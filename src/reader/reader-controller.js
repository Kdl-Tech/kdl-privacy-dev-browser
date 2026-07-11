'use strict';
/**
 * KDL — Mode lecture professionnel (sans distraction).
 * Utilise KDLExtract (extraction assainie) + KDLText (résumé extractif, stats).
 * N'altère jamais la page distante. Overlay dans l'UI de confiance uniquement.
 *
 * API globale : window.KDLReader.open(webview) / .setAIHook(fn) / .isOpen()
 *   fn(kind, text) -> Promise<{ok, text, error}>  (facultatif ; boutons IA affichés si présent)
 */
(function (root) {
  let el = null, aiHook = null, current = null;
  const S = { fontPx: 19, widthCh: 68, lh: 1.7, theme: 'sombre' };
  const THEMES = ['sombre', 'clair', 'sépia'];

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function build() {
    el = document.createElement('div');
    el.id = 'reader'; el.className = 'reader hidden'; el.dataset.theme = S.theme;
    el.innerHTML = `
      <div class="reader-bar">
        <span class="reader-brand">◈ KDL Lecture</span>
        <div class="reader-ctrls">
          <button class="ico-btn" data-act="theme" title="Thème (sombre / clair / sépia)"><svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9c-5 0-9-4-9-9Z"/></svg></button>
          <button class="ico-btn" data-act="font-" title="Réduire le texte"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
          <button class="ico-btn" data-act="font+" title="Agrandir le texte"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
          <button class="ico-btn" data-act="width" title="Largeur de colonne"><svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
          <button class="ico-btn" data-act="line" title="Interligne"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
          <button class="ico-btn" data-act="md" title="Exporter en Markdown"><svg viewBox="0 0 24 24"><path d="M12 3v12M8 11l4 4 4-4"/><path d="M5 21h14"/></svg></button>
          <button class="ico-btn" data-act="print" title="Imprimer / PDF"><svg viewBox="0 0 24 24"><path d="M6 9V3h12v6"/><path d="M6 18H4v-6h16v6h-2"/><path d="M8 14h8v7H8z"/></svg></button>
          <button class="ico-btn" data-act="close" title="Fermer (Échap)"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
        </div>
      </div>
      <div class="reader-progress"><i></i></div>
      <div class="reader-scroll" tabindex="0">
        <article class="reader-doc">
          <h1 class="reader-title"></h1>
          <div class="reader-meta"></div>
          <div class="reader-tools"></div>
          <div class="reader-ai-out hidden"></div>
          <div class="reader-content"></div>
        </article>
      </div>`;
    document.body.appendChild(el);

    el.querySelector('.reader-ctrls').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); if (!b) return; act(b.dataset.act);
    });
    const scroll = el.querySelector('.reader-scroll');
    scroll.addEventListener('scroll', () => {
      const max = scroll.scrollHeight - scroll.clientHeight;
      const p = max > 0 ? Math.min(100, Math.round(scroll.scrollTop / max * 100)) : 0;
      el.querySelector('.reader-progress i').style.width = p + '%';
    });
  }

  function applyVars() {
    const doc = el.querySelector('.reader-doc');
    doc.style.setProperty('--r-font', S.fontPx + 'px');
    doc.style.setProperty('--r-width', S.widthCh + 'ch');
    doc.style.setProperty('--r-lh', S.lh);
    el.dataset.theme = S.theme;
  }

  function act(a) {
    if (a === 'close') return close();
    if (a === 'theme') { S.theme = THEMES[(THEMES.indexOf(S.theme) + 1) % THEMES.length]; applyVars(); return; }
    if (a === 'font+') { S.fontPx = Math.min(28, S.fontPx + 1); applyVars(); return; }
    if (a === 'font-') { S.fontPx = Math.max(14, S.fontPx - 1); applyVars(); return; }
    if (a === 'width') { S.widthCh = S.widthCh >= 90 ? 54 : S.widthCh + 12; applyVars(); return; }
    if (a === 'line') { S.lh = S.lh >= 2.1 ? 1.5 : Math.round((S.lh + 0.2) * 10) / 10; applyVars(); return; }
    if (a === 'print') { document.body.classList.add('reader-printing'); window.print(); setTimeout(() => document.body.classList.remove('reader-printing'), 400); return; }
    if (a === 'md') return exportMd();
  }

  function htmlToMarkdown(html, title) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    let out = '# ' + (title || 'Document') + '\n\n';
    const walk = (node) => {
      let s = '';
      node.childNodes.forEach((c) => {
        if (c.nodeType === 3) { s += c.nodeValue.replace(/\s+/g, ' '); return; }
        if (c.nodeType !== 1) return;
        const t = c.tagName.toLowerCase();
        const inner = walk(c).trim();
        if (t === 'h1' || t === 'h2') s += '\n## ' + inner + '\n\n';
        else if (t === 'h3' || t === 'h4') s += '\n### ' + inner + '\n\n';
        else if (t === 'p') s += inner + '\n\n';
        else if (t === 'li') s += '- ' + inner + '\n';
        else if (t === 'ul' || t === 'ol') s += inner + '\n';
        else if (t === 'blockquote') s += '> ' + inner + '\n\n';
        else if (t === 'pre' || t === 'code') s += '\n```\n' + inner + '\n```\n\n';
        else if (t === 'strong' || t === 'b') s += '**' + inner + '**';
        else if (t === 'em' || t === 'i') s += '*' + inner + '*';
        else if (t === 'a') s += '[' + inner + '](' + (c.getAttribute('href') || '') + ')';
        else if (t === 'br') s += '\n';
        else s += inner;
      });
      return s;
    };
    return (out + walk(doc.body)).replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  async function exportMd() {
    if (!current) return;
    const md = htmlToMarkdown(current.html, current.title);
    const name = (current.title || 'article').replace(/[^\w \-]+/g, '').slice(0, 60).trim() || 'article';
    try {
      const res = await window.kdl.saveText(name + '.md', md);
      toastLike(res.ok ? 'Exporté : ' + res.file : (res.canceled ? 'Export annulé.' : 'Échec export.'));
    } catch { toastLike('Export impossible.'); }
  }

  // Petit toast local (indépendant du renderer pour rester autonome).
  function toastLike(msg) {
    let t = document.getElementById('reader-toast');
    if (!t) { t = document.createElement('div'); t.id = 'reader-toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastLike._t); toastLike._t = setTimeout(() => t.classList.add('hidden'), 2600);
  }

  function renderTools() {
    const T = root.KDLText;
    const tools = el.querySelector('.reader-tools');
    const gen = aiHook ? `
      <div class="reader-tool-group">
        <span class="reader-tool-label">Assistant IA</span>
        <button class="reader-chip" data-ai="summarize">Résumer</button>
        <button class="reader-chip" data-ai="simplify">Simplifier</button>
        <button class="reader-chip" data-ai="fiche">Fiche synthétique</button>
      </div>` : '';
    tools.innerHTML = `
      <div class="reader-tool-group">
        <span class="reader-tool-label">Outils locaux</span>
        <button class="reader-chip" data-local="resume">Résumé (extractif)</button>
        <button class="reader-chip" data-local="points">Points clés</button>
        <button class="reader-chip" data-local="mots">Mots-clés</button>
      </div>${gen}`;
    tools.querySelectorAll('[data-local]').forEach((b) => b.onclick = () => runLocal(b.dataset.local, T));
    tools.querySelectorAll('[data-ai]').forEach((b) => b.onclick = () => runAI(b.dataset.ai, b));
  }

  function showOut(title, bodyHtml, badge) {
    const out = el.querySelector('.reader-ai-out');
    out.classList.remove('hidden');
    out.innerHTML = `<div class="reader-out-head">${esc(title)} ${badge || ''}</div><div class="reader-out-body">${bodyHtml}</div>`;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function runLocal(kind, T) {
    const text = current.text || '';
    if (kind === 'resume') showOut('Résumé extractif', '<p>' + esc(T.summarize(text, 5)) + '</p>', '<span class="tag ok">local</span>');
    else if (kind === 'points') showOut('Points clés', '<ul>' + T.keyPoints(text, 6).map((p) => '<li>' + esc(p) + '</li>').join('') + '</ul>', '<span class="tag ok">local</span>');
    else if (kind === 'mots') showOut('Mots-clés', '<div class="kw">' + T.keywords(text, 12).map((k) => '<span class="kw-item">' + esc(k.term) + '</span>').join('') + '</div>', '<span class="tag ok">local</span>');
  }

  async function runAI(kind, btn) {
    if (!aiHook) return;
    const text = current.text || '';
    btn.disabled = true;
    showOut('Assistant IA', '<p class="muted">Génération en cours…</p>', '<span class="tag warn">IA locale</span>');
    try {
      const res = await aiHook(kind, text.slice(0, 6000));
      if (res && res.ok) showOut('Assistant IA', '<p>' + esc(res.text) + '</p>', '<span class="tag ok">IA locale</span>');
      else showOut('Assistant IA', '<p class="muted">' + esc((res && res.error) || 'IA indisponible.') + '</p>', '<span class="tag err">indisponible</span>');
    } catch (e) { showOut('Assistant IA', '<p class="muted">' + esc(String(e)) + '</p>', '<span class="tag err">erreur</span>'); }
    btn.disabled = false;
  }

  async function open(webview) {
    if (!el) build();
    const data = await root.KDLExtract.extract(webview);
    if (!data.ok) { toastLike('Lecture : ' + (data.error || 'contenu introuvable')); return { ok: false }; }
    current = data;
    const T = root.KDLText;
    const st = T.stats(data.text);
    const langLabel = { fr: 'Français', en: 'Anglais', inconnu: '—' }[T.guessLang(data.text)] || '—';
    el.querySelector('.reader-title').textContent = data.title || 'Document';
    const metaBits = [];
    if (data.byline) metaBits.push('Par ' + data.byline);
    if (data.date) metaBits.push(String(data.date).slice(0, 10));
    metaBits.push('~' + st.readingMinutes + ' min de lecture', st.words + ' mots', langLabel);
    el.querySelector('.reader-meta').textContent = metaBits.join(' · ');
    el.querySelector('.reader-content').innerHTML = data.html;   // HTML déjà assaini par l'extracteur
    el.querySelector('.reader-ai-out').classList.add('hidden');
    renderTools(); applyVars();
    el.classList.remove('hidden');
    el.querySelector('.reader-scroll').scrollTop = 0;
    el.querySelector('.reader-progress i').style.width = '0%';
    el.querySelector('.reader-scroll').focus();
    return { ok: true };
  }

  function close() { if (el) el.classList.add('hidden'); }
  function isOpen() { return !!el && !el.classList.contains('hidden'); }
  function setAIHook(fn) { aiHook = typeof fn === 'function' ? fn : null; if (el && isOpen()) renderTools(); }

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); close(); } }, true);

  root.KDLReader = { open, close, isOpen, setAIHook };
})(window);
