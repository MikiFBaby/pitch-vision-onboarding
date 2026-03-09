#!/usr/bin/env python3
"""
Deploy RunPod Transcription Integration to n8n Pipeline v1.0

Updates the "Submit Transcription" workflow to support RunPod as the primary
transcription provider with automatic Replicate fallback.

Usage:
    python3 scripts/deploy-runpod-transcription.py              # deploy
    python3 scripts/deploy-runpod-transcription.py --dry-run     # preview
    python3 scripts/deploy-runpod-transcription.py --provider replicate  # force Replicate
    python3 scripts/deploy-runpod-transcription.py --provider runpod     # force RunPod
    python3 scripts/deploy-runpod-transcription.py --provider split_50   # A/B test 50/50
    python3 scripts/n8n-deploy.py submit-transcription --rollback  # rollback

The script inserts a "Transcription Router" Code node that:
  1. Checks WHISPERX_PROVIDER env var (replicate | runpod | split_50)
  2. Routes to RunPod HTTP Request or existing Replicate node
  3. Normalizes output format so downstream nodes see identical data
  4. Falls back to Replicate if RunPod fails
"""

import json
import sys
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path

# ─── Load n8n deploy wrapper ─────────────────────────────────────────

SCRIPTS_DIR = Path(__file__).parent
spec = spec_from_file_location("deploy", SCRIPTS_DIR / "n8n-deploy.py")
deploy = module_from_spec(spec)
spec.loader.exec_module(deploy)

# ─── Transcription Router Code ────────────────────────────────────────

ROUTER_CODE = r"""
/**
 * Transcription Router v1.0
 *
 * Routes audio transcription to RunPod or Replicate based on WHISPERX_PROVIDER env.
 * Provides automatic fallback: RunPod failure → retry with Replicate.
 *
 * Input:  $json with audio_url, language, diarize, vad_onset, vad_offset
 * Output: $json + { provider, transcription_segments, transcription_language, processing_time_s }
 */

const RUNPOD_ENDPOINT = $env.RUNPOD_ENDPOINT_ID
  ? `https://api.runpod.ai/v2/${$env.RUNPOD_ENDPOINT_ID}/runsync`
  : null;
const RUNPOD_API_KEY = $env.RUNPOD_API_KEY || '';

// Provider selection: runpod | replicate | split_50
let provider;
try {
  provider = ($env.WHISPERX_PROVIDER || 'replicate').toLowerCase();
} catch (e) {
  provider = 'replicate';
}

// A/B split: random assignment
if (provider === 'split_50') {
  provider = Math.random() < 0.5 ? 'runpod' : 'replicate';
}

// If RunPod not configured, fall back to Replicate
if (provider === 'runpod' && (!RUNPOD_ENDPOINT || !RUNPOD_API_KEY)) {
  console.log('[router] RunPod not configured — falling back to Replicate');
  provider = 'replicate';
}

const input = $json;
const audioUrl = input.audio_url || input.audioUrl || input.file_url;

if (provider === 'runpod') {
  try {
    const startTime = Date.now();
    const response = await fetch(RUNPOD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNPOD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          audio_url: audioUrl,
          language: input.language || 'en',
          diarize: input.diarize ?? true,
          vad_onset: input.vad_onset ?? 0.3,
          vad_offset: input.vad_offset ?? 0.3,
          min_speakers: input.min_speakers,
          max_speakers: input.max_speakers,
        },
        // 10 min timeout for long audio
        policy: { executionTimeout: 600000 },
      }),
    });

    if (!response.ok) {
      throw new Error(`RunPod returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();

    if (result.status === 'FAILED' || result.error) {
      throw new Error(`RunPod job failed: ${result.error || JSON.stringify(result)}`);
    }

    const output = result.output || result;
    if (output.error) {
      throw new Error(`RunPod transcription error: ${output.error}`);
    }

    const processingTime = (Date.now() - startTime) / 1000;

    return {
      ...$json,
      provider: 'runpod',
      transcription_segments: output.segments || [],
      transcription_language: output.language || 'en',
      processing_time_s: output.processing_time_s || processingTime,
      audio_duration_s: output.audio_duration_s || null,
      // Flag for downstream: response came from RunPod
      _transcription_source: 'runpod',
    };
  } catch (err) {
    console.log(`[router] RunPod failed: ${err.message} — falling back to Replicate`);
    // Fall through to Replicate
    provider = 'replicate';
  }
}

// Replicate path: pass through to existing Replicate node
// Set _transcription_source so downstream knows which path was taken
return {
  ...$json,
  _transcription_source: 'replicate',
  _runpod_fallback: provider === 'replicate' && ($json._transcription_source !== 'replicate'),
};
""".strip()


# ─── Node definitions ─────────────────────────────────────────────────

ROUTER_NODE = {
    "parameters": {
        "jsCode": ROUTER_CODE,
        "mode": "runOnceForEachItem",
    },
    "id": "transcription-router-v1",
    "name": "Transcription Router",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [0, 0],
}


def find_node(nodes, name):
    """Find a node by name (case-insensitive partial match)."""
    name_lower = name.lower()
    for node in nodes:
        if name_lower in node.get("name", "").lower():
            return node
    return None


def insert_router_node(workflow, dry_run=False):
    """Insert Transcription Router into the Submit Transcription workflow."""
    nodes = workflow.get("nodes", [])
    connections = workflow.get("connections", {})

    # Find the Replicate node (this is what currently handles transcription)
    replicate_node = find_node(nodes, "Replicate") or find_node(nodes, "WhisperX") or find_node(nodes, "Transcri")
    if not replicate_node:
        print("ERROR: Cannot find Replicate/WhisperX transcription node in workflow.")
        print("Available nodes:")
        for n in nodes:
            print(f"  - {n.get('name')}")
        sys.exit(1)

    replicate_name = replicate_node["name"]

    # Find what feeds into the Replicate node
    source_node = None
    source_output_key = None
    for node_name, outputs in connections.items():
        for output_key, conn_lists in outputs.items():
            for conn_list in conn_lists:
                for conn in conn_list:
                    if conn.get("node") == replicate_name:
                        source_node = node_name
                        source_output_key = output_key

    if not source_node:
        print(f"WARNING: No upstream node found for '{replicate_name}'. Router will be added but not wired.")

    print(f"\nInsertion plan:")
    print(f"  BEFORE: {source_node or '???'} → {replicate_name}")
    print(f"  AFTER:  {source_node or '???'} → Transcription Router → {replicate_name}")
    print(f"  (RunPod calls happen inside the Router; Replicate is the fallback path)")

    # Check if Router already exists
    existing = find_node(nodes, "Transcription Router")
    if existing:
        print("\nTranscription Router already exists. Updating code...")
        existing["parameters"]["jsCode"] = ROUTER_CODE
        return workflow

    if dry_run:
        print("\n[DRY RUN] Would insert Transcription Router node")
        return workflow

    # Position between source and Replicate
    rep_pos = replicate_node.get("position", [0, 0])
    ROUTER_NODE["position"] = [rep_pos[0] - 250, rep_pos[1]]

    # Add node
    nodes.append(ROUTER_NODE)

    # Rewire: source → Router → Replicate
    if source_node and source_node in connections:
        for output_key, conn_lists in connections[source_node].items():
            for conn_list in conn_lists:
                for conn in conn_list:
                    if conn.get("node") == replicate_name:
                        conn["node"] = "Transcription Router"

    connections["Transcription Router"] = {
        "main": [
            [{"node": replicate_name, "type": "main", "index": 0}]
        ]
    }

    workflow["nodes"] = nodes
    workflow["connections"] = connections
    return workflow


def main():
    dry_run = "--dry-run" in sys.argv

    # Parse provider override
    provider = None
    for i, arg in enumerate(sys.argv):
        if arg == "--provider" and i + 1 < len(sys.argv):
            provider = sys.argv[i + 1]

    print("=" * 60)
    print("RunPod Transcription Deployment v1.0")
    print("=" * 60)

    if provider:
        print(f"\nProvider override: {provider}")
        print("Note: Set WHISPERX_PROVIDER env var in n8n to make this permanent.")

    # 1. Fetch workflow
    print("\nFetching Submit Transcription workflow...")
    workflow = deploy.fetch_workflow("submit-transcription")
    print(f"  Workflow: {workflow['name']} (ID: {workflow['id']})")
    print(f"  Nodes: {len(workflow.get('nodes', []))}")

    # 2. Snapshot
    if not dry_run:
        snapshot_path = deploy.snapshot_workflow(workflow, label="pre-runpod-router")
        print(f"  Snapshot: {snapshot_path}")

    # 3. Insert Router
    workflow = insert_router_node(workflow, dry_run=dry_run)

    # 4. Validate
    print("\nValidating all Code nodes...")
    valid, errors = deploy.validate_code_nodes(workflow)

    if not valid:
        print(f"\nERROR: {len(errors)} validation error(s):")
        for err in errors:
            print(f"  [{err['node_name']}] {err['error_message']}")
        if not dry_run:
            print("\nAborting deployment.")
            sys.exit(1)
    else:
        print("  All Code nodes valid.")

    if dry_run:
        print("\n[DRY RUN] No changes deployed.")
        return

    # 5. Deploy
    print("\nDeploying workflow...")
    deploy.deploy_workflow(workflow)
    print("  Deployed successfully.")

    # 6. Verify
    print("\nVerifying deployment...")
    v_valid, v_errors, _ = deploy.verify_deployment("submit-transcription")

    if not v_valid:
        print(f"\nWARNING: Post-deploy validation failed!")
        for err in v_errors:
            print(f"  [{err['node_name']}] {err['error_message']}")
        print("\nRollback with: python3 scripts/n8n-deploy.py submit-transcription --rollback")
    else:
        print("  Post-deploy validation passed.")

    print("\n" + "=" * 60)
    print("RunPod Transcription Router deployed!")
    print("")
    print("Next steps:")
    print("  1. Set RUNPOD_API_KEY and RUNPOD_ENDPOINT_ID in n8n environment")
    print("  2. Set WHISPERX_PROVIDER=split_50 for A/B testing")
    print("  3. Monitor processing_time_s and errors for 1 week")
    print("  4. Set WHISPERX_PROVIDER=runpod for full cutover")
    print("=" * 60)


if __name__ == "__main__":
    main()
