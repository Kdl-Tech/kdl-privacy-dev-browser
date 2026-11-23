/* KDL TECH — thème clair / sombre appliqué AVANT le rendu (anti-flash).
   Fichier externe (et non script en ligne) : CSP script-src 'self'. Le processus principal
   aligne nativeTheme.themeSource (« system » tant qu'aucun choix manuel) via renderer.js.
   Choix manuel mémorisé (localStorage 'kdl-theme') prioritaire ; sinon thème du système (prefers-color-scheme).
   À charger dans <head>, sans defer, avant les feuilles de style. */
(function (r) {
  var t = null;
  try { t = localStorage.getItem('kdl-theme'); } catch (e) {}
  if (t !== 'dark' && t !== 'light') {
    // Thème du système d'après Electron (fiable sous Linux, où prefers-color-scheme reste « light »),
    // sinon prefers-color-scheme.
    var natif = null;
    try { if (window.kdl && typeof window.kdl.systemDark === 'function') natif = window.kdl.systemDark(); } catch (e) { natif = null; }
    if (natif === true || natif === false) t = natif ? 'dark' : 'light';
    else {
      try { t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; } catch (e) { t = 'light'; }
    }
  }
  r.setAttribute('data-theme', t);
})(document.documentElement);
