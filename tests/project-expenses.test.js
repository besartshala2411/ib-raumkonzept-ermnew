const assert=require('assert');
const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

const expenseSource=fs.readFileSync(path.join(__dirname,'../src/modules/projects/projectExpenses.js'),'utf8');
const economicsSource=fs.readFileSync(path.join(__dirname,'../src/modules/projects/projectEconomics.js'),'utf8');
const workspaceSource=fs.readFileSync(path.join(__dirname,'../src/ui/projectWorkspace.js'),'utf8');
assert(!/TaskRuntime|supabase|password|Realtime/i.test(expenseSource),'project expenses must stay independent from protected runtime areas');
assert(workspaceSource.includes('projectExpenses.js'),'project workspace should load the expense module');
assert(expenseSource.includes('accept="image/*,application/pdf"'),'receipt input should accept photos and PDFs');
assert(expenseSource.includes('capture="environment"'),'mobile receipt capture should offer the rear camera');
assert(expenseSource.includes('FileReader'),'receipt upload should use browser-local FileReader');
assert(expenseSource.includes('tesseract.js@5.1.1'),'receipt photo recognition should be lazy-loaded from the pinned OCR bundle');

const expenses=require('../src/modules/projects/projectExpenses.js');
const economics=require('../src/modules/projects/projectEconomics.js');

const parsed=expenses.parseReceiptText(`BAUHAUS GmbH & Co. KG\nKassenbon\nDatum 30.08.2026 14:23\nBelegNr 4711-AB\nZwischensumme 98,20 EUR\nMwSt 18,66 EUR\nGESAMT 116,86 EUR\nVielen Dank`);
assert.strictEqual(parsed.supplier,'BAUHAUS GmbH & Co. KG','OCR parser should identify a supplier from the receipt header');
assert.strictEqual(parsed.date,'2026-08-30','OCR parser should normalize German dates');
assert.strictEqual(parsed.amount,116.86,'OCR parser should prefer the labelled total over VAT/intermediate values');
assert.strictEqual(parsed.category,'Material','OCR parser should suggest material for a building-supply receipt');
assert.strictEqual(parsed.reference,'4711-AB','OCR parser should extract a receipt reference where available');
assert(parsed.confidence>=0.75,'OCR parser should expose a useful confidence signal');
assert.strictEqual(expenses.detectCategory('ARAL Tankstelle Diesel'), 'Fahrt / Transport');
assert.strictEqual(expenses.detectCategory('Containerdienst Entsorgung Bauschutt'), 'Entsorgung');

const project={
  auftragspreis:20000,
  material:[
    {id:'m1',preis:8000,einkaufspreis:3000,subunternehmerPreis:0},
    {id:'m2',preis:4000,einkaufspreis:1200,subunternehmerPreis:2500}
  ],
  ausgaben:[
    {id:'e1',kategorie:'Material',betrag:2800,materialId:'m1',inKalkulation:true,belegDataURL:'data:image/jpeg;base64,AAA'},
    {id:'e2',kategorie:'Nachunternehmer',betrag:2400,materialId:'m2',inKalkulation:true},
    {id:'e3',kategorie:'Geräte / Miete',betrag:600,inKalkulation:true},
    {id:'e4',kategorie:'Fahrt / Transport',betrag:200,inKalkulation:false}
  ],
  ausschreibung:[]
};
const totals=expenses.expenseTotals(project);
assert.strictEqual(totals.total,5800,'only included expenses should count');
assert.strictEqual(totals.byCategory.Material,2800);
assert.strictEqual(totals.byCategory['Nachunternehmer'],2400);
assert.strictEqual(totals.receiptCount,1);

const values=economics.projectEconomics(project);
assert.strictEqual(values.materialCost,4000,'linked material receipt replaces manual cost for that position and keeps other manual material');
assert.strictEqual(values.subcontractorCost,2400,'linked subcontractor receipt replaces manual position cost');
assert.strictEqual(values.otherExpenseCost,600);
assert.strictEqual(values.costs,7000);
assert.strictEqual(values.grossProfit,13000);
assert.strictEqual(values.margin,65);

const dom=new JSDOM('<!doctype html><html><head></head><body><div id="view"><div id="projektTabBody"><div class="card">Materialliste</div></div></div></body></html>',{url:'https://example.test/#projekte/p1/material',runScripts:'outside-only'});
const win=dom.window;
win.S={projekte:[{id:'p1',name:'Bad',material:[{id:'m1',bezeichnung:'Fliesen'}],ausgaben:[{id:'e1',datum:'2026-08-30',kategorie:'Material',lieferant:'Bauhaus',betrag:123.45,inKalkulation:true,belegDataURL:'data:image/jpeg;base64,AAA',belegAutomatischErkannt:true}]}]};
win.fmtCurrency=value=>Number(value).toFixed(2)+' €';
win.eval(expenseSource);
assert(win.document.querySelector('[data-project-expenses="1"]'),'material tab should show expense and receipt card');
assert(win.document.body.textContent.includes('123.45 €'),'expense amount should be visible');
assert(win.document.body.textContent.includes('Bauhaus'),'supplier should be visible');
assert(win.document.body.textContent.includes('Beleg ansehen'),'stored receipt should be viewable');
assert(win.document.body.textContent.includes('Foto erkannt'),'recognized receipt should be marked visibly');
win.ProjectExpenses.enhance();
assert.strictEqual(win.document.querySelectorAll('[data-project-expenses="1"]').length,1,'repeated enhance must not duplicate expense card');

console.log('project expenses tests passed');
