// Phase 3C – Browser-Bootstrap für den kontrollierten Aufgaben-Pilot.
// Keine automatische Aktivierung: TaskRuntimeGate prüft das explizite localStorage-Flag.
// Der Legacy-State wird bei Fehlern oder OFF niemals überschrieben.
(function (global) {
  'use strict';

  let runtime = { mode: 'legacy', reason: 'not-started', tasks: null, repository: null, mapper: null };

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

  global.TaskRuntimeBootstrap = { initializeTaskRuntime, getTaskRuntime, getVisibleTasks };
})(typeof window !== 'undefined' ? window : globalThis);
