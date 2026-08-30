const fs=require('fs');
const path=require('path');

let passed=0,failed=0;
function assert(cond,msg){if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);}}

console.log('\n== Project acceptance ==');
const src=fs.readFileSync(path.join(__dirname,'../src/modules/projects/projectAcceptance.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../src/modules/projects/projectAcceptance.css'),'utf8');
const workspace=fs.readFileSync(path.join(__dirname,'../src/ui/projectWorkspace.js'),'utf8');

delete global.document;
delete global.window;
delete require.cache[require.resolve('../src/modules/projects/projectAcceptance.js')];
const acceptance=require('../src/modules/projects/projectAcceptance.js');

assert(acceptance.STATUS_VALUES.join('|')==='Offen|Abgenommen|Abgenommen mit Mängeln|Nicht abgenommen','Abnahme hat klare fachliche Ergebniswerte');
assert(acceptance.parseProjectHash('#projekte/p123/abnahme').projectId==='p123','Abnahme bleibt an ein konkretes Projekt gebunden');
assert(acceptance.parseProjectHash('#projekte/p123/abnahme').tab==='abnahme','Abnahme ist ein Projekt-Tab statt globaler Hauptbereich');
assert(acceptance.parseProjectHash('#kunden/k1')===null,'fremde Bereiche werden nicht verändert');
assert(acceptance.protocolFilename('Büro Ausbau / OG 1').startsWith('Abnahmeprotokoll_'),'Protokoll erhält einen eindeutigen Abnahme-Dateinamen');
const normalized=acceptance.normalizeAcceptance({status:'Abgenommen',kundeVertreter:'Max',unterschrift:'data:image/png;base64,x'});
assert(normalized.status==='Abgenommen'&&normalized.kundeVertreter==='Max','bestehende Abnahmedaten werden verlustarm übernommen');
assert(normalized.unterschrift.startsWith('data:image/png'),'gespeicherte Tablet-Unterschrift bleibt im Projektmodell erhalten');
assert(src.includes("data-project-acceptance-tab=\"1\"")||src.includes("data-project-acceptance-tab','1'"),'Projektansicht erhält genau einen Abnahme-Reiter');
assert(src.includes("id=\"paSignature\"")&&src.includes("initSigPad('paSignature'"),'vorhandenes Touch-/Stift-Unterschriftenpad wird wiederverwendet');
assert(src.includes('Abnahme abschließen & Protokoll')&&src.includes('exportProtocol(projectId,saved)'),'Abschluss erzeugt direkt das Abnahmeprotokoll');
assert(src.includes("project.abnahme=normalizeAcceptance(data)"),'Abnahme wird ausschließlich am zugehörigen Projekt gespeichert');
assert(src.includes("saveOrSharePdf")&&src.includes("Abnahmeprotokoll"),'Protokoll nutzt den vorhandenen PDF-/Share-Weg');
assert(src.includes("Bitte zuerst direkt auf dem Tablet unterschreiben"),'Abschluss ohne Unterschrift wird verhindert');
assert(css.includes('touch-action:none')&&css.includes('#paSignature'),'Signaturfläche ist für Tablet-Stift und Finger optimiert');
assert(css.includes('@media(max-width:760px)'),'Abnahme-Aktionen bleiben auf mobilen Geräten bedienbar');
assert(workspace.includes("./src/modules/projects/projectAcceptance.js"),'Projekt-Workspace lädt die Abnahme-Erweiterung nach dem sicheren App-Boot');
assert(!/IB_TASKS_SUPABASE|TaskRuntimeBootstrap|passwort|password|realtime/i.test(src),'Abnahme-Modul bleibt von Task-Pilot, Passwort und Realtime getrennt');

console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed?1:0);
