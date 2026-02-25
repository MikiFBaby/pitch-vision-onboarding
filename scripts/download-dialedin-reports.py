#!/usr/bin/env python3
"""
Download DialedIn (Chase) dialer reports from the reports@ inbox via IMAP.
Saves XLS attachments to ~/Desktop/reports/ organized by date.

Usage:
  python scripts/download-dialedin-reports.py          # Download all reports
  python scripts/download-dialedin-reports.py --days 30 # Last 30 days only
  python scripts/download-dialedin-reports.py --dry-run  # Preview without downloading
  python scripts/download-dialedin-reports.py --summarize # Download + parse + summarize
"""

import argparse
import email
import email.utils
import email.header
import imaplib
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

IMAP_HOST = 'imap.gmail.com'
IMAP_PORT = 993

# Known DialedIn sender addresses (Chase Data Corp)
DIALEDIN_SENDERS = [
    'notifications@chasedatacorp.com',
    'noreply@dialedincontactcenter.com',
    'reports@dialedin.com',
]

# 12 report types — order matters (most specific first)
REPORT_TYPES = [
    ('AgentSummarySubcampaign', re.compile(r'AgentSummarySubcampaign', re.I)),
    ('AgentSummaryCampaign',    re.compile(r'AgentSummaryCampaign', re.I)),
    ('AgentSummary',            re.compile(r'AgentSummary_', re.I)),
    ('AgentAnalysis',           re.compile(r'AgentAnalysis', re.I)),
    ('AgentPauseTime',          re.compile(r'AgentPauseTime', re.I)),
    ('SubcampaignSummary',      re.compile(r'SubcampaignSummary', re.I)),
    ('CampaignCallLog',         re.compile(r'CampaignCallLog', re.I)),
    ('CampaignSummary',         re.compile(r'CampaignSummary', re.I)),
    ('ProductionReportSubcampaign', re.compile(r'ProductionReportSubcampaign', re.I)),
    ('ProductionReport',        re.compile(r'ProductionReport_', re.I)),
    ('CallsPerHour',            re.compile(r'CallsPerHour', re.I)),
    ('ShiftReport',             re.compile(r'ShiftReport', re.I)),
]

DATE_RANGE_RE = re.compile(r'(\d{2}-\d{2}-\d{4})_(\d{2}-\d{4})')


def identify_report_type(filename):
    for name, pattern in REPORT_TYPES:
        if pattern.search(filename):
            return name
    return 'Unknown'


def extract_date_range(filename):
    match = re.search(r'(\d{2}-\d{2}-\d{4})_(\d{2}-\d{2}-\d{4})', filename)
    if match:
        return match.group(1), match.group(2)
    return None, None


# ---------------------------------------------------------------------------
# Credential loading
# ---------------------------------------------------------------------------

def load_credentials():
    """Load SMTP_USER and SMTP_PASS from .env.local"""
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env.local')
    if not os.path.exists(env_path):
        print(f"ERROR: .env.local not found at {env_path}")
        sys.exit(1)

    creds = {}
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('#') or '=' not in line:
                continue
            key, _, value = line.partition('=')
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key in ('SMTP_USER', 'SMTP_PASS'):
                creds[key] = value

    if 'SMTP_USER' not in creds or 'SMTP_PASS' not in creds:
        print("ERROR: SMTP_USER or SMTP_PASS not found in .env.local")
        sys.exit(1)

    return creds['SMTP_USER'], creds['SMTP_PASS']


# ---------------------------------------------------------------------------
# Manifest (dedup tracking)
# ---------------------------------------------------------------------------

def load_manifest(reports_dir):
    manifest_path = os.path.join(reports_dir, '.downloaded_manifest.json')
    if os.path.exists(manifest_path):
        with open(manifest_path) as f:
            return json.load(f)
    return {'downloaded_message_ids': [], 'files': []}


def save_manifest(reports_dir, manifest):
    manifest_path = os.path.join(reports_dir, '.downloaded_manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)


# ---------------------------------------------------------------------------
# Filename decoding
# ---------------------------------------------------------------------------

def decode_filename(raw_filename):
    """Decode RFC 2047 encoded filenames."""
    if not raw_filename:
        return None
    parts = email.header.decode_header(raw_filename)
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or 'utf-8', errors='replace'))
        else:
            decoded.append(part)
    return ''.join(decoded)


# ---------------------------------------------------------------------------
# Main download logic
# ---------------------------------------------------------------------------

def download_reports(args):
    user, password = load_credentials()
    reports_dir = os.path.expanduser(args.output)
    os.makedirs(reports_dir, exist_ok=True)

    manifest = load_manifest(reports_dir)
    already_downloaded = set(manifest['downloaded_message_ids'])

    print(f"Connecting to {IMAP_HOST}:{IMAP_PORT} as {user}...")
    imap = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    imap.login(user, password)
    print("  Logged in successfully.")

    imap.select('INBOX')

    # Build search query — IMAP OR takes exactly 2 args, so nest for 3+ senders
    # OR (OR FROM "a" FROM "b") FROM "c"
    def build_or_query(senders):
        if len(senders) == 1:
            return f'FROM "{senders[0]}"'
        if len(senders) == 2:
            return f'(OR FROM "{senders[0]}" FROM "{senders[1]}")'
        return f'(OR {build_or_query(senders[:-1])} FROM "{senders[-1]}")'

    sender_query = build_or_query(DIALEDIN_SENDERS)

    if args.days and not args.all:
        since_date = (datetime.now() - timedelta(days=args.days)).strftime('%d-%b-%Y')
        search_query = f'{sender_query} SINCE {since_date}'
        print(f"  Searching emails from last {args.days} days (since {since_date})...")
    else:
        search_query = sender_query
        print(f"  Searching ALL DialedIn emails...")

    status, data = imap.search(None, search_query)
    if status != 'OK':
        print(f"  Search failed: {status}")
        imap.logout()
        return

    message_ids = data[0].split()
    print(f"  Found {len(message_ids)} emails from DialedIn senders.")

    total_downloaded = 0
    total_skipped = 0
    total_errors = 0

    for i, msg_id in enumerate(message_ids):
        # Fetch the email
        status, msg_data = imap.fetch(msg_id, '(RFC822)')
        if status != 'OK':
            print(f"  [{i+1}/{len(message_ids)}] Failed to fetch message {msg_id}")
            total_errors += 1
            continue

        raw_email = msg_data[0][1]
        msg = email.message_from_bytes(raw_email)

        # Get message ID for dedup
        message_id = msg.get('Message-ID', str(msg_id))
        if message_id in already_downloaded:
            total_skipped += 1
            continue

        # Extract date
        date_str = msg.get('Date', '')
        try:
            msg_date = email.utils.parsedate_to_datetime(date_str)
        except Exception:
            msg_date = datetime.now()

        date_folder = msg_date.strftime('%Y-%m-%d')
        subject = msg.get('Subject', 'No Subject')

        # Walk attachments
        attachments_found = 0
        for part in msg.walk():
            content_disposition = str(part.get('Content-Disposition', ''))
            if 'attachment' not in content_disposition.lower():
                continue

            raw_fn = part.get_filename()
            filename = decode_filename(raw_fn)
            if not filename:
                continue

            if not filename.lower().endswith(('.xls', '.xlsx')):
                continue

            attachments_found += 1
            report_type = identify_report_type(filename)
            date_start, date_end = extract_date_range(filename)

            save_dir = os.path.join(reports_dir, date_folder)

            if args.dry_run:
                print(f"  [{i+1}/{len(message_ids)}] [DRY RUN] {filename}")
                print(f"    Type: {report_type} | Date: {date_start} to {date_end} | Folder: {date_folder}")
                total_downloaded += 1
                continue

            os.makedirs(save_dir, exist_ok=True)
            filepath = os.path.join(save_dir, filename)

            if os.path.exists(filepath):
                total_skipped += 1
                continue

            payload = part.get_payload(decode=True)
            if not payload:
                total_errors += 1
                continue

            with open(filepath, 'wb') as f:
                f.write(payload)

            total_downloaded += 1
            manifest['files'].append({
                'filename': filename,
                'report_type': report_type,
                'date_folder': date_folder,
                'date_range': f"{date_start} to {date_end}" if date_start else None,
                'email_subject': subject,
                'downloaded_at': datetime.now().isoformat(),
            })

            print(f"  [{i+1}/{len(message_ids)}] {filename} → {date_folder}/")

        # Mark message as processed
        if not args.dry_run:
            already_downloaded.add(message_id)
            manifest['downloaded_message_ids'].append(message_id)

        # Small delay to avoid rate limiting
        time.sleep(0.05)

    # Save manifest
    if not args.dry_run:
        save_manifest(reports_dir, manifest)

    imap.logout()

    print(f"\n{'='*60}")
    print(f"Download complete!")
    print(f"  Downloaded: {total_downloaded}")
    print(f"  Skipped (already exists): {total_skipped}")
    print(f"  Errors: {total_errors}")
    print(f"  Output: {reports_dir}")

    return reports_dir


# ---------------------------------------------------------------------------
# Summarize / Parse downloaded reports
# ---------------------------------------------------------------------------

def read_xls_to_records(filepath):
    """Read an XLS file using xlrd, with olefile fallback for corrupt headers."""
    import xlrd

    wb = None
    # Try direct xlrd first
    try:
        wb = xlrd.open_workbook(filepath)
    except Exception:
        # Fallback: extract Workbook stream via olefile (bypasses OLE2 FAT validation)
        try:
            import olefile
            ole = olefile.OleFileIO(filepath)
            if ole.exists('Workbook'):
                data = ole.openstream('Workbook').read()
                wb = xlrd.open_workbook(file_contents=data)
            ole.close()
        except Exception:
            pass

    if wb is None:
        return [], []

    # Try "Report" sheet, fall back to first sheet
    try:
        sheet = wb.sheet_by_name('Report')
    except Exception:
        sheet = wb.sheet_by_index(0)

    if sheet.nrows < 2:
        return [], []

    headers = [str(sheet.cell_value(0, c)).strip() for c in range(sheet.ncols)]
    records = []
    for r in range(1, sheet.nrows):
        row = {}
        for c in range(sheet.ncols):
            val = sheet.cell_value(r, c)
            cell_type = sheet.cell_type(r, c)
            # xlrd types: 0=empty, 1=text, 2=number, 3=date, 4=bool, 5=error
            if cell_type == 2:  # number
                row[headers[c]] = val
            else:
                row[headers[c]] = str(val).strip() if val else ''
        records.append(row)
    return headers, records


def safe_float(val):
    """Safely convert a value to float."""
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        cleaned = val.replace(',', '').replace('%', '').strip()
        try:
            return float(cleaned)
        except (ValueError, TypeError):
            return 0.0
    return 0.0


def summarize_reports(reports_dir):
    """Parse all downloaded XLS files and print a summary."""
    try:
        import xlrd  # noqa: F401
    except ImportError:
        print("ERROR: xlrd required. Run: pip install 'xlrd<2'")
        sys.exit(1)

    reports_dir = os.path.expanduser(reports_dir)
    summaries_dir = os.path.join(reports_dir, 'summaries')
    os.makedirs(summaries_dir, exist_ok=True)

    all_files = []
    for root, dirs, files in os.walk(reports_dir):
        if 'summaries' in root:
            continue
        for f in files:
            if f.lower().endswith(('.xls', '.xlsx')):
                all_files.append(os.path.join(root, f))

    if not all_files:
        print("No XLS/XLSX files found to summarize.")
        return

    print(f"\nParsing {len(all_files)} report files...")

    grand_summary = {
        'total_files': len(all_files),
        'by_type': {},
        'by_date': {},
        'total_agent_rows': 0,
        'total_transfers': 0,
        'total_dials': 0,
        'total_hours': 0.0,
        'campaigns': set(),
        'agents': set(),
    }

    for filepath in sorted(all_files):
        filename = os.path.basename(filepath)
        date_folder = os.path.basename(os.path.dirname(filepath))
        report_type = identify_report_type(filename)
        date_start, date_end = extract_date_range(filename)

        try:
            headers, records = read_xls_to_records(filepath)
            row_count = len(records)

            # Track by type
            if report_type not in grand_summary['by_type']:
                grand_summary['by_type'][report_type] = {'count': 0, 'total_rows': 0}
            grand_summary['by_type'][report_type]['count'] += 1
            grand_summary['by_type'][report_type]['total_rows'] += row_count

            # Track by date
            date_key = date_start or date_folder
            if date_key not in grand_summary['by_date']:
                grand_summary['by_date'][date_key] = {'files': 0, 'types': []}
            grand_summary['by_date'][date_key]['files'] += 1
            grand_summary['by_date'][date_key]['types'].append(report_type)

            # Extract key metrics from agent summary reports
            if report_type in ('AgentSummary', 'AgentSummaryCampaign', 'AgentSummarySubcampaign'):
                # Find Rep column
                rep_col = None
                for h in headers:
                    if h.lower() == 'rep':
                        rep_col = h
                        break

                for rec in records:
                    rep_val = str(rec.get(rep_col, '')).strip() if rep_col else ''
                    if rep_val.startswith('Total'):
                        continue

                    grand_summary['total_agent_rows'] += 1
                    if rep_val:
                        grand_summary['agents'].add(rep_val)

                    # Transfers
                    for key in ('Sale/Lead/App', 'Transfers'):
                        if key in rec:
                            grand_summary['total_transfers'] += int(safe_float(rec[key]))
                    # Dials
                    if 'Dialed' in rec:
                        grand_summary['total_dials'] += int(safe_float(rec['Dialed']))
                    # Hours
                    if 'Hours Worked' in rec:
                        grand_summary['total_hours'] += safe_float(rec['Hours Worked'])

                    # Campaigns/Teams
                    for key in ('Team', 'Campaign', 'Skill'):
                        if key in rec:
                            val = str(rec[key]).strip()
                            if val and val.lower() != 'total:':
                                grand_summary['campaigns'].add(val)

            # Save per-file JSON with all data
            file_summary = {
                'filename': filename,
                'report_type': report_type,
                'date_range': f"{date_start} to {date_end}" if date_start else None,
                'row_count': row_count,
                'columns': headers,
            }
            summary_path = os.path.join(summaries_dir, f"{date_key}_{report_type}.json")
            with open(summary_path, 'w') as f:
                json.dump({'meta': file_summary, 'data': records}, f, indent=2, default=str)

            print(f"  Parsed: {filename} ({report_type}, {row_count} rows)")

        except Exception as e:
            print(f"  ERROR parsing {filename}: {e}")

    # Print grand summary
    grand_summary['campaigns'] = sorted(grand_summary['campaigns'])
    grand_summary['agents'] = sorted(grand_summary['agents'])

    print(f"\n{'='*60}")
    print(f"GRAND SUMMARY")
    print(f"{'='*60}")
    print(f"Total files parsed:    {grand_summary['total_files']}")
    print(f"Total report dates:    {len(grand_summary['by_date'])}")
    print(f"Unique agents:         {len(grand_summary['agents'])}")
    print(f"Total agent rows:      {grand_summary['total_agent_rows']}")
    print(f"Total transfers:       {grand_summary['total_transfers']:,}")
    print(f"Total dials:           {grand_summary['total_dials']:,}")
    print(f"Total hours worked:    {grand_summary['total_hours']:,.1f}")
    if grand_summary['total_hours'] > 0:
        avg_tph = grand_summary['total_transfers'] / grand_summary['total_hours']
        print(f"Overall TPH:           {avg_tph:.2f}")

    print(f"\nReport types:")
    for rtype, info in sorted(grand_summary['by_type'].items()):
        print(f"  {rtype:<35} {info['count']:>4} files, {info['total_rows']:>6} rows")

    print(f"\nCampaigns/Teams found:")
    for camp in grand_summary['campaigns']:
        print(f"  - {camp}")

    print(f"\nDates covered:")
    dates = sorted(grand_summary['by_date'].keys())
    if dates:
        print(f"  Earliest: {dates[0]}")
        print(f"  Latest:   {dates[-1]}")
        print(f"  Total:    {len(dates)} days")

    # Save grand summary
    summary_output = {
        'total_files': grand_summary['total_files'],
        'total_dates': len(grand_summary['by_date']),
        'unique_agents': len(grand_summary['agents']),
        'total_agent_rows': grand_summary['total_agent_rows'],
        'total_transfers': grand_summary['total_transfers'],
        'total_dials': grand_summary['total_dials'],
        'total_hours': round(grand_summary['total_hours'], 1),
        'campaigns': grand_summary['campaigns'],
        'agent_count': len(grand_summary['agents']),
        'agents': grand_summary['agents'],
        'by_type': grand_summary['by_type'],
        'dates': dates,
    }
    summary_file = os.path.join(summaries_dir, '_grand_summary.json')
    with open(summary_file, 'w') as f:
        json.dump(summary_output, f, indent=2)
    print(f"\nFull summary saved: {summary_file}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Download DialedIn reports from email')
    parser.add_argument('--days', type=int, default=None,
                        help='Limit to last N days (default: all)')
    parser.add_argument('--all', action='store_true', default=True,
                        help='Download all emails (default)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview without downloading')
    parser.add_argument('--output', default='~/Desktop/reports',
                        help='Output directory (default: ~/Desktop/reports)')
    parser.add_argument('--summarize', action='store_true',
                        help='Parse and summarize after downloading')
    parser.add_argument('--summarize-only', action='store_true',
                        help='Only summarize already-downloaded files (skip download)')

    args = parser.parse_args()

    if args.summarize_only:
        summarize_reports(args.output)
        return

    reports_dir = download_reports(args)

    if args.summarize and reports_dir:
        summarize_reports(reports_dir)


if __name__ == '__main__':
    main()
