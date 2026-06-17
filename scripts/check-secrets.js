#!/usr/bin/env node
'use strict';

// Audit secrets basique (lecture seule) — n'affiche jamais la valeur trouvée.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', 'dist', 'out', 'captures', 'kdl-captures']);
const patterns = [
  { re: /(?:api[_-]?key|secret|token|passwd|password)\s*[:=]\s*['"][^'"]{8,}/i, name: 'clé/secret inline' },
  { re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, name: 'clé privée' },
  { re: /AKIA[0-9A-Z]{16}/, name: 'AWS access key' },
  { re: /gh[pousr]_[A-Za-z0-9]{30,}/, name: 'token GitHub' }
];

let hits = 0;
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!/\.(js|json|html|css|md|env|sh|txt)$/i.test(entry.name)) continue;
    if (entry.name === 'check-secrets.js') continue;
    const txt = fs.readFileSync(full, 'utf8');
    for (const p of patterns) {
      if (p.re.test(txt)) {
        hits++;
        console.log(`⚠ ${p.name} suspecté dans ${path.relative(ROOT, full)}`);
      }
    }
  }
}

walk(ROOT);
if (hits === 0) { console.log('✓ Aucun secret détecté.'); process.exit(0); }
else { console.log(`✗ ${hits} occurrence(s) à vérifier.`); process.exit(1); }
