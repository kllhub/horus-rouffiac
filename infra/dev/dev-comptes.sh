#!/usr/bin/env bash
# LOCAL UNIQUEMENT — crée un compte de test par rôle dans le Keycloak de docker-compose.dev.yml.
# Mot de passe commun : Horus-Test-2026!  (pas de 2FA en local).
# Autorise aussi le « direct grant » sur horus-pwa pour les tests automatisés : JAMAIS en production.
set -euo pipefail
KC=${KC:-http://localhost:8180}
MDP='Horus-Test-2026!'
TOKEN=$(curl -s -d grant_type=password -d client_id=admin-cli -d username=admin -d password=admin \
  "$KC/realms/master/protocol/openid-connect/token" | python -c 'import json,sys;print(json.load(sys.stdin)["access_token"])')
H=(-H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json")

CID=$(curl -s "${H[@]}" "$KC/admin/realms/horus/clients?clientId=horus-pwa" | python -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')
curl -s -o /dev/null "${H[@]}" -X PUT "$KC/admin/realms/horus/clients/$CID" -d '{"clientId":"horus-pwa","directAccessGrantsEnabled":true}'

creer() { # email prenom nom role
  curl -s -o /dev/null "${H[@]}" -X POST "$KC/admin/realms/horus/users" -d "{\"username\":\"$1\",\"email\":\"$1\",\"firstName\":\"$2\",\"lastName\":\"$3\",\"enabled\":true,\"emailVerified\":true,\"credentials\":[{\"type\":\"password\",\"value\":\"$MDP\",\"temporary\":false}]}"
  local id; id=$(curl -s "${H[@]}" "$KC/admin/realms/horus/users?username=$1&exact=true" | python -c 'import json,sys;print(json.load(sys.stdin)[0]["id"])')
  local role; role=$(curl -s "${H[@]}" "$KC/admin/realms/horus/roles/$4" | python -c 'import json,sys;r=json.load(sys.stdin);print(json.dumps({"id":r["id"],"name":r["name"]}))')
  curl -s -o /dev/null "${H[@]}" -X POST "$KC/admin/realms/horus/users/$id/role-mappings/realm" -d "[$role]"
  echo "$4 $1 $id"
}
creer admin@horus.test      Karim   Lahtil   admin
creer gend@horus.test       Adj.    Martinet gend
creer pm@horus.test         Agent   Duval    pm
creer asvp@horus.test       Agent   Roussel  asvp
creer moderateur@horus.test Sophie  R.       moderateur
creer ref.louradou@horus.test Marie L.       referent
creer ref.pigassou@horus.test Karim A.       referent
