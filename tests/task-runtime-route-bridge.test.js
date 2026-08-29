let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }

(async()=>{
  console.log('\n== TaskRuntimeBootstrap route registry bridge ==');

  const storageValues={IB_TASKS_SUPABASE_PILOT:'1'};
  const legacyTasks=[{id:'legacy',titel:'Legacy',status:'offen'}];
  const supabaseTasks=[{id:'db-1',titel:'Supabase 1',status:'offen'},{id:'db-2',titel:'Supabase 2',status:'erledigt'}];
  global.S={aufgaben:legacyTasks};
  global.localStorage={getItem(key){return storageValues[key] || null;}};
  global.sessionStorage={getItem(){return null;}};
  global.createTaskSupabaseRepository=()=>({});
  global.TaskRuntimeGate={
    async prepareTaskSupabaseRuntime(){
      return {mode:'supabase',reason:'ready',tasks:supabaseTasks,repository:{async list(){return supabaseTasks;}},mapper:{}};
    }
  };

  // Reproduziert index.html: reg('aufgaben', ..., renderAufgaben) hält die
  // ursprüngliche Renderer-Referenz fest. Ein bloßes window.renderAufgaben = wrapper
  // kann diesen gespeicherten Callback nicht mehr ändern.
  global.renderAufgaben=function(){ return global.S.aufgaben.map(t=>t.id).join(','); };
  const registeredRender=global.renderAufgaben;
  global.route=function(){ return registeredRender(); };
  global.renderProjektDetail=function(){ return null; };
  global.globalSearchIndex=function(){ return []; };

  delete require.cache[require.resolve('../src/modules/tasks/taskRuntimeBootstrap.js')];
  const bootstrap=require('../src/modules/tasks/taskRuntimeBootstrap.js');
  await bootstrap.initializeTaskRuntime({legacyTasks,client:{from(){}}});
  bootstrap.installTaskReadPilotBridge();

  assert(bootstrap.getTaskRuntime().mode==='supabase','Testvorbedingung: Supabase-READ ist ready');
  assert(global.route()==='db-1,db-2','Route-Dispatch zeigt Supabase-Tasks trotz zuvor eingefangener Legacy-Renderer-Referenz');
  assert(global.S.aufgaben===legacyTasks,'Route-Bridge stellt das ursprüngliche Legacy-Array nach dem Render exakt wieder her');
  assert(registeredRender()==='legacy','gespeicherter Original-Renderer bleibt außerhalb der Bridge unverändert legacy');

  storageValues.IB_TASKS_SUPABASE_PILOT=null;
  assert(global.route()==='legacy','deaktivierter READ-Pilot fällt über denselben Route-Pfad sofort auf Legacy zurück');
  assert(global.S.aufgaben===legacyTasks,'Legacy-State bleibt auch nach Flag-Off unverändert');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
