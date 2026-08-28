let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }
function tick(){ return new Promise(resolve=>setTimeout(resolve,0)); }

(async()=>{
  console.log('\n== TaskRuntimeBootstrap READ/WRITE bridge ==');

  let storageValues={IB_TASKS_SUPABASE_PILOT:'1',IB_TASKS_SUPABASE_WRITE_PILOT:null};
  global.S={aufgaben:[{id:'legacy',titel:'Legacy'}]};
  global.localStorage={getItem(key){return storageValues[key] || null;}};
  const calls={create:0,update:0,remove:0,legacySave:0,legacyStatus:0,legacyDelete:0};
  const mappedRepo={
    async list(){ return [{id:'db',titel:'Supabase',status:'offen',projektId:null,zugeordnet:null}]; },
    async create(data){ calls.create++; return {id:'db-new',...data}; },
    async update(id,changes){ calls.update++; return {id,titel:'Supabase',projektId:null,zugeordnet:null,...changes}; },
    async remove(id){ calls.remove++; return {id,titel:'Supabase',deletedAt:new Date().toISOString(),projektId:null,zugeordnet:null}; },
  };
  global.createTaskSupabaseRepository=()=>({});
  global.TaskRuntimeGate={
    async prepareTaskSupabaseRuntime(){
      return {mode:'supabase',reason:'ready',tasks:await mappedRepo.list(),repository:mappedRepo,mapper:{}};
    }
  };

  const bootstrap=require('../src/modules/tasks/taskRuntimeBootstrap.js');
  const legacyRef=global.S.aufgaben;
  await bootstrap.initializeTaskRuntime({legacyTasks:legacyRef,client:{from(){}}});
  assert(bootstrap.getTaskRuntime().mode==='supabase','initialisiert den freigegebenen Supabase-READ-Modus');
  assert(bootstrap.getVisibleTasks(legacyRef)[0].id==='db','liefert im Pilot die relational gelesenen Aufgaben');
  assert(!bootstrap.isTaskWritePilotEnabled(global.localStorage),'WRITE-Pilot ist unabhängig vom READ-Flag standardmäßig aus');

  let seen=null;
  bootstrap.withVisibleTasks(()=>{ seen=global.S.aufgaben; });
  assert(seen[0].id==='db','Render-Callback sieht temporär Supabase-Aufgaben');
  assert(global.S.aufgaben===legacyRef,'Legacy-Aufgaben-Array wird nach READ exakt wiederhergestellt');

  let restoredAfterError=false;
  try{ bootstrap.withVisibleTasks(()=>{ throw new Error('render failed'); }); }catch(_){ restoredAfterError=global.S.aufgaben===legacyRef; }
  assert(restoredAfterError,'Legacy-State wird auch nach Render-Fehler wiederhergestellt');

  let routeCount=0, lastToast='';
  global.location={hash:'#aufgaben'};
  global.route=()=>{routeCount++;};
  global.toast=(msg)=>{lastToast=msg;};
  global.renderAufgaben=function(){ return global.S.aufgaben[0].id; };
  global.renderProjektDetail=function(){ return global.S.aufgaben[0].id; };
  global.globalSearchIndex=function(){ return global.S.aufgaben[0].id; };
  global.saveAufgabe=function(){ calls.legacySave++; };
  global.setAufgabeStatus=function(){ calls.legacyStatus++; };
  global.deleteAufgabe=function(){ calls.legacyDelete++; };
  bootstrap.installTaskReadPilotBridge();
  assert(global.renderAufgaben()==='db','Aufgabenansicht liest im Pilot aus Supabase ohne State-Cutover');
  assert(global.renderProjektDetail()==='db' && global.globalSearchIndex()==='db','Projektübersicht und Suche nutzen denselben READ-Pfad');
  assert(global.S.aufgaben===legacyRef,'READ-Bridge hinterlässt Legacy-State unverändert');

  global.setAufgabeStatus('db','erledigt');
  global.deleteAufgabe('db');
  await tick();
  assert(calls.update===0 && calls.remove===0,'READ-only Pilot führt keinerlei Supabase-Mutation aus');
  assert(calls.legacyStatus===0 && calls.legacyDelete===0,'READ-only Pilot fällt bei Mutationen nicht auf Legacy-Schreiben zurück');
  assert(/nur lesend/i.test(lastToast),'READ-only Mutation wird für den Benutzer sichtbar blockiert');

  storageValues.IB_TASKS_SUPABASE_WRITE_PILOT='1';
  global.document={getElementById(id){
    const values={agTitel:'Neue Aufgabe',agBeschreibung:'Beschreibung',agFaellig:'2026-09-01',agPrio:'hoch',agProjekt:'',agZuge:''};
    return Object.prototype.hasOwnProperty.call(values,id)?{value:values[id]}:null;
  }};
  global.closeModal=()=>{};

  global.saveAufgabe();
  await tick(); await tick();
  assert(calls.create===1,'WRITE-Pilot legt Aufgabe ausschließlich über das Supabase-Repository an');
  assert(bootstrap.getTaskRuntime().tasks.some(t=>t.id==='db-new'),'erfolgreicher Create aktualisiert nur den Runtime-Task-Cache');
  assert(global.S.aufgaben===legacyRef && calls.legacySave===0,'Create verändert Legacy-State nicht und ruft Legacy-Save nicht auf');

  global.setAufgabeStatus('db','erledigt');
  await tick(); await tick();
  assert(calls.update===1 && bootstrap.getTaskRuntime().tasks.find(t=>t.id==='db').status==='erledigt','Statusänderung läuft über Supabase und aktualisiert Runtime-Cache');
  assert(calls.legacyStatus===0,'Supabase-Statusänderung hat keinen Legacy-Fallback');

  global.deleteAufgabe('db');
  await tick(); await tick();
  assert(calls.remove===1 && !bootstrap.getTaskRuntime().tasks.some(t=>t.id==='db'),'Delete nutzt Soft-Delete-Repository und entfernt Task aus Runtime-Cache');
  assert(calls.legacyDelete===0 && global.S.aufgaben===legacyRef,'Delete hat keinen Legacy-Fallback und verändert Legacy-State nicht');

  let failingLegacyCalls=0;
  bootstrap.getTaskRuntime().repository.update=async()=>{throw new Error('network');};
  global.setAufgabeStatus.__taskPilotOriginal=()=>{failingLegacyCalls++;};
  global.setAufgabeStatus('db-new','erledigt');
  await tick(); await tick();
  assert(failingLegacyCalls===0,'fehlgeschlagene Supabase-Mutation wird niemals als Legacy-Mutation wiederholt');
  assert(/nicht in Supabase gespeichert/i.test(lastToast),'Supabase-Fehler wird sichtbar gemeldet');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
