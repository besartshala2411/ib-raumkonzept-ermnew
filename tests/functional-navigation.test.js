const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

let html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
html=html.replace(/<script src="https:[^>]*><\/script>\s*/g,'');
html=html.replace(/<script src="\.\/([^"]+)"><\/script>/g,(match,relPath)=>{
  const filePath=path.join(__dirname,'..',relPath);
  return '<script>\n'+fs.readFileSync(filePath,'utf8')+'\n</script>';
});
// utils.js lädt die UI/UX-Schicht im echten Browser absichtlich dynamisch nach DOMContentLoaded.
// Für diesen Offline-JSDOM-Test wird nur dieser Netzwerk-Ladevorgang neutralisiert; die UI/UX-
// Schicht hat eine eigene Testsuite und darf hier keinen localhost-Fetch erzeugen.
html=html.replace(/\.\/src\/ui\/uiuxFoundation\.js/g,'data:text/javascript,void%200');

let failed=0,passed=0;
function assert(cond,msg){
  if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);}
}
function waitFor(predicate,timeoutMs=250){
  const started=Date.now();
  return new Promise(resolve=>{
    const check=()=>{
      if(predicate()) return resolve(true);
      if(Date.now()-started>=timeoutMs) return resolve(false);
      setTimeout(check,5);
    };
    check();
  });
}

async function main(){
  const runtimeErrors=[];
  const dom=new JSDOM(html,{
    url:'http://localhost/',runScripts:'dangerously',pretendToBeVisual:true,resources:'usable',
    beforeParse(window){
      const FDBFactory=require('fake-indexeddb/lib/FDBFactory').default||require('fake-indexeddb/lib/FDBFactory');
      window.indexedDB=new FDBFactory();
      window.scrollTo=()=>{};
      window.matchMedia=()=>({matches:false,addListener(){},removeListener(){}});
      window.navigator.serviceWorker={register:()=>Promise.resolve({}),ready:Promise.resolve({})};
      const fakeCtx={createLinearGradient:()=>({addColorStop(){}}),fillRect(){},fillText(){},drawImage(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},clearRect(){}};
      window.HTMLCanvasElement.prototype.getContext=()=>fakeCtx;
      window.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,AAAA';
      window.URL.createObjectURL=()=> 'blob:http://localhost/fake';
      window.URL.revokeObjectURL=()=>{};
    }
  });
  const {window}=dom;
  window.addEventListener('error',e=>runtimeErrors.push(String(e.error&&e.error.message||e.message||e)));
  await new Promise(resolve=>{
    let tries=0;
    const iv=setInterval(()=>{
      tries++;
      const body=window.document.getElementById('loginBody');
      if((body&&!body.innerHTML.includes('Lädt'))||tries>100){clearInterval(iv);resolve();}
    },50);
  });

  const auditAdmin={id:'audit-admin',name:'Audit Admin',position:'',rolle:'Geschäftsführer',tel:'',email:'audit@example.test',adresse:'',eintritt:'2024-01-01',status:'aktiv',urlaubstageJahr:30,stundenlohn:20,dokumente:[]};
  function ensureAuditAdmin(){
    if(!window.S.mitarbeiter.some(m=>m.id===auditAdmin.id)) window.S.mitarbeiter.push({...auditAdmin});
    window.S.currentUserId=auditAdmin.id;
  }
  ensureAuditAdmin();
  window.LC.cloudSyncEnabled=false;
  window.enterApp();

  console.log('\n== Sidebar / Modul-Navigation ==');
  const modules=window.MODULES||[];
  assert(modules.length>=20,'mindestens 20 registrierte ERM-Module vorhanden ('+modules.length+')');
  const ids=modules.map(m=>m.id);
  assert(new Set(ids).size===ids.length,'keine doppelten Modul-IDs registriert');

  for(const mod of modules){
    ensureAuditAdmin();
    let threw=false;
    try{window.route('#'+mod.id);}catch(e){threw=true;runtimeErrors.push(mod.id+': '+e.message);}
    const view=window.document.getElementById('view');
    const active=window.document.querySelector('.navItem.active');
    assert(!threw&&!view.textContent.includes('Fehler beim Laden des Moduls'),'Route #'+mod.id+' rendert ohne Modulfehler');
    assert(active&&active.dataset.route===mod.id,'Sidebar markiert #'+mod.id+' als aktiv');
  }

  console.log('\n== Direkte Sidebar-Klicks ==');
  ensureAuditAdmin();
  window.buildSidebar();
  assert(window.hasAdminAccess()===true,'Audit läuft mit Admin-Zugriff für alle sichtbaren Reiter');
  assert(window.document.querySelectorAll('.navItem').length===modules.length,'Admin-Sidebar enthält jeden registrierten Reiter');
  for(const mod of modules){
    // Der App-Boot kann in JSDOM noch testinterne asynchrone Storage-/Sync-Arbeit abschließen.
    // Vor jedem isolierten Klick stellen wir deshalb den synthetischen Test-Login samt Mitarbeiter-
    // Datensatz wieder her und bauen exakt dieselbe Sidebar wie enterApp() neu auf.
    ensureAuditAdmin();
    window.buildSidebar();
    window.route(window.location.hash||'#dashboard');
    const btn=window.document.querySelector('.navItem[data-route="'+mod.id+'"]');
    assert(!!btn,'Sidebar-Reiter '+mod.id+' ist vorhanden');
    if(!btn) continue;
    btn.click();
    const arrived=await waitFor(()=>{
      const active=window.document.querySelector('.navItem.active');
      return window.location.hash==='#'+mod.id && active && active.dataset.route===mod.id;
    });
    const active=window.document.querySelector('.navItem.active');
    const view=window.document.getElementById('view');
    assert(arrived&&active&&active.dataset.route===mod.id&&!view.textContent.includes('Fehler beim Laden des Moduls'),'Klick auf '+mod.id+' führt in die richtige Ansicht');
  }

  console.log('\n== Kern-Verknüpfungen ==');
  const expected=['dashboard','projekte','kunden','aufgaben','mitarbeiter','kalender','stundenzettel','rechnungen','urlaub'];
  expected.forEach(id=>assert(ids.includes(id),'Kernbereich '+id+' ist registriert'));
  assert(runtimeErrors.length===0,'keine unbehandelten Browserfehler während des kompletten Modul-Durchlaufs'+(runtimeErrors.length?': '+runtimeErrors.join(' | '):''));

  if(window.__uiuxFoundationObserver&&window.__uiuxFoundationObserver.disconnect) window.__uiuxFoundationObserver.disconnect();
  dom.window.close();
  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
}

main().catch(err=>{console.error(err);process.exit(1);});
