#!/usr/bin/env python3
"""
Deploy CPA Webhook Callback Architecture v2.0

Splits the CPA pipeline into 2 workflows:
  Workflow A (Submit): Webhook → Dedup → Submit to RunPod /run with callback → Return
  Workflow B (Process): RunPod callback → Extract → Format → Pre-Screen → Route → Store

This eliminates the 300s Wait node that pins n8n execution slots, enabling 10x throughput.

Usage:
    python3 scripts/deploy-cpa-webhook-callback.py              # deploy both
    python3 scripts/deploy-cpa-webhook-callback.py --dry-run     # preview only
"""

import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path

import requests

# ─── Configuration ──────────────────────────────────────────────────

SCRIPTS_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPTS_DIR.parent
API_BASE = "https://n8n.pitchvision.io/api/v1/workflows"
EXISTING_CPA_WORKFLOW_ID = "tuIPgrh5fR64knHq"
RUNPOD_ENDPOINT_ID = "j9iteehc9czgcs"
RUNPOD_API_KEY = "rpa_MV9Z6U227835RIFLCJ607JSFO6RB7TRXZTIWQJ3V13478z"
CALLBACK_WEBHOOK_PATH = "cpa-runpod-callback"
CALLBACK_WEBHOOK_URL = f"https://n8n.pitchvision.io/webhook/{CALLBACK_WEBHOOK_PATH}"

# Load n8n API key
N8N_API_KEY = os.environ.get("N8N_API_KEY")
if not N8N_API_KEY:
    env_path = PROJECT_DIR / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("N8N_API_KEY="):
                N8N_API_KEY = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
if not N8N_API_KEY:
    print("ERROR: N8N_API_KEY not found")
    sys.exit(1)

HEADERS = {"X-N8N-API-KEY": N8N_API_KEY, "Content-Type": "application/json"}


# ─── Snapshot current workflow ────────────────────────────────────────

def snapshot_current():
    """Backup current CPA workflow before modifying."""
    print("  Snapshotting current CPA workflow...")
    resp = requests.get(f"{API_BASE}/{EXISTING_CPA_WORKFLOW_ID}", headers=HEADERS)
    if not resp.ok:
        print(f"  WARNING: Could not snapshot ({resp.status_code})")
        return

    snap_dir = PROJECT_DIR / ".n8n-snapshots"
    snap_dir.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%dT%H_%M_%S")
    snap_path = snap_dir / f"CPA_Pre_Audit_{EXISTING_CPA_WORKFLOW_ID}_{ts}_pre_webhook_callback.json"

    wf = resp.json()
    snap_path.write_text(json.dumps(wf, indent=2))
    print(f"  Saved to: {snap_path.name}")


# ─── Workflow A: CPA Submit (update existing) ─────────────────────────

CHECK_DUPLICATES_CODE = r"""
/**
 * Check for Duplicates + Flatten Input — v2.0 (webhook callback)
 */
const body = $json.body || $json;
const fileName = body.file_name || '';
const agentName = body.agent_name || '';
const fileUrl = body.file_url || '';
const uploadSource = body.upload_source || 'cpa';
const batchId = body.batch_id || '';

let phoneNumber = '';
let callDate = '';
let callTime = '';

const chaseMatch = fileName.match(/(\d{10,11})_(\d{1,2})_(\d{1,2})_(\d{4})-(\d{2})_(\d{2})_(\d{2})/);
if (chaseMatch) {
  phoneNumber = chaseMatch[1];
  const month = chaseMatch[2].padStart(2, '0');
  const day = chaseMatch[3].padStart(2, '0');
  callDate = `${chaseMatch[4]}-${month}-${day}`;
  callTime = `${chaseMatch[5]}:${chaseMatch[6]}:${chaseMatch[7]}`;
}

const baseOutput = {
  file_name: fileName,
  file_url: fileUrl,
  agent_name: agentName,
  upload_source: uploadSource,
  batch_id: batchId,
  phone_number: phoneNumber,
  call_date: callDate,
  call_time: callTime,
};

if (!phoneNumber || !callDate) {
  return { ...baseOutput, duplicate: false };
}

let supabaseUrl, supabaseKey;
try {
  supabaseUrl = $env.SUPABASE_URL;
  supabaseKey = $env.SUPABASE_SERVICE_ROLE_KEY;
} catch (e) {
  return { ...baseOutput, duplicate: false };
}

if (!supabaseUrl || !supabaseKey) {
  return { ...baseOutput, duplicate: false };
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
  return { ...baseOutput, duplicate: Array.isArray(data) && data.length > 0 };
} catch (e) {
  return { ...baseOutput, duplicate: false };
}
""".strip()


def build_workflow_a():
    """Build the CPA Submit workflow (Workflow A)."""
    nodes = []
    x, y = 250, 300
    step = 300

    # 1. Webhook trigger
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "CPA Webhook",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [x, y],
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
        "position": [x + step, y],
        "parameters": {
            "jsCode": CHECK_DUPLICATES_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 3. Skip if Duplicate
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Skip if Duplicate",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [x + step * 2, y],
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "conditions": [{
                    "id": str(uuid.uuid4()),
                    "leftValue": "={{ $json.duplicate }}",
                    "rightValue": False,
                    "operator": {"type": "boolean", "operation": "equals"},
                }],
                "combinator": "and",
            },
        },
    })

    # 4. RunPod Submit (async /run with webhook callback)
    runpod_body = json.dumps({
        "input": {
            "audio_url": "{{ $json.file_url }}",
            "language": "en",
            "diarize": True,
            "vad_onset": 0.3,
            "vad_offset": 0.3,
            "max_duration": 300,
            "metadata": {
                "file_name": "{{ $json.file_name }}",
                "file_url": "{{ $json.file_url }}",
                "agent_name": "{{ $json.agent_name }}",
                "batch_id": "{{ $json.batch_id }}",
                "upload_source": "{{ $json.upload_source }}",
                "phone_number": "{{ $json.phone_number }}",
                "call_date": "{{ $json.call_date }}",
                "call_time": "{{ $json.call_time }}",
            },
        },
        "webhook": CALLBACK_WEBHOOK_URL,
        "policy": {
            "executionTimeout": 600000,
        },
    }, indent=2)
    # n8n expression prefix
    runpod_body = "=" + runpod_body

    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "RunPod Submit",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [x + step * 3, y - 100],
        "parameters": {
            "method": "POST",
            "url": f"https://api.runpod.ai/v2/{RUNPOD_ENDPOINT_ID}/run",
            "sendHeaders": True,
            "headerParameters": {
                "parameters": [
                    {"name": "Content-Type", "value": "application/json"},
                    {"name": "Authorization", "value": f"Bearer {RUNPOD_API_KEY}"},
                ],
            },
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": runpod_body,
            "options": {"timeout": 30000},
        },
    })

    # 5. Submit Response
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Submit Response",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x + step * 4, y - 100],
        "parameters": {
            "jsCode": """
const jobId = $json.id || 'unknown';
const status = $json.status || 'unknown';
const originalInput = $('Check Duplicates').first().json;

return {
  status: 'submitted',
  job_id: jobId,
  runpod_status: status,
  file_name: originalInput.file_name,
  agent_name: originalInput.agent_name,
  message: 'Transcription submitted to RunPod. Results will be processed via webhook callback.',
};
""".strip(),
            "mode": "runOnceForEachItem",
        },
    })

    # 6. Duplicate Response
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Duplicate Response",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x + step * 3, y + 150],
        "parameters": {
            "jsCode": 'return { json: { status: "duplicate", message: "Recording already processed", file_name: $json.file_name } };',
            "mode": "runOnceForEachItem",
        },
    })

    connections = {
        "CPA Webhook": {"main": [[{"node": "Check Duplicates", "type": "main", "index": 0}]]},
        "Check Duplicates": {"main": [[{"node": "Skip if Duplicate", "type": "main", "index": 0}]]},
        "Skip if Duplicate": {"main": [
            [{"node": "RunPod Submit", "type": "main", "index": 0}],
            [{"node": "Duplicate Response", "type": "main", "index": 0}],
        ]},
        "RunPod Submit": {"main": [[{"node": "Submit Response", "type": "main", "index": 0}]]},
    }

    return {
        "name": "CPA Pre-Audit Pipeline",
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1"},
    }


# ─── Workflow B: CPA Callback Processor ──────────────────────────────

EXTRACT_CALLBACK_CODE = r"""
/**
 * Extract Transcription from RunPod Webhook Callback v2.0
 *
 * RunPod POSTs: { id, status, output: { segments, language, metadata, ... } }
 * We extract segments + merge metadata back to top-level.
 */
const callback = $json.body || $json;
const jobId = callback.id || 'unknown';
const status = callback.status || 'unknown';
const output = callback.output || {};

// Check for errors
if (status === 'FAILED') {
  throw new Error(`RunPod job ${jobId} failed: ${JSON.stringify(callback.error || output.error || 'unknown')}`);
}

if (output.error) {
  throw new Error(`RunPod transcription error (job ${jobId}): ${output.error}`);
}

if (status !== 'COMPLETED') {
  throw new Error(`Unexpected RunPod status: ${status} (job ${jobId})`);
}

// Extract metadata passed through from submit
const metadata = output.metadata || {};

return {
  // Original call metadata (passed through RunPod)
  file_name: metadata.file_name || '',
  file_url: metadata.file_url || '',
  agent_name: metadata.agent_name || '',
  batch_id: metadata.batch_id || '',
  upload_source: metadata.upload_source || 'cpa',
  phone_number: metadata.phone_number || '',
  call_date: metadata.call_date || '',
  call_time: metadata.call_time || '',

  // Transcription results
  transcription_segments: output.segments || [],
  transcription_language: output.language || 'en',
  processing_time_s: output.processing_time_s || 0,
  audio_duration_s: output.audio_duration_s || 0,
  trimmed: output.trimmed || false,
  original_duration_s: output.original_duration_s || 0,
  provider: 'runpod',
  runpod_job_id: jobId,
};
""".strip()

FORMAT_TRANSCRIPT_CODE = r"""
/**
 * Format Merged Transcript (CPA) v1.0
 * Reuses normalization dictionary from main pipeline v5.16
 */
const segments = $json.transcription_segments || [];
const language = $json.transcription_language || 'en';

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

CPA_PRESCREEN_CODE = r"""
/**
 * CPA Pre-Screen v1.0 — Quick regex compliance checks
 */
const transcript = $json.merged_transcript || '';
const agentText = $json.agent_text || '';
const customerText = $json.customer_text || '';

const findings = [];

const abCheck = /part\s*a\s*(and|&|\+)\s*(part\s*)?b/i.test(agentText + ' ' + customerText);
findings.push({ check: 'medicare_ab', found: abCheck });

const rwbCheck = /red\s*,?\s*white\s*,?\s*(and|&)\s*(the\s+)?blue/i.test(transcript);
findings.push({ check: 'rwb_card', found: rwbCheck });

const consentPatterns = /\b(yes|yeah|sure|okay|go ahead|that's fine|uh-huh|mm-hmm|yep|alright)\b/i;
const consentCheck = consentPatterns.test(customerText);
findings.push({ check: 'transfer_consent', found: consentCheck });

const recordedLine = /recorded\s*(line|mind)/i.test(agentText);
findings.push({ check: 'recorded_line_disclosure', found: recordedLine });

const dncPatterns = /\b(do not call|don't call|stop calling|remove me|take me off|don't want|not interested)\b/i;
const dncSignals = dncPatterns.test(customerText);
findings.push({ check: 'dnc_detected', found: dncSignals, flagged: dncSignals });

const keyChecks = findings.filter(f => ['medicare_ab', 'rwb_card', 'transfer_consent'].includes(f.check));
const passCount = keyChecks.filter(f => f.found).length;
const confidence = Math.round((passCount / 3) * 100);
const flagged = dncSignals || passCount < 2;

return {
  ...$json,
  cpa_status: flagged ? 'flagged' : 'pass',
  cpa_findings: findings,
  cpa_confidence: confidence,
  cpa_version: '1.0',
};
""".strip()

STORE_RESULTS_CODE = r"""
/**
 * Store CPA Results — insert into QA Results table
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
  upload_source: 'cpa',
  upload_type: 'automated',
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


def build_workflow_b():
    """Build the CPA Callback Processor workflow (Workflow B)."""
    nodes = []
    x, y = 250, 300
    step = 300

    # 1. RunPod Callback Webhook
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "RunPod Callback",
        "type": "n8n-nodes-base.webhook",
        "typeVersion": 2,
        "position": [x, y],
        "webhookId": str(uuid.uuid4()),
        "parameters": {
            "path": CALLBACK_WEBHOOK_PATH,
            "httpMethod": "POST",
            "responseMode": "responseNode",
            "options": {},
        },
    })

    # 2. Extract Transcription from callback
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Extract Transcription",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x + step, y],
        "parameters": {
            "jsCode": EXTRACT_CALLBACK_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 3. Format Transcript
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Format Transcript",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x + step * 2, y],
        "parameters": {
            "jsCode": FORMAT_TRANSCRIPT_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 4. CPA Pre-Screen
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "CPA Pre-Screen",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x + step * 3, y],
        "parameters": {
            "jsCode": CPA_PRESCREEN_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 5. Route Decision
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Route Decision",
        "type": "n8n-nodes-base.if",
        "typeVersion": 2,
        "position": [x + step * 4, y],
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict"},
                "conditions": [{
                    "id": str(uuid.uuid4()),
                    "leftValue": "={{ $json.cpa_status }}",
                    "rightValue": "flagged",
                    "operator": {"type": "string", "operation": "equals"},
                }],
                "combinator": "and",
            },
        },
    })

    # 6. Trigger Full Analysis (flagged)
    trigger_body = json.dumps({
        "file_url": "{{ $json.file_url }}",
        "file_name": "{{ $json.file_name }}",
        "batch_id": "{{ $json.batch_id }}",
        "agent_name": "{{ $json.agent_name }}",
        "upload_source": "cpa_flagged",
        "cpa_findings": "{{ JSON.stringify($json.cpa_findings) }}",
    }, indent=2)

    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Trigger Full Analysis",
        "type": "n8n-nodes-base.httpRequest",
        "typeVersion": 4.2,
        "position": [x + step * 5, y - 150],
        "parameters": {
            "method": "POST",
            "url": "https://n8n.pitchvision.io/webhook/qa-upload",
            "sendBody": True,
            "specifyBody": "json",
            "jsonBody": '={\n  "file_url": "{{ $json.file_url }}",\n  "file_name": "{{ $json.file_name }}",\n  "batch_id": "{{ $json.batch_id }}",\n  "agent_name": "{{ $json.agent_name }}",\n  "upload_source": "cpa_flagged",\n  "cpa_findings": {{ JSON.stringify($json.cpa_findings) }}\n}',
            "options": {"timeout": 30000},
        },
    })

    # 7. Store Results (Pass)
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Store Results (Pass)",
        "type": "n8n-nodes-base.code",
        "typeVersion": 2,
        "position": [x + step * 5, y + 150],
        "parameters": {
            "jsCode": STORE_RESULTS_CODE,
            "mode": "runOnceForEachItem",
        },
    })

    # 8. Respond to RunPod (acknowledge callback)
    nodes.append({
        "id": str(uuid.uuid4()),
        "name": "Respond OK",
        "type": "n8n-nodes-base.respondToWebhook",
        "typeVersion": 1.1,
        "position": [x + step * 6, y],
        "parameters": {
            "respondWith": "json",
            "responseBody": '={\n  "status": "processed",\n  "cpa_status": "{{ $json.cpa_status }}",\n  "file_name": "{{ $json.file_name }}"\n}',
        },
    })

    connections = {
        "RunPod Callback": {"main": [[{"node": "Extract Transcription", "type": "main", "index": 0}]]},
        "Extract Transcription": {"main": [[{"node": "Format Transcript", "type": "main", "index": 0}]]},
        "Format Transcript": {"main": [[{"node": "CPA Pre-Screen", "type": "main", "index": 0}]]},
        "CPA Pre-Screen": {"main": [[{"node": "Route Decision", "type": "main", "index": 0}]]},
        "Route Decision": {"main": [
            [{"node": "Trigger Full Analysis", "type": "main", "index": 0}],
            [{"node": "Store Results (Pass)", "type": "main", "index": 0}],
        ]},
        "Trigger Full Analysis": {"main": [[{"node": "Respond OK", "type": "main", "index": 0}]]},
        "Store Results (Pass)": {"main": [[{"node": "Respond OK", "type": "main", "index": 0}]]},
    }

    return {
        "name": "CPA Callback Processor",
        "nodes": nodes,
        "connections": connections,
        "settings": {"executionOrder": "v1"},
    }


# ─── Deployment ──────────────────────────────────────────────────────

def deploy(dry_run=False):
    print("=" * 60)
    print("CPA Webhook Callback Architecture v2.0")
    print("=" * 60)

    # Build both workflows
    wf_a = build_workflow_a()
    wf_b = build_workflow_b()

    print(f"\nWorkflow A (Submit): {len(wf_a['nodes'])} nodes")
    for n in wf_a["nodes"]:
        print(f"  - {n['name']} ({n['type'].split('.')[-1]})")

    print(f"\nWorkflow B (Callback): {len(wf_b['nodes'])} nodes")
    for n in wf_b["nodes"]:
        print(f"  - {n['name']} ({n['type'].split('.')[-1]})")

    print(f"\nCallback URL: {CALLBACK_WEBHOOK_URL}")
    print(f"Metadata passthrough: file_name, file_url, agent_name, batch_id, phone_number, call_date, call_time")

    if dry_run:
        snap_dir = PROJECT_DIR / ".n8n-snapshots"
        snap_dir.mkdir(exist_ok=True)
        (snap_dir / "cpa-submit-v2-preview.json").write_text(json.dumps(wf_a, indent=2))
        (snap_dir / "cpa-callback-v2-preview.json").write_text(json.dumps(wf_b, indent=2))
        print("\n[DRY RUN] Previews saved to .n8n-snapshots/")
        return

    # Step 1: Snapshot current
    snapshot_current()

    # Step 2: Update existing CPA workflow (Workflow A)
    print(f"\n[1/3] Updating Workflow A (CPA Submit) — {EXISTING_CPA_WORKFLOW_ID}...")
    update_payload = {
        "name": wf_a["name"],
        "nodes": wf_a["nodes"],
        "connections": wf_a["connections"],
        "settings": wf_a["settings"],
    }
    resp = requests.put(
        f"{API_BASE}/{EXISTING_CPA_WORKFLOW_ID}",
        headers=HEADERS,
        json=update_payload,
    )
    if resp.ok:
        print(f"  Updated! Nodes: {len(wf_a['nodes'])}")
    else:
        print(f"  ERROR: {resp.status_code} — {resp.text[:300]}")
        sys.exit(1)

    # Step 3: Create Workflow B (Callback Processor)
    print("\n[2/3] Creating Workflow B (CPA Callback Processor)...")

    # Check if it already exists
    resp = requests.get(API_BASE, headers=HEADERS, params={"limit": 50})
    existing_callback = None
    if resp.ok:
        for wf in resp.json().get("data", []):
            if "CPA Callback" in wf.get("name", ""):
                existing_callback = wf
                break

    if existing_callback:
        print(f"  Found existing: {existing_callback['name']} ({existing_callback['id']})")
        update_b = {
            "name": wf_b["name"],
            "nodes": wf_b["nodes"],
            "connections": wf_b["connections"],
            "settings": wf_b["settings"],
        }
        resp = requests.put(
            f"{API_BASE}/{existing_callback['id']}",
            headers=HEADERS,
            json=update_b,
        )
        callback_id = existing_callback["id"]
        if resp.ok:
            print(f"  Updated!")
        else:
            print(f"  ERROR updating: {resp.status_code} — {resp.text[:300]}")
            sys.exit(1)
    else:
        resp = requests.post(API_BASE, headers=HEADERS, json=wf_b)
        if resp.ok:
            callback_id = resp.json().get("id")
            print(f"  Created! ID: {callback_id}")
        else:
            print(f"  ERROR: {resp.status_code} — {resp.text[:300]}")
            sys.exit(1)

    # Step 4: Activate Workflow B
    print("\n[3/3] Activating Workflow B...")
    act_resp = requests.post(f"{API_BASE}/{callback_id}/activate", headers=HEADERS)
    if act_resp.ok:
        print("  Activated!")
    else:
        print(f"  Warning: Activation returned {act_resp.status_code}")
        print("  Activate manually in n8n UI")

    print("\n" + "=" * 60)
    print("Deployment Complete!")
    print(f"  Workflow A (Submit):   {EXISTING_CPA_WORKFLOW_ID}")
    print(f"  Workflow B (Callback): {callback_id}")
    print(f"  Callback URL:          {CALLBACK_WEBHOOK_URL}")
    print("=" * 60)
    print("\nTest with:")
    print(f"  curl -X POST https://n8n.pitchvision.io/webhook/cpa-upload \\")
    print(f'    -H "Content-Type: application/json" \\')
    print(f'    -d \'{{"file_url":"<presigned_url>","file_name":"test.wav","agent_name":"Test"}}\'')


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    deploy(dry_run=dry_run)
