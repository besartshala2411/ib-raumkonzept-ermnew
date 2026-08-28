let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }
function tick(){ return new Promise(resolve=>setTimeout(resolve,0)); }
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }

(async()=>{
  console.log('\n== TaskRuntimeBootstrap auth race guards ==');

  const legacyTasks=[{id:'legacy',titel:'Legacy',status:'offen'}];
  global.S={aufgaben:legacyTasks};
  const flags={IB_TASKS_SUPABASE_PILOT:'1',IB_TASKS_SUPABASE_WRITE_PILOT:'1'};
  global.localStorage={getItem(key){return flags[key] || null;}};
  global.getSupabaseClient=async()=>({from(){}});
  global.createTaskSupabaseRepository=()=>({});
  global.location={hash:'#aufgaben'};
  global.route=()=>{};
  global.toast=()=>{};

  const firstPreflight=deferred();
  global.TaskRuntimeGate={prepareTaskSupabaseRuntime:async()=>firstPreflight.promise};
  const bootstrap=require('../src/modules/tasks/taskRuntimeBootstrap.js');

  const staleInit=bootstrap.initializeTaskRuntime({legacyTasks,client:{from(){}}});
  await tick();
  bootstrap.resetTaskRuntime('logout',legacyTasks);
  firstPreflight.resolve({mode:'supabase',reason:'ready',tasks:[{id:'stale'}],repository:{list:async()=>[]},mapper:{}});
  await staleInit;
  assert(bootstrap.getTaskRuntime().mode==='legacy' && bootstrap.getTaskRuntime().reason==='logout',
    'verspäteter Preflight kann einen Logout-Reset nicht überschreiben');
  assert(bootstrap.getVisibleTasks(legacyTasks)[0].id==='legacy',
    'nach verspätetem Preflight bleiben nur Legacy-Aufgaben sichtbar');

  // Ein alter refresh-Promise darf beim Abschluss nicht das Promise einer neuen
  // Auth-Generation löschen und dadurch einen dritten parallelen Preflight erlauben.
  const p1=deferred(), p2=deferred();
  let gateCalls=0;
  global.TaskRuntimeGate.prepareTaskSupabaseRuntime=async()=>{
    gateCalls++;
    return gateCalls===1 ? p1.promise : p2.promise;
  };
  const refresh1=bootstrap.refreshRuntimeAndView();
  await tick();
  bootstrap.resetTaskRuntime('auth-transition',legacyTasks);
  const refresh2=bootstrap.refreshRuntimeAndView();
  await tick();
  assert(gateCalls===2,'nach Auth-Reset startet genau ein neuer Preflight');
  p1.resolve({mode:'supabase',reason:'old',tasks:[{id:'old'}],repository:{list:async()=>[]},mapper:{}});
  await refresh1;
  await tick();
  const refresh3=bootstrap.refreshRuntimeAndView();
  await tick();
  assert(gateCalls===2,'Abschluss des alten Preflights löscht den neuen In-Flight-Preflight nicht');
  p2.resolve({mode:'supabase',reason:'ready',tasks:[{id:'fresh'}],repository:{list:async()=>[]},mapper:{}});
  await Promise.all([refresh2,refresh3]);
  assert(bootstrap.getTaskRuntime().mode==='supabase' && bootstrap.getTaskRuntime().tasks[0].id==='fresh',
    'nur das Ergebnis der aktuellen Auth-Generation wird übernommen');

  // Auch ein bereits gestarteter WRITE darf nach Logout den geleerten Runtime-Cache
  // nicht wieder mit Daten des vorherigen Benutzers befüllen.
  const pendingUpdate=deferred();
  const repo={
    list:async()=>[{id:'task-1',titel:'T',status:'offen'}],
    update:async(id,changes)=>{ await pendingUpdate.promise; return {id,titel:'T',...changes}; },
  };
  global.TaskRuntimeGate.prepareTaskSupabaseRuntime=async()=>({mode:'supabase',reason:'ready',tasks:await repo.list(),repository:repo,mapper:{}});
  await bootstrap.initializeTaskRuntime({legacyTasks,client:{from(){}}});
  global.setAufgabeStatus=function(){};
  global.saveAufgabe=function(){};
  global.deleteAufgabe=function(){};
  bootstrap.installTaskWritePilotBridge();
  global.setAufgabeStatus('task-1','erledigt');
  await tick();
  bootstrap.resetTaskRuntime('logout',legacyTasks);
  pendingUpdate.resolve();
  await tick(); await tick();
  assert(bootstrap.getTaskRuntime().mode==='legacy' && bootstrap.getTaskRuntime().reason==='logout',
    'verspäteter WRITE-Abschluss überschreibt den Logout-Reset nicht');
  assert(bootstrap.getVisibleTasks(legacyTasks)[0].id==='legacy',
    'verspäteter WRITE-Abschluss macht keine alten Runtime-Tasks sichtbar');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
