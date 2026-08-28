/* =========================================================
   CORE / FORMATTERS
   Phase-1-Extraktion aus index.html (Stand: siehe git log).
   Reine Funktionen ohne Abhängigkeit auf S, DOM oder Supabase.
   Als klassisches (nicht type="module") Script geladen -> die
   folgenden function-Deklarationen hängen sich wie vorher
   automatisch an window, exakt gleiches Verhalten wie im Inline-Script.
   Verhalten bewusst NICHT verändert - nur verschoben.
========================================================= */
function escHtml(v){
  return String(v==null?"":v).replace(/[&<>'"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function escAttr(v){
  return String(v==null?"":v).replace(/[&<>'"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}
function fmtDate(iso){
  if(!iso) return "–";
  const d = new Date(iso);
  if(isNaN(d)) return iso;
  return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});
}
function fmtDateTime(iso){
  if(!iso) return "–";
  const d = new Date(iso);
  if(isNaN(d)) return iso;
  return d.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"})+" "+d.toLocaleTimeString("de-DE",{hour:"2-digit",minute:"2-digit"});
}
function fmtCurrency(n){
  n = Number(n)||0;
  return n.toLocaleString("de-DE",{style:"currency",currency:"EUR"});
}
