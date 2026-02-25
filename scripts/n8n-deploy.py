#!/usr/bin/env python3
"""
n8n Workflow Deployment Wrapper — Safe deployment with validation and rollback.

Usage as a library (from other deployment scripts):

    from importlib.util import spec_from_file_location, module_from_spec
    spec = spec_from_file_location("deploy", "scripts/n8n-deploy.py")
    deploy = module_from_spec(spec)
    spec.loader.exec_module(deploy)

    # Fetch, modify, deploy safely
    workflow = deploy.fetch_workflow("AhPORSIrn7Ygyadn")
    # ... modify workflow nodes ...
    deploy.safe_deploy(workflow)

Usage standalone (validate + snapshot only):

    python3 scripts/n8n-deploy.py AhPORSIrn7Ygyadn          # snapshot + validate current
    python3 scripts/n8n-deploy.py AhPORSIrn7Ygyadn --rollback 2026-02-13T15_42_23  # rollback

Safety features:
1. Pre-deployment syntax validation (Node.js) for all Code nodes
2. Automatic snapshot before every deploy (JSON file)
3. Post-deployment verification (re-fetch + re-validate)
4. Rollback from any snapshot
"""

import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import requests

# ─── Configuration ───────────────────────────────────────────────────────────

API_BASE = "https://n8n.pitchvision.io/api/v1/workflows"
API_KEY = os.environ.get("N8N_API_KEY")
if not API_KEY:
    # Try loading from .env.local
    env_path = Path(__file__).parent.parent / ".env.local"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("N8N_API_KEY="):
                API_KEY = line.split("=", 1)[1].strip()
                break
    if not API_KEY:
        raise RuntimeError("N8N_API_KEY not found. Set it in .env.local or as an environment variable.")
HEADERS = {"X-N8N-API-KEY": API_KEY, "Content-Type": "application/json"}

SNAPSHOT_DIR = Path(__file__).parent.parent / ".n8n-snapshots"

# Workflow name aliases for convenience
WORKFLOW_ALIASES = {
    "ai-analysis": "AhPORSIrn7Ygyadn",
    "audio": "9wipkyWPDvqnRhXO",
    "transcription": "H72pFXMslQAzi4rI",
    "error-handler": "6KYZ8iIlZa0J35bt",
    "orchestrator": "pXsXeajgkUU4tRnY",
    "webhook": "oSeZ4uL50OeP4yPo",
}


# ─── Core Functions ──────────────────────────────────────────────────────────

def fetch_workflow(workflow_id):
    """Fetch a workflow by ID. Returns the full workflow dict."""
    workflow_id = WORKFLOW_ALIASES.get(workflow_id, workflow_id)
    url = f"{API_BASE}/{workflow_id}"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()


def validate_code_nodes(workflow):
    """Validate JavaScript syntax in all Code nodes using Node.js.

    Returns (valid: bool, errors: list[dict]).
    Each error dict has: node_name, error_message, line, column.
    """
    errors = []
    nodes = workflow.get("nodes", [])

    for node in nodes:
        js_code = None
        node_name = node.get("name", "Unknown")

        # Code node (jsCode)
        if "jsCode" in node.get("parameters", {}):
            js_code = node["parameters"]["jsCode"]
        # AI Agent systemMessage is not JS — skip

        if not js_code:
            continue

        # Wrap in async function to allow await and top-level patterns n8n uses
        # Also provide n8n globals as stubs so references don't cause ReferenceErrors
        wrapped = (
            "const $input = {first:()=>({json:{}}),all:()=>[{json:{}}],item:{json:{}}};\n"
            "const $json = {};\n"
            "const $ = new Proxy({}, {get: () => ({first:()=>({json:{}}),all:()=>[{json:{}}]})});\n"
            "const $node = {};\n"
            "const $env = {};\n"
            "const $execution = {id:'test'};\n"
            "const $prevNode = {name:'test'};\n"
            "const items = [{json:{}}];\n"
            "(async function() {\n"
            + js_code
            + "\n});"
        )

        # Write to temp file for --check (can't combine --check with -e)
        import tempfile
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".js", delete=False, encoding="utf-8"
        )
        tmp.write(wrapped)
        tmp.close()

        try:
            result = subprocess.run(
                ["node", "--check", tmp.name],
                capture_output=True,
                text=True,
                timeout=10,
            )
        finally:
            os.unlink(tmp.name)

        if result.returncode != 0:
            stderr = result.stderr.strip()

            # Parse line/column from Node.js error
            line_num = None
            error_msg = stderr

            # Node --check outputs like: /tmp/xyz.js:618
            line_match = re.search(r':(\d+)\b', stderr)
            if line_match:
                # Subtract the 8 stub lines we prepended + 1 for async wrapper
                line_num = int(line_match.group(1)) - 9

            # Extract the actual error message (last SyntaxError line)
            syntax_match = re.search(r'(SyntaxError: .+)', stderr)
            if syntax_match:
                error_msg = syntax_match.group(1)

            errors.append({
                "node_name": node_name,
                "error_message": error_msg,
                "line": line_num,
                "stderr": stderr,
            })

    return len(errors) == 0, errors


def snapshot_workflow(workflow, label=None):
    """Save a snapshot of the workflow to disk. Returns the snapshot path."""
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    workflow_id = workflow.get("id", "unknown")
    workflow_name = workflow.get("name", "unknown").replace(" ", "_").replace(":", "")
    timestamp = datetime.now().strftime("%Y-%m-%dT%H_%M_%S")
    label_part = f"_{label}" if label else ""

    filename = f"{workflow_name}_{workflow_id}_{timestamp}{label_part}.json"
    filepath = SNAPSHOT_DIR / filename

    # Save only the deployable fields + id for reference
    snapshot = {
        "id": workflow_id,
        "name": workflow.get("name"),
        "nodes": workflow.get("nodes"),
        "connections": workflow.get("connections"),
        "settings": workflow.get("settings", {}),
        "_snapshot_time": datetime.now().isoformat(),
        "_snapshot_label": label,
    }

    filepath.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    return filepath


def deploy_workflow(workflow):
    """Deploy a workflow via PUT. Returns the API response."""
    workflow_id = workflow.get("id")
    if not workflow_id:
        raise ValueError("Workflow must have an 'id' field")

    url = f"{API_BASE}/{workflow_id}"
    put_payload = {
        "name": workflow["name"],
        "nodes": workflow["nodes"],
        "connections": workflow["connections"],
        "settings": workflow.get("settings", {}),
    }

    resp = requests.put(url, headers=HEADERS, json=put_payload)
    resp.raise_for_status()
    return resp.json()


def verify_deployment(workflow_id):
    """Re-fetch and re-validate after deployment. Returns (valid, errors, workflow)."""
    workflow_id = WORKFLOW_ALIASES.get(workflow_id, workflow_id)
    workflow = fetch_workflow(workflow_id)
    valid, errors = validate_code_nodes(workflow)
    return valid, errors, workflow


def rollback_from_snapshot(snapshot_path):
    """Rollback a workflow from a snapshot file."""
    snapshot = json.loads(Path(snapshot_path).read_text(encoding="utf-8"))

    print(f"Rolling back to: {snapshot.get('_snapshot_label', 'unknown')}")
    print(f"  Snapshot time: {snapshot.get('_snapshot_time', 'unknown')}")
    print(f"  Workflow: {snapshot['name']}")

    result = deploy_workflow(snapshot)
    print(f"  Rolled back! Updated at: {result.get('updatedAt', 'unknown')}")
    return result


def safe_deploy(workflow, label=None, skip_snapshot=False):
    """The main entry point — validate, snapshot, deploy, verify.

    Args:
        workflow: The modified workflow dict (must include 'id')
        label: Optional label for the snapshot (e.g., "before_af12_fix")
        skip_snapshot: Skip snapshot (use if you already took one)

    Returns:
        dict with keys: success, snapshot_path, deploy_result, errors

    Raises:
        DeploymentError if validation fails pre-deploy.
    """
    result = {
        "success": False,
        "snapshot_path": None,
        "deploy_result": None,
        "errors": [],
    }

    workflow_id = workflow.get("id")
    if not workflow_id:
        raise ValueError("Workflow must have an 'id' field")

    # Step 1: Pre-deployment syntax validation
    print("\n[1/4] Validating syntax...")
    valid, errors = validate_code_nodes(workflow)
    if not valid:
        print("  BLOCKED — Syntax errors found:")
        for err in errors:
            line_info = f" (line ~{err['line']})" if err.get("line") else ""
            print(f"  ✗ {err['node_name']}{line_info}: {err['error_message']}")
        result["errors"] = errors
        raise DeploymentError(
            f"Syntax validation failed in {len(errors)} node(s). Deployment aborted.",
            errors=errors,
        )
    print(f"  ✓ All Code nodes pass syntax check")

    # Step 2: Snapshot current version
    if not skip_snapshot:
        print("\n[2/4] Taking snapshot of current version...")
        current = fetch_workflow(workflow_id)
        snapshot_path = snapshot_workflow(current, label=label or "pre_deploy")
        result["snapshot_path"] = str(snapshot_path)
        print(f"  ✓ Saved to {snapshot_path.name}")
    else:
        print("\n[2/4] Snapshot skipped")

    # Step 3: Deploy
    print("\n[3/4] Deploying...")
    deploy_result = deploy_workflow(workflow)
    result["deploy_result"] = deploy_result
    print(f"  ✓ Deployed! Updated at: {deploy_result.get('updatedAt', 'unknown')}")

    # Step 4: Post-deployment verification
    print("\n[4/4] Verifying deployment...")
    valid, errors, verified = verify_deployment(workflow_id)
    if not valid:
        print("  ✗ POST-DEPLOY VERIFICATION FAILED:")
        for err in errors:
            print(f"    {err['node_name']}: {err['error_message']}")

        if result["snapshot_path"]:
            print("\n  AUTO-ROLLING BACK...")
            rollback_from_snapshot(result["snapshot_path"])
            print("  ✓ Rolled back to previous version")

        result["errors"] = errors
        raise DeploymentError(
            "Post-deployment verification failed. Rolled back automatically.",
            errors=errors,
        )

    print(f"  ✓ All Code nodes verified")

    result["success"] = True
    print("\n✓ Deployment complete and verified.")
    return result


def list_snapshots(workflow_id=None):
    """List available snapshots, optionally filtered by workflow ID."""
    if not SNAPSHOT_DIR.exists():
        return []

    snapshots = []
    for f in sorted(SNAPSHOT_DIR.glob("*.json"), reverse=True):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            if workflow_id and data.get("id") != workflow_id:
                continue
            snapshots.append({
                "path": str(f),
                "filename": f.name,
                "workflow_id": data.get("id"),
                "workflow_name": data.get("name"),
                "time": data.get("_snapshot_time"),
                "label": data.get("_snapshot_label"),
            })
        except (json.JSONDecodeError, KeyError):
            continue

    return snapshots


class DeploymentError(Exception):
    """Raised when deployment validation fails."""
    def __init__(self, message, errors=None):
        super().__init__(message)
        self.errors = errors or []


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python3 scripts/n8n-deploy.py <workflow_id>              # validate + snapshot")
        print("  python3 scripts/n8n-deploy.py <workflow_id> --rollback <snapshot>  # rollback")
        print("  python3 scripts/n8n-deploy.py --list [workflow_id]       # list snapshots")
        print()
        print("Workflow aliases:")
        for alias, wid in WORKFLOW_ALIASES.items():
            print(f"  {alias:20s} → {wid}")
        sys.exit(1)

    if sys.argv[1] == "--list":
        wid = sys.argv[2] if len(sys.argv) > 2 else None
        wid = WORKFLOW_ALIASES.get(wid, wid)
        snapshots = list_snapshots(wid)
        if not snapshots:
            print("No snapshots found.")
        else:
            print(f"{'Time':<28s} {'Label':<20s} {'Workflow':<30s} Filename")
            print("─" * 120)
            for s in snapshots:
                print(f"{s['time'] or '?':<28s} {s['label'] or '':<20s} {s['workflow_name'] or '?':<30s} {s['filename']}")
        sys.exit(0)

    workflow_id = sys.argv[1]
    workflow_id = WORKFLOW_ALIASES.get(workflow_id, workflow_id)

    if "--rollback" in sys.argv:
        idx = sys.argv.index("--rollback")
        if idx + 1 >= len(sys.argv):
            # Show available snapshots
            snapshots = list_snapshots(workflow_id)
            if not snapshots:
                print("No snapshots available for rollback.")
                sys.exit(1)
            print("Available snapshots:")
            for i, s in enumerate(snapshots):
                print(f"  [{i}] {s['time']} ({s['label']}) — {s['filename']}")
            choice = input("\nRollback to which snapshot? [number]: ").strip()
            snapshot_path = snapshots[int(choice)]["path"]
        else:
            snapshot_path = sys.argv[idx + 1]
            # Could be a partial match on filename
            if not os.path.exists(snapshot_path):
                for s in list_snapshots(workflow_id):
                    if sys.argv[idx + 1] in s["filename"]:
                        snapshot_path = s["path"]
                        break

        rollback_from_snapshot(snapshot_path)
        sys.exit(0)

    # Default: validate + snapshot
    print(f"Fetching workflow {workflow_id}...")
    workflow = fetch_workflow(workflow_id)
    print(f"  {workflow['name']} ({len(workflow['nodes'])} nodes)")

    print("\nValidating syntax...")
    valid, errors = validate_code_nodes(workflow)
    if valid:
        print("  ✓ All Code nodes pass syntax check")
    else:
        print("  ✗ Syntax errors found:")
        for err in errors:
            line_info = f" (line ~{err['line']})" if err.get("line") else ""
            print(f"    {err['node_name']}{line_info}: {err['error_message']}")
        sys.exit(1)

    print("\nTaking snapshot...")
    path = snapshot_workflow(workflow, label="manual")
    print(f"  ✓ Saved to {path}")


if __name__ == "__main__":
    main()
