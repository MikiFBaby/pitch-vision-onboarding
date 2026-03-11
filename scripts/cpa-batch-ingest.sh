#!/usr/bin/env bash
#
# CPA Batch Ingestion — Send S3 recordings to CPA Pre-Audit webhook
#
# Usage:
#   ./scripts/cpa-batch-ingest.sh                          # Process all files in chase-recordings/
#   ./scripts/cpa-batch-ingest.sh --prefix "chase-recordings/225262_Elite"  # Specific prefix
#   ./scripts/cpa-batch-ingest.sh --limit 20               # Process first 20 files
#   ./scripts/cpa-batch-ingest.sh --concurrency 5          # 5 concurrent webhook calls
#   ./scripts/cpa-batch-ingest.sh --dry-run                # List files without sending
#
# Environment:
#   S3_BUCKET           (default: pitchvision-qa-recordings)
#   S3_PREFIX           (default: chase-recordings/)
#   CPA_WEBHOOK_URL     (default: https://n8n.pitchvision.io/webhook/cpa-upload)
#   PRESIGN_EXPIRY      (default: 3600 seconds)
#

set -euo pipefail

# ─── Defaults ──────────────────────────────────────────────────────────
S3_BUCKET="${S3_BUCKET:-pitchvision-qa-recordings}"
S3_PREFIX="${S3_PREFIX:-chase-recordings/}"
CPA_WEBHOOK_URL="${CPA_WEBHOOK_URL:-https://n8n.pitchvision.io/webhook/cpa-upload}"
PRESIGN_EXPIRY="${PRESIGN_EXPIRY:-3600}"
BATCH_ID="cpa-batch-$(date +%Y%m%d-%H%M%S)"
CONCURRENCY=3
DELAY=5  # seconds between each call
LIMIT=0
DRY_RUN=false
PREFIX_OVERRIDE=""

# ─── Parse args ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix) PREFIX_OVERRIDE="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    --concurrency) CONCURRENCY="$2"; shift 2 ;;
    --delay) DELAY="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --batch-id) BATCH_ID="$2"; shift 2 ;;
    --help|-h)
      echo "Usage: $0 [--prefix PREFIX] [--limit N] [--concurrency N] [--delay SECS] [--dry-run] [--batch-id ID]"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ -n "$PREFIX_OVERRIDE" ]]; then
  S3_PREFIX="$PREFIX_OVERRIDE"
fi

# ─── Temp files ────────────────────────────────────────────────────────
TMPDIR_BATCH=$(mktemp -d)
trap "rm -rf $TMPDIR_BATCH" EXIT

FILE_LIST="$TMPDIR_BATCH/files.txt"
RESULTS="$TMPDIR_BATCH/results.txt"
touch "$RESULTS"

# ─── List S3 files ─────────────────────────────────────────────────────
echo "📂 Listing s3://$S3_BUCKET/$S3_PREFIX ..."
aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX" | grep -E '\.wav$' | awk '{$1=$2=$3=""; print substr($0,4)}' > "$FILE_LIST"

TOTAL=$(wc -l < "$FILE_LIST" | tr -d ' ')
echo "   Found $TOTAL .wav files"

if [[ "$LIMIT" -gt 0 && "$LIMIT" -lt "$TOTAL" ]]; then
  head -n "$LIMIT" "$FILE_LIST" > "$FILE_LIST.tmp"
  mv "$FILE_LIST.tmp" "$FILE_LIST"
  TOTAL=$LIMIT
  echo "   Limited to $TOTAL files"
fi

if [[ "$TOTAL" -eq 0 ]]; then
  echo "❌ No files found. Exiting."
  exit 1
fi

echo "🏷️  Batch ID: $BATCH_ID"
echo "⚡ Concurrency: $CONCURRENCY"
echo ""

if $DRY_RUN; then
  echo "🔍 DRY RUN — would process these files:"
  cat "$FILE_LIST"
  exit 0
fi

# ─── Parse Chase filename ─────────────────────────────────────────────
# Pattern: CampaignID_CampaignName_AgentName_Phone_M_D_YYYY-HH_MM_SS.wav
parse_filename() {
  local fname="$1"
  local base="${fname%.wav}"

  # Extract phone number (10-11 digits before date pattern)
  PHONE=$(echo "$base" | grep -oE '[0-9]{10,11}_[0-9]{1,2}_[0-9]{1,2}_[0-9]{4}' | head -1 | cut -d_ -f1)

  # Extract date parts
  local date_part=$(echo "$base" | grep -oE '[0-9]{10,11}_([0-9]{1,2})_([0-9]{1,2})_([0-9]{4})-([0-9]{2})_([0-9]{2})_([0-9]{2})' | head -1)
  if [[ -n "$date_part" ]]; then
    local parts=(${date_part//_/ })
    # parts: phone month day year-hour min sec
    local month=$(printf "%02d" "${parts[1]}")
    local day=$(printf "%02d" "${parts[2]}")
    local year_hour="${parts[3]}"
    local year="${year_hour%%-*}"
    local hour="${year_hour##*-}"
    local min="${parts[4]}"
    local sec="${parts[5]}"
    CALL_DATE="${year}-${month}-${day}"
    CALL_TIME="${hour}:${min}:${sec}"
  else
    CALL_DATE=""
    CALL_TIME=""
  fi

  # Extract agent name (between 2nd and 3rd underscore-separated groups before phone)
  # Pattern: ID_Campaign_Agent_Phone_...
  AGENT_NAME=$(echo "$base" | sed -E 's/^[0-9]+_[^_]+( [^_]+)*_([^_]+ [^_]+)_[0-9]{10,11}_.*/\2/' 2>/dev/null || echo "")

  # Extract campaign (between ID and agent name)
  CAMPAIGN=$(echo "$base" | sed -E 's/^[0-9]+_([^_]+( [^_]+)*)_[^_]+ [^_]+_[0-9]{10,11}_.*/\1/' 2>/dev/null || echo "")
}

# ─── Send single file ─────────────────────────────────────────────────
send_file() {
  local idx="$1"
  local fname="$2"

  # Generate presigned URL
  local presigned
  presigned=$(aws s3 presign "s3://$S3_BUCKET/$S3_PREFIX$fname" --expires-in "$PRESIGN_EXPIRY" 2>&1)
  if [[ $? -ne 0 ]]; then
    echo "[$idx/$TOTAL] ❌ PRESIGN FAILED: $fname" | tee -a "$RESULTS"
    return
  fi

  # Parse filename for metadata
  parse_filename "$fname"

  # Build JSON payload with python3 (handles URL escaping properly)
  local json_payload
  json_payload=$(python3 -c "
import json, sys
print(json.dumps({
    'file_url': sys.argv[1],
    'file_name': sys.argv[2],
    'agent_name': sys.argv[3],
    'batch_id': sys.argv[4],
    'upload_source': 's3_auto',
    'phone_number': sys.argv[5],
    'call_date': sys.argv[6],
    'call_time': sys.argv[7],
    's3_key': sys.argv[8],
}))
" "$presigned" "$fname" "$AGENT_NAME" "$BATCH_ID" "$PHONE" "$CALL_DATE" "$CALL_TIME" "${S3_PREFIX}${fname}")

  # Send to webhook
  local response
  response=$(curl -s -w "\n%{http_code}" -X POST "$CPA_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    --max-time 30 \
    -d "$json_payload" 2>&1)

  local http_code=$(echo "$response" | tail -1)
  local body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "200" ]]; then
    echo "[$idx/$TOTAL] ✅ $fname → $PHONE ($CALL_DATE $CALL_TIME)" | tee -a "$RESULTS"
  else
    echo "[$idx/$TOTAL] ❌ HTTP $http_code: $fname — $body" | tee -a "$RESULTS"
  fi
}

# ─── Process files with concurrency ───────────────────────────────────
echo "🚀 Starting batch ingestion ($TOTAL files, $CONCURRENCY concurrent)..."
echo ""

IDX=0
ACTIVE=0

while IFS= read -r fname; do
  IDX=$((IDX + 1))

  send_file "$IDX" "$fname" &
  ACTIVE=$((ACTIVE + 1))

  # Delay between sends to avoid overwhelming RunPod/n8n
  if [[ "$DELAY" -gt 0 ]]; then
    sleep "$DELAY"
  fi

  # Throttle concurrency
  if [[ "$ACTIVE" -ge "$CONCURRENCY" ]]; then
    wait -n 2>/dev/null || true
    ACTIVE=$((ACTIVE - 1))
  fi
done < "$FILE_LIST"

# Wait for remaining
wait

# ─── Summary ───────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "📊 Batch Complete: $BATCH_ID"
SENT=$(grep -c "✅" "$RESULTS" || true)
FAILED=$(grep -c "❌" "$RESULTS" || true)
echo "   ✅ Sent:   $SENT / $TOTAL"
echo "   ❌ Failed: $FAILED / $TOTAL"
echo "═══════════════════════════════════════════════"
