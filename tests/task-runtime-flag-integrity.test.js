let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }
function tick(){ return new Promise(resolve=>setTimeout(resolve,0)); }

(async()=>{
  console.log('\n== TaskRuntimeBootstrap flag integrity ==');

  const bootstrap=require('../src/modules/tasks/taskRuntimeBootstrap.js');
  const exact={getItem(){return '1';}};
  const malformed=['true','01',' 1 ','yes','0',''];
  assert(bootstrap.isTaskReadPilotRequested(exact),'READ-Flag akzeptiert exakt den freigegebenen Wert 1');
  assert(bootstrap.isTaskWritePilotEnabled(exact),'WRITE-Flag akzeptiert exakt den freigegebenen Wert 1');
  for(const value of malformed){
    const storage={getItem(){return value;}};
    assert(!bootstrap.isTaskReadPilotRequested(storage),`READ-Flag ${JSON.stringify(value)} aktiviert den Pilot nicht`);
    assert(!bootstrap.isTaskWritePilotEnabled(storage),`WRITE-Flag ${JSON.stringify(value)} aktiviert den Pilot nicht`);
  }
  const blocked={getItem(){throw new Error('storage blocked');}};
  assert(!bootstrap.isTaskReadPilotRequested(blocked),'gesperrter READ-Storage bleibt fail-closed');
  assert(!bootstrap.isTaskWritePilotEnabled(blocked),'gesperrter WRITE-Storage bleibt fail-closed');

  const local={IB_TASKS_SUPABASE_PILOT:'1'};
  const session={IB_TASKS_SUPABASE_WRITE_PILOT:'true'};
  global.localStorage={getItem(k){return local[k]||null;}};
  global.sessionStorage={getItem(k){return session[k]||null;}};
  global.S={aufgaben:[{id:'legacy',titel:'Legacy'}]};
  let listCalls=0, updates=0, legacyUpdates=0, lastToast='';
  const repo={
    async list(){listCalls++;return [{id:'db',titel:'DB',status:'offen',projektId:null,zugeordnet:null}];},
    async update(id,changes){updates++;return {id,titel:'DB',projektId:null,zugeordnet:null,...changes};}
  };
  global.createTaskSupabaseRepository=()=>({});
  global.TaskRuntimeGate={async prepareTaskSupabaseRuntime(){return {mode:'supabase',reason:'ready',tasks:await repo.list(),repository:repo,mapper:{}};}};
  global.setAufgabeStatus=function(){legacyUpdates++;};
  global.toast=(m)=>{lastToast=m;};
  global.route=()=>{};

  await bootstrap.initializeTaskRuntime({legacyTasks:global.S.aufgaben,client:{from(){}}});
  bootstrap.installTaskWritePilotBridge();
  assert(bootstrap.getVisibleTasks(global.S.aufgaben)[0].id==='db','exaktes READ-Flag aktiviert den vorbereiteten Supabase-READ');

  global.setAufgabeStatus('db','erledigt');
  await tick();
  assert(updates===0 && legacyUpdates===0,'malformiertes WRITE-Flag aktiviert weder Supabase- noch Legacy-Mutation');
  assert(/nur lesend/i.test(lastToast),'malformiertes WRITE-Flag bleibt sichtbar READ-only');

  session.IB_TASKS_SUPABASE_WRITE_PILOT='1';
  global.setAufgabeStatus('db','erledigt');
  await tick(); await tick();
  assert(updates===1 && legacyUpdates===0,'erst exaktes tab-lokales WRITE-Flag erlaubt die Supabase-Mutation');

  const sessionStorageObject=global.sessionStorage;
  Object.defineProperty(global,'sessionStorage',{configurable:true,get(){throw new Error('sessionStorage getter blocked');}});
  let writeStorageGetterThrew=false;
  try { global.setAufgabeStatus('db','offen'); } catch (_) { writeStorageGetterThrew=true; }
  await tick();
  assert(!writeStorageGetterThrew && updates===1 && legacyUpdates===0,'werfender sessionStorage-Property-Zugriff blockiert WRITE ohne Exception oder Legacy-Fallback');
  assert(/nur lesend/i.test(lastToast),'gesperrter WRITE-Storage bleibt sichtbar READ-only');
  Object.defineProperty(global,'sessionStorage',{configurable:true,writable:true,value:sessionStorageObject});

  local.IB_TASKS_SUPABASE_PILOT='true';
  const beforeListCalls=listCalls;
  assert(bootstrap.getVisibleTasks(global.S.aufgaben)[0].id==='legacy','malformiertes READ-Flag deaktiviert die Supabase-Sicht sofort');
  await bootstrap.reloadSupabaseTasks();
  assert(listCalls===beforeListCalls,'malformiertes READ-Flag verhindert weitere Supabase-Reload-Reads');
  global.setAufgabeStatus('db','offen');
  await tick();
  assert(updates===1 && legacyUpdates===0,'malformiertes READ-Flag blockiert stale Supabase-WRITE fail-closed');
  assert(/nicht schreibbereit/i.test(lastToast),'stale Runtime mit ungültigem READ-Flag wird sichtbar blockiert');

  local.IB_TASKS_SUPABASE_PILOT='1';
  Object.defineProperty(global,'localStorage',{configurable:true,get(){throw new Error('localStorage getter blocked');}});
  const getterBlockedListCalls=listCalls;
  assert(bootstrap.getVisibleTasks(global.S.aufgaben)[0].id==='legacy','werfender localStorage-Property-Zugriff fällt sofort auf Legacy-Sicht zurück');
  await bootstrap.reloadSupabaseTasks();
  assert(listCalls===getterBlockedListCalls,'werfender localStorage-Property-Zugriff verhindert weitere Supabase-Reload-Reads');
  let mutationThrew=false;
  try { global.setAufgabeStatus('db','erledigt'); } catch (_) { mutationThrew=true; }
  await tick();
  assert(!mutationThrew && updates===1 && legacyUpdates===0,'werfender localStorage-Property-Zugriff blockiert stale WRITE ohne Exception oder Legacy-Fallback');
  assert(/nicht schreibbereit/i.test(lastToast),'gesperrter READ-Storage wird sichtbar fail-closed blockiert');

  bootstrap.resetTaskRuntime('blocked-storage-init',global.S.aufgaben);
  let gateStorage='unset';
  global.TaskRuntimeGate={async prepareTaskSupabaseRuntime(opts){
    gateStorage=opts.storage;
    if(!bootstrap.isTaskReadPilotRequested(opts.storage)) return {mode:'legacy',reason:'feature-flag-off',tasks:opts.legacyTasks,repository:null,mapper:null};
    return {mode:'supabase',reason:'ready',tasks:await repo.list(),repository:repo,mapper:{}};
  }};
  const beforeBlockedInitLists=listCalls;
  const blockedInit=await bootstrap.initializeTaskRuntime({legacyTasks:global.S.aufgaben,client:{from(){}}});
  assert(gateStorage===null,'gesperrter localStorage-Zugriff wird beim Runtime-Start als nicht verfügbar an das Gate übergeben');
  assert(blockedInit.mode==='legacy' && blockedInit.reason==='feature-flag-off','Runtime-Start mit gesperrtem READ-Storage bleibt fail-closed im Legacy-Modus');
  assert(listCalls===beforeBlockedInitLists,'Runtime-Start mit gesperrtem READ-Storage führt keinen Supabase-Task-Read aus');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
