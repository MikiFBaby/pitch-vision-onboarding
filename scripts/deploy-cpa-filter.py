#!/usr/bin/env python3
"""
Deploy CPA (Compliance Pre-Audit) Filter to QA Pipeline v1.0

Inserts a lightweight pre-filter node into the AI Analysis workflow
that checks Medicare calls for double confirmation (A&B, RWB card,
transfer consent) before full AI analysis runs.

Usage:
    python3 scripts/deploy-cpa-filter.py              # deploy
    python3 scripts/deploy-cpa-filter.py --dry-run     # show what would change
    python3 scripts/n8n-deploy.py ai-analysis --rollback   # rollback if needed

The CPA Filter node is inserted between "Detect Product Type" and
"Auto Fail Filter" in the AI Analysis workflow.
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

# ─── Load CPA filter code ───────────────────────────────────────────

CPA_CODE_PATH = SCRIPTS_DIR / "cpa-filter-node.js"
if not CPA_CODE_PATH.exists():
    print(f"ERROR: CPA filter code not found at {CPA_CODE_PATH}")
    sys.exit(1)

cpa_js_code = CPA_CODE_PATH.read_text(encoding="utf-8")

# ─── Node definition ────────────────────────────────────────────────

CPA_NODE = {
    "parameters": {
        "jsCode": cpa_js_code,
        "mode": "runOnceForEachItem",
    },
    "id": "cpa-filter-v1",
    "name": "CPA Filter",
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [0, 0],  # Will be auto-positioned
}


def find_node(nodes, name):
    """Find a node by name (case-insensitive partial match)."""
    name_lower = name.lower()
    for node in nodes:
        if name_lower in node.get("name", "").lower():
            return node
    return None


def insert_cpa_node(workflow, dry_run=False):
    """Insert CPA Filter node into the workflow."""
    nodes = workflow.get("nodes", [])
    connections = workflow.get("connections", {})

    # Find insertion points
    detect_product = find_node(nodes, "Detect Product Type")
    auto_fail_filter = find_node(nodes, "Auto Fail Filter")

    if not detect_product:
        print("WARNING: 'Detect Product Type' node not found. Searching alternatives...")
        detect_product = find_node(nodes, "Extract Metadata")

    if not auto_fail_filter:
        print("ERROR: 'Auto Fail Filter' node not found in workflow.")
        sys.exit(1)

    if not detect_product:
        print("ERROR: Cannot find insertion point (Detect Product Type or Extract Metadata).")
        sys.exit(1)

    source_name = detect_product["name"]
    target_name = auto_fail_filter["name"]

    print(f"\nInsertion plan:")
    print(f"  BEFORE: {source_name} → {target_name}")
    print(f"  AFTER:  {source_name} → CPA Filter → {target_name}")

    # Check if CPA Filter already exists
    existing = find_node(nodes, "CPA Filter")
    if existing:
        print("\nCPA Filter node already exists. Updating code only...")
        existing["parameters"]["jsCode"] = cpa_js_code
        if dry_run:
            print("[DRY RUN] Would update CPA Filter code")
            return workflow
        return workflow

    # Position the new node between source and target
    src_pos = detect_product.get("position", [0, 0])
    tgt_pos = auto_fail_filter.get("position", [0, 0])
    CPA_NODE["position"] = [
        (src_pos[0] + tgt_pos[0]) // 2,
        (src_pos[1] + tgt_pos[1]) // 2,
    ]

    if dry_run:
        print(f"\n[DRY RUN] Would add CPA Filter node at position {CPA_NODE['position']}")
        print(f"[DRY RUN] Would rewire: {source_name} → CPA Filter → {target_name}")
        return workflow

    # Add the node
    nodes.append(CPA_NODE)

    # Rewire connections: source → CPA → target
    # 1. Find source's output connections to target and redirect to CPA
    if source_name in connections:
        for output_key, output_conns in connections[source_name].items():
            for conn_list in output_conns:
                for conn in conn_list:
                    if conn.get("node") == target_name:
                        conn["node"] = "CPA Filter"

    # 2. Add CPA → target connection
    connections["CPA Filter"] = {
        "main": [
            [{"node": target_name, "type": "main", "index": 0}]
        ]
    }

    workflow["nodes"] = nodes
    workflow["connections"] = connections

    return workflow


def main():
    dry_run = "--dry-run" in sys.argv

    print("=" * 60)
    print("CPA Filter Deployment v1.0")
    print("=" * 60)

    # 1. Fetch current workflow
    print("\nFetching AI Analysis workflow...")
    workflow = deploy.fetch_workflow("ai-analysis")
    print(f"  Workflow: {workflow['name']} (ID: {workflow['id']})")
    print(f"  Nodes: {len(workflow.get('nodes', []))}")

    # 2. Snapshot before changes
    if not dry_run:
        snapshot_path = deploy.snapshot_workflow(workflow, label="pre-cpa-filter")
        print(f"  Snapshot: {snapshot_path}")

    # 3. Insert CPA Filter
    workflow = insert_cpa_node(workflow, dry_run=dry_run)

    # 4. Validate all Code nodes
    print("\nValidating all Code nodes...")
    valid, errors = deploy.validate_code_nodes(workflow)

    if not valid:
        print(f"\nERROR: {len(errors)} validation error(s):")
        for err in errors:
            print(f"  [{err['node_name']}] {err['error_message']}")
        if not dry_run:
            print("\nAborting deployment. Fix errors and retry.")
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
    v_valid, v_errors, _ = deploy.verify_deployment("ai-analysis")

    if not v_valid:
        print(f"\nWARNING: Post-deploy validation failed!")
        for err in v_errors:
            print(f"  [{err['node_name']}] {err['error_message']}")
        print("\nRollback with: python3 scripts/n8n-deploy.py ai-analysis --rollback")
    else:
        print("  Post-deploy validation passed.")

    print("\n" + "=" * 60)
    print("CPA Filter deployed successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
