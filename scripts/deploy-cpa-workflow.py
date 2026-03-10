#!/usr/bin/env python3
"""
Deploy CPA (Compliance Pre-Audit) Pipeline to n8n v1.0

Creates a new n8n workflow that pre-screens recordings via RunPod WhisperX
transcription + regex compliance checks. Clean calls auto-pass; flagged
calls forward to the existing full AI Analysis pipeline.

Usage:
    python3 scripts/deploy-cpa-workflow.py              # create + deploy
    python3 scripts/deploy-cpa-workflow.py --dry-run     # preview only
    python3 scripts/deploy-cpa-workflow.py --update       # update existing

Flow:
    POST /webhook/cpa-upload
      -> Check Duplicates
      -> Transcribe via RunPod (runsync, diarize=true)
      -> Format Transcript (normalization dictionary)
      -> CPA Pre-Screen (regex compliance checks)
      -> Route: PASS -> store to DB | FLAGGED -> forward to full pipeline
"""

import json
import os
import sys
import uuid
from pathlib import Path

import requests

# ─── Configuration ──────────────────────────────────────────────────

SCRIPTS_DIR = Path(__file__).parent
API_BASE = "https://n8n.pitchvision.io/api/v1/workflows"

# Load API key
API_KEY = os.environ.get("N8N_API_KEY")
if not API_KEY:
    env_path = SCRIPTS_DIR.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("N8N_API_KEY="):
                API_KEY = line.split("=", 1)[1].strip()
                break
if not API_KEY:
    print("ERROR: N8N_API_KEY not found")
    sys.exit(1)

HEADERS = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}

# Supabase config (for REST API calls in n8n)
SUPABASE_URL = None
SUPABASE_KEY = None
env_path = SCRIPTS_DIR.parent / ".env.local"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        if line.startswith("NEXT_PUBLIC_SUPABASE_URL="):
            SUPABASE_URL = line.split("=", 1)[1].strip()
        elif line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
            SUPABASE_KEY = line.split("=", 1)[1].strip()


# ─── CPA Pre-Screen Code ────────────────────────────────────────────

CPA_PRESCREEN_CODE = r"""
/**
 * CPA Pre-Screen v1.0 — Quick regex compliance checks
 *
 * Checks 3 key compliance signals + DNC detection.
 * Calls with 2+ missing key items OR DNC detected = flagged for full review.
 */
const transcript = $json.merged_transcript || '';
const agentText = $json.agent_text || '';
const customerText = $json.customer_text || '';

const findings = [];

// 1. Medicare A&B Confirmation
const abCheck = /part\s*a\s*(and|&|\+)\s*(part\s*)?b/i.test(agentText + ' ' + customerText);
findings.push({ check: 'medicare_ab', found: abCheck });

// 2. Red/White/Blue Card mention
const rwbCheck = /red\s*,?\s*white\s*,?\s*(and|&)\s*blue/i.test(transcript);
findings.push({ check: 'rwb_card', found: rwbCheck });

// 3. Transfer Consent
const consentPatterns = /\b(yes|yeah|sure|okay|go ahead|that's fine|uh-huh|mm-hmm|yep|alright)\b/i;
const consentCheck = consentPatterns.test(customerText);
findings.push({ check: 'transfer_consent', found: consentCheck });

// 4. Recorded Line Disclosure
const recordedLine = /recorded\s*(line|mind)/i.test(agentText);
findings.push({ check: 'recorded_line_disclosure', found: recordedLine });

// 5. DNC Detection
const dncPatterns = /\b(do not call|don't call|stop calling|remove me|take me off|don't want|not interested)\b/i;
const dncSignals = dncPatterns.test(customerText);
findings.push({ check: 'dnc_detected', found: dncSignals, flagged: dncSignals });

// Score: how many key checks passed
const keyChecks = findings.filter(f => ['medicare_ab', 'rwb_card', 'transfer_consent'].includes(f.check));
const passCount = keyChecks.filter(f => f.found).length;
const confidence = Math.round((passCount / 3) * 100);

// Route decision: missing 2+ key items OR DNC = needs full review
const flagged = dncSignals || passCount < 2;
const cpa_status = flagged ? 'flagged' : 'pass';

return {
  ...$json,
  cpa_status,
  cpa_findings: findings,
  cpa_confidence: confidence,
  cpa_version: '1.0',
};
""".strip()


# ─── Format Transcript Code ─────────────────────────────────────────

FORMAT_TRANSCRIPT_CODE = r"""
/**
 * Format Merged Transcript (CPA) v1.0
 * Reuses normalization dictionary from main pipeline v5.16
 */
const segments = $json.transcription_segments || [];
const language = $json.transcription_language || 'en';

// WhisperX normalization dictionary (v5.16)
const NORMALIZATIONS = {
  'recorded mind': 'recorded line',
  'unrecorded line': 'on a recorded line',
  'Medicaid Part A': 'Medicare Part A',
  'Courtline': 'on a recorded line',
  'court alliance': 'on a recorded line',
  'Record Align': 'on a recorded line',
  'Accord line': 'on a recorded line',
  'Part C and B': 'Part A and B',
  "America's Alta": "America's Health",
  'Recorder Alliance': 'recorded line',
  'Accorded Line': 'on a recorded line',
  'report line': 'recorded line',
  'a reporter': 'on a recorded line',
  'Pitch Perfection': 'Pitch Perfect',
  'pitch perfection': 'Pitch Perfect',
  'Page Perfect': 'Pitch Perfect',
  'Peach Perfect': 'Pitch Perfect',
  'Pick Perfect': 'Pitch Perfect',
  'self-deported': 'self-reported',
};

function normalize(text) {
  let result = text;
  for (const [bad, good] of Object.entries(NORMALIZATIONS)) {
    result = result.replace(new RegExp(bad, 'gi'), good);
  }
  return result;
}

// Build agent/customer text from diarized segments
let agentSegments = [];
let customerSegments = [];
let mergedLines = [];

for (const seg of segments) {
  const text = normalize((seg.text || '').trim());
  if (!text) continue;

  const speaker = seg.speaker || 'SPEAKER_00';
  const start = seg.start || 0;
  const end = seg.end || 0;
  const mins = Math.floor(start / 60);
  const secs = Math.floor(start % 60);
  const timestamp = `[${mins}:${String(secs).padStart(2, '0')}]`;

  // SPEAKER_00 = Agent (first speaker), SPEAKER_01 = Customer
  const role = speaker === 'SPEAKER_00' ? 'Agent' : 'Customer';

  if (role === 'Agent') {
    agentSegments.push({ start, end, text, speaker });
  } else {
    customerSegments.push({ start, end, text, speaker });
  }

  mergedLines.push(`${timestamp} ${role}: ${text}`);
}

const agentText = agentSegments.map(s => s.text).join(' ');
const customerText = customerSegments.map(s => s.text).join(' ');
const mergedTranscript = mergedLines.join('\n');

return {
  ...$json,
  merged_transcript: mergedTranscript,
  agent_text: agentText,
  customer_text: customerText,
  agent_segments: agentSegments,
  customer_segments: customerSegments,
  segment_count: segments.length,
  agent_word_count: agentText.split(/\s+/).filter(w => w).length,
  customer_word_count: customerText.split(/\s+/).filter(w => w).length,
};
""".strip()


# ─── Check Duplicates Code ──────────────────────────────────────────

CHECK_DUPLICATES_CODE = r"""
/**
 * Check for Duplicates — query Supabase for existing agent+phone+date+time
 */
const fileName = $json.file_name || '';
const agentName = $json.agent_name || '';

// Parse metadata from filename if not provided
let phoneNumber = '';
let callDate = '';
let callTime = '';

// Chase pattern: CampaignID_CampaignName_AgentName_Phone_M_D_YYYY-HH_MM_SS.wav
const chaseMatch = fileName.match(/(\d{10,11})_(\d{1,2})_(\d{1,2})_(\d{4})-(\d{2})_(\d{2})_(\d{2})/);
if (chaseMatch) {
  phoneNumber = chaseMatch[1];
  const month = chaseMatch[2].padStart(2, '0');
  const day = chaseMatch[3].padStart(2, '0');
  callDate = `${chaseMatch[4]}-${month}-${day}`;
  callTime = `${chaseMatch[5]}:${chaseMatch[6]}:${chaseMatch[7]}`;
}

if (!phoneNumber || !callDate) {
  // Not enough info to dedup — proceed
  return { ...$json, duplicate: false, phone_number: phoneNumber, call_date: callDate, call_time: callTime };
}

// Query Supabase REST API
let supabaseUrl, supabaseKey;
try {
  supabaseUrl = $env.SUPABASE_URL;
  supabaseKey = $env.SUPABASE_SERVICE_ROLE_KEY;
} catch (e) {
  return { ...$json, duplicate: false, phone_number: phoneNumber, call_date: callDate, call_time: callTime };
}

if (!supabaseUrl || !supabaseKey) {
  return { ...$json, duplicate: false, phone_number: phoneNumber, call_date: callDate, call_time: callTime };
}

const url = `${supabaseUrl}/rest/v1/QA Results?select=id&agent_name=eq.${encodeURIComponent(agentName)}&phone_number=eq.${encodeURIComponent(phoneNumber)}&call_date=eq.${encodeURIComponent(callDate)}&call_time=eq.${encodeURIComponent(callTime)}&limit=1`;

try {
  const resp = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
  });
  const data = await resp.json();
  const isDuplicate = Array.isArray(data) && data.length > 0;

  return {
    ...$json,
    duplicate: isDuplicate,
    phone_number: phoneNumber,
    call_date: callDate,
    call_time: callTime,
  };
} catch (e) {
  return { ...$json, duplicate: false, phone_number: phoneNumber, call_date: callDate, call_time: callTime };
}
""".strip()


# ─── Store Results Code ──────────────────────────────────────────────

STORE_RESULTS_CODE = r"""
/**
 * Store CPA Results — insert into QA Results table via Supabase REST API
 */
const data = $json;

let supabaseUrl, supabaseKey;
try {
  supabaseUrl = $env.SUPABASE_URL;
  supabaseKey = $env.SUPABASE_SERVICE_ROLE_KEY;
} catch (e) {
  return { ...$json, store_error: 'Missing Supabase env vars' };
}

const payload = {
  agent_name: data.agent_name || 'Unknown',
  phone_number: data.phone_number || '',
  call_date: data.call_date || null,
  call_time: data.call_time || null,
  transcript: data.merged_transcript || '',
  cpa_status: data.cpa_status || 'pass',
  cpa_findings: data.cpa_findings || [],
  cpa_confidence: data.cpa_confidence || 0,
  upload_source: data.upload_source || 's3_auto',
  batch_id: data.batch_id || null,
  compliance_score: data.cpa_confidence || 0,
  analyzed_at: new Date().toISOString(),
};

try {
  const resp = await fetch(`${supabaseUrl}/rest/v1/QA Results`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return { ...$json, store_error: `Supabase ${resp.status}: ${errText}` };
  }

  const result = await resp.json();
  return { ...$json, stored: true, qa_result_id: result[0]?.id };
} catch (e) {
  return { ...$json, store_error: e.message };
}
""".strip()


# ─── Node Definitions ────────────────────────────────────────────────

def make_nodes():
    """Build all CPA workflow nodes."""
    nodes = []
    x_start = 250
    x_step = 300

    # 1. Webhook Trigger
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "CPA Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [x_start, 300],
        "webhookId": str(uuid.uuid4()),
        "parameters": {
            "path": "cpa-upload",
            "httpMethod": "POST",
            "responseMode": "lastNode",
            "options": {},
        },
    })

    # 2. Check Duplicates
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Check Duplicates",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x_start + x_step, 300],
        "parameters": {
            "jsCode": CHECK_DUPLICATES_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 3. Skip if Duplicate (IF node)
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Skip if Duplicate",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [x_start + x_step * 2, 300],
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "conditions": [
                    {
                        "id": str(uuid.uuid4()),
                        "leftValue": "={{ $json.duplicate }}",
                        "rightValue": False,
                        "operator": {
                            "type": "boolean",
                            "operation": "equals",
                        },
                    }
                ],
                "combinator": "and",
            },
        },
    })

    # 4. RunPod Transcription (HTTP Request — runsync)
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "RunPod Transcribe",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [x_start + x_step * 3, 200],
        "parameters": {
            "method": "POST",
            "url": "=https://api.runpod.ai/v2/{{ $env.RUNPOD_ENDPOINT_ID }}/runsync",
            "authentication": "genericCredentialType",
            "genericAuthType": "httpHeaderAuth",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "Content-Type", "value": "application/json"},
                ],
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={\n  "input": {\n    "audio_url": "{{ $json.file_url }}",\n    "language": "en",\n    "diarize": true,\n    "vad_onset": 0.3,\n    "vad_offset": 0.3\n  },\n  "policy": {\n    "executionTimeout": 600000\n  }\n}',
            "options": {
                "timeout": 120000,
            },
        },
    })

    # 5. Extract Transcription
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Extract Transcription",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x_start + x_step * 4, 200],
        "parameters": {
            "jsCode": """
// Extract segments from RunPod runsync response
const runpodResult = $json;
const output = runpodResult.output || runpodResult;

if (output.error) {
  throw new Error('RunPod transcription error: ' + output.error);
}

// Merge with original input data (from previous nodes via $('Check Duplicates'))
const originalInput = $('Check Duplicates').first().json;

return {
  ...originalInput,
  transcription_segments: output.segments || [],
  transcription_language: output.language || 'en',
  processing_time_s: output.processing_time_s || 0,
  audio_duration_s: output.audio_duration_s || 0,
  provider: 'runpod',
};
""".strip(),
            "mode": "runOnceForEachItem",
        },
    })

    # 6. Format Transcript
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Format Transcript",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x_start + x_step * 5, 200],
        "parameters": {
            "jsCode": FORMAT_TRANSCRIPT_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 7. CPA Pre-Screen
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "CPA Pre-Screen",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x_start + x_step * 6, 200],
        "parameters": {
            "jsCode": CPA_PRESCREEN_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 8. Route Decision (IF: cpa_status === 'flagged')
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Route Decision",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [x_start + x_step * 7, 200],
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "conditions": [
                    {
                        "id": str(uuid.uuid4()),
                        "leftValue": "={{ $json.cpa_status }}",
                        "rightValue": "flagged",
                        "operator": {
                            "type": "string",
                            "operation": "equals",
                        },
                    }
                ],
                "combinator": "and",
            },
        },
    })

    # 9. Store Results (Pass) — auto-pass clean calls
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Store Results (Pass)",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x_start + x_step * 8, 350],
        "parameters": {
            "jsCode": STORE_RESULTS_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 10. Trigger Full Analysis (Flagged) — forward to existing pipeline
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Trigger Full Analysis",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [x_start + x_step * 8, 100],
        "parameters": {
            "method": "POST",
            "url": "https://n8n.pitchvision.io/webhook/qa-upload",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={\n  "file_url": "{{ $json.file_url }}",\n  "file_name": "{{ $json.file_name }}",\n  "batch_id": "{{ $json.batch_id }}",\n  "agent_name": "{{ $json.agent_name }}",\n  "upload_source": "cpa_flagged",\n  "cpa_findings": {{ JSON.stringify($json.cpa_findings) }}\n}',
            "options": {
                "timeout": 30000,
            },
        },
    })

    # 11. Duplicate Response
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Duplicate Response",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x_start + x_step * 3, 450],
        "parameters": {
            "jsCode": 'return { json: { status: "duplicate", message: "Recording already processed", file_name: $json.file_name } };',
            "mode": "runOnceForEachItem",
        },
    })

    return nodes


def make_connections():
    """Build node connections."""
    return {
        "CPA Webhook": {
            "main": [[{"node": "Check Duplicates", "type": "main", "index": 0}]]
        },
        "Check Duplicates": {
            "main": [[{"node": "Skip if Duplicate", "type": "main", "index": 0}]]
        },
        "Skip if Duplicate": {
            "main": [
                # True (not duplicate) -> RunPod Transcribe
                [{"node": "RunPod Transcribe", "type": "main", "index": 0}],
                # False (is duplicate) -> Duplicate Response
                [{"node": "Duplicate Response", "type": "main", "index": 0}],
            ]
        },
        "RunPod Transcribe": {
            "main": [[{"node": "Extract Transcription", "type": "main", "index": 0}]]
        },
        "Extract Transcription": {
            "main": [[{"node": "Format Transcript", "type": "main", "index": 0}]]
        },
        "Format Transcript": {
            "main": [[{"node": "CPA Pre-Screen", "type": "main", "index": 0}]]
        },
        "CPA Pre-Screen": {
            "main": [[{"node": "Route Decision", "type": "main", "index": 0}]]
        },
        "Route Decision": {
            "main": [
                # True (flagged) -> Trigger Full Analysis
                [{"node": "Trigger Full Analysis", "type": "main", "index": 0}],
                # False (pass) -> Store Results
                [{"node": "Store Results (Pass)", "type": "main", "index": 0}],
            ]
        },
    }


# ─── Deployment ──────────────────────────────────────────────────────

def create_workflow(dry_run=False):
    """Create the CPA workflow via n8n API."""
    nodes = make_nodes()
    connections = make_connections()

    workflow = {
        "name": "CPA Pre-Audit Pipeline",
        "nodes": nodes,
        "connections": connections,
        "settings": {
            "executionOrder": "v1",
        },
    }

    print(f"\nWorkflow: {workflow['name']}")
    print(f"Nodes: {len(nodes)}")
    for n in nodes:
        print(f"  - {n['name']} ({n['type']})")

    print(f"\nConnections:")
    for src, targets in connections.items():
        for output_idx, output_conns in enumerate(targets.get("main", [])):
            for conn in output_conns:
                label = f"(output {output_idx})" if len(targets.get("main", [])) > 1 else ""
                print(f"  {src} {label} -> {conn['node']}")

    if dry_run:
        print("\n[DRY RUN] Would create workflow. No changes made.")
        # Save to file for inspection
        out_path = SCRIPTS_DIR.parent / ".n8n-snapshots" / "cpa-workflow-preview.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(workflow, indent=2))
        print(f"  Preview saved to: {out_path}")
        return None

    # Create via API
    print("\nCreating workflow via n8n API...")
    resp = requests.post(API_BASE, headers=HEADERS, json=workflow)

    if not resp.ok:
        print(f"ERROR: n8n API returned {resp.status_code}: {resp.text}")
        sys.exit(1)

    result = resp.json()
    workflow_id = result.get("id")
    print(f"  Created! ID: {workflow_id}")
    print(f"  Name: {result.get('name')}")

    # Activate the workflow
    activate_url = f"{API_BASE}/{workflow_id}/activate"
    act_resp = requests.post(activate_url, headers=HEADERS)
    if act_resp.ok:
        print("  Activated!")
    else:
        print(f"  Warning: Could not activate ({act_resp.status_code})")
        print(f"  Activate manually in n8n UI")

    return result


def update_workflow(workflow_id, dry_run=False):
    """Update an existing CPA workflow."""
    nodes = make_nodes()
    connections = make_connections()

    workflow = {
        "id": workflow_id,
        "name": "CPA Pre-Audit Pipeline",
        "nodes": nodes,
        "connections": connections,
        "settings": {
            "executionOrder": "v1",
        },
    }

    if dry_run:
        print(f"\n[DRY RUN] Would update workflow {workflow_id}")
        return None

    # Use the deploy library for safe deployment
    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location("deploy", SCRIPTS_DIR / "n8n-deploy.py")
    deploy = module_from_spec(spec)
    spec.loader.exec_module(deploy)

    print(f"\nUpdating workflow {workflow_id}...")
    result = deploy.safe_deploy(workflow, label="cpa-update")
    if result["success"]:
        print("  Updated successfully!")
    else:
        print(f"  Update failed: {result.get('errors')}")

    return result


def main():
    dry_run = "--dry-run" in sys.argv
    update = "--update" in sys.argv

    print("=" * 60)
    print("CPA Pre-Audit Pipeline Deployment v1.0")
    print("=" * 60)

    if update:
        # Find existing workflow
        print("\nSearching for existing CPA workflow...")
        resp = requests.get(API_BASE, headers=HEADERS)
        resp.raise_for_status()
        workflows = resp.json().get("data", [])

        cpa_wf = None
        for wf in workflows:
            if "CPA" in wf.get("name", "") or "cpa" in wf.get("name", "").lower():
                cpa_wf = wf
                break

        if not cpa_wf:
            print("  No existing CPA workflow found. Creating new one.")
            create_workflow(dry_run=dry_run)
        else:
            print(f"  Found: {cpa_wf['name']} (ID: {cpa_wf['id']})")
            update_workflow(cpa_wf["id"], dry_run=dry_run)
    else:
        create_workflow(dry_run=dry_run)

    print("\n" + "=" * 60)
    print("Next steps:")
    print("  1. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID in n8n environment")
    print("  2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in n8n environment")
    print("  3. Set up RunPod HTTP Auth credentials in n8n")
    print("  4. Set QA_PIPELINE_MODE=split in Vercel")
    print("  5. Test with: curl -X POST https://n8n.pitchvision.io/webhook/cpa-upload \\")
    print('       -H "Content-Type: application/json" \\')
    print('       -d \'{"file_url":"<presigned_url>","file_name":"test.wav","agent_name":"Test"}\'')
    print("=" * 60)


if __name__ == "__main__":
    main()
