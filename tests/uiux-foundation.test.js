const {JSDOM}=require('jsdom');

let passed=0,failed=0;
function assert(cond,msg){if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);}}

console.log('\n== UI/UX foundation ==');

// Pure contract first: labels are normalized, relations are navigation-only metadata.
delete global.document;
delete global.window;
delete require.cache[require.resolve('../src/ui/uiuxFoundation.js')];
const pure=require('../src/ui/uiuxFoundation.js');
assert(pure.normalizeLabel('  Mitarbeiter  ')==='mitarbeiter','deutsche Navigationslabels werden stabil normalisiert');
assert(pure.relationsFor('Aufgaben').join('|')==='Projekte|Mitarbeiter|Kalender','Aufgaben verknüpfen die relevanten bestehenden Bereiche');
assert(pure.relationsFor('Unbekannt').length===0,'unbekannte Bereiche erzeugen keine geratenen Links');
assert(pure.SECTION_PREFIX==='uiux-section-','Section-Klassen liegen in einem klar abgegrenzten UI/UX-Namespace');

// DOM contract: reuse the real nav controls rather than inventing hashes/routes or state.
const dom=new JSDOM(`<!doctype html><html><head></head><body>
  <aside id="sidebar">
    <button class="navItem active"><span class="navIcon">✓</span>Aufgaben<span class="navBadge">1</span></button>
    <button class="navItem"><span class="navIcon">P</span>Projekte</button>
    <button class="navItem"><span class="navIcon">M</span>Mitarbeiter</button>
    <button class="navItem"><span class="navIcon">K</span>Kalender</button>
  </aside>
  <main id="view">
    <div class="pageHead"><div><div class="pageTitle">Aufgaben</div></div><button class="btn" id="createTask">Neu</button></div>
    <div class="grid cols-3"><div class="kpi" id="kpi">1</div></div>
    <div class="card" id="existing">Inhalt</div>
  </main>
</body></html>`,{url:'https://example.test/#aufgaben'});

global.document=dom.window.document;
global.MutationObserver=dom.window.MutationObserver;
global.requestAnimationFrame=fn=>fn();
global.addEventListener=()=>{};
delete require.cache[require.resolve('../src/ui/uiuxFoundation.js')];
const ui=require('../src/ui/uiuxFoundation.js');

ui.enhance();
let context=document.getElementById('uiuxContextLinks');
assert(document.body.classList.contains('uiux-foundation'),'Foundation aktiviert nur die UI-Klasse am Body');
assert(document.body.classList.contains('uiux-section-aufgaben'),'aktive bestehende Navigation steuert eine rein visuelle Aufgaben-Section-Klasse');
assert(document.getElementById('view').getAttribute('data-uiux-section')==='aufgaben','View erhält den aktiven Bereich nur als UI-Metadatum');
assert(document.querySelector('.navItem.active').getAttribute('aria-current')==='page','aktive Navigation erhält aria-current');
assert(!!context && context.getAttribute('aria-label')==='Verknüpfte Bereiche für Aufgaben','kontextuelle Verknüpfungsnavigation benennt ihren Quellbereich zugänglich');
assert(context.getAttribute('data-uiux-source')==='aufgaben','Verknüpfungsleiste markiert ihren Quellbereich ohne Datenzugriff');
assert(Array.from(context.querySelectorAll('.uiuxContextChip')).map(x=>x.textContent).join('|')==='Projekte|Mitarbeiter|Kalender','nur tatsächlich vorhandene Nav-Bereiche werden angeboten');
assert(document.getElementById('existing').textContent==='Inhalt','bestehender View-Inhalt bleibt unangetastet');
assert(document.getElementById('existing').classList.contains('uiuxCard'),'bestehende Karten werden nur für konsistente Darstellung markiert');
assert(document.getElementById('kpi').classList.contains('uiuxKpi'),'bestehende KPI-Elemente werden nur visuell markiert');
assert(document.getElementById('createTask').classList.contains('uiuxPrimaryAction'),'erste bestehende Seitenaktion wird visuell priorisiert ohne Handler-Ersatz');

let clicked=false;
const navItems=Array.from(document.querySelectorAll('.navItem'));
const projectButton=navItems.find(x=>x.textContent.includes('Projekte'));
projectButton.addEventListener('click',()=>{clicked=true;});
context.querySelector('.uiuxContextChip').click();
assert(clicked,'Verknüpfung delegiert an die bestehende Navigation statt eigene Routen zu erfinden');

navItems[0].classList.remove('active');
projectButton.classList.add('active');
ui.enhance();
context=document.getElementById('uiuxContextLinks');
assert(!document.body.classList.contains('uiux-section-aufgaben')&&document.body.classList.contains('uiux-section-projekte'),'Bereichswechsel entfernt alte UI-Section-Klasse und setzt exakt die neue');
assert(document.getElementById('view').getAttribute('data-uiux-section')==='projekte','Section-Metadatum folgt dem vorhandenen aktiven Nav-Element');
assert(context.getAttribute('data-uiux-source')==='projekte','Verknüpfungen werden beim Bereichswechsel aus der vorhandenen Navigation neu abgeleitet');

assert(!Object.prototype.hasOwnProperty.call(global,'S'),'UI/UX-Modul erzeugt oder verändert keinen Legacy-State');
assert(!Object.prototype.hasOwnProperty.call(global,'TaskRuntimeBootstrap'),'UI/UX-Modul koppelt sich nicht an die Task-Runtime');

if(global.__uiuxFoundationObserver&&typeof global.__uiuxFoundationObserver.disconnect==='function') global.__uiuxFoundationObserver.disconnect();
delete global.document;
delete global.MutationObserver;
delete global.requestAnimationFrame;
delete global.addEventListener;

console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed?1:0);
