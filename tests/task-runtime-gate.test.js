const { isTaskSupabasePilotEnabled, createTaskReferenceMapper, createMappedTaskRepository, validateLegacyTaskCoverage, prepareTaskSupabaseRuntime } = require('../src/modules/tasks/taskRuntimeGate.js');

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
  const statusPatch=mapper.toDbTaskPatch({status:'erledigt'});
  assert(statusPatch.status==='erledigt' && !Object.prototype.hasOwnProperty.call(statusPatch,'projektId') && !Object.prototype.hasOwnProperty.call(statusPatch,'zugeordnet'), 'Partial-Update erfindet keine Referenzfelder');
  const refPatch=mapper.toDbTaskPatch({projektId:'p-legacy',zugeordnet:'e-legacy'});
  assert(refPatch.projektId==='p-uuid' && refPatch.zugeordnet==='e-uuid', 'Partial-Update mappt vorhandene Referenzfelder');
  assert(validateLegacyTaskCoverage([{id:'ok',projektId:'p-legacy',zugeordnet:'e-legacy'}],mapper).length===0, 'vollständig gemappte Legacy-Aufgabe ist cutover-fähig');
  assert(validateLegacyTaskCoverage([{id:'gap',projektId:'missing',zugeordnet:null}],mapper).length===1, 'Legacy-Referenzlücke wird vor Cutover erkannt');

  let threw=false;
  try{ mapper.toDbTask({projektId:'missing'}); }catch(e){ threw=e.message.includes('nicht gemappt'); }
  assert(threw, 'unbekannte Legacy-Referenz fällt geschlossen');

  const duplicate=createTaskReferenceMapper({projects:[{id:'u1',legacy_id:'l1'},{id:'u2',legacy_id:'l1'}]});
  assert(!duplicate.ok, 'mehrdeutiges Mapping wird abgelehnt');

  const rawCalls=[];
  const rawRepository={
    async list(){ rawCalls.push(['list']); return [{id:'t1',projektId:'p-uuid',zugeordnet:'e-uuid',status:'offen'}]; },
    async create(data){ rawCalls.push(['create',data]); return {id:'t2',...data}; },
    async update(id,changes){ rawCalls.push(['update',id,changes]); return {id,projektId:'p-uuid',zugeordnet:'e-uuid',...changes}; },
    async remove(id){ rawCalls.push(['remove',id]); return {id,projektId:'p-uuid',zugeordnet:'e-uuid',deletedAt:'now'}; },
    async restore(id){ rawCalls.push(['restore',id]); return {id,projektId:'p-uuid',zugeordnet:'e-uuid',deletedAt:null}; },
  };
  const mappedRepository=createMappedTaskRepository(rawRepository,mapper);
  const mappedList=await mappedRepository.list();
  assert(mappedList[0].projektId==='p-legacy' && mappedList[0].zugeordnet==='e-legacy', 'Mapped Repository hält UUIDs aus list() von der UI fern');
  const mappedCreated=await mappedRepository.create({titel:'Neu',projektId:'p-legacy',zugeordnet:'e-legacy'});
  assert(rawCalls.find(c=>c[0]==='create')[1].projektId==='p-uuid' && mappedCreated.projektId==='p-legacy', 'create mappt vor und nach dem Raw-Repository');
  await mappedRepository.update('t1',{status:'erledigt'});
  const updateCall=rawCalls.find(c=>c[0]==='update');
  assert(updateCall[2].status==='erledigt' && !Object.prototype.hasOwnProperty.call(updateCall[2],'projektId'), 'Status-Update lässt bestehende DB-Referenzen unangetastet');
  const removed=await mappedRepository.remove('t1');
  const restored=await mappedRepository.restore('t1');
  assert(removed.projektId==='p-legacy' && restored.zugeordnet==='e-legacy', 'remove/restore geben nur Legacy-Referenzen an UI zurück');

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
  assert(result.repository && typeof result.repository.update==='function', 'Runtime liefert nur das gemappte Repository an spätere Write-Integration');

  result=await prepareTaskSupabaseRuntime({storage:storage('1'),client,createRepository:repoFactory,legacyTasks:[{id:'legacy-gap',projektId:'missing'}]});
  assert(result.mode==='legacy' && result.reason==='legacy-reference-gap', 'unvollständige Legacy-Referenzen verhindern Supabase-Lesemodus');

  const badRepo=()=>({list:async()=>[{id:'t1',projektId:'unknown',zugeordnet:null}]});
  result=await prepareTaskSupabaseRuntime({storage:storage('1'),client,createRepository:badRepo,legacyTasks});
  assert(result.mode==='legacy' && result.reason==='preflight-failed', 'unbekannte DB-Referenz fällt auf Legacy zurück');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
