const fs=require('fs');
const path=require('path');

let passed=0,failed=0;
function assert(cond,msg){if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);}}

console.log('\n== Project workspace ==');
const css=fs.readFileSync(path.join(__dirname,'../src/ui/projectWorkspace.css'),'utf8');
const js=fs.readFileSync(path.join(__dirname,'../src/ui/uiuxFoundation.js'),'utf8');

assert(css.includes('#view:has(#pjGrid)'),'Projektübersicht wird nur bei vorhandener Projektliste umgebaut');
assert(css.includes('grid-template-areas')&&css.includes('"projects map"'),'Desktop/iPad zeigt Projektkarten und Karte nebeneinander');
assert(css.includes('#pjMapWrap')&&css.includes('height:560px'),'Karte erhält eine arbeitsfähige große Fläche');
assert(css.includes('#pjGrid')&&css.includes('repeat(3,minmax(0,1fr))'),'Projektkarten werden auf breiten Ansichten kompakt gerastert');
assert(css.includes('@media (max-width:899px)')&&css.includes('"map"')&&css.includes('"projects"'),'kleinere Ansichten stapeln Karte und Projekte sicher');
assert(css.includes('@media (max-width:560px)')&&css.includes('grid-template-columns:1fr'),'Smartphone reduziert die Projektkarten auf eine Spalte');
assert(js.includes("['uiuxProjectWorkspaceStyles','./src/ui/projectWorkspace.css']"),'UI/UX-Loader lädt den Projekt-Workspace explizit');
assert(!css.includes('pointer-events:none'),'Workspace blockiert keine bestehenden Klickziele');
assert(!css.includes('position:fixed'),'Workspace legt keine feste Ebene über die Navigation');
assert(!/TaskRuntimeBootstrap|IB_TASKS_SUPABASE|password|passwort|supabase/i.test(css),'Projekt-Workspace bleibt vollständig von Runtime, Supabase und Passwortmodul getrennt');

console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed?1:0);
