const {JSDOM}=require('jsdom');

let passed=0,failed=0;
function assert(cond,msg){if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);}}

console.log('\n== UI/UX foundation ==');

delete global.document;
delete global.window;
delete require.cache[require.resolve('../src/ui/uiuxFoundation.js')];
const pure=require('../src/ui/uiuxFoundation.js');
assert(pure.normalizeLabel('  Mitarbeiter  ')==='mitarbeiter','deutsche Navigationslabels werden stabil normalisiert');
assert(pure.relationsFor('Aufgaben').join('|')==='Projekte|Mitarbeiter|Kalender','Aufgaben verknüpfen die relevanten bestehenden Bereiche');
assert(pure.relationsFor('Unbekannt').length===0,'unbekannte Bereiche erzeugen keine geratenen Links');
assert(pure.SECTION_CLASSES.includes('uiux-section-dashboard'),'Section-Klassen sind explizit und begrenzt');

const dom=new JSDOM(`<!doctype html><html><head></head><body>
  <aside id="sidebar">
    <button class="navItem active"><span class="navIcon">✓</span>Aufgaben<span class="navBadge">1</span></button>
    <button class="navItem"><span class="navIcon">P</span>Projekte</button>
    <button class="navItem"><span class="navIcon">M</span>Mitarbeiter</button>
    <button class="navItem"><span class="navIcon">K</span>Kalender</button>
  </aside>
  <main id="view">
    <div class="pageHead"><div><div class="pageTitle">Aufgaben</div></div><button class="btn">Neu</button></div>
    <div class="kpi">3 offen</div>
    <div class="card" id="existing">Inhalt</div>
    <div class="quickTile">Schnellzugriff</div>
    <div class="tableWrap"><table><tr><td>Test</td></tr></table></div>
  </main>
</body></html>`,{url:'https://example.test/#aufgaben'});

global.document=dom.window.document;
global.MutationObserver=dom.window.MutationObserver;
global.requestAnimationFrame=fn=>fn();
global.addEventListener=()=>{};
delete require.cache[require.resolve('../src/ui/uiuxFoundation.js')];
const ui=require('../src/ui/uiuxFoundation.js');

ui.enhance();
const context=document.getElementById('uiuxContextLinks');
assert(document.body.classList.contains('uiux-foundation'),'Foundation aktiviert nur die UI-Klasse am Body');
assert(document.body.classList.contains('uiux-section-aufgaben'),'aktive Ansicht erhält genau die passende Section-Klasse');
assert(document.body.getAttribute('data-uiux-section')==='aufgaben','aktive Ansicht wird als rein visuelles Datenattribut gespiegelt');
assert(document.querySelector('.navItem.active').getAttribute('aria-current')==='page','aktive Navigation erhält aria-current');
assert(document.querySelector('.card').classList.contains('uiuxCard'),'bestehende Karten werden nur dekorativ markiert');
assert(document.querySelector('.kpi').classList.contains('uiuxKpi'),'bestehende KPI wird nur dekorativ markiert');
assert(document.querySelector('.quickTile').classList.contains('uiuxQuickTile'),'bestehender Schnellzugriff wird nur dekorativ markiert');
assert(document.querySelector('.pageHead').classList.contains('uiuxPrimaryHead'),'Seitenkopf erhält einheitliche Hierarchieklasse');
assert(document.querySelector('.pageHead .btn').classList.contains('uiuxPrimaryAction'),'vorhandene Hauptaktion wird visuell hervorgehoben');
assert(document.querySelector('.tableWrap').getAttribute('tabindex')==='0','breite Tabellen bleiben per Tastatur/Touch erreichbar');
assert(!!context && context.getAttribute('aria-label')==='Verknüpfte Bereiche','kontextuelle Verknüpfungsnavigation wird zugänglich erzeugt');
assert(Array.from(context.querySelectorAll('.uiuxContextChip')).map(x=>x.textContent).join('|')==='Projekte|Mitarbeiter|Kalender','nur tatsächlich vorhandene Nav-Bereiche werden angeboten');
assert(document.getElementById('existing').textContent==='Inhalt','bestehender View-Inhalt bleibt unangetastet');

const sameContext=context;
ui.enhance();
assert(document.getElementById('uiuxContextLinks')===sameContext,'wiederholtes UI-Enhancement ersetzt die Verknüpfungsleiste nicht unnötig');
assert(ui.shouldRefreshForViewMutations([{type:'childList',addedNodes:[sameContext],removedNodes:[]}])===false,'eigene Verknüpfungsleiste löst keinen rekursiven Render-Zyklus aus');
const realViewNode=document.createElement('section');
assert(ui.shouldRefreshForViewMutations([{type:'childList',addedNodes:[realViewNode],removedNodes:[]}])===true,'echte View-Neuinhalte lösen weiterhin ein UI-Refresh aus');

let contextClicked=false;
const projectButton=Array.from(document.querySelectorAll('.navItem')).find(x=>x.textContent.includes('Projekte'));
projectButton.addEventListener('click',()=>{contextClicked=true;});
context.querySelector('.uiuxContextChip').click();
assert(contextClicked,'Verknüpfung delegiert an die bestehende Navigation statt eigene Routen zu erfinden');

let directSidebarClicks=0;
projectButton.addEventListener('click',()=>{directSidebarClicks++;});
projectButton.click();
assert(directSidebarClicks===1,'direkter Klick auf linken Navigationsreiter bleibt unverändert funktionsfähig');

const taskButton=document.querySelector('.navItem.active');
taskButton.classList.remove('active');
projectButton.classList.add('active');
ui.enhance();
assert(document.body.classList.contains('uiux-section-projekte')&&!document.body.classList.contains('uiux-section-aufgaben'),'Section-Klasse wechselt ohne Altklasse sauber mit');
assert(Array.from(document.querySelectorAll('#uiuxContextLinks .uiuxContextChip')).map(x=>x.textContent).join('|')==='Aufgaben','Projekt-Verknüpfungen zeigen weiterhin nur vorhandene Bereiche');

assert(!Object.prototype.hasOwnProperty.call(global,'S'),'UI/UX-Modul erzeugt oder verändert keinen Legacy-State');
assert(!Object.prototype.hasOwnProperty.call(global,'TaskRuntimeBootstrap'),'UI/UX-Modul koppelt sich nicht an die Task-Runtime');

if(global.__uiuxFoundationObserver&&typeof global.__uiuxFoundationObserver.disconnect==='function') global.__uiuxFoundationObserver.disconnect();
delete global.document;
delete global.MutationObserver;
delete global.requestAnimationFrame;
delete global.addEventListener;

console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed?1:0);
