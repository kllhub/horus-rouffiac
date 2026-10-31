// Configuration HORUS.
// Dans le dépôt : null → mode DÉMO (données fictives, stockage local, PIN 1234) — c'est ce que sert Fly.io.
// En production, infra/deploy.sh réécrit ce fichier sur le serveur :
//   window.HORUS_CONFIG = { keycloak: { url: "https://auth.mairiederouffiac.fr", realm: "horus", clientId: "horus-pwa" } };
window.HORUS_CONFIG = null;
