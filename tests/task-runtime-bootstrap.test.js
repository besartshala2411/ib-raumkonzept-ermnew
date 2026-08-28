let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }

(async()=>{
  console.log('\n== TaskRuntimeBootstrap READ bridge ==');

  global.S={aufgaben:[{id:'legacy',titel:'Legacy'}]};
  global.localStorage={getItem(){return '1';}};
  global.createTaskSupabaseRepository=()=>({});
  global.TaskRuntimeGate={
    async prepareTaskSupabaseRuntime(){
      return {mode:'supabase',reason:'ready',tasks:[{id:'db',titel:'Supabase'}],repository:{},mapper:{}};
    }
  };

  const bootstrap=require('../src/modules/tasks/taskRuntimeBootstrap.js');
  const legacyRef=global.S.aufgaben;
  await bootstrap.initializeTaskRuntime({legacyTasks:legacyRef,client:{from(){}}});
  assert(bootstrap.getTaskRuntime().mode==='supabase','initialisiert den freigegebenen Supabase-READ-Modus');
  assert(bootstrap.getVisibleTasks(legacyRef)[0].id==='db','liefert im Pilot die relational gelesenen Aufgaben');

  let seen=null;
  bootstrap.withVisibleTasks(()=>{ seen=global.S.aufgaben; });
  assert(seen[0].id==='db','Render-Callback sieht temporär Supabase-Aufgaben');
  assert(global.S.aufgaben===legacyRef,'Legacy-Aufgaben-Array wird nach READ exakt wiederhergestellt');

  let restoredAfterError=false;
  try{ bootstrap.withVisibleTasks(()=>{ throw new Error('render failed'); }); }catch(_){ restoredAfterError=global.S.aufgaben===legacyRef; }
  assert(restoredAfterError,'Legacy-State wird auch nach Render-Fehler wiederhergestellt');

  global.renderAufgaben=function(){ return global.S.aufgaben[0].id; };
  global.renderProjektDetail=function(){ return global.S.aufgaben[0].id; };
  global.globalSearchIndex=function(){ return global.S.aufgaben[0].id; };
  bootstrap.installTaskReadPilotBridge();
  assert(global.renderAufgaben()==='db','Aufgabenansicht liest im Pilot aus Supabase ohne State-Cutover');
  assert(global.renderProjektDetail()==='db' && global.globalSearchIndex()==='db','Projektübersicht und Suche nutzen denselben READ-Pfad');
  assert(global.S.aufgaben===legacyRef,'READ-Bridge hinterlässt Legacy-State unverändert');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
