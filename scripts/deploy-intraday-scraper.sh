#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Deploy Intraday Scraper to VPS/EC2
#
# Usage:
#   SSH_HOST=ubuntu@your-ec2-ip ./scripts/deploy-intraday-scraper.sh
#
# Prerequisites on VPS:
#   - Node.js 18+ installed
#   - npm available
#   - /opt/intraday-scraper directory (will be created)
#
# This script:
#   1. Copies the scraper script to the VPS
#   2. Installs dependencies (playwright, xlsx)
#   3. Installs Chromium browser
#   4. Sets up cron job (every 5 min, 9 AM - 7 PM ET weekdays)
#   5. Creates env file template
#   6. Runs a test scrape
# ─────────────────────────────────────────────────────────────

set -euo pipefail

SSH_HOST="${SSH_HOST:?Set SSH_HOST=user@host}"
REMOTE_DIR="/opt/intraday-scraper"
SCRIPT_NAME="intraday-scraper-vps.mjs"

echo "═══ Deploying Intraday Scraper to ${SSH_HOST}:${REMOTE_DIR} ═══"

# 1. Create remote directory structure
echo "[1/6] Creating remote directory..."
ssh "${SSH_HOST}" "sudo mkdir -p ${REMOTE_DIR} && sudo chown \$(whoami) ${REMOTE_DIR}"

# 2. Copy scraper script
echo "[2/6] Copying scraper script..."
scp "scripts/${SCRIPT_NAME}" "${SSH_HOST}:${REMOTE_DIR}/${SCRIPT_NAME}"

# 3. Create package.json and install deps
echo "[3/6] Installing dependencies..."
ssh "${SSH_HOST}" "cat > ${REMOTE_DIR}/package.json << 'PKGJSON'
{
  \"name\": \"intraday-scraper\",
  \"version\": \"1.0.0\",
  \"type\": \"module\",
  \"private\": true,
  \"dependencies\": {
    \"playwright\": \"^1.40.0\",
    \"xlsx\": \"^0.18.5\"
  }
}
PKGJSON
cd ${REMOTE_DIR} && npm install"

# 4. Install Chromium for Playwright
echo "[4/6] Installing Playwright Chromium..."
ssh "${SSH_HOST}" "cd ${REMOTE_DIR} && npx playwright install chromium --with-deps 2>&1 | tail -5"

# 5. Create env file template (if not exists)
echo "[5/6] Setting up environment file..."
ssh "${SSH_HOST}" "if [ ! -f ${REMOTE_DIR}/.env ]; then
cat > ${REMOTE_DIR}/.env << 'ENVEOF'
# DialedIn Portal credentials
DIALEDIN_PORTAL_USER=
DIALEDIN_PORTAL_PASS=

# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Alert callback (optional — triggers manager Slack DMs)
ALERT_CALLBACK_URL=https://pitch-vision-web.vercel.app/api/dialedin/intraday-alerts
CRON_SECRET=
ENVEOF
echo 'Created .env template — EDIT IT with real values: nano ${REMOTE_DIR}/.env'
else
echo '.env already exists, skipping'
fi"

# 6. Set up cron job
echo "[6/6] Installing cron job..."
CRON_LINE="*/5 13-23 * * 1-5 bash -c 'set -a; source ${REMOTE_DIR}/.env; set +a; node ${REMOTE_DIR}/${SCRIPT_NAME}' >> /var/log/intraday-scraper.log 2>&1"

ssh "${SSH_HOST}" "
# Remove any existing intraday-scraper cron entries
crontab -l 2>/dev/null | grep -v 'intraday-scraper' > /tmp/cron-clean || true
# Add the new entry
echo '${CRON_LINE}' >> /tmp/cron-clean
crontab /tmp/cron-clean
rm /tmp/cron-clean
echo 'Cron installed:'
crontab -l | grep intraday-scraper
"

# Create log file
ssh "${SSH_HOST}" "sudo touch /var/log/intraday-scraper.log && sudo chown \$(whoami) /var/log/intraday-scraper.log"

echo ""
echo "═══ Deployment Complete ═══"
echo ""
echo "Next steps:"
echo "  1. SSH in and edit the env file:"
echo "     ssh ${SSH_HOST}"
echo "     nano ${REMOTE_DIR}/.env"
echo ""
echo "  2. Run a manual test:"
echo "     ssh ${SSH_HOST} 'set -a; source ${REMOTE_DIR}/.env; set +a; node ${REMOTE_DIR}/${SCRIPT_NAME}'"
echo ""
echo "  3. Monitor the log:"
echo "     ssh ${SSH_HOST} 'tail -f /var/log/intraday-scraper.log'"
echo ""
echo "  Cron schedule: Every 5 min, 9 AM - 7 PM ET, Mon-Fri"
echo "  (13:00-23:00 UTC during EDT / 14:00-00:00 UTC during EST)"
