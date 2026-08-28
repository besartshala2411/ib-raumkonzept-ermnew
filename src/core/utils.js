/* =========================================================
   CORE / UTILS
   Phase-1-Extraktion aus index.html.
   Reine Hilfsfunktionen plus Phase-3C-Pilot-Loader.

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

/*
 * Phase 3C: index.html ist bewusst nicht als 400-KB-Gesamtdatei ersetzt worden.
 * Da utils.js bereits synchron direkt vor dem Hauptscript geladen wird, kann der
 * Pilot hier fail-closed nachgeladen werden. Ohne explizites localStorage-Flag
 * passiert nichts; Legacy-Verhalten bleibt unverändert.
 */
(function loadTaskPilotModules(global){
  if (typeof document === 'undefined' || !global || !global.localStorage) return;
  let enabled = false;
  try { enabled = global.localStorage.getItem('IB_TASKS_SUPABASE_PILOT') === '1'; }
  catch (_) { enabled = false; }
  if (!enabled) return;

  const scripts = [
    './src/modules/tasks/taskRuntimeGate.js',
    './src/modules/tasks/taskSupabaseRepository.js',
    './src/modules/tasks/taskRuntimeBootstrap.js',
  ];

  // Während des HTML-Parsens synchron einfügen, damit alle drei Module vor dem
  // bestehenden Hauptscript verfügbar sind. Flag OFF => dieser Pfad läuft nie.
  if (document.readyState === 'loading' && typeof document.write === 'function') {
    document.write(scripts.map(src => '<script src="' + src + '"><\\/script>').join(''));
    return;
  }

  // Defensive Fallback-Variante für spätes Laden; Reihenfolge bleibt erhalten.
  let chain = Promise.resolve();
  for (const src of scripts) {
    chain = chain.then(() => new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = reject;
      document.head.appendChild(el);
    }));
  }
  global.__taskPilotModulesReady = chain.catch(() => null);
})(typeof window !== 'undefined' ? window : null);
