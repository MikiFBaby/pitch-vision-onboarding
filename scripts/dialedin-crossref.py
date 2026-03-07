#!/usr/bin/env python3
"""
Cross-reference DialedIn agent data against employee_directory.
Uses the most recent 2 days of data (typically Friday + Saturday).
Also computes performance averages across all available dates.

Usage:
    python scripts/dialedin-crossref.py
    python scripts/dialedin-crossref.py --dates 2026-02-20,2026-02-21
"""

import os
import sys
import json
import argparse
import requests
from collections import defaultdict
from difflib import SequenceMatcher
from dotenv import load_dotenv

# Load .env.local
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

SUPABASE_URL = os.getenv('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY')
OUTPUT_DIR = os.path.expanduser("~/Desktop/reports")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required in .env.local")
    sys.exit(1)

HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': f'Bearer {SUPABASE_KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

# Load Pitch Health blocklist
BLOCKLIST_PATH = os.path.join(os.path.dirname(__file__), 'pitch-health-blocklist.json')
PITCH_HEALTH_NAMES = set()
if os.path.exists(BLOCKLIST_PATH):
    with open(BLOCKLIST_PATH) as f:
        PITCH_HEALTH_NAMES = {n.strip().lower() for n in json.load(f)}


def supabase_get(table, params=None):
    """GET from Supabase REST API with pagination."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    all_data = []
    offset = 0
    limit = 1000
    while True:
        p = dict(params or {})
        p['offset'] = str(offset)
        p['limit'] = str(limit)
        resp = requests.get(url, headers=HEADERS, params=p)
        if resp.status_code != 200:
            print(f"  ERROR: {table} query failed: {resp.status_code} {resp.text[:200]}")
            break
        batch = resp.json()
        all_data.extend(batch)
        if len(batch) < limit:
            break
        offset += limit
    return all_data


def supabase_patch(table, match_params, body):
    """PATCH (update) rows in Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    resp = requests.patch(url, headers=HEADERS, params=match_params, json=body)
    return resp.status_code in (200, 204)


def is_pitch_health(agent_name, team):
    """Check if agent is Pitch Health (by team or blocklist)."""
    if team and 'pitch health' in team.lower():
        return True
    if agent_name and agent_name.strip().lower() in PITCH_HEALTH_NAMES:
        return True
    return False


def normalize_name(name):
    """Normalize a name for comparison."""
    if not name:
        return ''
    return ' '.join(name.strip().lower().split())


def similarity(a, b):
    """String similarity ratio (0-1)."""
    return SequenceMatcher(None, a, b).ratio()


def match_agents_to_employees(agents, employees):
    """
    Tiered name matching:
    - Tier 1: Exact match (first_name + last_name == agent_name)
    - Tier 2: Last name + first initial match
    - Tier 3: Fuzzy match (similarity > 0.8)
    """
    # Build employee lookup
    emp_by_fullname = {}
    emp_by_last_initial = defaultdict(list)
    emp_list = []

    for emp in employees:
        fn = (emp.get('first_name') or '').strip()
        ln = (emp.get('last_name') or '').strip()
        full = normalize_name(f"{fn} {ln}")
        if full:
            emp_by_fullname[full] = emp
        if ln and fn:
            key = f"{ln.lower()} {fn[0].lower()}"
            emp_by_last_initial[key].append(emp)
        emp_list.append((full, emp))

    matches = {}  # agent_name -> (employee, tier, confidence)
    unmatched_agents = []

    for agent_name in agents:
        norm = normalize_name(agent_name)
        if not norm:
            continue

        # Tier 1: Exact match
        if norm in emp_by_fullname:
            matches[agent_name] = (emp_by_fullname[norm], 1, 1.0)
            continue

        # Tier 2: Last name + first initial
        parts = norm.split()
        if len(parts) >= 2:
            # Try "last first-initial"
            key = f"{parts[-1]} {parts[0][0]}"
            candidates = emp_by_last_initial.get(key, [])
            if len(candidates) == 1:
                matches[agent_name] = (candidates[0], 2, 0.9)
                continue

        # Tier 3: Fuzzy match
        best_score = 0
        best_emp = None
        for emp_full, emp in emp_list:
            if not emp_full:
                continue
            score = similarity(norm, emp_full)
            if score > best_score:
                best_score = score
                best_emp = emp
        if best_score >= 0.8 and best_emp:
            matches[agent_name] = (best_emp, 3, round(best_score, 3))
        else:
            unmatched_agents.append(agent_name)

    return matches, unmatched_agents


def compute_performance_averages(all_performance, matches):
    """Compute per-employee averages across all dates."""
    # Group performance by agent_name
    by_agent = defaultdict(list)
    for row in all_performance:
        by_agent[row['agent_name']].append(row)

    averages = []
    for agent_name, match_info in matches.items():
        emp, tier, conf = match_info
        rows = by_agent.get(agent_name, [])
        if not rows:
            continue

        days_worked = len(rows)
        avg_dials = sum(r.get('dials', 0) for r in rows) / days_worked
        avg_connects = sum(r.get('connects', 0) for r in rows) / days_worked
        avg_transfers = sum(r.get('transfers', 0) for r in rows) / days_worked
        avg_hours = sum(r.get('hours_worked', 0) for r in rows) / days_worked
        avg_tph = sum(r.get('tph', 0) for r in rows) / days_worked
        conv_rates = [r.get('conversion_rate', 0) for r in rows if r.get('conversion_rate') is not None]
        avg_conv = sum(conv_rates) / len(conv_rates) if conv_rates else 0

        # Recent vs prior week comparison
        dates = sorted(set(r['report_date'] for r in rows))
        recent_week = dates[-5:] if len(dates) >= 5 else dates
        prior_week = dates[-10:-5] if len(dates) >= 10 else []

        recent_tph = [r['tph'] for r in rows if r['report_date'] in recent_week and r.get('tph')]
        prior_tph = [r['tph'] for r in rows if r['report_date'] in prior_week and r.get('tph')]
        recent_avg = sum(recent_tph) / len(recent_tph) if recent_tph else 0
        prior_avg = sum(prior_tph) / len(prior_tph) if prior_tph else 0
        trend = round(recent_avg - prior_avg, 2) if prior_avg else None

        # Teams/skills seen
        teams = list(set(r.get('team', '') for r in rows if r.get('team')))
        skills = list(set(r.get('skill', '') for r in rows if r.get('skill')))

        averages.append({
            'agent_name': agent_name,
            'employee_id': emp.get('id'),
            'employee_name': f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(),
            'match_tier': tier,
            'match_confidence': conf,
            'days_worked': days_worked,
            'avg_dials': round(avg_dials, 1),
            'avg_connects': round(avg_connects, 1),
            'avg_transfers': round(avg_transfers, 1),
            'avg_hours': round(avg_hours, 2),
            'avg_tph': round(avg_tph, 2),
            'avg_conversion_rate': round(avg_conv, 2),
            'recent_week_tph': round(recent_avg, 2),
            'prior_week_tph': round(prior_avg, 2),
            'trend_tph': trend,
            'teams': teams,
            'skills': skills,
        })

    # Sort by avg TPH descending
    averages.sort(key=lambda x: x['avg_tph'], reverse=True)

    # Add rank
    for i, a in enumerate(averages, 1):
        a['rank'] = i

    return averages


def main():
    parser = argparse.ArgumentParser(description="Cross-reference DialedIn agents with employee directory")
    parser.add_argument('--dates', help="Comma-separated dates to use for cross-ref (default: latest 2)")
    parser.add_argument('--update-ids', action='store_true', help="Actually update employee_id in DB")
    parser.add_argument('--backfill-names', action='store_true', help="Backfill dialedin_name for tier-1/2 matches where NULL")
    args = parser.parse_args()

    print("=" * 70)
    print("  DialedIn Cross-Reference & Performance Averages")
    print("=" * 70)

    # 1. Get latest dates from dialedin_daily_kpis
    print("\n[1/6] Fetching available dates...")
    kpis = supabase_get('dialedin_daily_kpis', {
        'select': 'report_date',
        'order': 'report_date.desc',
    })
    all_dates = [k['report_date'] for k in kpis]
    print(f"  Found {len(all_dates)} dates in DB: {all_dates[-1] if all_dates else 'none'} → {all_dates[0] if all_dates else 'none'}")

    if args.dates:
        crossref_dates = [d.strip() for d in args.dates.split(',')]
    else:
        crossref_dates = all_dates[:2] if len(all_dates) >= 2 else all_dates[:1]

    if not crossref_dates:
        print("  ERROR: No dates available. Run bulk upload first.")
        return

    print(f"  Cross-ref dates: {crossref_dates}")

    # 2. Fetch agent performance for cross-ref dates
    print("\n[2/6] Fetching agent performance for cross-ref dates...")
    recent_agents = []
    for date in crossref_dates:
        batch = supabase_get('dialedin_agent_performance', {
            'select': '*',
            'report_date': f'eq.{date}',
        })
        recent_agents.extend(batch)
    print(f"  Found {len(recent_agents)} agent-day records for {crossref_dates}")

    # Filter out Pitch Health
    before_filter = len(recent_agents)
    recent_agents = [a for a in recent_agents if not is_pitch_health(a.get('agent_name', ''), a.get('team'))]
    filtered = before_filter - len(recent_agents)
    if filtered:
        print(f"  Filtered out {filtered} Pitch Health agents")

    # Unique agent names from recent data
    recent_agent_names = list(set(a['agent_name'] for a in recent_agents if a.get('agent_name')))
    recent_agent_names.sort()
    print(f"  Unique agents in recent data: {len(recent_agent_names)}")

    # 3. Fetch employee directory
    print("\n[3/6] Fetching employee directory (Active employees)...")
    employees = supabase_get('employee_directory', {
        'select': 'id,first_name,last_name,employee_status,role,hourly_wage,current_campaigns,country,dialedin_name',
        'employee_status': 'eq.Active',
    })
    print(f"  Found {len(employees)} Active employees")

    # 4. Match agents to employees
    print("\n[4/6] Matching DialedIn agents to employee directory...")
    matches, unmatched = match_agents_to_employees(recent_agent_names, employees)

    tier_counts = defaultdict(int)
    for _, (_, tier, _) in matches.items():
        tier_counts[tier] += 1

    print(f"  Matched: {len(matches)} agents")
    print(f"    Tier 1 (exact): {tier_counts.get(1, 0)}")
    print(f"    Tier 2 (last+initial): {tier_counts.get(2, 0)}")
    print(f"    Tier 3 (fuzzy): {tier_counts.get(3, 0)}")
    print(f"  Unmatched: {len(unmatched)} agents")

    # Find employees not in DialedIn data
    matched_emp_ids = {m[0]['id'] for m in matches.values()}
    agents_with_role = [e for e in employees if e.get('role') == 'Agent']
    missing_from_dialedin = [e for e in agents_with_role if e['id'] not in matched_emp_ids]
    print(f"\n  Active Agents NOT in recent DialedIn data: {len(missing_from_dialedin)}")

    # 5. Update employee_id in agent_performance (if requested)
    if args.update_ids and matches:
        print("\n[5/6] Updating employee_id in dialedin_agent_performance...")
        updated = 0
        failed = 0
        for agent_name, (emp, tier, conf) in matches.items():
            ok = supabase_patch(
                'dialedin_agent_performance',
                {'agent_name': f'eq.{agent_name}'},
                {'employee_id': emp['id']},
            )
            if ok:
                updated += 1
            else:
                failed += 1
        print(f"  Updated: {updated} agents, Failed: {failed}")
    else:
        print("\n[5/6] Skipping employee_id update (use --update-ids to enable)")

    # 5b. Backfill dialedin_name for tier-1/2 matches
    if args.backfill_names and matches:
        print("\n[5b] Backfilling dialedin_name for matched employees...")
        backfilled = 0
        skipped = 0
        for agent_name, (emp, tier, conf) in matches.items():
            if tier > 2:  # Only auto-apply tier 1 and 2 (exact + last+initial)
                continue
            if emp.get('dialedin_name'):  # Already has a dialedin_name
                skipped += 1
                continue
            ok = supabase_patch(
                'employee_directory',
                {'id': f'eq.{emp["id"]}'},
                {'dialedin_name': agent_name},
            )
            if ok:
                backfilled += 1
                print(f"    Set dialedin_name='{agent_name}' for {emp.get('first_name','')} {emp.get('last_name','')} (tier {tier})")
            else:
                print(f"    FAILED to set dialedin_name for {emp.get('first_name','')} {emp.get('last_name','')}")
        print(f"  Backfilled: {backfilled}, Already set: {skipped}, Tier 3 (skipped): {sum(1 for _, (_, t, _) in matches.items() if t == 3)}")

        # Print tier-3 fuzzy matches for manual review
        tier3 = [(n, m) for n, m in matches.items() if m[1] == 3]
        if tier3:
            print(f"\n  TIER 3 FUZZY MATCHES (manual review needed — NOT auto-applied):")
            for agent_name, (emp, _, conf) in sorted(tier3, key=lambda x: x[1][2], reverse=True):
                emp_name = f"{emp.get('first_name','')} {emp.get('last_name','')}".strip()
                print(f"    {agent_name:<35} → {emp_name:<35} (confidence: {conf})")
    elif args.backfill_names:
        print("\n[5b] No matches to backfill")
    else:
        print("  (use --backfill-names to populate dialedin_name)")

    # 6. Fetch ALL performance data for averages
    print("\n[6/6] Computing performance averages across all dates...")
    all_performance = supabase_get('dialedin_agent_performance', {
        'select': 'agent_name,report_date,team,skill,dials,connects,transfers,hours_worked,tph,conversion_rate',
        'order': 'report_date.desc',
    })
    # Filter Pitch Health from all data too
    all_performance = [a for a in all_performance if not is_pitch_health(a.get('agent_name', ''), a.get('team'))]
    print(f"  Total performance records: {len(all_performance)}")

    averages = compute_performance_averages(all_performance, matches)
    print(f"  Computed averages for {len(averages)} matched employees")

    # === PRINT REPORTS ===

    # Unmatched agents report
    print("\n" + "=" * 70)
    print("  UNMATCHED DIALEDIN AGENTS (not in employee directory)")
    print("=" * 70)
    # Get team info for unmatched
    agent_team_lookup = {}
    for a in recent_agents:
        if a.get('agent_name') and a['agent_name'] in unmatched:
            agent_team_lookup[a['agent_name']] = a.get('team', '?')

    for name in sorted(unmatched):
        team = agent_team_lookup.get(name, '?')
        print(f"  {name:<35} Team: {team}")

    # Missing employees report
    print("\n" + "=" * 70)
    print("  ACTIVE AGENTS NOT IN RECENT DIALEDIN DATA")
    print("=" * 70)
    for emp in sorted(missing_from_dialedin, key=lambda e: f"{e.get('first_name','')} {e.get('last_name','')}"):
        name = f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip()
        campaigns = emp.get('current_campaigns') or []
        print(f"  {name:<35} Campaigns: {', '.join(campaigns) if campaigns else 'none'}")

    # Performance averages (top 30)
    print("\n" + "=" * 70)
    print("  TOP 30 AGENTS — PERFORMANCE AVERAGES (37 days)")
    print("=" * 70)
    print(f"  {'Rank':<5} {'Agent Name':<30} {'Days':<5} {'Avg TPH':<9} {'Avg Transfers':<15} {'Avg Hours':<10} {'Trend':<8} {'Team'}")
    print(f"  {'-'*5} {'-'*30} {'-'*5} {'-'*9} {'-'*15} {'-'*10} {'-'*8} {'-'*20}")
    for a in averages[:30]:
        trend_str = f"{a['trend_tph']:+.2f}" if a['trend_tph'] is not None else "N/A"
        teams = ', '.join(a['teams'][:2]) if a['teams'] else '?'
        print(f"  {a['rank']:<5} {a['agent_name']:<30} {a['days_worked']:<5} {a['avg_tph']:<9.2f} {a['avg_transfers']:<15.1f} {a['avg_hours']:<10.2f} {trend_str:<8} {teams}")

    # Campaign breakdown from recent data
    print("\n" + "=" * 70)
    print("  CAMPAIGN/TEAM BREAKDOWN (recent data)")
    print("=" * 70)
    team_counts = defaultdict(int)
    team_transfers = defaultdict(int)
    for a in recent_agents:
        team = a.get('team') or 'Unknown'
        team_counts[team] += 1
        team_transfers[team] += a.get('transfers', 0)

    for team in sorted(team_counts.keys(), key=lambda t: team_transfers[t], reverse=True):
        print(f"  {team:<45} Agents: {team_counts[team]:<5} Transfers: {team_transfers[team]}")

    # Save full report to JSON
    report = {
        'crossref_dates': crossref_dates,
        'total_dates_available': len(all_dates),
        'matched_count': len(matches),
        'unmatched_count': len(unmatched),
        'unmatched_agents': [
            {'name': n, 'team': agent_team_lookup.get(n, '?')} for n in sorted(unmatched)
        ],
        'missing_from_dialedin': [
            {
                'name': f"{e.get('first_name', '')} {e.get('last_name', '')}".strip(),
                'id': e['id'],
                'campaigns': e.get('current_campaigns') or [],
            }
            for e in missing_from_dialedin
        ],
        'performance_averages': averages,
        'team_breakdown': [
            {'team': t, 'agent_count': team_counts[t], 'transfers': team_transfers[t]}
            for t in sorted(team_counts.keys(), key=lambda t: team_transfers[t], reverse=True)
        ],
        'tier_1_matches': [
            {'agent': name, 'employee': f"{m[0].get('first_name','')} {m[0].get('last_name','')}".strip(), 'employee_id': m[0]['id']}
            for name, m in matches.items() if m[1] == 1
        ],
        'tier_2_matches': [
            {'agent': name, 'employee': f"{m[0].get('first_name','')} {m[0].get('last_name','')}".strip(), 'employee_id': m[0]['id'], 'confidence': m[2]}
            for name, m in matches.items() if m[1] == 2
        ],
        'tier_3_matches': [
            {'agent': name, 'employee': f"{m[0].get('first_name','')} {m[0].get('last_name','')}".strip(), 'employee_id': m[0]['id'], 'confidence': m[2]}
            for name, m in matches.items() if m[1] == 3
        ],
    }

    output_path = os.path.join(OUTPUT_DIR, 'crossref_report.json')
    with open(output_path, 'w') as f:
        json.dump(report, f, indent=2, default=str)
    print(f"\n  Full report saved to: {output_path}")

    print("\n" + "=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    print(f"  Cross-ref dates:             {', '.join(crossref_dates)}")
    print(f"  Agents in recent data:       {len(recent_agent_names)}")
    print(f"  Matched to directory:        {len(matches)}")
    print(f"  Unmatched (DialedIn only):   {len(unmatched)}")
    print(f"  Active agents missing data:  {len(missing_from_dialedin)}")
    print(f"  Performance avg computed:    {len(averages)} employees")
    print(f"  Report saved:                {output_path}")
    print("=" * 70)


if __name__ == "__main__":
    main()
