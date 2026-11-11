'use strict';
// node test/privacy.test.js  (ou npm test)
const assert = require('assert');
const { siteOf, isThirdParty } = require('../src/privacy');
assert.equal(siteOf('a.b.example.com'), 'example.com');
assert.equal(siteOf('www.bbc.co.uk'), 'bbc.co.uk');
assert.equal(siteOf('127.0.0.1'), '127.0.0.1');
assert.equal(isThirdParty('https://cdn.example.com/x.js', 'https://www.example.com/'), false);
assert.equal(isThirdParty('https://tracker.ads.net/p', 'https://www.example.com/'), true);
assert.equal(isThirdParty('http://127.0.0.1:8002/c', 'http://localhost:8001/'), true);
assert.equal(isThirdParty('file:///x', 'https://example.com/'), false);
assert.equal(isThirdParty('garbage', 'https://example.com/'), false);
console.log('privacy.test.js OK');

// --- Bloqueur de pisteurs (07/11/2026)
const { hostListed, shouldBlock } = require('../src/privacy');
const LISTE = require('../src/bloqueur-liste');
const SET = new Set(LISTE);
assert.ok(LISTE.length >= 200, 'liste trop courte');
assert.ok(LISTE.every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)), 'domaine mal formé');
assert.equal(hostListed('www.google-analytics.com', SET), true);
assert.equal(hostListed('securepubads.g.doubleclick.net', SET), true);
assert.equal(hostListed('notdoubleclick.net', SET), false);
assert.equal(hostListed('example.com', SET), false);
const page = 'https://www.lemonde.fr/article';
assert.equal(shouldBlock('https://www.googletagmanager.com/gtm.js', page, 'script', SET), true);
assert.equal(shouldBlock('https://static.criteo.net/js/ld.js', page, 'script', SET), true);
assert.equal(shouldBlock('https://www.lemonde.fr/app.js', page, 'script', SET), false);
assert.equal(shouldBlock('https://cdn.jsdelivr.net/x.js', page, 'script', SET), false);
// jamais la page elle-même, jamais le premier parti
assert.equal(shouldBlock('https://www.criteo.com/', 'https://duckduckgo.com/', 'mainFrame', SET), false);
assert.equal(shouldBlock('https://static.criteo.com/x.js', 'https://www.criteo.com/', 'script', SET), false);
console.log('bloqueur OK');
