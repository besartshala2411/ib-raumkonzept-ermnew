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
  let updates=0, legacyUpdates=0, listCalls=0, lastToast='', deferredUpdate=null;
  const repo={
    async list(){listCalls++;return [{id:'db',titel:'DB',status:'offen',projektId:null,zugeordnet:null}];},
    async update(id,changes){
      updates++;
      if(deferredUpdate) return deferredUpdate.promise;
      return {id,titel:'DB',projektId:null,zugeordnet:null,...changes};
    }
  };
  global.createTaskSupabaseRepository=()=>({});
  global.TaskRuntimeGate={async prepareTaskSupabaseRuntime(){return {mode:'supabase',reason:'ready',tasks:await repo.list(),repository:repo,mapper:{}};}};
  global.setAufgabeStatus=function(){legacyUpdates++;};
  global.toast=(m)=>{lastToast=m;};
  global.route=()=>{};
  const bootstrap=require('../src/modules/tasks/taskRuntimeBootstrap.js');
  await bootstrap.initializeTaskRuntime({legacyTasks:global.S.aufgaben,client:{from(){}}});
  bootstrap.installTaskWritePilotBridge();

  assert(bootstrap.getVisibleTasks(global.S.aufgaben)[0].id==='db','aktiver READ-Pilot liefert Supabase-Tasks als sichtbaren Runtime-State');

  global.setAufgabeStatus('db','erledigt');
  await tick();
  assert(updates===0 && legacyUpdates===0,'origin-weites localStorage-WRITE-Flag allein aktiviert keine Mutation im Browser-Kontext');
  assert(/nur lesend/i.test(lastToast),'fehlendes tab-lokales WRITE-Flag blockiert sichtbar');

  session.IB_TASKS_SUPABASE_WRITE_PILOT='1';
  global.setAufgabeStatus('db','erledigt');
  await tick(); await tick();
  assert(updates===1 && legacyUpdates===0,'sessionStorage-WRITE-Flag aktiviert Mutation nur im aktuellen Tab-Kontext');
  assert(bootstrap.getTaskRuntime().tasks[0].status==='erledigt','tab-lokal freigegebener Write aktualisiert Runtime-Cache');

  // Eine bereits versandte Mutation darf nach READ-Deaktivierung zwar serverseitig
  // abgeschlossen werden, ihr verspätetes Ergebnis aber nicht mehr den deaktivierten
  // Pilot-Cache oder die sichtbare Legacy-Ansicht überschreiben.
  let resolveDeferred;
  deferredUpdate={};
  deferredUpdate.promise=new Promise(resolve=>{resolveDeferred=resolve;});
  global.setAufgabeStatus('db','offen');
  await tick();
  assert(updates===2,'in-flight Testmutation wurde vor READ-Deaktivierung an Supabase versandt');
  local.IB_TASKS_SUPABASE_PILOT=null;
  resolveDeferred({id:'db',titel:'DB',status:'offen',projektId:null,zugeordnet:null});
  await tick(); await tick();
  deferredUpdate=null;
  assert(bootstrap.getTaskRuntime().tasks[0].status==='erledigt','verspätetes Mutationsergebnis nach READ-Deaktivierung überschreibt den Runtime-Cache nicht');
  assert(bootstrap.getVisibleTasks(global.S.aufgaben)[0].id==='legacy','nach READ-Deaktivierung bleibt die sichtbare Ansicht auf Legacy');

  // Wird das READ-Flag in einer bereits initialisierten Supabase-Runtime entfernt,
  // dürfen weder stale Reads noch ein zurückgelassenes WRITE-Flag weiter Supabase nutzen.
  const beforeReloadListCalls=listCalls;
  await bootstrap.reloadSupabaseTasks();
  assert(listCalls===beforeReloadListCalls,'entferntes READ-Flag verhindert weitere Supabase-Reload-Reads');

  global.setAufgabeStatus('db','offen');
  await tick();
  assert(updates===2 && legacyUpdates===0,'entferntes READ-Flag stoppt WRITE sofort auch bei stale Supabase-Runtime');
  assert(/nicht schreibbereit/i.test(lastToast),'READ-Deaktivierung in stale Runtime wird sichtbar fail-closed blockiert');

  local.IB_TASKS_SUPABASE_PILOT='1';
  session.IB_TASKS_SUPABASE_WRITE_PILOT=null;
  global.setAufgabeStatus('db','offen');
  await tick();
  assert(updates===2,'Entfernen des sessionStorage-Flags sperrt weitere Writes sofort wieder');

  delete global.sessionStorage;
  global.setAufgabeStatus('db','offen');
  await tick();
  assert(updates===2 && legacyUpdates===0,'fehlendes sessionStorage bleibt fail-closed und fällt nicht auf localStorage-WRITE zurück');

  global.sessionStorage={getItem(){throw new Error('sessionStorage getItem blocked');}};
  global.setAufgabeStatus('db','offen');
  await tick();
  assert(updates===2 && legacyUpdates===0,'werfendes sessionStorage.getItem bleibt fail-closed ohne Supabase- oder Legacy-WRITE');
  assert(/nur lesend/i.test(lastToast),'werfendes sessionStorage.getItem bleibt sichtbar READ-only');

  Object.defineProperty(global,'sessionStorage',{
    configurable:true,
    get(){ throw new Error('session storage blocked'); }
  });
  global.setAufgabeStatus('db','offen');
  await tick();
  assert(updates===2 && legacyUpdates===0,'gesperrtes sessionStorage bleibt ebenfalls fail-closed');
  delete global.sessionStorage;

  // Erst nach deaktiviertem READ-Flag plus Runtime-Reset (entspricht dem Reload im
  // Runbook) darf der unveränderte Legacy-Pfad wieder Schreibzugriffe übernehmen.
  local.IB_TASKS_SUPABASE_PILOT=null;
  bootstrap.resetTaskRuntime('pilot-disabled',global.S.aufgaben);
  global.setAufgabeStatus('legacy','erledigt');
  assert(legacyUpdates===1 && updates===2,'nach explizitem Pilot-Reset ist Legacy-Schreiben wieder verfügbar');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
