const { analyzePilotInput } = require('../tools/migration/phase3bPreflight.js');

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  OK  ' + msg); }
  else { failed++; console.log('  FAIL ' + msg); }
}

const AUTH1 = '11111111-1111-4111-8111-111111111111';
const AUTH2 = '22222222-2222-4222-8222-222222222222';

function cleanInput() {
  return {
    mitarbeiter: [
      { id: 'm1', authUserId: AUTH1, rolle: 'geschaeftsfuehrer', status: 'aktiv' },
      { id: 'm2', authUserId: AUTH2, rolle: 'bauleiter', status: 'aktiv' },
      { id: 'm3', authUserId: null, rolle: 'mitarbeiter', status: 'aktiv' },
    ],
    projekte: [{ id: 'p1' }],
    aufgaben: [
      { id: 't1', titel: 'A', status: 'offen', prioritaet: 'hoch', projektId: 'p1', zugeordnet: 'm2' },
      { id: 't2', titel: 'B', status: 'in Arbeit', prioritaet: 'mittel', projektId: null, zugeordnet: 'm1' },
    ],
  };
}

console.log('\n== Phase 3B preflight ==');
{
  const r = analyzePilotInput(cleanInput(), [AUTH1, AUTH2]);
  assert(r.ok === true, 'saubere synthetische Eingabe ist freigabefähig');
  assert(r.summary.auth_users === 2, 'zählt 2 Auth-Konten');
  assert(r.summary.employees_auth_linked === 2, 'zählt 2 verknüpfte Mitarbeiter');
  assert(r.summary.tasks_total === 2, 'zählt Aufgaben');
}

{
  const input = cleanInput();
  input.passwoerter = [{ passwort: 'synthetic-never-real' }];
  const r = analyzePilotInput(input, [AUTH1, AUTH2]);
  assert(r.ok === false, 'weist Passwort/Voll-State-artige Eingaben zurück');
}

{
  const input = cleanInput();
  input.mitarbeiter[1].authUserId = AUTH1;
  const r = analyzePilotInput(input, [AUTH1, AUTH2]);
  assert(r.errors.some((e) => e.includes('mehreren Mitarbeitern')), 'erkennt doppelte Mitarbeiter-authUserId');
  assert(r.summary.auth_users_unmapped === 1, 'erkennt nicht gemapptes Auth-Konto');
}

{
  const input = cleanInput();
  input.aufgaben.push({ id: 't3', titel: 'C', status: 'offen', prioritaet: 'niedrig', projektId: null, zugeordnet: null });
  const r = analyzePilotInput(input, [AUTH1, AUTH2]);
  assert(r.summary.tasks_projectless_unassigned === 1, 'zählt projektlose unzugewiesene Aufgaben');
  assert(r.warnings.some((w) => w.includes('nur für Geschäftsführer')), 'warnt zur neuen RLS-Sichtbarkeit');
}

{
  const input = cleanInput();
  input.aufgaben.push({ id: 't4', titel: 'D', status: 'offen', prioritaet: 'mittel', projektId: 'p1', zugeordnet: 'm3' });
  const r = analyzePilotInput(input, [AUTH1, AUTH2]);
  assert(r.summary.tasks_assigned_to_employee_without_auth === 1, 'zählt Aufgaben an Mitarbeiter ohne Auth-Konto');
}

{
  const input = cleanInput();
  input.aufgaben[0].projektId = 'missing-project';
  const r = analyzePilotInput(input, [AUTH1, AUTH2]);
  assert(r.ok === false, 'ungültige Projekt-Referenz blockiert Preflight');
}

console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed ? 1 : 0);
