#!/bin/bash
# ─────────────────────────────────────────────────────────────
# Deploy Pitch Vision Web to EC2 (colocated with n8n)
#
# The server already has Docker, nginx, and certbot.
# This script adds the Next.js app as Docker containers
# and configures nginx to reverse-proxy to it.
#
# Usage:
#   SSH_KEY=~/pitchvision-n8n-key.pem
#
#   # First-time setup:
#   SSH_KEY=$SSH_KEY DOMAIN=app.pitchvision.io ./scripts/deploy-frontend.sh setup
#
#   # Deploy latest code:
#   SSH_KEY=$SSH_KEY ./scripts/deploy-frontend.sh deploy
#
#   # View logs:
#   SSH_KEY=$SSH_KEY ./scripts/deploy-frontend.sh logs [app|cron]
#
#   # Other: restart, status, ssl
# ─────────────────────────────────────────────────────────────

set -euo pipefail

SSH_KEY="${SSH_KEY:-$HOME/pitchvision-n8n-key.pem}"
SSH_HOST="ubuntu@3.219.219.182"
DOMAIN="${DOMAIN:-app.pitchvision.io}"
REMOTE_DIR="/opt/pitch-vision-web"
COMMAND="${1:-deploy}"

ssh_run() {
  ssh -o ConnectTimeout=10 -i "${SSH_KEY}" "${SSH_HOST}" "$@"
}

scp_to() {
  scp -i "${SSH_KEY}" "$1" "${SSH_HOST}:$2"
}

# ─── Setup: first-time provisioning on existing server ───────
cmd_setup() {
  echo "═══ Setting up Pitch Vision Web on ${SSH_HOST} ═══"
  echo "  Colocating with n8n on existing c5.xlarge"
  echo ""

  # 1. Create project directory
  echo "[1/5] Creating project directory..."
  ssh_run "sudo mkdir -p ${REMOTE_DIR} && sudo chown \$(whoami):\$(whoami) ${REMOTE_DIR}"

  # 2. Clone repo
  echo "[2/5] Cloning repository..."
  local REPO_URL
  REPO_URL="$(git remote get-url origin 2>/dev/null || echo '')"
  if [ -z "$REPO_URL" ]; then
    echo "ERROR: Could not detect git remote URL. Set it manually."
    exit 1
  fi
  ssh_run "
    if [ ! -f ${REMOTE_DIR}/package.json ]; then
      cd ${REMOTE_DIR}
      git init
      git remote add origin ${REPO_URL} 2>/dev/null || true
      git fetch origin main
      git checkout main
    else
      echo 'Repo already cloned'
      cd ${REMOTE_DIR} && git pull origin main
    fi
  "

  # 3. Copy .env.production
  echo "[3/5] Copying environment file..."
  if [ -f .env.production ]; then
    scp_to .env.production "${REMOTE_DIR}/.env.production"
    echo "  Copied .env.production"
  else
    echo "  WARNING: No .env.production found locally."
    echo "  Create it: cp .env.production.template .env.production"
    echo "  Fill in values, then re-run setup."
    exit 1
  fi

  # 4. Build and start containers
  echo "[4/5] Building Docker images and starting containers..."
  ssh_run "
    cd ${REMOTE_DIR}
    docker compose --env-file .env.production up -d --build
  "

  # 5. Add nginx server block
  echo "[5/5] Configuring nginx reverse proxy..."
  ssh_run "
    cat | sudo tee /etc/nginx/sites-available/pitchvision-web > /dev/null << 'NGINX'
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \"upgrade\";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 120s;
        client_max_body_size 50M;
    }

    location /_next/static/ {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control \"public, max-age=31536000, immutable\";
    }

    location /api/health {
        proxy_pass http://localhost:3000;
        access_log off;
    }
}
NGINX

    sudo ln -sf /etc/nginx/sites-available/pitchvision-web /etc/nginx/sites-enabled/pitchvision-web
    sudo nginx -t && sudo systemctl reload nginx
    echo 'nginx configured and reloaded'
  "

  echo ""
  echo "═══ Setup Complete ═══"
  echo ""
  echo "App running at http://3.219.219.182:3000 (direct)"
  echo ""
  echo "Next steps:"
  echo "  1. Point DNS: ${DOMAIN} → 3.219.219.182"
  echo "  2. After DNS propagation, set up SSL:"
  echo "     SSH_KEY=${SSH_KEY} DOMAIN=${DOMAIN} $0 ssl"
}

# ─── Deploy: pull latest and rebuild ─────────────────────────
cmd_deploy() {
  echo "═══ Deploying latest code ═══"

  if [ -f .env.production ]; then
    echo "[1/4] Syncing .env.production..."
    scp_to .env.production "${REMOTE_DIR}/.env.production"
  fi

  echo "[2/4] Pulling latest code..."
  ssh_run "cd ${REMOTE_DIR} && git pull origin main"

  echo "[3/4] Building and restarting..."
  ssh_run "cd ${REMOTE_DIR} && docker compose --env-file .env.production up -d --build"

  echo "[4/4] Verifying health..."
  sleep 10
  ssh_run "
    for i in 1 2 3 4 5 6; do
      if curl -sf http://localhost:3000/api/health >/dev/null 2>&1; then
        echo '✓ App is healthy'
        cd ${REMOTE_DIR} && docker compose ps
        exit 0
      fi
      echo 'Waiting for app to start...'
      sleep 5
    done
    echo '✗ App did not become healthy within 30s'
    cd ${REMOTE_DIR} && docker compose logs --tail=30 app
    exit 1
  "

  echo ""
  echo "═══ Deploy Complete ═══"
}

# ─── SSL: certbot for app domain ─────────────────────────────
cmd_ssl() {
  echo "═══ Setting up SSL for ${DOMAIN} ═══"
  ssh_run "
    sudo certbot --nginx -d ${DOMAIN} \
      --email admin@pitchperfectsolutions.net \
      --agree-tos \
      --no-eff-email \
      --redirect
  "
  echo "SSL configured. ${DOMAIN} now serves over HTTPS."
}

# ─── Logs ─────────────────────────────────────────────────────
cmd_logs() {
  local service="${2:-}"
  if [ -n "$service" ]; then
    ssh_run "cd ${REMOTE_DIR} && docker compose logs -f --tail=100 ${service}"
  else
    ssh_run "cd ${REMOTE_DIR} && docker compose logs -f --tail=100"
  fi
}

# ─── Restart ──────────────────────────────────────────────────
cmd_restart() {
  echo "Restarting containers..."
  ssh_run "cd ${REMOTE_DIR} && docker compose --env-file .env.production restart"
  sleep 5
  ssh_run "cd ${REMOTE_DIR} && docker compose ps"
}

# ─── Status ───────────────────────────────────────────────────
cmd_status() {
  ssh_run "
    echo '=== Docker Containers ==='
    cd ${REMOTE_DIR} && docker compose ps
    echo ''
    echo '=== Recent App Logs ==='
    cd ${REMOTE_DIR} && docker compose logs --tail=10 app
    echo ''
    echo '=== Recent Cron Logs ==='
    cd ${REMOTE_DIR} && docker compose logs --tail=10 cron
    echo ''
    echo '=== Health Check ==='
    curl -sf http://localhost:3000/api/health && echo '' || echo 'UNHEALTHY'
  "
}

# ─── Route command ────────────────────────────────────────────
case "${COMMAND}" in
  setup)   cmd_setup ;;
  deploy)  cmd_deploy ;;
  ssl)     cmd_ssl ;;
  logs)    cmd_logs "$@" ;;
  restart) cmd_restart ;;
  status)  cmd_status ;;
  *)
    echo "Usage: $0 {setup|deploy|ssl|logs|restart|status}"
    echo ""
    echo "Commands:"
    echo "  setup    First-time setup (clone, build, configure nginx)"
    echo "  deploy   Pull latest, rebuild, restart"
    echo "  ssl      Set up Let's Encrypt SSL via certbot"
    echo "  logs     Stream logs (optionally: logs app|cron)"
    echo "  restart  Restart all containers"
    echo "  status   Show container status and health"
    exit 1
    ;;
esac
