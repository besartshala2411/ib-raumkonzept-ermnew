const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

const source=fs.readFileSync(path.join(__dirname,'../src/modules/projects/projectDocuments.js'),'utf8');
assert(!/TaskRuntime|supabase|password/i.test(source),'project document archive must stay independent from task runtime, Supabase and password code');

const dom=new JSDOM('<!doctype html><html><head></head><body><div id="view"><div id="projektTabBody"></div></div></body></html>',{url:'https://example.test/#projekte/p1/material',runScripts:'outside-only'});
const win=dom.window;
let saved=0,shared=0;
win.S={projekte:[{id:'p1',name:'Projekt 1',dokumente:[]}]};
win.uid=()=>`id${win.S.projekte[0].dokumente.length+1}`;
win.saveState=()=>{saved++;};
win.saveOrSharePdf=()=>{shared++;return 'shared';};
win.eval(source);
const fakePdf={output:type=>type==='datauristring'?'data:application/pdf;base64,AAA':''};
const result=win.saveOrSharePdf(fakePdf,'LV_Projekt_1.pdf');
assert.strictEqual(result,'shared');
assert.strictEqual(shared,1);
assert.strictEqual(win.S.projekte[0].dokumente.length,1,'generated project PDF should be archived');
assert.strictEqual(win.S.projekte[0].dokumente[0].name,'LV_Projekt_1.pdf');
assert.strictEqual(win.S.projekte[0].dokumente[0].automatisch,true);
assert.strictEqual(saved,1);
win.saveOrSharePdf(fakePdf,'LV_Projekt_1.pdf');
assert.strictEqual(win.S.projekte[0].dokumente.length,1,'identical generated PDF should not be duplicated');
win.history.replaceState(null,'','#dashboard');
win.saveOrSharePdf(fakePdf,'Outside.pdf');
assert.strictEqual(win.S.projekte[0].dokumente.length,1,'non-project export must not be archived into a project');

win.history.replaceState(null,'','#projekte/p1/dokumente');
win.ProjectDocuments.enhanceDocumentsTab();
assert(win.document.querySelector('[data-project-documents-info="1"]'),'documents tab should show automatic archive hint');
assert(win.document.body.textContent.includes('Automatisch archiviert: 1'));

console.log('project documents tests passed');
