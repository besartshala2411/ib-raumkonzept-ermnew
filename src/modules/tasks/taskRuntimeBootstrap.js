// Phase 3C – Browser-Bootstrap für den kontrollierten Aufgaben-Pilot.
// Keine automatische Aktivierung: TaskRuntimeGate prüft das explizite localStorage-Flag.
// READ-Pilot: der Legacy-State wird niemals dauerhaft mit Supabase-Tasks überschrieben.
// WRITE-Pilot: zusätzliches Flag erforderlich; bei aktivem READ ohne WRITE werden Mutationen blockiert.
(function (global) {
  'use strict';

  const TASK_WRITE_FLAG = 'IB_TASKS_SUPABASE_WRITE_PILOT';
  let runtime = { mode: 'legacy', reason: 'not-started', tasks: null, repository: null, mapper: null };
  let bridgeInstalled = false;
  let initializePromise = null;

  function isTaskWritePilotEnabled(storage) {
    try {
      return !!storage && storage.getItem(TASK_WRITE_FLAG) === '1';
    } catch (_) {
      return false;
    }
  }

  async function initializeTaskRuntime(options) {
    const opts = options || {};
    const legacyTasks = Array.isArray(opts.legacyTasks) ? opts.legacyTasks : [];
    const gate = global.TaskRuntimeGate;
    const createRepository = global.createTaskSupabaseRepository;

    if (!gate || typeof gate.prepareTaskSupabaseRuntime !== 'function') {
      runtime = { mode: 'legacy', reason: 'gate-unavailable', tasks: legacyTasks, repository: null, mapper: null };
      return runtime;
    }

    let client = opts.client || null;
    if (!client && typeof global.getSupabaseClient === 'function') {
      try { client = await global.getSupabaseClient(); } catch (_) { client = null; }
    }

    runtime = await gate.prepareTaskSupabaseRuntime({
      storage: opts.storage || global.localStorage,
      client,
      createRepository,
      legacyTasks,
    });
    return runtime;
  }

  function getTaskRuntime() { return runtime; }
  function getVisibleTasks(legacyTasks) {
    return runtime.mode === 'supabase' && Array.isArray(runtime.tasks)
      ? runtime.tasks
      : (Array.isArray(legacyTasks) ? legacyTasks : []);
  }

  function withVisibleTasks(fn, thisArg, args) {
    const state = global.S;
    if (!state || !Array.isArray(state.aufgaben) || runtime.mode !== 'supabase') {
      return fn.apply(thisArg, args || []);
    }
    const legacyTasks = state.aufgaben;
    state.aufgaben = getVisibleTasks(legacyTasks);
    try {
      return fn.apply(thisArg, args || []);
    } finally {
      state.aufgaben = legacyTasks;
    }
  }

  function wrapReadFunction(name) {
    const original = global[name];
    if (typeof original !== 'function' || original.__taskPilotReadWrapped) return;
    function wrapped() { return withVisibleTasks(original, this, arguments); }
    wrapped.__taskPilotReadWrapped = true;
    wrapped.__taskPilotOriginal = original;
    global[name] = wrapped;
  }

  function notify(message, type) {
    if (typeof global.toast === 'function') global.toast(message, type || 'info');
  }

  function rerenderTasks() {
    if (typeof global.route === 'function') {
      global.route(global.location && global.location.hash ? global.location.hash : '#aufgaben');
    }
  }

  async function reloadSupabaseTasks() {
    if (runtime.mode !== 'supabase' || !runtime.repository || typeof runtime.repository.list !== 'function') return runtime;
    runtime.tasks = await runtime.repository.list();
    rerenderTasks();
    return runtime;
  }

  function mutationMode() {
    if (runtime.mode !== 'supabase') return 'legacy';
    return isTaskWritePilotEnabled(global.localStorage) ? 'supabase-write' : 'supabase-readonly';
  }

  function blockReadOnlyMutation() {
    notify('Aufgaben-Pilot ist derzeit nur lesend aktiviert. Änderungen wurden nicht gespeichert.', 'warn');
    rerenderTasks();
  }

  function mutationFailed(error) {
    notify('Aufgabe konnte nicht in Supabase gespeichert werden: ' + String(error && error.message ? error.message : error).slice(0, 180), 'error');
    rerenderTasks();
  }

  function wrapTaskMutation(name, supabaseHandler) {
    const original = global[name];
    if (typeof original !== 'function' || original.__taskPilotWriteWrapped) return;
    function wrapped() {
      const mode = mutationMode();
      if (mode === 'legacy') return original.apply(this, arguments);
      if (mode === 'supabase-readonly') {
        blockReadOnlyMutation();
        return;
      }
      const args = arguments;
      Promise.resolve()
        .then(() => supabaseHandler.apply(this, args))
        .catch(mutationFailed);
    }
    wrapped.__taskPilotWriteWrapped = true;
    wrapped.__taskPilotOriginal = original;
    global[name] = wrapped;
  }

  function installTaskWritePilotBridge() {
    wrapTaskMutation('saveAufgabe', async function () {
      if (!runtime.repository || typeof runtime.repository.create !== 'function') throw new Error('Task-Repository nicht verfügbar.');
      const byId = (id) => global.document && global.document.getElementById(id);
      const titelEl = byId('agTitel');
      const titel = titelEl && String(titelEl.value || '').trim();
      if (!titel) {
        notify('Titel erforderlich.', 'warn');
        return;
      }
      const created = await runtime.repository.create({
        titel,
        beschreibung: (byId('agBeschreibung') && byId('agBeschreibung').value || '').trim(),
        faellig: byId('agFaellig') && byId('agFaellig').value || '',
        prioritaet: byId('agPrio') && byId('agPrio').value || 'mittel',
        projektId: byId('agProjekt') && byId('agProjekt').value || null,
        zugeordnet: byId('agZuge') && byId('agZuge').value || null,
        status: 'offen',
      });
      runtime.tasks = [created].concat((runtime.tasks || []).filter((task) => task.id !== created.id));
      if (typeof global.closeModal === 'function') global.closeModal();
      rerenderTasks();
      notify('Aufgabe gespeichert.', 'success');
    });

    wrapTaskMutation('setAufgabeStatus', async function (id, status) {
      if (!runtime.repository || typeof runtime.repository.update !== 'function') throw new Error('Task-Repository nicht verfügbar.');
      const updated = await runtime.repository.update(id, { status });
      runtime.tasks = (runtime.tasks || []).map((task) => task.id === id ? updated : task);
      rerenderTasks();
    });

    wrapTaskMutation('deleteAufgabe', async function (id) {
      if (!runtime.repository || typeof runtime.repository.remove !== 'function') throw new Error('Task-Repository nicht verfügbar.');
      await runtime.repository.remove(id);
      runtime.tasks = (runtime.tasks || []).filter((task) => task.id !== id);
      rerenderTasks();
      notify('Aufgabe gelöscht.', 'success');
    });
  }

  async function refreshRuntimeAndView() {
    const state = global.S;
    if (!state || !Array.isArray(state.aufgaben)) return runtime;
    if (initializePromise) return initializePromise;
    initializePromise = initializeTaskRuntime({ legacyTasks: state.aufgaben })
      .then((result) => {
        if (result.mode === 'supabase' && typeof global.route === 'function') {
          global.route(global.location && global.location.hash ? global.location.hash : '#dashboard');
        }
        return result;
      })
      .finally(() => { initializePromise = null; });
    return initializePromise;
  }

  function installTaskReadPilotBridge() {
    if (bridgeInstalled) return;
    bridgeInstalled = true;
    wrapReadFunction('renderAufgaben');
    wrapReadFunction('renderProjektDetail');
    wrapReadFunction('globalSearchIndex');
    installTaskWritePilotBridge();

    const originalEnterApp = global.enterApp;
    if (typeof originalEnterApp === 'function' && !originalEnterApp.__taskPilotReadWrapped) {
      function wrappedEnterApp() {
        const result = originalEnterApp.apply(this, arguments);
        Promise.resolve().then(refreshRuntimeAndView).catch(() => null);
        return result;
      }
      wrappedEnterApp.__taskPilotReadWrapped = true;
      wrappedEnterApp.__taskPilotOriginal = originalEnterApp;
      global.enterApp = wrappedEnterApp;
    }

    const shell = global.document && global.document.getElementById('appShell');
    if (shell && !shell.classList.contains('hidden')) {
      Promise.resolve().then(refreshRuntimeAndView).catch(() => null);
    }
  }

  global.TaskRuntimeBootstrap = {
    TASK_WRITE_FLAG,
    isTaskWritePilotEnabled,
    initializeTaskRuntime,
    getTaskRuntime,
    getVisibleTasks,
    withVisibleTasks,
    reloadSupabaseTasks,
    installTaskWritePilotBridge,
    installTaskReadPilotBridge,
    refreshRuntimeAndView,
  };

  if (typeof global.setTimeout === 'function' && typeof global.document !== 'undefined') {
    global.setTimeout(installTaskReadPilotBridge, 0);
  }
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = globalThis.TaskRuntimeBootstrap;
}
