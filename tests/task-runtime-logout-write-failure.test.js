let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  OK  ' + msg); }
  else { failed++; console.log('  FAIL ' + msg); }
}
function tick() { return new Promise((resolve) => setTimeout(resolve, 0)); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

(async () => {
  console.log('\n== TaskRuntimeBootstrap logout WRITE failure race ==');

  const legacyTasks = [{ id: 'legacy', titel: 'Legacy', status: 'offen' }];
  const localFlags = { IB_TASKS_SUPABASE_PILOT: '1' };
  const sessionFlags = { IB_TASKS_SUPABASE_WRITE_PILOT: '1' };
  const pendingFailure = deferred();
  const toastEvents = [];
  let repositoryUpdates = 0;
  let legacyUpdates = 0;

  global.S = { aufgaben: legacyTasks };
  global.localStorage = { getItem(key) { return localFlags[key] || null; } };
  global.sessionStorage = { getItem(key) { return sessionFlags[key] || null; } };
  global.location = { hash: '#aufgaben' };
  global.route = () => {};
  global.toast = (message, type) => toastEvents.push({ message, type });
  global.setAufgabeStatus = () => { legacyUpdates++; };
  global.saveAufgabe = () => {};
  global.deleteAufgabe = () => {};

  const repository = {
    list: async () => [{ id: 'task-logout', titel: 'Pilot', status: 'offen' }],
    update: async () => {
      repositoryUpdates++;
      return pendingFailure.promise;
    },
  };
  global.TaskRuntimeGate = {
    prepareTaskSupabaseRuntime: async () => ({
      mode: 'supabase',
      reason: 'ready',
      tasks: await repository.list(),
      repository,
      mapper: {},
    }),
  };

  const bootstrap = require('../src/modules/tasks/taskRuntimeBootstrap.js');
  await bootstrap.initializeTaskRuntime({ legacyTasks, client: { from() {} } });
  bootstrap.installTaskWritePilotBridge();

  global.setAufgabeStatus('task-logout', 'erledigt');
  await tick();
  assert(repositoryUpdates === 1, 'Supabase-WRITE startet vor dem Logout');
  assert(legacyUpdates === 0, 'laufender Pilot-WRITE fällt nicht auf Legacy zurück');

  const toastCountBeforeLogout = toastEvents.length;
  bootstrap.resetTaskRuntime('logout', legacyTasks);
  pendingFailure.reject(new Error('verspäteter Fehler des abgemeldeten Benutzers'));
  await tick();
  await tick();

  assert(bootstrap.getTaskRuntime().mode === 'legacy' && bootstrap.getTaskRuntime().reason === 'logout',
    'verspäteter WRITE-Fehler kann den Logout-Reset nicht überschreiben');
  assert(bootstrap.getVisibleTasks(legacyTasks)[0].id === 'legacy',
    'nach Logout bleiben ausschließlich Legacy-Aufgaben sichtbar');
  assert(toastEvents.length === toastCountBeforeLogout,
    'verspäteter WRITE-Fehler erzeugt nach Logout keine stale Supabase-Fehlermeldung');
  assert(legacyUpdates === 0,
    'verspäteter WRITE-Fehler nach Logout löst keine Legacy-Mutation aus');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
