#!/usr/bin/env python3
"""
Import payroll data from American + Canadian XLSX files into Supabase.
Populates the payroll_periods table and fills missing hourly_wage in employee_directory.

Usage:
    python scripts/payroll-import.py
    python scripts/payroll-import.py --dry-run
"""

import os
import sys
import json
import argparse
from difflib import SequenceMatcher

try:
    import openpyxl
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip3 install openpyxl")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip3 install requests")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
BLOCKLIST_PATH = os.path.join(os.path.dirname(__file__), "pitch-health-blocklist.json")

AMERICAN_FILE = os.path.expanduser(
    "~/Desktop/American Pay January 18th - January 31st, 2026 2.xlsx"
)
CANADIAN_FILE = os.path.expanduser(
    "~/Desktop/Canadian Pay January 25th - February 7th, 2026 FINAL.xlsx"
)

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

HEADERS_UPSERT = {
    **HEADERS,
    "Prefer": "resolution=merge-duplicates,return=minimal",
}


def load_blocklist():
    if os.path.exists(BLOCKLIST_PATH):
        with open(BLOCKLIST_PATH) as f:
            data = json.load(f)
        return set(n.strip().lower() for n in data)
    return set()


def load_env():
    """Load .env.local if SUPABASE_URL not set."""
    global SUPABASE_URL, SUPABASE_KEY, HEADERS, HEADERS_UPSERT
    if SUPABASE_URL and SUPABASE_KEY:
        return
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    os.environ[k.strip()] = v.strip().strip('"').strip("'")
        SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
        SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        HEADERS["apikey"] = SUPABASE_KEY
        HEADERS["Authorization"] = f"Bearer {SUPABASE_KEY}"
        HEADERS_UPSERT["apikey"] = SUPABASE_KEY
        HEADERS_UPSERT["Authorization"] = f"Bearer {SUPABASE_KEY}"


def fetch_employees():
    """Fetch active employees from employee_directory."""
    url = f"{SUPABASE_URL}/rest/v1/employee_directory?select=id,first_name,last_name,hourly_wage,country,employee_status&employee_status=eq.Active"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()


def safe_float(val):
    """Convert cell value to float, handling None, #N/A, strings."""
    if val is None:
        return 0.0
    if isinstance(val, str):
        val = val.strip().replace("$", "").replace(",", "")
        if val in ("", "#N/A", "N/A", "-"):
            return 0.0
        try:
            return float(val)
        except ValueError:
            return 0.0
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def safe_int(val):
    return int(safe_float(val))


def parse_weekly_sheet(ws, country, period_start, period_end):
    """Parse a weekly payroll sheet (row 2 = headers, row 3+ = data)."""
    rows = list(ws.iter_rows(min_row=2, values_only=True))
    if not rows:
        return []

    # Row 0 is headers
    header = [str(c).strip() if c else "" for c in rows[0]]

    # Map column indices
    col_map = {}
    for i, h in enumerate(header):
        hl = h.lower()
        if "employee name" in hl:
            col_map["name"] = i
        elif hl == "total hours":
            col_map["hours"] = i
        elif "hourly rate" in hl:
            col_map["rate"] = i
        elif "total hourly pay" in hl:
            col_map["hourly_pay"] = i
        elif hl == "sla":
            col_map["sla"] = i
        elif "total transfers" in hl:
            col_map["transfers"] = i
        elif "commis" in hl and "total" in hl:
            col_map["commission"] = i
        elif hl == "bonus":
            col_map["bonus"] = i
        elif hl == "total pay":
            col_map["total_pay"] = i

    if "name" not in col_map:
        print(f"    WARNING: No 'Employee Name' column found in sheet")
        return []

    agents = []
    for row in rows[1:]:  # Skip header
        name_val = row[col_map["name"]]
        if not name_val or not isinstance(name_val, str):
            continue
        name = name_val.strip()
        if not name or name.upper() in ("GRAND TOTAL", "TOTAL"):
            continue

        agents.append({
            "agent_name": name,
            "period_start": period_start,
            "period_end": period_end,
            "country": country,
            "hours_worked": safe_float(row[col_map.get("hours", -1)] if col_map.get("hours") is not None and col_map["hours"] < len(row) else None),
            "hourly_rate": safe_float(row[col_map.get("rate", -1)] if col_map.get("rate") is not None and col_map["rate"] < len(row) else None),
            "hourly_pay": safe_float(row[col_map.get("hourly_pay", -1)] if col_map.get("hourly_pay") is not None and col_map["hourly_pay"] < len(row) else None),
            "sla_transfers": safe_int(row[col_map.get("transfers", -1)] if col_map.get("transfers") is not None and col_map["transfers"] < len(row) else None),
            "commission": safe_float(row[col_map.get("commission", -1)] if col_map.get("commission") is not None and col_map["commission"] < len(row) else None),
            "bonus": safe_float(row[col_map.get("bonus", -1)] if col_map.get("bonus") is not None and col_map["bonus"] < len(row) else None),
            "total_pay": safe_float(row[col_map.get("total_pay", -1)] if col_map.get("total_pay") is not None and col_map["total_pay"] < len(row) else None),
        })

    return agents


def build_name_lookup(employees):
    """Build tiered name lookup from employee_directory."""
    exact = {}  # "first last" → employee
    last_initial = {}  # "last f" → employee

    for emp in employees:
        fn = (emp.get("first_name") or "").strip()
        ln = (emp.get("last_name") or "").strip()
        full = f"{fn} {ln}".strip().lower()
        if full:
            exact[full] = emp

        if ln and fn:
            key = f"{ln} {fn[0]}".lower()
            last_initial[key] = emp

    return exact, last_initial


def match_employee(name, exact_map, last_initial_map, all_employees):
    """Tiered name matching: exact → last+initial → fuzzy."""
    name_lower = name.strip().lower()

    # Tier 1: Exact match
    if name_lower in exact_map:
        return exact_map[name_lower], "exact"

    # Tier 2: Last name + first initial
    parts = name_lower.split()
    if len(parts) >= 2:
        key = f"{parts[-1]} {parts[0][0]}"
        if key in last_initial_map:
            return last_initial_map[key], "last_initial"

    # Tier 3: Fuzzy match
    best_score = 0
    best_emp = None
    for emp in all_employees:
        fn = (emp.get("first_name") or "").strip()
        ln = (emp.get("last_name") or "").strip()
        full = f"{fn} {ln}".strip().lower()
        if not full:
            continue
        score = SequenceMatcher(None, name_lower, full).ratio()
        if score > best_score:
            best_score = score
            best_emp = emp
    if best_score >= 0.8:
        return best_emp, "fuzzy"

    return None, None


def main():
    parser = argparse.ArgumentParser(description="Import payroll XLSX to Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Parse and display without writing to DB")
    args = parser.parse_args()

    load_env()
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        sys.exit(1)

    blocklist = load_blocklist()
    print(f"Loaded Pitch Health blocklist: {len(blocklist)} names")

    # ── Parse American payroll ────────────────────────────────
    all_agents = []
    if os.path.exists(AMERICAN_FILE):
        print(f"\nParsing American payroll: {os.path.basename(AMERICAN_FILE)}")
        wb = openpyxl.load_workbook(AMERICAN_FILE, read_only=True, data_only=True)

        # Week 1: Jan 18 - Jan 24
        if "January 18th - January 24th" in wb.sheetnames:
            agents = parse_weekly_sheet(
                wb["January 18th - January 24th"], "USA", "2026-01-18", "2026-01-24"
            )
            print(f"  Week 1 (Jan 18-24): {len(agents)} agents")
            all_agents.extend(agents)

        # Week 2: Jan 25 - Jan 31
        if "January 25th - January 31st" in wb.sheetnames:
            agents = parse_weekly_sheet(
                wb["January 25th - January 31st"], "USA", "2026-01-25", "2026-01-31"
            )
            print(f"  Week 2 (Jan 25-31): {len(agents)} agents")
            all_agents.extend(agents)

        wb.close()
    else:
        print(f"WARNING: American payroll file not found: {AMERICAN_FILE}")

    # ── Parse Canadian payroll ────────────────────────────────
    if os.path.exists(CANADIAN_FILE):
        print(f"\nParsing Canadian payroll: {os.path.basename(CANADIAN_FILE)}")
        wb = openpyxl.load_workbook(CANADIAN_FILE, read_only=True, data_only=True)

        # Week 1: Jan 25 - Jan 31
        if "January 25th - January 31st" in wb.sheetnames:
            agents = parse_weekly_sheet(
                wb["January 25th - January 31st"], "Canada", "2026-01-25", "2026-01-31"
            )
            print(f"  Week 1 (Jan 25-31): {len(agents)} agents")
            all_agents.extend(agents)

        # Week 2: Feb 1 - Feb 7
        if "February 1st - February 7th" in wb.sheetnames:
            agents = parse_weekly_sheet(
                wb["February 1st - February 7th"], "Canada", "2026-02-01", "2026-02-07"
            )
            print(f"  Week 2 (Feb 1-7): {len(agents)} agents")
            all_agents.extend(agents)

        wb.close()
    else:
        print(f"WARNING: Canadian payroll file not found: {CANADIAN_FILE}")

    # ── Filter Pitch Health ───────────────────────────────────
    before_count = len(all_agents)
    all_agents = [a for a in all_agents if a["agent_name"].strip().lower() not in blocklist]
    filtered = before_count - len(all_agents)
    print(f"\nFiltered {filtered} Pitch Health agents, {len(all_agents)} remaining")

    # ── Cross-reference with employee_directory ───────────────
    print("\nFetching employee directory...")
    employees = fetch_employees()
    print(f"  {len(employees)} Active employees")

    exact_map, li_map = build_name_lookup(employees)

    matched = 0
    unmatched = []
    wage_updates = []

    for agent in all_agents:
        emp, method = match_employee(agent["agent_name"], exact_map, li_map, employees)
        if emp:
            agent["employee_id"] = emp["id"]
            matched += 1

            # Check for missing wages
            if emp.get("hourly_wage") is None and agent["hourly_rate"] > 0:
                wage_updates.append({
                    "id": emp["id"],
                    "name": f"{emp['first_name']} {emp['last_name']}",
                    "hourly_wage": agent["hourly_rate"],
                })
        else:
            agent["employee_id"] = None
            unmatched.append(agent["agent_name"])

    print(f"  Matched: {matched} | Unmatched: {len(unmatched)}")
    if wage_updates:
        print(f"  Missing wages to fill: {len(wage_updates)}")
        for w in wage_updates:
            print(f"    {w['name']}: ${w['hourly_wage']}")

    if unmatched[:10]:
        print(f"\n  First 10 unmatched: {', '.join(unmatched[:10])}")

    if args.dry_run:
        print(f"\n[DRY RUN] Would insert {len(all_agents)} payroll records")
        print(f"[DRY RUN] Would update {len(wage_updates)} missing wages")

        # Print summary
        usa = [a for a in all_agents if a["country"] == "USA"]
        can = [a for a in all_agents if a["country"] == "Canada"]
        print(f"\nSummary:")
        print(f"  USA: {len(usa)} records, ${sum(a['total_pay'] for a in usa):,.2f} total pay")
        print(f"  Canada: {len(can)} records, ${sum(a['total_pay'] for a in can):,.2f} total pay")
        return

    # ── Write to payroll_periods ──────────────────────────────
    print(f"\nInserting {len(all_agents)} payroll records...")
    url = f"{SUPABASE_URL}/rest/v1/payroll_periods"

    # Batch upsert in chunks of 100
    batch_size = 100
    inserted = 0
    for i in range(0, len(all_agents), batch_size):
        batch = all_agents[i : i + batch_size]
        resp = requests.post(url, headers=HEADERS_UPSERT, json=batch)
        if resp.status_code in (200, 201):
            inserted += len(batch)
            print(f"  Inserted {inserted}/{len(all_agents)}")
        else:
            print(f"  ERROR at batch {i}: {resp.status_code} {resp.text[:200]}")

    # ── Fill missing wages ────────────────────────────────────
    if wage_updates:
        print(f"\nUpdating {len(wage_updates)} missing hourly wages...")
        for w in wage_updates:
            url = f"{SUPABASE_URL}/rest/v1/employee_directory?id=eq.{w['id']}"
            resp = requests.patch(url, headers=HEADERS, json={"hourly_wage": w["hourly_wage"]})
            if resp.status_code in (200, 204):
                print(f"  Updated {w['name']}: ${w['hourly_wage']}")
            else:
                print(f"  ERROR updating {w['name']}: {resp.status_code}")

    print("\nDone!")


if __name__ == "__main__":
    main()
