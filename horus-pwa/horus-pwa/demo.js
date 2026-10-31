/* HORUS — bandeau du MODE DÉMONSTRATION (config.js = null, version servie par Fly.io).
 *
 * En démo, rien ne quitte le navigateur : un signalement n'est transmis à personne.
 * Un habitant qui arriverait ici par erreur doit le savoir avant d'écrire quoi que ce soit.
 */
(function () {
  if (window.HORUS_CONFIG) return; // production : pas de bandeau
  window.HORUS_DEMO = true;

  const css = document.createElement("style");
  css.textContent =
    "#horus-demo-bandeau{position:relative;z-index:2500;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 14px;" +
    "padding:9px 16px;background:#3a1d1d;border-bottom:2px solid #E05555;color:#F5E9C8;font:600 13px/1.4 'Open Sans',sans-serif;text-align:center}" +
    "#horus-demo-bandeau strong{color:#ffb4b4}#horus-demo-bandeau a{color:#E8C97A;font-weight:700}" +
    "@media print{#horus-demo-bandeau{display:none}}";
  document.head.appendChild(css);

  const afficher = () => {
    if (document.getElementById("horus-demo-bandeau")) return;
    const b = document.createElement("div");
    b.id = "horus-demo-bandeau";
    b.setAttribute("role", "alert");
    b.innerHTML =
      "<span>🧪 <strong>Version de démonstration</strong> — données fictives, " +
      "<strong>aucun signalement n'est transmis</strong> aux forces de l'ordre.</span>" +
      "<span>Urgence : <a href=\"tel:17\">17</a> · <a href=\"tel:112\">112</a> · " +
      "Site officiel : <a href=\"https://horus.mairiederouffiac.fr\">horus.mairiederouffiac.fr</a></span>";
    document.body.prepend(b);
  };
  if (document.body) afficher();
  else document.addEventListener("DOMContentLoaded", afficher);
})();
