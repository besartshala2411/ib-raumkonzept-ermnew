const { isTaskSupabasePilotEnabled, createTaskReferenceMapper, validateLegacyTaskCoverage, prepareTaskSupabaseRuntime } = require('../src/modules/tasks/taskRuntimeGate.js');

let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }
function storage(value){ return { getItem(){ return value; } }; }

(async()=>{
  console.log('\n== TaskRuntimeGate ==');
  assert(!isTaskSupabasePilotEnabled(storage(null)), 'Feature-Flag ist standardmäßig aus');
  assert(isTaskSupabasePilotEnabled(storage('1')), 'Feature-Flag akzeptiert nur explizite Aktivierung');
  assert(!isTaskSupabasePilotEnabled({getItem(){throw new Error('blocked');}}), 'Storage-Fehler aktivieren Pilot nicht');

  const mapper=createTaskReferenceMapper({
    projects:[{id:'p-uuid',legacy_id:'p-legacy'}],
    employees:[{id:'e-uuid',legacy_id:'e-legacy'}],
  });
  assert(mapper.ok, 'eindeutiges Mapping ist gültig');
  const db=mapper.toDbTask({titel:'X',projektId:'p-legacy',zugeordnet:'e-legacy'});
  assert(db.projektId==='p-uuid' && db.zugeordnet==='e-uuid', 'Legacy-Referenzen werden zu UUIDs aufgelöst');
  const legacy=mapper.toLegacyTask({titel:'X',projektId:'p-uuid',zugeordnet:'e-uuid'});
  assert(legacy.projektId==='p-legacy' && legacy.zugeordnet==='e-legacy', 'UUID-Referenzen werden zu Legacy-IDs aufgelöst');
  assert(mapper.toDbTask({projektId:null,zugeordnet:null}).projektId===null, 'leere Referenzen bleiben null');
  assert(validateLegacyTaskCoverage([{id:'ok',projektId:'p-legacy',zugeordnet:'e-legacy'}],mapper).length===0, 'vollständig gemappte Legacy-Aufgabe ist cutover-fähig');
  assert(validateLegacyTaskCoverage([{id:'gap',projektId:'missing',zugeordnet:null}],mapper).length===1, 'Legacy-Referenzlücke wird vor Cutover erkannt');

  let threw=false;
  try{ mapper.toDbTask({projektId:'missing'}); }catch(e){ threw=e.message.includes('nicht gemappt'); }
  assert(threw, 'unbekannte Legacy-Referenz fällt geschlossen');

  const duplicate=createTaskReferenceMapper({projects:[{id:'u1',legacy_id:'l1'},{id:'u2',legacy_id:'l1'}]});
  assert(!duplicate.ok, 'mehrdeutiges Mapping wird abgelehnt');

  const legacyTasks=[{id:'legacy-task'}];
  let result=await prepareTaskSupabaseRuntime({storage:storage(null),legacyTasks});
  assert(result.mode==='legacy' && result.reason==='feature-flag-off', 'Flag OFF bleibt ohne Supabase-Zugriff im Legacy-Modus');

  result=await prepareTaskSupabaseRuntime({storage:storage('1'),legacyTasks});
  assert(result.mode==='legacy' && result.reason==='supabase-unavailable', 'fehlender Client fällt auf Legacy zurück');

  function query(result){
    const q={
      select(){return q;}, is(){return Promise.resolve(result);}, eq(){return Promise.resolve(result);},
      then(resolve,reject){return Promise.resolve(result).then(resolve,reject);}
    };
    return q;
  }
  const client={from(table){
    if(table==='projects') return query({data:[{id:'p-uuid',legacy_id:'p-legacy'}],error:null});
    if(table==='employees') return query({data:[{id:'e-uuid',legacy_id:'e-legacy'}],error:null});
    throw new Error('unexpected table');
  }};
  const repoFactory=()=>({list:async()=>[{id:'t1',projektId:'p-uuid',zugeordnet:'e-uuid'}]});
  result=await prepareTaskSupabaseRuntime({storage:storage('1'),client,createRepository:repoFactory,legacyTasks});
  assert(result.mode==='supabase' && result.tasks[0].projektId==='p-legacy', 'vollständiger Preflight erlaubt Supabase-Lesemodus');

  result=await prepareTaskSupabaseRuntime({storage:storage('1'),client,createRepository:repoFactory,legacyTasks:[{id:'legacy-gap',projektId:'missing'}]});
  assert(result.mode==='legacy' && result.reason==='legacy-reference-gap', 'unvollständige Legacy-Referenzen verhindern Supabase-Lesemodus');

  const badRepo=()=>({list:async()=>[{id:'t1',projektId:'unknown',zugeordnet:null}]});
  result=await prepareTaskSupabaseRuntime({storage:storage('1'),client,createRepository:badRepo,legacyTasks});
  assert(result.mode==='legacy' && result.reason==='preflight-failed', 'unbekannte DB-Referenz fällt auf Legacy zurück');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
