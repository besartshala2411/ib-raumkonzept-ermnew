const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

let passed=0,failed=0;
function assert(cond,msg){if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);}}

console.log('\n== Project workspace ==');
const css=fs.readFileSync(path.join(__dirname,'../src/ui/projectWorkspace.css'),'utf8');
const foundationJs=fs.readFileSync(path.join(__dirname,'../src/ui/uiuxFoundation.js'),'utf8');
const workspaceJs=fs.readFileSync(path.join(__dirname,'../src/ui/projectWorkspace.js'),'utf8');

assert(css.includes('#view:has(#pjGrid)'),'Projektübersicht wird nur bei vorhandener Projektliste umgebaut');
assert(css.includes('grid-template-areas')&&css.includes('"projects map"'),'Desktop/iPad zeigt Projektkarten und Karte nebeneinander');
assert(css.includes('#pjMapWrap')&&css.includes('height:560px'),'Karte erhält eine arbeitsfähige große Fläche');
assert(css.includes('#pjGrid')&&css.includes('repeat(3,minmax(0,1fr))'),'Projektkarten werden auf breiten Ansichten kompakt gerastert');
assert(css.includes('@media (max-width:899px)')&&css.includes('"map"')&&css.includes('"projects"'),'kleinere Ansichten stapeln Karte und Projekte sicher');
assert(css.includes('@media (max-width:560px)')&&css.includes('grid-template-columns:1fr'),'Smartphone reduziert die Projektkarten auf eine Spalte');
assert(foundationJs.includes("['uiuxProjectWorkspaceStyles','./src/ui/projectWorkspace.css']"),'UI/UX-Loader lädt den Projekt-Workspace-Stil explizit');
assert(foundationJs.includes("script.src='./src/ui/projectWorkspace.js'"),'UI/UX-Loader lädt die Projektkarten-Erweiterung nach dem App-Boot');
assert(!css.includes('pointer-events:none'),'Workspace blockiert keine bestehenden Klickziele');
assert(!css.includes('position:fixed'),'Workspace legt keine feste Ebene über die Navigation');
assert(!/TaskRuntimeBootstrap|IB_TASKS_SUPABASE|password|passwort|supabase/i.test(css+workspaceJs),'Projekt-Workspace bleibt von Runtime, Supabase und Passwortmodul getrennt');
assert(!/saveState\s*\(|persistState\s*\(|\.push\s*\(|\.splice\s*\(/.test(workspaceJs),'Projektkarten-Erweiterung schreibt nicht in den Legacy-State');

const dom=new JSDOM(`<!doctype html><html><body><main id="view"><div id="pjGrid"><div class="card" onclick="goTo('#projekte/p1')"><div><b>Umbau Nord</b></div><div class="pageSub">Musterweg 4</div><div class="progressBar"></div></div></div></main></body></html>`,{url:'https://example.test/#projekte'});
global.window=dom.window;global.document=dom.window.document;
window.S={
  kunden:[{id:'k1',firma:'Beispiel Bau GmbH'}],
  projekte:[{id:'p1',name:'Umbau Nord',kundeId:'k1',adresse:'Musterweg 4',status:'Aktiv',fortschritt:35,deadline:'2099-08-30',team:['m1','m2'],fotos:[{id:'f1',dataURL:'data:image/jpeg;base64,AA=='}],dokumente:[{id:'d1'}],bauzeitenplan:[{von:'2099-08-01',bis:'2099-08-28'}]}]
};
window.kundeName=id=>id==='k1'?'Beispiel Bau GmbH':'–';
window.fmtDate=value=>value.split('-').reverse().join('.');
delete require.cache[require.resolve('../src/ui/projectWorkspace.js')];
const workspace=require('../src/ui/projectWorkspace.js');
workspace.enhance();
const card=document.querySelector('#pjGrid .card');
assert(card.classList.contains('projectWorkspaceCard'),'bestehende Projektkarte wird erweitert statt ersetzt');
assert(card.querySelector('.projectWorkspacePhoto')?.getAttribute('src').startsWith('data:image/jpeg'),'letztes vorhandenes Projektfoto wird als Vorschau genutzt');
assert(card.querySelector('.projectWorkspaceCustomer')?.textContent==='Beispiel Bau GmbH','Kunde wird direkt auf der Projektkarte sichtbar');
assert(card.querySelector('.projectWorkspacePeriod')?.textContent.includes('01.08.2099')&&card.querySelector('.projectWorkspacePeriod')?.textContent.includes('28.08.2099'),'Bauzeitraum wird aus vorhandenen Projektphasen abgeleitet');
assert(card.querySelector('.projectWorkspaceMeta')?.textContent.includes('👷 2')&&card.querySelector('.projectWorkspaceMeta')?.textContent.includes('📷 1')&&card.querySelector('.projectWorkspaceMeta')?.textContent.includes('📁 1'),'Team Fotos und Dokumente erscheinen als kompakte Kennzahlen');
assert(card.querySelector('.projectWorkspaceMediaProgress')?.textContent==='35 %','Fortschritt ist direkt auf dem Vorschaubild erkennbar');
assert(workspace.projectIdFromCard(card)==='p1','Projekt-ID wird nur aus dem bestehenden Kartenlink gelesen');
const projectSnapshot=JSON.stringify(window.S.projekte[0]);
workspace.enhance();
assert(JSON.stringify(window.S.projekte[0])===projectSnapshot,'wiederholtes Enhancement verändert keine Projektdaten');
assert(card.querySelectorAll('.projectWorkspaceEnhancement').length===1,'wiederholtes Enhancement dupliziert keine Karteninhalte');

if(window.__uiuxFoundationObserver&&window.__uiuxFoundationObserver.disconnect) window.__uiuxFoundationObserver.disconnect();
delete global.window;delete global.document;

console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed?1:0);
