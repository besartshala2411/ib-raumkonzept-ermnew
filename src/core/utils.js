/* =========================================================
   CORE / UTILS
   Phase-1-Extraktion aus index.html.
   Reine, DOM-/State-unabhängige Hilfsfunktionen (ID-Erzeugung,
   Datums-/Zeit-Helfer, Debounce). Verhalten bewusst NICHT verändert.

   Achtung Ladereihenfolge: debounce() wird im Hauptscript sofort beim
   Laden aufgerufen (const saveState = debounce(persistState, 250)),
   diese Datei muss daher vor dem Hauptscript geladen werden - siehe
   <script src> ohne defer in index.html.
========================================================= */
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,9); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function nowHM(){ const d=new Date(); return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); }
function debounce(fn, ms){
  let t;
  return function(...args){ clearTimeout(t); t=setTimeout(()=>fn.apply(this,args), ms); };
}
