#!/usr/bin/env bash
# HORUS — déploiement sur le serveur de production (à lancer depuis la racine git, poste de dev).
#
#   ./infra/deploy.sh            # API + front
#   ./infra/deploy.sh --front    # front seul (pages, icônes, Service Worker)
#
# - copie api/ et infra/ dans ~/horus sur le serveur (jamais le .env, qui reste sur place) ;
# - reconstruit et redémarre la stack HORUS (migrations Prisma incluses) ;
# - publie la PWA dans /var/www/horus avec le config.js de production.
# Ne touche à rien d'autre sur la machine (ni plateforme-commune, ni Keycloak, ni nginx).
set -euo pipefail
HOTE=${HORUS_HOTE:-ubuntu@92.222.89.206}
[ -f api/package.json ] && [ -f horus-pwa/horus-pwa/index.html ] || { echo "À lancer depuis la racine git."; exit 1; }

if [ "${1:-}" != "--front" ]; then
  echo "== API"
  tar -czf - --exclude=node_modules --exclude=dist api infra/docker-compose.yml infra/backup.sh infra/keycloak infra/nginx \
    | ssh "$HOTE" 'mkdir -p ~/horus && tar -xzf - -C ~/horus'
  ssh "$HOTE" 'cd ~/horus/infra && test -f .env || { echo "✗ ~/horus/infra/.env absent (voir docs/DEPLOIEMENT.md)"; exit 1; }
    docker compose up -d --build && docker compose ps
    for i in $(seq 1 30); do curl -sf http://127.0.0.1:3110/api/health && echo && break; sleep 2; done'
fi

echo "== Front"
tar -C horus-pwa/horus-pwa -czf - --exclude=config.js . | ssh "$HOTE" 'set -e
  rm -rf ~/horus/www.new && mkdir -p ~/horus/www.new && tar -xzf - -C ~/horus/www.new
  . ~/horus/infra/.env
  printf "window.HORUS_CONFIG = { keycloak: { url: \"%s\", realm: \"horus\", clientId: \"horus-pwa\" } };\n" \
    "${KEYCLOAK_ISSUER_URL%/realms/*}" > ~/horus/www.new/config.js
  rsync -a --delete ~/horus/www.new/ /var/www/horus/ && rm -rf ~/horus/www.new
  echo "✓ PWA publiée dans /var/www/horus"'
