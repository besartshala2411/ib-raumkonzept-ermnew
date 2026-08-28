let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }
function tick(){ return new Promise(resolve=>setTimeout(resolve,0)); }

(async()=>{
  console.log('\n== TaskRuntimeBootstrap WRITE tab scope ==');
  const local={IB_TASKS_SUPABASE_PILOT:'1',IB_TASKS_SUPABASE_WRITE_PILOT:'1'};
  const session={IB_TASKS_SUPABASE_WRITE_PILOT:null};
  global.localStorage={getItem(k){return local[k]||null;}};
  global.sessionStorage={getItem(k){return session[k]||null;}};
  global.S={aufgaben:[{id:'legacy'}]};
  let updates=0, legacyUpdates=0, lastToast='';
  const repo={
    async list(){return [{id:'db',titel:'DB',status:'offen',projektId:null,zugeordnet:null}];},
    async update(id,changes){updates++;return {id,titel:'DB',projektId:null,zugeordnet:null,...changes};}
  };
  global.createTaskSupabaseRepository=()=>({});
  global.TaskRuntimeGate={async prepareTaskSupabaseRuntime(){return {mode:'supabase',reason:'ready',tasks:await repo.list(),repository:repo,mapper:{}};}};
  global.setAufgabeStatus=function(){legacyUpdates++;};
  global.toast=(m)=>{lastToast=m;};
  global.route=()=>{};
  const bootstrap=require('../src/modules/tasks/taskRuntimeBootstrap.js');
  await bootstrap.initializeTaskRuntime({legacyTasks:global.S.aufgaben,client:{from(){}}});
  bootstrap.installTaskWritePilotBridge();

  global.setAufgabeStatus('db','erledigt');
  await tick();
  assert(updates===0 && legacyUpdates===0,'origin-weites localStorage-WRITE-Flag allein aktiviert keine Mutation im Browser-Kontext');
  assert(/nur lesend/i.test(lastToast),'fehlendes tab-lokales WRITE-Flag blockiert sichtbar');

  session.IB_TASKS_SUPABASE_WRITE_PILOT='1';
  global.setAufgabeStatus('db','erledigt');
  await tick(); await tick();
  assert(updates===1 && legacyUpdates===0,'sessionStorage-WRITE-Flag aktiviert Mutation nur im aktuellen Tab-Kontext');
  assert(bootstrap.getTaskRuntime().tasks[0].status==='erledigt','tab-lokal freigegebener Write aktualisiert Runtime-Cache');

  session.IB_TASKS_SUPABASE_WRITE_PILOT=null;
  global.setAufgabeStatus('db','offen');
  await tick();
  assert(updates===1,'Entfernen des sessionStorage-Flags sperrt weitere Writes sofort wieder');

  delete global.sessionStorage;
  global.setAufgabeStatus('db','offen');
  await tick();
  assert(updates===1 && legacyUpdates===0,'fehlendes sessionStorage bleibt fail-closed und fällt nicht auf localStorage-WRITE zurück');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
