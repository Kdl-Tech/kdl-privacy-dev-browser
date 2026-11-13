/* KDL TECH — thème clair / sombre appliqué AVANT le rendu (anti-flash).
   Fichier externe (et non script en ligne) : CSP script-src 'self'. Le processus principal
   aligne nativeTheme.themeSource (« system » tant qu'aucun choix manuel) via renderer.js.
   Choix manuel mémorisé (localStorage 'kdl-theme') prioritaire ; sinon thème du système (prefers-color-scheme).
   À charger dans <head>, sans defer, avant les feuilles de style. */
(function (r) {
  var t = null;
  try { t = localStorage.getItem('kdl-theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') {
    try { t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { t = 'light'; }
  }
  r.setAttribute('data-theme', t);
})(document.documentElement);
