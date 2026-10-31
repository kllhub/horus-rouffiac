/* HORUS — connexion Keycloak + appels à l'API, communs à fdo.html et admin.html.
 *
 * - La page de connexion est celle de Keycloak (realm « horus ») : mot de passe ET second
 *   facteur y sont gérés ; aucun mot de passe ne transite par HORUS.
 * - Flux « authorization code » + PKCE (bibliothèque officielle keycloak-js, embarquée dans vendor/).
 * - Pas d'iframe de session (CSP stricte) : la session est revérifiée par redirection.
 *
 * Usage :
 *   const auth = await HorusAuth.init();   // { connecte, kc }
 *   await HorusAuth.api("GET", "/moi");
 */
(function () {
  const cfg = window.HORUS_CONFIG && window.HORUS_CONFIG.keycloak;
  let kc = null;

  class ErreurApi extends Error {
    constructor(statut, code) { super(code); this.statut = statut; this.code = code; }
  }

  async function init() {
    if (!cfg) return { connecte: false, kc: null };
    const { default: Keycloak } = await import("./vendor/keycloak.js");
    kc = new Keycloak({ url: cfg.url, realm: cfg.realm, clientId: cfg.clientId });
    const connecte = await kc.init({
      onLoad: "check-sso",
      pkceMethod: "S256",
      checkLoginIframe: false,
      responseMode: "query",
    });
    // Nettoie l'URL de retour (code, state) pour qu'un rechargement ne rejoue rien.
    if (location.search.includes("state=")) history.replaceState(null, "", location.pathname);
    return { connecte, kc };
  }

  async function api(methode, chemin, corps) {
    if (!kc) throw new ErreurApi(0, "non_configure");
    try {
      await kc.updateToken(30);
    } catch (e) {
      kc.login();
      throw new ErreurApi(401, "session_expiree");
    }
    const res = await fetch("/api" + chemin, {
      method: methode,
      headers: { "Authorization": "Bearer " + kc.token, "Content-Type": "application/json" },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ErreurApi(res.status, (data && data.error) || "erreur");
    return data;
  }

  window.HorusAuth = {
    actif: !!cfg,
    init,
    api,
    ErreurApi,
    login: () => kc && kc.login(),
    logout: () => kc && kc.logout({ redirectUri: location.origin + location.pathname }),
    // Changer de mot de passe / reconfigurer le second facteur : écrans Keycloak (actions AIA).
    changerMotDePasse: () => kc && kc.login({ action: "UPDATE_PASSWORD" }),
    configurerDeuxiemeFacteur: () => kc && kc.login({ action: "CONFIGURE_TOTP" }),
    profil: () => (kc && kc.tokenParsed) || null,
  };
})();
