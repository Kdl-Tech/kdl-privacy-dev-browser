/* Anti-flash de thème : exécuté en <head> AVANT le rendu (CSP script-src 'self').
   Pose data-theme d'après le choix mémorisé ; défaut = clair. */
(function () {
  'use strict';
  var t;
  try { t = localStorage.getItem('kdl-theme'); } catch (e) { t = null; }
  document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
})();
