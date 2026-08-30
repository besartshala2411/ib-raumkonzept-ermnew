const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

const source=fs.readFileSync(path.join(__dirname,'../src/modules/projects/projectEconomics.js'),'utf8');
assert(!/TaskRuntime|supabase|password/i.test(source),'project economics must stay independent from task runtime, Supabase and password code');

const api=require('../src/modules/projects/projectEconomics.js');
const project={
  budget:30000,
  material:[
    {preis:10000,einkaufspreis:4200,subunternehmerPreis:0},
    {verkaufspreis:8000,preis:8000,einkaufspreis:2300,subunternehmerPreis:3500}
  ],
  ausschreibung:[{status:'beauftragt',angebotSumme:6000},{status:'abgelehnt',angebotSumme:5000}]
};
let values=api.projectEconomics(project);
assert.strictEqual(values.sales,18000);
assert.strictEqual(values.revenue,30000);
assert.strictEqual(values.materialCost,6500);
assert.strictEqual(values.positionSubCost,3500);
assert.strictEqual(values.commissionedSubcontractorCost,6000);
assert.strictEqual(values.subcontractorCost,3500,'position-specific subcontractor cost should win to avoid double counting');
assert.strictEqual(values.costs,10000);
assert.strictEqual(values.grossProfit,20000);
assert(Math.abs(values.margin-66.6666667)<0.01);

values=api.projectEconomics({auftragspreis:25000,budget:30000,material:[{preis:12000,einkaufspreis:5000}],ausschreibung:[{status:'Beauftragt',angebotSumme:7000}]});
assert.strictEqual(values.revenue,25000,'explicit contract price should win over budget');
assert.strictEqual(values.subcontractorCost,7000);
assert.strictEqual(values.grossProfit,13000);

const dom=new JSDOM('<!doctype html><html><head></head><body><div id="view"><div id="projektTabBody"><div class="card"><div class="tableWrap"><table><tbody><tr><td>Gewerk</td><td>Fliesen</td><td>10</td><td>m²</td><td>1000</td><td>heute</td><td></td></tr></tbody></table></div></div></div></div></body></html>',{url:'https://example.test/#projekte/p1/material',runScripts:'outside-only'});
const win=dom.window;
win.S={projekte:[{id:'p1',name:'Bad',budget:10000,material:[{id:'m1',bezeichnung:'Fliesen',preis:5000,einkaufspreis:2000,subunternehmerPreis:1000,lieferant:'Händler'}],ausschreibung:[]} ]};
win.fmtCurrency=value=>Number(value).toFixed(2)+' €';
win.eval(source);
assert(win.document.querySelector('[data-project-economics="1"]'),'material tab should get economics summary');
assert(win.document.querySelector('.projectEconomicsRowInfo'),'material row should show cost context');
assert.strictEqual(win.document.querySelectorAll('[data-project-economics="1"]').length,1,'enhancement must remain idempotent');
win.ProjectEconomics.enhance();
assert.strictEqual(win.document.querySelectorAll('[data-project-economics="1"]').length,1,'repeated enhance must not duplicate summary');

console.log('project economics tests passed');
