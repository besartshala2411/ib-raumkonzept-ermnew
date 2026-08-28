let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }
function tick(){ return new Promise(resolve=>setTimeout(resolve,0)); }
function deferred(){ let resolve,reject; const promise=new Promise((res,rej)=>{resolve=res;reject=rej;}); return {promise,resolve,reject}; }

(async()=>{
  console.log('\n== TaskRuntimeBootstrap READ/WRITE bridge ==');

  let storageValues={IB_TASKS_SUPABASE_PILOT:'1',IB_TASKS_SUPABASE_WRITE_PILOT:null};
  global.S={aufgaben:[{id:'legacy',titel:'Legacy'}]};
  global.localStorage={getItem(key){return storageValues[key] || null;}};
  const calls={create:0,update:0,remove:0,legacySave:0,legacyStatus:0,legacyDelete:0,enter:0,logout:0};
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
  assert(bootstrap.isTaskReadPilotRequested(global.localStorage),'READ-Pilot erkennt die explizite Anforderung');
  assert(!bootstrap.isTaskWritePilotEnabled(global.localStorage),'WRITE-Pilot ist unabhängig vom READ-Flag standardmäßig aus');

  let seen=null;
  bootstrap.withVisibleTasks(()=>{ seen=global.S.aufgaben; });
  assert(seen[0].id==='db','Render-Callback sieht temporär Supabase-Aufgaben');
  assert(global.S.aufgaben===legacyRef,'Legacy-Aufgaben-Array wird nach READ exakt wiederhergestellt');

  let restoredAfterError=false;
  try{ bootstrap.withVisibleTasks(()=>{ throw new Error('render failed'); }); }catch(_){ restoredAfterError=global.S.aufgaben===legacyRef; }
  assert(restoredAfterError,'Legacy-State wird auch nach Render-Fehler wiederhergestellt');

  let routeCount=0, lastToast='', enterSawTask=null;
  global.location={hash:'#aufgaben'};
  global.route=()=>{routeCount++;};
  global.toast=(msg)=>{lastToast=msg;};
  global.renderAufgaben=function(){ return global.S.aufgaben[0].id; };
  global.renderProjektDetail=function(){ return global.S.aufgaben[0].id; };
  global.globalSearchIndex=function(){ return global.S.aufgaben[0].id; };
  global.saveAufgabe=function(){ calls.legacySave++; };
  global.setAufgabeStatus=function(){ calls.legacyStatus++; };
  global.deleteAufgabe=function(){ calls.legacyDelete++; };
  global.enterApp=function(){ calls.enter++; enterSawTask=bootstrap.getVisibleTasks(global.S.aufgaben)[0].id; };
  global.logout=function(){ calls.logout++; };
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

  // Doppel-Klick auf Speichern darf keinen zweiten INSERT starten, solange der erste
  // Request noch läuft. Nach Abschluss muss ein späterer neuer Versuch wieder möglich sein.
  const pendingCreate=deferred();
  mappedRepo.create=async(data)=>{ calls.create++; await pendingCreate.promise; return {id:'db-new',...data}; };
  global.saveAufgabe();
  global.saveAufgabe();
  await tick();
  assert(calls.create===1,'doppelter Create startet während laufendem Request nur einen Supabase-INSERT');
  assert(/bereits gespeichert/i.test(lastToast),'paralleler Create wird sichtbar als laufende Speicherung blockiert');
  pendingCreate.resolve();
  await tick(); await tick();
  assert(bootstrap.getTaskRuntime().tasks.some(t=>t.id==='db-new'),'abgeschlossener Create aktualisiert den Runtime-Task-Cache');
  assert(global.S.aufgaben===legacyRef && calls.legacySave===0,'Create verändert Legacy-State nicht und ruft Legacy-Save nicht auf');

  mappedRepo.create=async(data)=>{ calls.create++; return {id:'db-new-2',...data}; };
  global.saveAufgabe();
  await tick(); await tick();
  assert(calls.create===2,'nach Abschluss wird ein späterer Create wieder zugelassen');

  // Statusänderung und Delete derselben Aufgabe teilen denselben Lock-Key. Damit
  // kann ein Delete nicht einen noch laufenden Status-Request überholen.
  const pendingUpdate=deferred();
  mappedRepo.update=async(id,changes)=>{ calls.update++; await pendingUpdate.promise; return {id,titel:'Supabase',projektId:null,zugeordnet:null,...changes}; };
  global.setAufgabeStatus('db','erledigt');
  global.deleteAufgabe('db');
  await tick();
  assert(calls.update===1 && calls.remove===0,'konkurrierende Mutation derselben Aufgabe wird serialisiert');
  pendingUpdate.resolve();
  await tick(); await tick();
  assert(bootstrap.getTaskRuntime().tasks.find(t=>t.id==='db').status==='erledigt','Statusänderung aktualisiert nach Abschluss den Runtime-Cache');
  assert(calls.legacyStatus===0,'Supabase-Statusänderung hat keinen Legacy-Fallback');

  mappedRepo.remove=async(id)=>{ calls.remove++; return {id,titel:'Supabase',deletedAt:new Date().toISOString(),projektId:null,zugeordnet:null}; };
  global.deleteAufgabe('db');
  await tick(); await tick();
  assert(calls.remove===1 && !bootstrap.getTaskRuntime().tasks.some(t=>t.id==='db'),'Delete nutzt Soft-Delete-Repository und entfernt Task aus Runtime-Cache');
  assert(calls.legacyDelete===0 && global.S.aufgaben===legacyRef,'Delete hat keinen Legacy-Fallback und verändert Legacy-State nicht');

  bootstrap.getTaskRuntime().repository.update=async()=>{throw new Error('network');};
  const legacyStatusBeforeFailure=calls.legacyStatus;
  global.setAufgabeStatus('db-new','erledigt');
  await tick(); await tick();
  assert(calls.legacyStatus===legacyStatusBeforeFailure,'fehlgeschlagene Supabase-Mutation wird niemals als Legacy-Mutation wiederholt');
  assert(/nicht in Supabase gespeichert/i.test(lastToast),'Supabase-Fehler wird sichtbar gemeldet');

  // Kritischer Cutover-Fall: READ/WRITE sind angefordert, aber der Supabase-Preflight
  // fällt zurück auf Legacy. Auch dann darf keine Mutation in S.aufgaben landen.
  global.TaskRuntimeGate.prepareTaskSupabaseRuntime=async()=>({mode:'legacy',reason:'preflight-failed',tasks:legacyRef});
  await bootstrap.initializeTaskRuntime({legacyTasks:legacyRef,client:{from(){}}});
  const legacyStatusBeforePreflightBlock=calls.legacyStatus;
  global.setAufgabeStatus('legacy','erledigt');
  await tick();
  assert(calls.legacyStatus===legacyStatusBeforePreflightBlock,'fehlgeschlagener Pilot-Preflight blockiert Legacy-Schreiben bei aktivem READ-Flag');
  assert(/nicht schreibbereit/i.test(lastToast) && /Legacy-State/i.test(lastToast),'Preflight-Blockade wird sichtbar und erklärt den fehlenden Legacy-Fallback');

  // Auth-Grenze: Ein alter Supabase-Cache darf beim nächsten Benutzer niemals vor
  // dem neuen RLS-Refresh gerendert werden.
  global.TaskRuntimeGate.prepareTaskSupabaseRuntime=async()=>({mode:'supabase',reason:'ready',tasks:await mappedRepo.list(),repository:mappedRepo,mapper:{}});
  await bootstrap.initializeTaskRuntime({legacyTasks:legacyRef,client:{from(){}}});
  assert(bootstrap.getTaskRuntime().mode==='supabase','Testvorbedingung: Runtime enthält vor Auth-Wechsel Supabase-Daten');
  global.enterApp();
  assert(calls.enter===1 && enterSawTask==='legacy','enterApp setzt vor dem ersten Render auf Legacy-Snapshot zurück');
  assert(bootstrap.getTaskRuntime().reason==='auth-transition','Auth-Wechsel markiert den Runtime-Reset explizit');
  await tick(); await tick();
  assert(bootstrap.getTaskRuntime().mode==='supabase','nach Auth-Wechsel wird der RLS-gescopte Supabase-READ neu initialisiert');

  global.logout();
  assert(calls.logout===1 && bootstrap.getTaskRuntime().mode==='legacy','Logout verwirft den Supabase-Runtime-Cache sofort');
  assert(bootstrap.getTaskRuntime().reason==='logout' && bootstrap.getVisibleTasks(legacyRef)[0].id==='legacy','nach Logout sind keine Tasks des vorherigen Runtime-Caches sichtbar');

  // Erst wenn der Pilot ausdrücklich deaktiviert ist, gilt wieder der unveränderte Legacy-Pfad.
  storageValues.IB_TASKS_SUPABASE_PILOT=null;
  storageValues.IB_TASKS_SUPABASE_WRITE_PILOT=null;
  global.setAufgabeStatus('legacy','erledigt');
  assert(calls.legacyStatus===legacyStatusBeforePreflightBlock+1,'bei deaktiviertem READ-Pilot bleibt Legacy-Schreiben unverändert verfügbar');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
