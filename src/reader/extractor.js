'use strict';
/**
 * KDL — extracteur de contenu principal (mode lecture / repli IA).
 * S'exécute DANS la page du <webview> (executeJavaScript) et ne renvoie que du
 * texte + un HTML strictement assaini (liste blanche de balises, aucun script,
 * aucun attribut sauf href http/https). Aucune donnée sensible n'est lue.
 *
 * Exposé en global : window.KDLExtract.extract(webview) -> {ok,title,byline,date,html,text,url,excerpt}
 */
(function (root) {
  // Script auto-suffisant injecté dans la page invitée. Retourne un JSON sérialisable.
  const PAGE_SCRIPT = `(function(){
    try{
      var OK={p:1,h1:1,h2:1,h3:1,h4:1,ul:1,ol:1,li:1,blockquote:1,pre:1,code:1,strong:1,b:1,em:1,i:1,br:1,a:1,figure:1,figcaption:1};
      var DROP={SCRIPT:1,STYLE:1,NOSCRIPT:1,NAV:1,ASIDE:1,HEADER:1,FOOTER:1,FORM:1,BUTTON:1,INPUT:1,SELECT:1,IFRAME:1,SVG:1,CANVAS:1};
      function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
      function txt(el){return (el.innerText||el.textContent||'').replace(/\\s+/g,' ').trim();}
      // 1) choisir le meilleur conteneur par densité de texte
      var best=null,bestScore=0;
      var cands=document.querySelectorAll('article,main,[role=main],.post,.article,.content,#content,.entry-content,section,div');
      for(var i=0;i<cands.length;i++){
        var el=cands[i]; if(!el||DROP[el.tagName]) continue;
        var t=txt(el); if(t.length<200) continue;
        var links=el.querySelectorAll('a').length;
        var p=el.querySelectorAll('p').length;
        var score=t.length + p*60 - links*40;
        var tag=el.tagName.toLowerCase();
        if(tag==='article') score*=1.6; else if(tag==='main') score*=1.3;
        if(score>bestScore){bestScore=score;best=el;}
      }
      if(!best) best=document.body;
      // 2) sérialiser en HTML assaini (liste blanche)
      function walk(node){
        var out='';
        for(var c=node.firstChild;c;c=c.nextSibling){
          if(c.nodeType===3){ out+=esc(c.nodeValue); }
          else if(c.nodeType===1){
            var tag=c.tagName; if(DROP[tag]) continue;
            var low=tag.toLowerCase();
            if(low==='br'){ out+='<br>'; continue; }
            if(OK[low]){
              if(low==='a'){
                var href=c.getAttribute('href')||'';
                if(/^https?:\\/\\//i.test(href)) out+='<a href="'+esc(href)+'" rel="noopener noreferrer">'+walk(c)+'</a>';
                else out+=walk(c);
              } else if(low==='figure'||low==='figcaption'){
                var inner=walk(c); if(inner.trim()) out+='<'+low+'>'+inner+'</'+low+'>';
              } else {
                var inner2=walk(c);
                if(inner2.trim()||low==='li') out+='<'+low+'>'+inner2+'</'+low+'>';
              }
            } else {
              out+=walk(c); // balise inconnue : on garde son contenu texte
            }
          }
        }
        return out;
      }
      var html=walk(best).replace(/(<br>\\s*){3,}/g,'<br><br>');
      var text=txt(best);
      // 3) métadonnées prudentes
      function meta(sel,attr){var m=document.querySelector(sel);return m?((m.getAttribute(attr)||'').trim()):'';}
      var title=(document.querySelector('h1')&&txt(document.querySelector('h1')))||document.title||'';
      var byline=meta('meta[name=author]','content')||meta('[rel=author]','textContent')||'';
      var date=meta('meta[property="article:published_time"]','content')||meta('time[datetime]','datetime')||'';
      var excerpt=(text||'').slice(0,300);
      return JSON.stringify({ok:true,title:title,byline:byline,date:date,html:html,text:text,url:location.href,excerpt:excerpt});
    }catch(e){ return JSON.stringify({ok:false,error:String(e)}); }
  })();`;

  async function extract(webview) {
    if (!webview || !webview.executeJavaScript) return { ok: false, error: 'webview indisponible' };
    try {
      const json = await webview.executeJavaScript(PAGE_SCRIPT, true);
      const data = typeof json === 'string' ? JSON.parse(json) : json;
      if (!data || !data.ok) return { ok: false, error: (data && data.error) || 'extraction impossible' };
      if (!data.text || data.text.length < 40) return { ok: false, error: 'contenu principal introuvable sur cette page' };
      return data;
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  const api = { extract, PAGE_SCRIPT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.KDLExtract = api;
})(typeof window !== 'undefined' ? window : null);
