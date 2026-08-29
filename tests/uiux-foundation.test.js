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

// DOM contract: reuse the real nav controls rather than inventing hashes/routes.
const dom=new JSDOM(`<!doctype html><html><head></head><body>
  <aside id="sidebar">
    <button class="navItem active"><span class="navIcon">✓</span>Aufgaben<span class="navBadge">1</span></button>
    <button class="navItem"><span class="navIcon">P</span>Projekte</button>
    <button class="navItem"><span class="navIcon">M</span>Mitarbeiter</button>
    <button class="navItem"><span class="navIcon">K</span>Kalender</button>
  </aside>
  <main id="view"><div id="existing">Inhalt</div></main>
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
assert(document.querySelector('.navItem.active').getAttribute('aria-current')==='page','aktive Navigation erhält aria-current');
assert(!!context && context.getAttribute('aria-label')==='Verknüpfte Bereiche','kontextuelle Verknüpfungsnavigation wird zugänglich erzeugt');
assert(Array.from(context.querySelectorAll('.uiuxContextChip')).map(x=>x.textContent).join('|')==='Projekte|Mitarbeiter|Kalender','nur tatsächlich vorhandene Nav-Bereiche werden angeboten');
assert(document.getElementById('existing').textContent==='Inhalt','bestehender View-Inhalt bleibt unangetastet');

let clicked=false;
const projectButton=Array.from(document.querySelectorAll('.navItem')).find(x=>x.textContent.includes('Projekte'));
projectButton.addEventListener('click',()=>{clicked=true;});
context.querySelector('.uiuxContextChip').click();
assert(clicked,'Verknüpfung delegiert an die bestehende Navigation statt eigene Routen zu erfinden');
assert(!Object.prototype.hasOwnProperty.call(global,'S'),'UI/UX-Modul erzeugt oder verändert keinen Legacy-State');
assert(!Object.prototype.hasOwnProperty.call(global,'TaskRuntimeBootstrap'),'UI/UX-Modul koppelt sich nicht an die Task-Runtime');

if(global.__uiuxFoundationObserver&&typeof global.__uiuxFoundationObserver.disconnect==='function') global.__uiuxFoundationObserver.disconnect();
delete global.document;
delete global.MutationObserver;
delete global.requestAnimationFrame;
delete global.addEventListener;

console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed?1:0);
