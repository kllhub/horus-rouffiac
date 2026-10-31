#!/usr/bin/env bash
# Crée le PREMIER administrateur HORUS (ensuite, tout se gère dans admin.html).
#
#   ./premier-admin.sh prenom.nom@mairiederouffiac.fr "Prénom" "Nom"
#
# Utilise le compte de service horus-admin (secret dans infra/.env).
# Mot de passe provisoire affiché une fois ; à la première connexion, Keycloak impose
# un nouveau mot de passe ET la configuration de la double authentification.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
[ $# -eq 3 ] || { sed -n 2,4p "$0"; exit 1; }
EMAIL=$1 PRENOM=$2 NOM=$3
KC=${KEYCLOAK_ISSUER_URL%/realms/*}
TOKEN=$(curl -sf -d grant_type=client_credentials -d client_id=horus-admin --data-urlencode "client_secret=$HORUS_ADMIN_SECRET" \
  "$KC/realms/horus/protocol/openid-connect/token" | python3 -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')
H=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")
MDP=$(python3 -c 'import secrets;print(secrets.token_urlsafe(12))')

python3 - "$EMAIL" "$PRENOM" "$NOM" "$MDP" > ./.horus-admin.tmp.json <<'EOF'
import json, sys
e, p, n, m = sys.argv[1:]
print(json.dumps({"username": e, "email": e, "firstName": p, "lastName": n, "enabled": True, "emailVerified": True,
                  "requiredActions": ["CONFIGURE_TOTP"], "credentials": [{"type": "password", "value": m, "temporary": True}]}))
EOF
CODE=$(curl -s -o /dev/null -w '%{http_code}' "${H[@]}" -X POST "$KC/admin/realms/horus/users" --data-binary @./.horus-admin.tmp.json)
rm -f ./.horus-admin.tmp.json
[ "$CODE" = 201 ] || { echo "✗ création refusée ($CODE) — le compte existe peut-être déjà."; exit 1; }
ID=$(curl -sf "${H[@]}" "$KC/admin/realms/horus/users?username=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$EMAIL")&exact=true" \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')
ROLE=$(curl -sf "${H[@]}" "$KC/admin/realms/horus/roles/admin" | python3 -c 'import json,sys;r=json.load(sys.stdin);print(json.dumps([{"id":r["id"],"name":r["name"]}]))')
curl -sf "${H[@]}" -X POST "$KC/admin/realms/horus/users/$ID/role-mappings/realm" -d "$ROLE"

# Fiche membre (nom affiché) dans la base HORUS.
docker exec -i "${HORUS_PG:-horus-postgres}" psql -U horus -d horus -v ON_ERROR_STOP=1 -q \
  -v id="$ID" -v email="$EMAIL" -v nom="$PRENOM $NOM" <<'SQL'
INSERT INTO membres (id, email, nom) VALUES (:'id', :'email', :'nom')
ON CONFLICT (id) DO UPDATE SET nom = EXCLUDED.nom;
SQL
echo "✓ Administrateur créé : $EMAIL"
echo "  Mot de passe provisoire (affiché une seule fois) : $MDP"
