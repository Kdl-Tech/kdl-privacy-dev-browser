'use strict';
// node test/i18n.test.js (lancé par npm test)
// Échoue si une clé manque dans une langue, si une clé utilisée dans le code n'existe pas,
// ou si les variables {x} diffèrent d'une langue à l'autre.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const I18N = require('../src/i18n');

const SRC = path.join(__dirname, '..', 'src');
const { DICT, LANGS } = I18N;
const errors = [];

// 1. Mêmes clés, aucune valeur vide, mêmes variables dans fr / en / es.
const ref = Object.keys(DICT.fr);
const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');
for (const l of LANGS) {
  const d = DICT[l];
  assert.ok(d, 'dictionnaire absent : ' + l);
  for (const k of ref) {
    if (!(k in d)) errors.push(`[${l}] clé manquante : ${k}`);
    else if (typeof d[k] !== 'string' || !d[k].trim()) errors.push(`[${l}] valeur vide : ${k}`);
    else if (vars(d[k]) !== vars(DICT.fr[k])) errors.push(`[${l}] variables différentes pour ${k} : ${vars(d[k])} / ${vars(DICT.fr[k])}`);
  }
  for (const k of Object.keys(d)) if (!(k in DICT.fr)) errors.push(`[${l}] clé inconnue du français : ${k}`);
}

// 2. Toute clé utilisée dans le code existe.
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(js|html)$/.test(e.name) && e.name !== 'i18n.js' ? [p] : [];
  });
}
const used = new Set();
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(SRC, file);
  for (const m of src.matchAll(/\btr\(\s*(['"`])([^'"`]*)\1/g)) used.add(m[2]);
  for (const m of src.matchAll(/data-i18n(?:-html|-title|-placeholder|-aria-label)?="([^"]+)"/g)) used.add(m[1]);
  // Un appel tr() dont la clé n'est pas une chaîne littérale échapperait au contrôle.
  for (const m of src.matchAll(/\btr\(\s*([^'"`\s])/g)) errors.push(`${rel} : clé non littérale dans tr(${m[1]}…)`);
}
for (const k of used) if (!(k in DICT.fr)) errors.push('clé utilisée mais absente : ' + k);
assert.ok(used.size > 200, 'trop peu de clés détectées dans le code (' + used.size + ')');

if (errors.length) { console.error(errors.join('\n')); process.exit(1); }

// 3. Comportement de t() : variables, secours français, clé inconnue, typographie française.
I18N.setLang('en');
assert.equal(I18N.t('favs.imported', { n: 3 }), 'Import: 3 bookmark(s) added.');
I18N.setLang('es');
assert.equal(I18N.t('ws.opened', { name: 'Dev' }), 'Espacio «Dev» abierto.');
I18N.setLang('de');                                    // langue non prise en charge -> français
assert.equal(I18N.lang, 'fr');
assert.equal(I18N.t('fav.dup'), 'Doublon : cette URL existe déjà.');
assert.equal(I18N.t('cle.inexistante'), 'cle.inexistante');
assert.equal(I18N.normalize('es-419'), 'es');
assert.equal(I18N.normalize('pt-BR'), null);

// 4. Les prompts IA demandent une réponse dans la langue de l'interface.
const P = require('../src/ai/prompt-templates');
assert.ok(P.build('summarize', 'x', 'en').includes('en anglais'));
assert.ok(P.build('translate', 'x', 'es').includes('en espagnol'));
assert.ok(P.build('explain', 'x', 'fr').includes('en français'));

const unused = ref.filter((k) => !used.has(k));
console.log(`i18n.test.js OK — ${ref.length} clés × ${LANGS.length} langues, ${used.size} utilisées${unused.length ? ' (non utilisées : ' + unused.join(', ') + ')' : ''}`);
