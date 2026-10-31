#!/usr/bin/env bash
# Crée le realm « horus » sur le Keycloak de production, PAR L'ADMIN API.
#
#   KC_ADMIN_PASSWORD=… ./creer-realm.sh        (sur le serveur, depuis ~/horus/infra)
#
# ⛔ Ne touche PAS au realm « commune » et ne recrée PAS le conteneur Keycloak
#    (plateforme-commune : « recréer le conteneur effaçait comptes et mots de passe »).
#    On POSTe un realm neuf ; s'il existe déjà, Keycloak répond 409 et rien n'est modifié.
#
# Variables lues dans infra/.env : HORUS_URL, HORUS_ADMIN_SECRET.
# Identifiants du compte « admin » du realm master : KC_ADMIN_USER (défaut admin), KC_ADMIN_PASSWORD.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
KC=${KC_URL:-https://auth.mairiederouffiac.fr}
: "${KC_ADMIN_PASSWORD:?KC_ADMIN_PASSWORD manquant (compte admin du realm master)}"
: "${HORUS_URL:?}" "${HORUS_ADMIN_SECRET:?}"

TOKEN=$(curl -sf -d grant_type=password -d client_id=admin-cli \
  --data-urlencode "username=${KC_ADMIN_USER:-admin}" --data-urlencode "password=$KC_ADMIN_PASSWORD" \
  "$KC/realms/master/protocol/openid-connect/token" | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')

# Substitution explicite des seules variables attendues (pas d'envsubst global).
(umask 077; python3 - "$HORUS_URL" "$HORUS_ADMIN_SECRET" <<'EOF'
import sys
s = open("keycloak/realm-horus.json", encoding="utf-8").read()
s = s.replace("${HORUS_URL}", sys.argv[1]).replace("${HORUS_ADMIN_SECRET}", sys.argv[2])
assert "${" not in s, "variable non substituée"
open(".realm-horus.tmp.json", "w", encoding="utf-8").write(s)
EOF
)

CODE=$(curl -s -o ./.realm-reponse.tmp.txt -w '%{http_code}' -X POST "$KC/admin/realms" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" --data-binary @./.realm-horus.tmp.json)
rm -f ./.realm-horus.tmp.json
case "$CODE" in
  201) echo "✓ realm « horus » créé." ;;
  409) echo "Le realm « horus » existe déjà : rien n'a été modifié." ;;
  *)   echo "✗ Échec ($CODE) : $(cat ./.realm-reponse.tmp.txt)"; rm -f ./.realm-reponse.tmp.txt; exit 1 ;;
esac
curl -sf "$KC/realms/horus" >/dev/null && echo "✓ $KC/realms/horus répond."
