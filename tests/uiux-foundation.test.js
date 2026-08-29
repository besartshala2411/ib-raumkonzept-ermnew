const {JSDOM}=require('jsdom');

let passed=0,failed=0;
function assert(cond,msg){if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);}}

console.log('\n== UI/UX foundation ==');

delete global.document;
delete global.window;
delete require.cache[require.resolve('../src/ui/uiuxFoundation.js')];
const pure=require('../src/ui/uiuxFoundation.js');
assert(pure.normalizeLabel('  Mitarbeiter  ')==='mitarbeiter','deutsche Navigationslabels werden stabil normalisiert');
assert(pure.relationsFor('Aufgaben').join('|')==='Projekte|Mitarbeiter|Kalender','Aufgaben behalten relevante Kontextbeziehungen');
assert(pure.relationsFor('Projekte').includes('Stundenzettel'),'Projekt-Kontext verweist auf den tatsächlich vorhandenen Zeitbereich');
assert(pure.relationsFor('Unbekannt').length===0,'unbekannte Bereiche erzeugen keine geratenen Links');
assert(pure.SECTION_CLASSES.includes('uiux-section-dashboard'),'Section-Klassen sind explizit und begrenzt');
assert(pure.PRIMARY_NAV_KEYS.has('dashboard')&&pure.PRIMARY_NAV_KEYS.has('projekte')&&pure.PRIMARY_NAV_KEYS.has('rechnungen'),'Hauptnavigation konzentriert sich auf den Kernprozess');
assert(!pure.PRIMARY_NAV_KEYS.has('fuhrpark')&&!pure.PRIMARY_NAV_KEYS.has('passwoerter'),'Spezialbereiche bleiben außerhalb der Hauptnavigation ohne funktional entfernt zu werden');
assert(pure.WORKFLOW_KEYS.join('|')==='kunden|projekte|aufgaben|stundenzettel|rechnungen','Arbeitsfluss bildet Kunde bis Rechnung in einer festen Reihenfolge ab');
assert(pure.MOBILE_NAV_KEYS.join('|')==='dashboard|projekte|aufgaben|kalender','mobile Schnellnavigation bleibt bewusst auf vier Kernbereiche begrenzt');

const dom=new JSDOM(`<!doctype html><html><head></head><body>
  <aside id="sidebar">
    <button class="navItem"><span class="navIcon">D</span>Dashboard</button>
    <button class="navItem"><span class="navIcon">C</span>Kunden</button>
    <button class="navItem"><span class="navIcon">P</span>Projekte</button>
    <button class="navItem active"><span class="navIcon">✓</span>Aufgaben<span class="navBadge">1</span></button>
    <button class="navItem"><span class="navIcon">M</span>Mitarbeiter</button>
    <button class="navItem"><span class="navIcon">K</span>Kalender</button>
    <button class="navItem"><span class="navIcon">Z</span>Stundenzettel</button>
    <button class="navItem"><span class="navIcon">R</span>Rechnungen</button>
    <button class="navItem"><span class="navIcon">F</span>Fuhrpark</button>
    <button class="navItem"><span class="navIcon">S</span>Schlüssel</button>
  </aside>
  <main id="view">
    <div class="pageHead"><div><div class="pageTitle">Aufgaben</div></div><button class="btn primary" id="newAction">Neu</button><button class="btn danger" id="deleteAction">Löschen</button></div>
    <div class="kpi">3 offen</div>
    <div class="card" id="existing">Inhalt</div>
    <div class="quickTile">Schnellzugriff</div>
    <div class="formRow"><label>Titel</label><input value="Test"></div>
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
const sidebar=document.getElementById('sidebar');
const moreToggle=document.getElementById('uiuxMoreNavToggle');
const mobileNav=document.getElementById('uiuxMobileNav');
assert(document.body.classList.contains('uiux-foundation'),'Foundation aktiviert nur die UI-Klasse am Body');
assert(document.body.classList.contains('uiux-section-aufgaben'),'aktive Ansicht erhält genau die passende Section-Klasse');
assert(document.body.getAttribute('data-uiux-section')==='aufgaben','aktive Ansicht wird als rein visuelles Datenattribut gespiegelt');
assert(document.querySelector('.navItem.active').getAttribute('aria-current')==='page','aktive Navigation erhält aria-current');
assert(document.querySelector('.card').classList.contains('uiuxCard'),'bestehende Karten werden nur dekorativ markiert');
assert(document.querySelector('.kpi').classList.contains('uiuxKpi'),'bestehende KPI wird nur dekorativ markiert');
assert(document.querySelector('.quickTile').classList.contains('uiuxQuickTile'),'bestehender Schnellzugriff wird nur dekorativ markiert');
assert(document.querySelector('.formRow').classList.contains('uiuxFormRow'),'Formularzeilen erhalten nur eine visuelle Strukturklasse');
assert(document.querySelector('table').classList.contains('uiuxDataTable'),'Tabellen erhalten nur eine visuelle Strukturklasse');
assert(document.querySelector('.pageHead').classList.contains('uiuxPrimaryHead'),'Seitenkopf erhält einheitliche Hierarchieklasse');
assert(document.getElementById('newAction').classList.contains('uiuxPrimaryAction'),'vorhandene primäre Aktion bleibt die hervorgehobene Hauptaktion');
assert(!document.getElementById('deleteAction').classList.contains('uiuxPrimaryAction'),'Löschen wird niemals versehentlich als Hauptaktion hervorgehoben');
assert(document.getElementById('deleteAction').classList.contains('uiuxDangerAction'),'destruktive Aktion wird separat und zurückhaltend markiert');
assert(document.querySelector('.tableWrap').getAttribute('tabindex')==='0','breite Tabellen bleiben per Tastatur/Touch erreichbar');
assert(!!context && context.getAttribute('aria-label')==='Arbeitsfluss','Kernbereiche erhalten einen verständlichen Arbeitsfluss statt beliebiger Zusatznavigation');
assert(context.classList.contains('uiuxWorkflowLinks'),'Arbeitsfluss ist als eigener UI-Modus gekennzeichnet');
assert(Array.from(context.querySelectorAll('.uiuxContextChip')).map(x=>x.textContent).join('|')==='1. Kunden|2. Projekte|3. Aufgaben|4. Stundenzettel|5. Rechnungen','Arbeitsfluss zeigt Kunde → Projekt → Aufgabe → Zeit → Rechnung vollständig');
assert(context.querySelector('.uiuxWorkflowStep.active').textContent==='3. Aufgaben','aktuelle Arbeitsfluss-Stufe ist eindeutig markiert');
assert(document.getElementById('existing').textContent==='Inhalt','bestehender View-Inhalt bleibt unangetastet');
assert(document.querySelectorAll('.uiuxNavPrimary').length===8,'Kernbereiche werden als Hauptnavigation markiert');
assert(document.querySelectorAll('.uiuxNavSecondary').length===2,'Spezialbereiche werden als erweiterte Navigation markiert');
assert(!!moreToggle&&moreToggle.getAttribute('aria-expanded')==='false','erweiterte Navigation startet kompakt und zugänglich');
assert(moreToggle.textContent==='Weitere Bereiche (2)','Mehr-Schalter zeigt die Anzahl der ausgeblendeten Spezialbereiche');
moreToggle.click();
assert(sidebar.classList.contains('uiuxNavExpanded')&&moreToggle.getAttribute('aria-expanded')==='true','Mehr-Schalter öffnet alle vorhandenen Spezialbereiche ohne Routen zu verändern');
moreToggle.click();
assert(!sidebar.classList.contains('uiuxNavExpanded'),'Mehr-Schalter kann die Navigation wieder verdichten');

assert(!!mobileNav&&mobileNav.getAttribute('aria-label')==='Schnellnavigation','mobile Schnellnavigation wird aus bestehenden Reitern erzeugt');
assert(Array.from(mobileNav.querySelectorAll('.uiuxMobileNavItem')).map(x=>x.textContent).join('|')==='Dashboard|Projekte|Aufgaben|Kalender','mobile Leiste enthält nur die vier häufigsten Ziele');
assert(mobileNav.querySelector('.uiuxMobileNavItem.active').textContent==='Aufgaben','mobile Navigation spiegelt die aktive Ansicht');

const sameContext=context;
ui.enhance();
assert(document.getElementById('uiuxContextLinks')===sameContext,'wiederholtes UI-Enhancement ersetzt die Arbeitsflussleiste nicht unnötig');
assert(ui.shouldRefreshForViewMutations([{type:'childList',addedNodes:[sameContext],removedNodes:[]}])===false,'eigene Arbeitsflussleiste löst keinen rekursiven Render-Zyklus aus');
const realViewNode=document.createElement('section');
assert(ui.shouldRefreshForViewMutations([{type:'childList',addedNodes:[realViewNode],removedNodes:[]}])===true,'echte View-Neuinhalte lösen weiterhin ein UI-Refresh aus');

let contextClicked=false;
const projectButton=Array.from(document.querySelectorAll('.navItem')).find(x=>x.textContent.includes('Projekte'));
projectButton.addEventListener('click',()=>{contextClicked=true;});
Array.from(context.querySelectorAll('.uiuxContextChip')).find(x=>x.textContent.includes('Projekte')).click();
assert(contextClicked,'Arbeitsfluss delegiert an die bestehende Navigation statt eigene Routen zu erfinden');

let mobileClicked=false;
projectButton.addEventListener('click',()=>{mobileClicked=true;});
Array.from(mobileNav.querySelectorAll('.uiuxMobileNavItem')).find(x=>x.textContent==='Projekte').click();
assert(mobileClicked,'mobile Schnellnavigation delegiert ebenfalls ausschließlich an bestehende Reiter');

let directSidebarClicks=0;
projectButton.addEventListener('click',()=>{directSidebarClicks++;});
projectButton.click();
assert(directSidebarClicks===1,'direkter Klick auf linken Navigationsreiter bleibt unverändert funktionsfähig');

const taskButton=document.querySelector('.navItem.active');
taskButton.classList.remove('active');
projectButton.classList.add('active');
ui.enhance();
assert(document.body.classList.contains('uiux-section-projekte')&&!document.body.classList.contains('uiux-section-aufgaben'),'Section-Klasse wechselt ohne Altklasse sauber mit');
assert(document.querySelector('#uiuxContextLinks .uiuxWorkflowStep.active').textContent==='2. Projekte','Arbeitsfluss folgt der aktiven Kernansicht');
assert(document.querySelector('#uiuxMobileNav .uiuxMobileNavItem.active').textContent==='Projekte','mobile Navigation folgt der aktiven Kernansicht');

const fleetButton=Array.from(document.querySelectorAll('.navItem')).find(x=>x.textContent.includes('Fuhrpark'));
projectButton.classList.remove('active');
fleetButton.classList.add('active');
ui.enhance();
assert(sidebar.classList.contains('uiuxNavExpanded'),'direkt geöffneter Spezialbereich bleibt sichtbar statt durch die Verdichtung versteckt zu werden');
assert(fleetButton.classList.contains('uiuxNavSecondary'),'Spezialbereich bleibt funktional vorhandener Nav-Reiter');

assert(!Object.prototype.hasOwnProperty.call(global,'S'),'UI/UX-Modul erzeugt oder verändert keinen Legacy-State');
assert(!Object.prototype.hasOwnProperty.call(global,'TaskRuntimeBootstrap'),'UI/UX-Modul koppelt sich nicht an die Task-Runtime');

if(global.__uiuxFoundationObserver&&typeof global.__uiuxFoundationObserver.disconnect==='function') global.__uiuxFoundationObserver.disconnect();
delete global.document;
delete global.MutationObserver;
delete global.requestAnimationFrame;
delete global.addEventListener;

console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed?1:0);
