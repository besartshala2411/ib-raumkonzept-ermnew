const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

let html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
html=html.replace(/<script src="https:[^>]*><\/script>\s*/g,'');
html=html.replace(/<script src="\.\/([^"]+)"><\/script>/g,(match,relPath)=>{
  const filePath=path.join(__dirname,'..',relPath);
  return '<script>\n'+fs.readFileSync(filePath,'utf8')+'\n</script>';
});

let failed=0,passed=0;
function assert(cond,msg){
  if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);}
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

  window.S.mitarbeiter.push({id:'audit-admin',name:'Audit Admin',position:'',rolle:'Geschäftsführer',tel:'',email:'audit@example.test',adresse:'',eintritt:'2024-01-01',status:'aktiv',urlaubstageJahr:30,stundenlohn:20,dokumente:[]});
  window.S.currentUserId='audit-admin';
  window.LC.cloudSyncEnabled=false;
  window.enterApp();

  console.log('\n== Sidebar / Modul-Navigation ==');
  const modules=window.MODULES||[];
  assert(modules.length>=20,'mindestens 20 registrierte ERM-Module vorhanden ('+modules.length+')');
  const ids=modules.map(m=>m.id);
  assert(new Set(ids).size===ids.length,'keine doppelten Modul-IDs registriert');

  for(const mod of modules){
    let threw=false;
    try{window.route('#'+mod.id);}catch(e){threw=true;runtimeErrors.push(mod.id+': '+e.message);}
    const view=window.document.getElementById('view');
    const active=window.document.querySelector('.navItem.active');
    assert(!threw&&!view.textContent.includes('Fehler beim Laden des Moduls'),'Route #'+mod.id+' rendert ohne Modulfehler');
    assert(active&&active.dataset.route===mod.id,'Sidebar markiert #'+mod.id+' als aktiv');
  }

  console.log('\n== Direkte Sidebar-Klicks ==');
  window.buildSidebar();
  const buttons=Array.from(window.document.querySelectorAll('.navItem'));
  assert(buttons.length===modules.length,'Admin-Sidebar enthält jeden registrierten Reiter');
  for(const btn of buttons){
    const id=btn.dataset.route;
    btn.click();
    await new Promise(resolve=>setTimeout(resolve,0));
    const active=window.document.querySelector('.navItem.active');
    const view=window.document.getElementById('view');
    assert(active&&active.dataset.route===id&&!view.textContent.includes('Fehler beim Laden des Moduls'),'Klick auf '+id+' führt in die richtige Ansicht');
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
