// Phase 3C – Browser-Bootstrap für den kontrollierten Aufgaben-Pilot.
// Keine automatische Aktivierung: TaskRuntimeGate prüft das explizite localStorage-Flag.
// READ-Pilot: der Legacy-State wird niemals dauerhaft mit Supabase-Tasks überschrieben.
// WRITE-Pilot: zusätzliches Flag erforderlich; bei aktivem READ ohne WRITE werden Mutationen blockiert.
(function (global) {
  'use strict';

  const TASK_READ_FLAG = 'IB_TASKS_SUPABASE_PILOT';
  const TASK_WRITE_FLAG = 'IB_TASKS_SUPABASE_WRITE_PILOT';
  let runtime = { mode: 'legacy', reason: 'not-started', tasks: null, repository: null, mapper: null };
  let bridgeInstalled = false;
  let initializePromise = null;
  let runtimeGeneration = 0;
  const mutationsInFlight = new Set();

  function storageFlagEnabled(storage, key) {
    try {
      return !!storage && storage.getItem(key) === '1';
    } catch (_) {
      return false;
    }
  }

  function isTaskReadPilotRequested(storage) {
    return storageFlagEnabled(storage, TASK_READ_FLAG);
  }

  function isTaskWritePilotEnabled(storage) {
    return storageFlagEnabled(storage, TASK_WRITE_FLAG);
  }

  function resetTaskRuntime(reason, legacyTasks) {
    runtimeGeneration++;
    runtime = {
      mode: 'legacy',
      reason: reason || 'reset',
      tasks: Array.isArray(legacyTasks) ? legacyTasks : null,
      repository: null,
      mapper: null,
    };
    initializePromise = null;
    mutationsInFlight.clear();
    return runtime;
  }

  async function initializeTaskRuntime(options) {
    const opts = options || {};
    const legacyTasks = Array.isArray(opts.legacyTasks) ? opts.legacyTasks : [];
    const gate = global.TaskRuntimeGate;
    const createRepository = global.createTaskSupabaseRepository;
    const generation = runtimeGeneration;

    if (!gate || typeof gate.prepareTaskSupabaseRuntime !== 'function') {
      if (generation === runtimeGeneration) {
        runtime = { mode: 'legacy', reason: 'gate-unavailable', tasks: legacyTasks, repository: null, mapper: null };
      }
      return runtime;
    }

    let client = opts.client || null;
    if (!client && typeof global.getSupabaseClient === 'function') {
      try { client = await global.getSupabaseClient(); } catch (_) { client = null; }
    }
    if (generation !== runtimeGeneration) return runtime;

    const prepared = await gate.prepareTaskSupabaseRuntime({
      storage: opts.storage || global.localStorage,
      client,
      createRepository,
      legacyTasks,
    });
    if (generation !== runtimeGeneration) return runtime;
    runtime = prepared;
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
    const generation = runtimeGeneration;
    const tasks = await runtime.repository.list();
    if (generation !== runtimeGeneration || runtime.mode !== 'supabase') return runtime;
    runtime.tasks = tasks;
    rerenderTasks();
    return runtime;
  }

  function mutationMode() {
    if (runtime.mode === 'supabase') {
      return isTaskWritePilotEnabled(global.localStorage) ? 'supabase-write' : 'supabase-readonly';
    }
    // Sobald der READ-Pilot ausdrücklich angefordert wurde, ist Legacy-Schreiben kein
    // zulässiger Fallback mehr. Das gilt auch vor/bei fehlgeschlagenem Preflight.
    // So kann ein Supabase-Ausfall keine unbemerkte Divergenz zwischen beiden Stores erzeugen.
    if (isTaskReadPilotRequested(global.localStorage)) return 'pilot-unavailable';
    return 'legacy';
  }

  function blockReadOnlyMutation() {
    notify('Aufgaben-Pilot ist derzeit nur lesend aktiviert. Änderungen wurden nicht gespeichert.', 'warn');
    rerenderTasks();
  }

  function blockUnavailableMutation() {
    notify('Aufgaben-Pilot ist nicht schreibbereit. Änderung wurde aus Sicherheitsgründen nicht im Legacy-State gespeichert.', 'error');
    rerenderTasks();
  }

  function mutationFailed(error) {
    notify('Aufgabe konnte nicht in Supabase gespeichert werden: ' + String(error && error.message ? error.message : error).slice(0, 180), 'error');
    rerenderTasks();
  }

  function mutationBusy() {
    notify('Diese Aufgaben-Änderung wird bereits gespeichert.', 'warn');
  }

  function mutationKey(name, args) {
    if (name === 'saveAufgabe') return 'task:create';
    const id = args && args.length ? args[0] : null;
    return id ? 'task:' + String(id) : 'task:' + name;
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
      if (mode === 'pilot-unavailable') {
        blockUnavailableMutation();
        return;
      }
      const args = arguments;
      const key = mutationKey(name, args);
      if (mutationsInFlight.has(key)) {
        mutationBusy();
        return;
      }
      mutationsInFlight.add(key);
      Promise.resolve()
        .then(() => supabaseHandler.apply(this, args))
        .catch(mutationFailed)
        .finally(() => { mutationsInFlight.delete(key); });
    }
    wrapped.__taskPilotWriteWrapped = true;
    wrapped.__taskPilotOriginal = original;
    global[name] = wrapped;
  }

  function installTaskWritePilotBridge() {
    wrapTaskMutation('saveAufgabe', async function () {
      if (!runtime.repository || typeof runtime.repository.create !== 'function') throw new Error('Task-Repository nicht verfügbar.');
      const generation = runtimeGeneration;
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
      if (generation !== runtimeGeneration || runtime.mode !== 'supabase') return;
      runtime.tasks = [created].concat((runtime.tasks || []).filter((task) => task.id !== created.id));
      if (typeof global.closeModal === 'function') global.closeModal();
      rerenderTasks();
      notify('Aufgabe gespeichert.', 'success');
    });

    wrapTaskMutation('setAufgabeStatus', async function (id, status) {
      if (!runtime.repository || typeof runtime.repository.update !== 'function') throw new Error('Task-Repository nicht verfügbar.');
      const generation = runtimeGeneration;
      const updated = await runtime.repository.update(id, { status });
      if (generation !== runtimeGeneration || runtime.mode !== 'supabase') return;
      runtime.tasks = (runtime.tasks || []).map((task) => task.id === id ? updated : task);
      rerenderTasks();
    });

    wrapTaskMutation('deleteAufgabe', async function (id) {
      if (!runtime.repository || typeof runtime.repository.remove !== 'function') throw new Error('Task-Repository nicht verfügbar.');
      const generation = runtimeGeneration;
      await runtime.repository.remove(id);
      if (generation !== runtimeGeneration || runtime.mode !== 'supabase') return;
      runtime.tasks = (runtime.tasks || []).filter((task) => task.id !== id);
      rerenderTasks();
      notify('Aufgabe gelöscht.', 'success');
    });
  }

  async function refreshRuntimeAndView() {
    const state = global.S;
    if (!state || !Array.isArray(state.aufgaben)) return runtime;
    if (initializePromise) return initializePromise;
    const pending = initializeTaskRuntime({ legacyTasks: state.aufgaben })
      .then((result) => {
        if (result.mode === 'supabase' && typeof global.route === 'function') {
          global.route(global.location && global.location.hash ? global.location.hash : '#dashboard');
        }
        return result;
      });
    initializePromise = pending;
    pending.finally(() => {
      if (initializePromise === pending) initializePromise = null;
    });
    return pending;
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
        // Auth-/Benutzerwechsel darf niemals Tasks aus einem vorherigen Runtime-Cache
        // kurz anzeigen. Vor dem ersten Render deshalb immer auf den lokalen Legacy-
        // Snapshot zurücksetzen; der RLS-gescopte Supabase-READ folgt danach asynchron.
        const legacyTasks = global.S && Array.isArray(global.S.aufgaben) ? global.S.aufgaben : [];
        resetTaskRuntime('auth-transition', legacyTasks);
        const result = originalEnterApp.apply(this, arguments);
        Promise.resolve().then(refreshRuntimeAndView).catch(() => null);
        return result;
      }
      wrappedEnterApp.__taskPilotReadWrapped = true;
      wrappedEnterApp.__taskPilotOriginal = originalEnterApp;
      global.enterApp = wrappedEnterApp;
    }

    const originalLogout = global.logout;
    if (typeof originalLogout === 'function' && !originalLogout.__taskPilotReadWrapped) {
      function wrappedLogout() {
        const legacyTasks = global.S && Array.isArray(global.S.aufgaben) ? global.S.aufgaben : [];
        resetTaskRuntime('logout', legacyTasks);
        return originalLogout.apply(this, arguments);
      }
      wrappedLogout.__taskPilotReadWrapped = true;
      wrappedLogout.__taskPilotOriginal = originalLogout;
      global.logout = wrappedLogout;
    }

    const shell = global.document && global.document.getElementById('appShell');
    if (shell && !shell.classList.contains('hidden')) {
      Promise.resolve().then(refreshRuntimeAndView).catch(() => null);
    }
  }

  global.TaskRuntimeBootstrap = {
    TASK_READ_FLAG,
    TASK_WRITE_FLAG,
    isTaskReadPilotRequested,
    isTaskWritePilotEnabled,
    resetTaskRuntime,
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
