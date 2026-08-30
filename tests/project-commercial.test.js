const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

const source=fs.readFileSync(path.join(__dirname,'../src/modules/projects/projectCommercial.js'),'utf8');
assert(!/supabase|TaskRuntime|password|Realtime/i.test(source),'commercial project workflow must stay independent from Supabase task runtime password and Realtime');
const api=require('../src/modules/projects/projectCommercial.js');

const project={id:'p1',auftragspreis:20000,budget:25000,deadline:'2099-01-01',status:'Aktiv',material:[{id:'m1',bezeichnung:'Fliesen',preis:10000,einkaufspreis:4000,subunternehmerPreis:1000}],ausgaben:[{betrag:500,kategorie:'Transport'}],nachtraege:[{id:'n1',titel:'Zusatz',betrag:2500,status:'Freigegeben'},{id:'n2',titel:'Offen',betrag:900,status:'Entwurf'}]};
assert.strictEqual(api.approvedChangeRevenue(project),2500);
const eco=api.fallbackEconomics(project);
assert.strictEqual(eco.revenue,22500,'approved change order should increase project revenue');
assert.strictEqual(eco.costs,5500);
assert.strictEqual(eco.grossProfit,17000);
assert.strictEqual(api.invoiceGross({brutto:1190}),1190);
assert.strictEqual(api.invoiceGross({positionen:[{menge:2,preis:500}],mwst:19}),1190);
assert.strictEqual(api.isPaid({status:'Bezahlt'}),true);
assert.strictEqual(api.isPaid({status:'Offen'}),false);

const dom=new JSDOM('<!doctype html><html><head></head><body><div id="view"><div class="tabs"><button class="tabBtn active">Übersicht</button></div><div id="projektTabBody"><div class="card">Legacy overview</div></div></div></body></html>',{url:'https://example.test/#projekte/p1/uebersicht',runScripts:'outside-only'});
const win=dom.window;
win.S={projekte:[project],aufgaben:[{id:'a1',projektId:'p1',titel:'Prüfen',status:'offen',faellig:'2099-01-01'}],rechnungen:[{id:'r1',projektId:'p1',brutto:1190,status:'Bezahlt'},{id:'r2',projektId:'p1',brutto:2380,status:'Offen'}]};
win.fmtCurrency=v=>Number(v).toFixed(2)+' €';
win.fmtDate=v=>v;
win.uid=()=>`u${Date.now()}`;
let saves=0;win.saveState=()=>{saves++;};
win.eval(source);
assert(win.document.querySelector('[data-project-commercial-cockpit="1"]'),'overview should receive commercial cockpit');
assert(win.document.querySelector('[data-project-change-tab="1"]'),'project should receive dedicated change-order tab');
const inv=win.ProjectCommercial.invoiceSummary('p1');
assert.strictEqual(inv.total,3570);
assert.strictEqual(inv.paid,1190);
assert.strictEqual(inv.open,2380);

win.history.replaceState(null,'','#projekte/p1/nachtraege');
win.ProjectCommercial.enhance();
assert(win.document.body.textContent.includes('Nachträge'));
assert(win.document.getElementById('pcTitle'));
win.document.getElementById('pcTitle').value='Mehrarbeit Decke';
win.document.getElementById('pcAmount').value='1500';
win.ProjectCommercial.addChange(project);
assert(project.nachtraege.some(x=>x.titel==='Mehrarbeit Decke'&&x.status==='Entwurf'));
assert(saves>0,'change order should persist through existing legacy saveState only');
const created=project.nachtraege.find(x=>x.titel==='Mehrarbeit Decke');
win.ProjectCommercial.advanceChange(project,created.id);
assert.strictEqual(created.status,'Freigegeben');
win.ProjectCommercial.advanceChange(project,created.id);
assert.strictEqual(created.status,'Abgerechnet');

const materialDom=new JSDOM('<!doctype html><html><head></head><body><div id="view"><div class="tabs"></div><div id="projektTabBody"><div class="tableWrap"><table><tbody><tr><td>1</td><td>Fliesen</td><td>10</td><td>m²</td><td></td></tr></tbody></table></div></div></div></body></html>',{url:'https://example.test/#projekte/p1/material',runScripts:'outside-only'});
const mw=materialDom.window;mw.S={projekte:[project],aufgaben:[],rechnungen:[]};mw.fmtCurrency=v=>Number(v).toFixed(2)+' €';mw.eval(source);mw.ProjectCommercial.enhance();
assert(mw.document.querySelector('.projectCommercialLvLine'),'LV row should show selling price cost and contribution margin context');
assert(mw.document.body.textContent.includes('DB'));

console.log('project commercial tests passed');
