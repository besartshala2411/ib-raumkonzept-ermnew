// Phase 3C – Browser-Bootstrap für den kontrollierten Aufgaben-Pilot.
// Keine automatische Aktivierung: TaskRuntimeGate prüft das explizite localStorage-Flag.
// READ-Pilot: der Legacy-State wird niemals dauerhaft mit Supabase-Tasks überschrieben.
(function (global) {
  'use strict';

  let runtime = { mode: 'legacy', reason: 'not-started', tasks: null, repository: null, mapper: null };
  let bridgeInstalled = false;
  let initializePromise = null;

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
    initializeTaskRuntime,
    getTaskRuntime,
    getVisibleTasks,
    withVisibleTasks,
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
