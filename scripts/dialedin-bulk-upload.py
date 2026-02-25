#!/usr/bin/env python3
"""
Bulk upload DialedIn XLS reports to the local dev server API.
Groups files by end-date (from filename) and POSTs each date batch.

Usage:
    python scripts/dialedin-bulk-upload.py
    python scripts/dialedin-bulk-upload.py --dry-run
    python scripts/dialedin-bulk-upload.py --reports-dir ~/Desktop/reports
    python scripts/dialedin-bulk-upload.py --date 2026-02-21   # single date only
"""

import os
import re
import sys
import json
import time
import glob
import argparse
import requests

REPORTS_DIR = os.path.expanduser("~/Desktop/reports")
API_URL = "http://localhost:3000/api/dialedin/upload"
MANIFEST_FILE = os.path.join(REPORTS_DIR, ".bulk_upload_manifest.json")

DATE_PATTERN = re.compile(r'(\d{2})-(\d{2})-(\d{4})_(\d{2})-(\d{2})-(\d{4})')


def extract_end_date(filename):
    """Extract end date from filename pattern MM-DD-YYYY_MM-DD-YYYY, return as YYYY-MM-DD."""
    m = DATE_PATTERN.search(filename)
    if m:
        mm, dd, yyyy = m.group(4), m.group(5), m.group(6)
        return f"{yyyy}-{mm}-{dd}"
    return None


def load_manifest():
    if os.path.exists(MANIFEST_FILE):
        with open(MANIFEST_FILE, 'r') as f:
            return json.load(f)
    return {"completed_dates": [], "errors": []}


def save_manifest(manifest):
    with open(MANIFEST_FILE, 'w') as f:
        json.dump(manifest, f, indent=2)


def find_and_group_files(reports_dir):
    """Find all .xls files and group by their end-date."""
    files_by_date = {}
    all_xls = glob.glob(os.path.join(reports_dir, "**", "*.xls"), recursive=True)

    for filepath in all_xls:
        filename = os.path.basename(filepath)
        # Skip manifest and summary files
        if filename.startswith('.') or '/summaries/' in filepath:
            continue
        end_date = extract_end_date(filename)
        if not end_date:
            print(f"  SKIP (no date): {filename}")
            continue
        if end_date not in files_by_date:
            files_by_date[end_date] = {}
        # Deduplicate by filename (same file may appear in multiple date folders)
        files_by_date[end_date][filename] = filepath

    # Convert dict-of-dicts to dict-of-lists
    return {date: list(paths.values()) for date, paths in files_by_date.items()}


def upload_date_batch(date, filepaths, dry_run=False):
    """Upload all files for a given date to the API."""
    print(f"\n{'=' * 60}")
    print(f"  Date: {date} — {len(filepaths)} files")
    print(f"{'=' * 60}")

    for fp in sorted(filepaths):
        print(f"    {os.path.basename(fp)}")

    if dry_run:
        print(f"  [DRY RUN] Would upload {len(filepaths)} files")
        return {"success": True, "dry_run": True}

    # Build multipart form data
    files_payload = []
    for fp in filepaths:
        filename = os.path.basename(fp)
        files_payload.append(
            ('files', (filename, open(fp, 'rb'), 'application/vnd.ms-excel'))
        )

    try:
        resp = requests.post(API_URL, files=files_payload, timeout=120)
        # Close file handles
        for _, (_, fh, _) in files_payload:
            fh.close()

        if resp.status_code == 200:
            data = resp.json()
            computed = data.get('computed', False)
            summary = data.get('summary', {})
            checklist = data.get('checklist', {})

            status = "COMPUTED" if computed else f"STORED ({checklist.get('received', '?')}/{checklist.get('total', '?')} reports)"
            agents = summary.get('agents', '-')
            transfers = summary.get('transfers', '-')
            tph = summary.get('tph', '-')

            print(f"  => {status}")
            if computed:
                print(f"     Agents: {agents} | Transfers: {transfers} | TPH: {tph}")
            return data
        else:
            error_msg = f"HTTP {resp.status_code}: {resp.text[:200]}"
            print(f"  => ERROR: {error_msg}")
            return {"success": False, "error": error_msg}
    except requests.exceptions.ConnectionError:
        print(f"  => ERROR: Cannot connect to {API_URL}. Is the dev server running?")
        return {"success": False, "error": "Connection refused"}
    except Exception as e:
        print(f"  => ERROR: {e}")
        return {"success": False, "error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Bulk upload DialedIn reports to API")
    parser.add_argument('--reports-dir', default=REPORTS_DIR, help="Path to reports directory")
    parser.add_argument('--dry-run', action='store_true', help="List files without uploading")
    parser.add_argument('--date', help="Upload only a specific date (YYYY-MM-DD)")
    parser.add_argument('--resume', action='store_true', help="Skip already-completed dates")
    parser.add_argument('--api-url', default=API_URL, help="Upload API URL")
    args = parser.parse_args()

    reports_dir = args.reports_dir
    if not os.path.isdir(reports_dir):
        print(f"ERROR: Reports directory not found: {reports_dir}")
        sys.exit(1)

    # Find and group files
    print(f"Scanning {reports_dir} for XLS files...")
    files_by_date = find_and_group_files(reports_dir)
    total_files = sum(len(v) for v in files_by_date.values())
    print(f"Found {total_files} XLS files across {len(files_by_date)} dates\n")

    if not files_by_date:
        print("No XLS files found.")
        return

    # Filter to specific date if requested
    if args.date:
        if args.date not in files_by_date:
            print(f"No files found for date {args.date}")
            print(f"Available dates: {', '.join(sorted(files_by_date.keys()))}")
            return
        files_by_date = {args.date: files_by_date[args.date]}

    # Load manifest for resume
    manifest = load_manifest()
    if args.resume:
        skip_count = 0
        for d in list(files_by_date.keys()):
            if d in manifest["completed_dates"]:
                del files_by_date[d]
                skip_count += 1
        if skip_count:
            print(f"Resuming: skipping {skip_count} already-completed dates")

    # Sort dates chronologically
    sorted_dates = sorted(files_by_date.keys())

    print(f"Will process {len(sorted_dates)} dates: {sorted_dates[0]} → {sorted_dates[-1]}")
    if args.dry_run:
        print("[DRY RUN MODE]")

    # Process each date
    success_count = 0
    error_count = 0
    start_time = time.time()

    for i, date in enumerate(sorted_dates, 1):
        filepaths = files_by_date[date]
        print(f"\n[{i}/{len(sorted_dates)}]", end="")
        result = upload_date_batch(date, filepaths, dry_run=args.dry_run)

        if result.get("success", False) or result.get("computed", False) or result.get("dry_run"):
            success_count += 1
            if not args.dry_run:
                manifest["completed_dates"].append(date)
                save_manifest(manifest)
        else:
            error_count += 1
            manifest["errors"].append({"date": date, "error": result.get("error", "unknown")})
            save_manifest(manifest)

        # Small delay between batches to avoid overwhelming the server
        if not args.dry_run and i < len(sorted_dates):
            time.sleep(1)

    elapsed = time.time() - start_time
    print(f"\n{'=' * 60}")
    print(f"BULK UPLOAD COMPLETE")
    print(f"  Dates processed: {success_count} success, {error_count} errors")
    print(f"  Total time: {elapsed:.1f}s")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
