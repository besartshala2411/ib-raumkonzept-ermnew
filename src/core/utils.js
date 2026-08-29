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
 * Phase 3C: iPad-/Mobile-Pilot-Steuerung ohne DevTools.
 * Der Dialog ist standardmäßig vollständig unsichtbar und erscheint nur bei
 * explizitem ?ibTaskPilotControl=1. Der URL-Parameter aktiviert selbst NICHTS.
 * READ bleibt origin-weit in localStorage, WRITE ausschließlich tab-lokal in
 * sessionStorage. Schlägt ein Storage-Zugriff fehl, wird bestmöglich auf OFF
 * zurückgerollt und niemals automatisch weitergeschaltet.
 */
(function installTaskPilotMobileControl(global){
  if (!global) return;
  const READ_FLAG = 'IB_TASKS_SUPABASE_PILOT';
  const WRITE_FLAG = 'IB_TASKS_SUPABASE_WRITE_PILOT';
  const CONTROL_PARAM = 'ibTaskPilotControl';

  function storageSet(storage, key, value) {
    if (!storage || typeof storage.setItem !== 'function') throw new Error('Storage nicht verfügbar.');
    storage.setItem(key, value);
  }
  function storageRemove(storage, key) {
    if (storage && typeof storage.removeItem === 'function') storage.removeItem(key);
  }
  function storageEnabled(storage, key) {
    try { return !!storage && typeof storage.getItem === 'function' && storage.getItem(key) === '1'; }
    catch (_) { return false; }
  }
  function getStorage(name) {
    try { return global[name] || null; } catch (_) { return null; }
  }
  function controlRequested(search) {
    try {
      const params = new URLSearchParams(typeof search === 'string' ? search : '');
      return params.get(CONTROL_PARAM) === '1';
    } catch (_) {
      return false;
    }
  }
  function getState() {
    const read = storageEnabled(getStorage('localStorage'), READ_FLAG);
    const write = storageEnabled(getStorage('sessionStorage'), WRITE_FLAG);
    return { read, write, active: read && write };
  }
  function enable() {
    const local = getStorage('localStorage');
    const session = getStorage('sessionStorage');
    try {
      storageSet(local, READ_FLAG, '1');
      storageSet(session, WRITE_FLAG, '1');
      const state = getState();
      if (!state.active) throw new Error('Pilot-Flags konnten nicht bestätigt werden.');
      return { ok: true, state };
    } catch (error) {
      try { storageRemove(session, WRITE_FLAG); } catch (_) {}
      try { storageRemove(local, READ_FLAG); } catch (_) {}
      return { ok: false, error, state: getState() };
    }
  }
  function disable() {
    const local = getStorage('localStorage');
    const session = getStorage('sessionStorage');
    let ok = true;
    try { storageRemove(session, WRITE_FLAG); } catch (_) { ok = false; }
    try { storageRemove(local, READ_FLAG); } catch (_) { ok = false; }
    const state = getState();
    return { ok: ok && !state.read && !state.write, state };
  }
  function reload() {
    if (global.location && typeof global.location.reload === 'function') global.location.reload();
  }
  function install() {
    if (typeof document === 'undefined' || !global.location || !controlRequested(global.location.search)) return false;
    if (document.getElementById('taskPilotMobileControl')) return true;

    const panel = document.createElement('div');
    panel.id = 'taskPilotMobileControl';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Task WRITE Pilot Steuerung');
    panel.style.cssText = 'position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;padding:14px;border:2px solid #b45309;border-radius:12px;background:#fff;color:#111;font:14px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.25)';

    const title = document.createElement('strong');
    title.textContent = 'Phase 3C · Task WRITE Pilot';
    const help = document.createElement('div');
    help.style.cssText = 'margin:6px 0 6px';
    help.textContent = 'Nur für den kontrollierten Test. READ gilt für diese Origin, WRITE nur für diesen Tab.';
    const status = document.createElement('div');
    status.id = 'taskPilotMobileStatus';
    status.style.cssText = 'margin:0 0 10px;font-weight:700';

    const activate = document.createElement('button');
    activate.type = 'button';
    activate.textContent = 'Pilot aktivieren';
    activate.style.cssText = 'padding:10px 14px;margin-right:8px;font:inherit;font-weight:600';
    activate.onclick = function () {
      if (getState().active) return;
      if (typeof global.confirm === 'function' && !global.confirm('Task WRITE Pilot jetzt in diesem Tab aktivieren?')) return;
      const result = enable();
      if (!result.ok) {
        if (typeof global.alert === 'function') global.alert('Pilot konnte nicht sicher aktiviert werden. Flags wurden zurückgesetzt.');
        renderState();
        return;
      }
      reload();
    };

    const deactivate = document.createElement('button');
    deactivate.type = 'button';
    deactivate.textContent = 'Pilot deaktivieren';
    deactivate.style.cssText = 'padding:10px 14px;font:inherit';
    deactivate.onclick = function () {
      disable();
      reload();
    };

    function renderState() {
      const state = getState();
      if (state.active) status.textContent = 'Status: AKTIV · READ + WRITE';
      else if (state.read) status.textContent = 'Status: READ-only · WRITE nicht aktiv';
      else if (state.write) status.textContent = 'Status: inkonsistent · WRITE ohne READ wird nicht verwendet';
      else status.textContent = 'Status: AUS';
      activate.disabled = state.active;
      deactivate.disabled = !state.read && !state.write;
    }

    panel.appendChild(title);
    panel.appendChild(help);
    panel.appendChild(status);
    panel.appendChild(activate);
    panel.appendChild(deactivate);
    (document.body || document.documentElement).appendChild(panel);
    renderState();
    return true;
  }

  global.TaskPilotMobileControl = { READ_FLAG, WRITE_FLAG, CONTROL_PARAM, controlRequested, getState, enable, disable, install };
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  }
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * Phase 3C: index.html ist bewusst nicht als 400-KB-Gesamtdatei ersetzt worden.
 * Da utils.js bereits synchron direkt vor dem Hauptscript geladen wird, kann der
 * Pilot hier fail-closed nachgeladen werden. Ohne explizites localStorage-Flag
 * passiert nichts; Legacy-Verhalten bleibt unverändert.
 */
(function loadTaskPilotModules(global){
  if (typeof document === 'undefined' || !global) return;
  let storage = null;
  try { storage = global.localStorage || null; } catch (_) { storage = null; }
  if (!storage) return;
  let enabled = false;
  try { enabled = storage.getItem('IB_TASKS_SUPABASE_PILOT') === '1'; }
  catch (_) { enabled = false; }
  if (!enabled) return;

  const scripts = [
    './src/modules/tasks/taskRuntimeGate.js',
    './src/modules/tasks/taskSupabaseRepository.js',
    './src/modules/tasks/taskRuntimeBootstrap.js',
  ];

  if (document.readyState === 'loading' && typeof document.write === 'function') {
    document.write(scripts.map(src => '<script src="' + src + '"></scr' + 'ipt>').join(''));
    return;
  }

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
