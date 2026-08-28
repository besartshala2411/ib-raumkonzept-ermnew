const { createTaskSupabaseRepository, dbTaskToLegacy } = require('../src/modules/tasks/taskSupabaseRepository.js');

let passed = 0, failed = 0;
function assert(cond, msg) { if (cond) { passed++; console.log('  OK  ' + msg); } else { failed++; console.log('  FAIL ' + msg); } }

function builder(finalResult, calls) {
  const b = {
    select(cols) { calls.push(['select', cols]); return b; },
    is(col, value) { calls.push(['is', col, value]); return b; },
    order(col, opts) { calls.push(['order', col, opts]); return Promise.resolve(finalResult); },
    insert(row) { calls.push(['insert', row]); return b; },
    update(row) { calls.push(['update', row]); return b; },
    eq(col, value) { calls.push(['eq', col, value]); return b; },
    single() { calls.push(['single']); return Promise.resolve(finalResult); },
    then(resolve, reject) { return Promise.resolve(finalResult).then(resolve, reject); },
  };
  return b;
}

function clientWith(result, calls) {
  return { from(table) { calls.push(['from', table]); return builder(result, calls); } };
}

(async () => {
  console.log('\n== TaskSupabaseRepository ==');
  const row = { id:'db1', legacy_id:null, titel:'Test', beschreibung:null, faellig:null, prioritaet:'mittel', project_id:null, zugeordnet_employee_id:null, status:'offen', deleted_at:null };

  assert(dbTaskToLegacy(row).titel === 'Test', 'DB-Zeile wird in UI-Form gemappt');
  assert(dbTaskToLegacy(row).beschreibung === '', 'NULL-Beschreibung wird zu Leerstring');

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:[row], error:null }, calls));
    const data = await repo.list();
    assert(data.length === 1, 'list liefert aktive Tasks');
    assert(calls.some(c => c[0] === 'is' && c[1] === 'deleted_at' && c[2] === null), 'list filtert Soft Deletes');
  }

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:row, error:null }, calls));
    await repo.create({ titel:' Neue Aufgabe ', beschreibung:'', faellig:'', prioritaet:'hoch' });
    const insert = calls.find(c => c[0] === 'insert')[1];
    assert(insert.titel === 'Neue Aufgabe', 'create trimmt Titel');
    assert(!Object.prototype.hasOwnProperty.call(insert, 'company_id'), 'create sendet company_id nicht vom Client');
    assert(!Object.prototype.hasOwnProperty.call(insert, 'created_by'), 'create sendet created_by nicht vom Client');
  }

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:row, error:null }, calls));
    await repo.update('db1', { status:'erledigt', company_id:'evil', deleted_at:'evil' });
    const patch = calls.find(c => c[0] === 'update')[1];
    assert(patch.status === 'erledigt', 'update übernimmt erlaubte Felder');
    assert(!('company_id' in patch) && !('deleted_at' in patch), 'update ignoriert geschützte Felder');
  }

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:row, error:null }, calls));
    let threw = false;
    try { await repo.update('db1', { company_id:'evil', deleted_at:'evil' }); }
    catch (e) { threw = e.message.includes('keine erlaubten Änderungen'); }
    assert(threw, 'update lehnt reine geschützte/no-op Änderungen ab');
    assert(!calls.some(c => c[0] === 'update'), 'bei no-op wird kein Supabase-Update gesendet');
  }

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:row, error:null }, calls));
    let threw = false;
    try { await repo.update('db1'); } catch (e) { threw = e.message.includes('ungültige Änderungen'); }
    assert(threw, 'update validiert fehlende changes');
  }

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:row, error:null }, calls));
    let threw = false;
    try { await repo.create({ titel:'X', prioritaet:'kritisch' }); } catch (e) { threw = e.message.includes('ungültige Priorität'); }
    assert(threw, 'create validiert Priorität clientseitig');
  }

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:row, error:null }, calls));
    let threw = false;
    try { await repo.update('db1', { status:'kaputt' }); } catch (e) { threw = e.message.includes('ungültiger Status'); }
    assert(threw, 'update validiert Status clientseitig');
  }

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:{...row, deleted_at:'2026-08-28T12:00:00Z'}, error:null }, calls));
    await repo.remove('db1');
    const patch = calls.find(c => c[0] === 'update')[1];
    assert(typeof patch.deleted_at === 'string', 'remove führt Soft Delete per deleted_at aus');
    assert(!calls.some(c => c[0] === 'delete'), 'kein Hard Delete vorhanden');
  }

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:row, error:null }, calls));
    await repo.restore('db1');
    const patch = calls.find(c => c[0] === 'update')[1];
    assert(patch.deleted_at === null, 'restore setzt deleted_at auf null');
  }

  {
    const calls = [];
    const repo = createTaskSupabaseRepository(clientWith({ data:null, error:{ message:'RLS denied' } }, calls));
    let threw = false;
    try { await repo.create({ titel:'X' }); } catch (e) { threw = e.message.includes('RLS denied'); }
    assert(threw, 'Supabase/RLS-Fehler werden nicht verschluckt');
  }

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
