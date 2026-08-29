let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }
function tick(){ return new Promise(resolve=>setTimeout(resolve,0)); }

(async()=>{
  console.log('\n== TaskRuntimeBootstrap create readback gate ==');

  const flags={IB_TASKS_SUPABASE_PILOT:'1',IB_TASKS_SUPABASE_WRITE_PILOT:'1'};
  const legacyTasks=[];
  const rows=[];
  let listCalls=0, createCalls=0, legacyCreates=0, closeCalls=0, routeCalls=0, lastToast='';

  global.S={aufgaben:legacyTasks};
  global.localStorage={getItem(key){return flags[key]||null;}};
  global.sessionStorage={getItem(key){return flags[key]||null;}};
  global.location={hash:'#aufgaben'};
  global.route=()=>{routeCalls++;};
  global.toast=(message)=>{lastToast=message;};
  global.closeModal=()=>{closeCalls++;};
  global.saveAufgabe=()=>{legacyCreates++;};
  global.setAufgabeStatus=()=>{};
  global.deleteAufgabe=()=>{};
  global.document={getElementById(id){
    const values={
      agTitel:'PHASE3C WRITE PILOT TEST',
      agBeschreibung:'',
      agFaellig:'',
      agPrio:'mittel',
      agProjekt:'',
      agZuge:'',
    };
    return Object.prototype.hasOwnProperty.call(values,id)?{value:values[id]}:null;
  }};

  const repo={
    async list(){listCalls++;return rows.map(row=>({...row}));},
    async create(data){
      createCalls++;
      const created={id:'db-created-'+createCalls,...data};
      rows.unshift(created);
      return {...created};
    },
  };
  global.createTaskSupabaseRepository=()=>({});
  global.TaskRuntimeGate={async prepareTaskSupabaseRuntime(){
    return {mode:'supabase',reason:'ready',tasks:await repo.list(),repository:repo,mapper:{}};
  }};

  const bootstrap=require('../src/modules/tasks/taskRuntimeBootstrap.js');
  await bootstrap.initializeTaskRuntime({legacyTasks,client:{from(){}}});
  bootstrap.installTaskWritePilotBridge();
  assert(listCalls===1 && bootstrap.getTaskRuntime().tasks.length===0,'Preflight startet mit leerem Supabase-Taskbestand');

  global.saveAufgabe();
  await tick(); await tick(); await tick();
  assert(createCalls===1 && legacyCreates===0,'Create läuft ausschließlich über das Supabase-Repository');
  assert(listCalls===2,'erfolgreicher Create wird unmittelbar durch einen neuen Supabase-READ verifiziert');
  assert(bootstrap.getTaskRuntime().tasks.some(task=>task.id==='db-created-1'),'nur der per READ bestätigte Datensatz landet im Runtime-Cache');
  assert(closeCalls===1 && routeCalls>=1,'Formular wird erst nach erfolgreichem READ-Back geschlossen und Ansicht neu gerendert');
  assert(/per READ verifiziert/i.test(lastToast),'erfolgreicher Create meldet die bestätigte READ-Verifikation');
  assert(global.S.aufgaben===legacyTasks && legacyTasks.length===0,'Legacy-State bleibt beim verifizierten Create unverändert');

  // Regression für den im Live-Pilot beobachteten Fall: INSERT liefert eine ID,
  // der direkt folgende RLS-/Mapping-READ sieht den Datensatz aber nicht. Dann darf
  // die UI keinen Erfolg vortäuschen und insbesondere keinen Legacy-Fallback ausführen.
  repo.create=async(data)=>{
    createCalls++;
    return {id:'db-invisible',...data};
  };
  const closesBeforeInvisible=closeCalls;
  const runtimeBeforeInvisible=bootstrap.getTaskRuntime().tasks.map(task=>task.id).join(',');
  global.saveAufgabe();
  await tick(); await tick(); await tick();
  assert(createCalls===2 && listCalls===3,'auch ein bestätigter INSERT ohne sichtbaren READ-Back wird genau einmal nachgelesen');
  assert(closeCalls===closesBeforeInvisible,'bei fehlender READ-Sichtbarkeit bleibt das Formular offen statt Erfolg vorzutäuschen');
  assert(/anschließenden Supabase-READ aber nicht sichtbar/i.test(lastToast),'fehlender READ-Back wird als eindeutiger Pilotfehler gemeldet');
  assert(bootstrap.getTaskRuntime().tasks.map(task=>task.id).join(',')===runtimeBeforeInvisible,'unsichtbarer Create verändert den Runtime-Cache nicht');
  assert(legacyCreates===0 && legacyTasks.length===0,'fehlender READ-Back löst niemals einen Legacy-Create aus');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(error=>{console.error(error);process.exit(1);});
