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
  console.log('\n== TaskRuntimeBootstrap WRITE flag race guards ==');

  const legacyTasks = [{ id: 'legacy', titel: 'Legacy', status: 'offen' }];
  const localFlags = { IB_TASKS_SUPABASE_PILOT: '1' };
  const sessionFlags = { IB_TASKS_SUPABASE_WRITE_PILOT: '1' };
  const pendingUpdate = deferred();
  let repositoryUpdates = 0;
  let legacyUpdates = 0;
  const toastEvents = [];

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
    list: async () => [{ id: 'task-1', titel: 'Pilot', status: 'offen' }],
    update: async (id, changes) => {
      repositoryUpdates++;
      await pendingUpdate.promise;
      return { id, titel: 'Pilot', ...changes };
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

  global.setAufgabeStatus('task-1', 'erledigt');
  await tick();
  assert(repositoryUpdates === 1, 'WRITE startet bei explizit aktiviertem tab-lokalem Flag');

  const busyToastCount = toastEvents.length;
  global.setAufgabeStatus('task-1', 'erledigt');
  await tick();
  assert(repositoryUpdates === 1,
    'doppelte Mutation derselben Aufgabe startet keinen zweiten Supabase-WRITE solange der erste läuft');
  assert(legacyUpdates === 0,
    'doppelte laufende Mutation fällt niemals auf Legacy zurück');
  assert(toastEvents.length === busyToastCount + 1 && toastEvents.at(-1).type === 'warn',
    'doppelte laufende Mutation wird als bereits laufender WRITE signalisiert');

  sessionFlags.IB_TASKS_SUPABASE_WRITE_PILOT = null;
  pendingUpdate.resolve();
  await tick();
  await tick();

  assert(bootstrap.getTaskRuntime().tasks[0].status === 'offen',
    'verspätetes WRITE-Ergebnis wird nach WRITE-Deaktivierung nicht in den Runtime-Cache übernommen');
  assert(legacyUpdates === 0,
    'verspätetes WRITE-Ergebnis fällt niemals auf eine Legacy-Mutation zurück');

  const toastCount = toastEvents.length;
  global.setAufgabeStatus('task-1', 'erledigt');
  await tick();
  assert(repositoryUpdates === 1,
    'nach WRITE-Deaktivierung wird kein weiterer Supabase-WRITE gestartet');
  assert(legacyUpdates === 0,
    'READ-Pilot ohne WRITE-Flag bleibt schreibgeschützt statt Legacy zu mutieren');
  assert(toastEvents.length === toastCount + 1 && toastEvents.at(-1).type === 'warn',
    'blockierter WRITE wird als READ-only-Zustand signalisiert');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
