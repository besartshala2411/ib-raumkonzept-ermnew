(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.ProjectEconomics=api;
  if(root&&root.document) api.install();
})(typeof window!=='undefined'?window:globalThis,function(global){
  'use strict';

  function n(value){const out=Number(value);return Number.isFinite(out)?out:0;}
  function parseProjectHash(hash){
    const parts=String(hash||'').replace(/^#/,'').split('/').filter(Boolean);
    return parts[0]==='projekte'&&parts[1]?{projectId:decodeURIComponent(parts[1]),tab:parts[2]||'uebersicht'}:null;
  }
  function projectById(id){
    const state=global.S;
    return state&&Array.isArray(state.projekte)?state.projekte.find(p=>String(p.id)===String(id))||null:null;
  }
  function materialSales(material){return n(material&&material.verkaufspreis!=null?material.verkaufspreis:material&&material.preis);}
  function materialPurchase(material){return n(material&&material.einkaufspreis);}
  function materialSubcontractor(material){return n(material&&material.subunternehmerPreis);}
  function includedExpenses(project){return (Array.isArray(project&&project.ausgaben)?project.ausgaben:[]).filter(item=>item&&item.inKalkulation!==false);}
  function expenseCategoryTotal(project,category){return includedExpenses(project).filter(item=>String(item.kategorie||'')===category).reduce((sum,item)=>sum+n(item.betrag),0);}
  function linkedMaterialIds(project,category){return new Set(includedExpenses(project).filter(item=>String(item.kategorie||'')===category&&item.materialId).map(item=>String(item.materialId)));}
  function commissionedSubcontractorCosts(project){
    return (Array.isArray(project&&project.ausschreibung)?project.ausschreibung:[]).reduce((sum,item)=>{
      const status=String(item&&item.status||'').toLocaleLowerCase('de-DE');
      return status.includes('beauftragt')?sum+n(item.angebotSumme):sum;
    },0);
  }
  function projectEconomics(project){
    const material=Array.isArray(project&&project.material)?project.material:[];
    const sales=material.reduce((sum,item)=>sum+materialSales(item),0);
    const materialLinked=linkedMaterialIds(project,'Material');
    const subLinked=linkedMaterialIds(project,'Nachunternehmer');
    const manualMaterialCost=material.reduce((sum,item)=>materialLinked.has(String(item&&item.id))?sum:sum+materialPurchase(item),0);
    const expenseMaterialCost=expenseCategoryTotal(project,'Material');
    const materialCost=manualMaterialCost+expenseMaterialCost;
    const manualPositionSubCost=material.reduce((sum,item)=>subLinked.has(String(item&&item.id))?sum:sum+materialSubcontractor(item),0);
    const expenseSubCost=expenseCategoryTotal(project,'Nachunternehmer');
    const positionSubCost=manualPositionSubCost+expenseSubCost;
    const commissioned=commissionedSubcontractorCosts(project);
    const subcontractorCost=positionSubCost>0?positionSubCost:commissioned;
    const otherExpenseCost=includedExpenses(project).filter(item=>!['Material','Nachunternehmer'].includes(String(item.kategorie||''))).reduce((sum,item)=>sum+n(item.betrag),0);
    const revenue=n(project&&project.auftragspreis)||n(project&&project.budget)||sales;
    const costs=materialCost+subcontractorCost+otherExpenseCost;
    const grossProfit=revenue-costs;
    const margin=revenue>0?(grossProfit/revenue)*100:0;
    return {revenue,sales,materialCost,manualMaterialCost,expenseMaterialCost,positionSubCost,manualPositionSubCost,expenseSubCost,commissionedSubcontractorCost:commissioned,subcontractorCost,otherExpenseCost,costs,grossProfit,margin};
  }
  function money(value){
    try{return typeof global.fmtCurrency==='function'?global.fmtCurrency(n(value)):new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n(value));}
    catch(_){return n(value).toFixed(2)+' €';}
  }
  function make(tag,className,text){const el=global.document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;}
  function metric(label,value,detail){
    const box=make('div','projectEconomicsMetric');
    box.appendChild(make('span','projectEconomicsMetricLabel',label));
    box.appendChild(make('strong','projectEconomicsMetricValue',value));
    if(detail) box.appendChild(make('span','projectEconomicsMetricDetail',detail));
    return box;
  }
  function openProjectPrice(project){
    if(typeof global.openModal!=='function') return false;
    global.openModal('<div class="modalHead"><div class="modalTitle">Projektkalkulation</div><button class="iconBtn" onclick="closeModal()">✖</button></div>'+
      '<div class="pageSub" style="margin-bottom:14px;">Hier steht dein vereinbarter Verkaufspreis/Auftragspreis für die Baustelle. Material-, Beleg- und Nachunternehmerkosten werden getrennt geführt.</div>'+
      '<div class="formRow"><label>Auftragspreis / dein Preis (€)</label><input id="peProjectPrice" type="number" min="0" step="0.01" value="'+(project.auftragspreis!=null?n(project.auftragspreis):'')+'" placeholder="z. B. 24500"></div>'+
      '<div class="modalFoot"><button class="btn" onclick="closeModal()">Abbrechen</button><button class="btn primary" id="peProjectPriceSave">Speichern</button></div>');
    global.document.getElementById('peProjectPriceSave')?.addEventListener('click',()=>{
      const input=global.document.getElementById('peProjectPrice');
      project.auftragspreis=n(input&&input.value);
      try{if(typeof global.saveState==='function')global.saveState();}catch(_){}
      try{if(typeof global.closeModal==='function')global.closeModal();}catch(_){}
      try{if(typeof global.route==='function')global.route(global.location.hash);}catch(_){}
    });
    return true;
  }
  function openMaterialCosts(project,material){
    if(typeof global.openModal!=='function') return false;
    global.openModal('<div class="modalHead"><div class="modalTitle">Kosten & Verkaufspreis</div><button class="iconBtn" onclick="closeModal()">✖</button></div>'+
      '<div class="pageSub" style="margin-bottom:14px;">'+String(material.bezeichnung||'Position')+'</div>'+
      '<div class="grid cols-2">'+
        '<div class="formRow"><label>Dein Verkaufspreis (€)</label><input id="peSales" type="number" min="0" step="0.01" value="'+materialSales(material)+'"></div>'+
        '<div class="formRow"><label>Material-Einkauf (€)</label><input id="pePurchase" type="number" min="0" step="0.01" value="'+materialPurchase(material)+'"></div>'+
        '<div class="formRow"><label>Nachunternehmer-Kosten (€)</label><input id="peSub" type="number" min="0" step="0.01" value="'+materialSubcontractor(material)+'"></div>'+
        '<div class="formRow"><label>Lieferant / Händler</label><input id="peSupplier" type="text" value="'+String(material.lieferant||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'"></div>'+
      '</div>'+
      '<div class="formRow"><label>Kostennotiz</label><textarea id="peNote" placeholder="z. B. Rechnung, Bestellung, Sonderpreis …">'+String(material.kostenNotiz||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</textarea></div>'+
      '<div class="modalFoot"><button class="btn" onclick="closeModal()">Abbrechen</button><button class="btn primary" id="peCostSave">Speichern</button></div>');
    global.document.getElementById('peCostSave')?.addEventListener('click',()=>{
      material.verkaufspreis=n(global.document.getElementById('peSales')?.value);
      material.preis=material.verkaufspreis;
      material.einkaufspreis=n(global.document.getElementById('pePurchase')?.value);
      material.subunternehmerPreis=n(global.document.getElementById('peSub')?.value);
      material.lieferant=String(global.document.getElementById('peSupplier')?.value||'').trim();
      material.kostenNotiz=String(global.document.getElementById('peNote')?.value||'').trim();
      material.kostenAktualisiertAm=new Date().toISOString();
      try{if(typeof global.saveState==='function')global.saveState();}catch(_){}
      try{if(typeof global.closeModal==='function')global.closeModal();}catch(_){}
      try{if(typeof global.route==='function')global.route(global.location.hash);}catch(_){}
    });
    return true;
  }
  function enhanceRows(project,body){
    const table=body.querySelector('.tableWrap table');
    if(!table) return;
    const rows=Array.from(table.querySelectorAll('tbody tr'));
    (project.material||[]).forEach((item,index)=>{
      const row=rows[index];if(!row||row.dataset.projectEconomicsRow==='1')return;
      row.dataset.projectEconomicsRow='1';
      const cells=row.querySelectorAll('td');if(cells.length<2)return;
      const info=make('div','projectEconomicsRowInfo');
      info.appendChild(make('span','projectEconomicsPill','VK '+money(materialSales(item))));
      info.appendChild(make('span','projectEconomicsPill','EK '+money(materialPurchase(item))));
      if(materialSubcontractor(item)>0)info.appendChild(make('span','projectEconomicsPill','NU '+money(materialSubcontractor(item))));
      if(item.lieferant)info.appendChild(make('span','projectEconomicsSupplier',String(item.lieferant)));
      cells[1].appendChild(info);
      const actionCell=cells[cells.length-1];
      const button=make('button','btn sm projectEconomicsEdit','Kosten');button.type='button';
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openMaterialCosts(project,item);});
      actionCell.insertBefore(button,actionCell.firstChild);
    });
  }
  function summaryCard(project){
    const values=projectEconomics(project);
    const card=make('section','card projectEconomicsSummary');
    card.setAttribute('data-project-economics','1');
    const head=make('div','projectEconomicsHead');
    const title=make('div');title.appendChild(make('strong','','Baustellen-Kalkulation'));title.appendChild(make('div','pageSub','Verkauf, Material-Einkauf, Belege und Nachunternehmer auf einen Blick.'));
    const edit=make('button','btn sm','Projektpreis bearbeiten');edit.type='button';edit.addEventListener('click',()=>openProjectPrice(project));
    head.appendChild(title);head.appendChild(edit);card.appendChild(head);
    const metrics=make('div','projectEconomicsMetrics');
    metrics.appendChild(metric('Dein Auftragspreis',money(values.revenue),values.sales&&values.sales!==values.revenue?'LV-Verkauf '+money(values.sales):''));
    metrics.appendChild(metric('Material ausgegeben',money(values.materialCost),values.expenseMaterialCost>0?'davon Belege '+money(values.expenseMaterialCost):'Einkauf / Ist-Kosten'));
    metrics.appendChild(metric('Nachunternehmer',money(values.subcontractorCost),values.expenseSubCost>0?'davon Belege '+money(values.expenseSubCost):(values.positionSubCost>0?'positionsbezogen':'beauftragte Angebote')));
    metrics.appendChild(metric('Weitere Ausgaben',money(values.otherExpenseCost),'Miete, Fahrt, Entsorgung, Sonstiges'));
    metrics.appendChild(metric('Gesamtkosten',money(values.costs),'alle berücksichtigten Ist-Kosten'));
    metrics.appendChild(metric('Deckungsbeitrag',money(values.grossProfit),values.margin.toFixed(1).replace('.',',')+' %'));
    card.appendChild(metrics);
    if(values.grossProfit<0){const warning=make('div','projectEconomicsWarning','⚠ Die erfassten Kosten liegen über dem Auftragspreis.');warning.setAttribute('role','status');card.appendChild(warning);}
    return card;
  }
  function loadStyles(){
    if(!global.document||global.document.getElementById('projectEconomicsStyles'))return;
    const link=global.document.createElement('link');link.id='projectEconomicsStyles';link.rel='stylesheet';link.href='./src/modules/projects/projectEconomics.css';global.document.head.appendChild(link);
  }
  function enhance(){
    const state=parseProjectHash(global.location&&global.location.hash);if(!state||state.tab!=='material')return false;
    const project=projectById(state.projectId),body=global.document&&global.document.getElementById('projektTabBody');if(!project||!body)return false;
    if(!body.querySelector('.projectEconomicsSummary[data-project-economics="1"]'))body.insertBefore(summaryCard(project),body.firstChild);
    enhanceRows(project,body);return true;
  }
  let observer=null;
  function install(){
    loadStyles();enhance();
    if(typeof global.MutationObserver==='function'&&global.document){
      const view=global.document.getElementById('view');if(view){observer=new global.MutationObserver(()=>Promise.resolve().then(enhance));observer.observe(view,{childList:true,subtree:true});}
    }
    global.addEventListener?.('hashchange',()=>Promise.resolve().then(enhance));
    return true;
  }
  return {n,parseProjectHash,materialSales,materialPurchase,materialSubcontractor,includedExpenses,expenseCategoryTotal,linkedMaterialIds,commissionedSubcontractorCosts,projectEconomics,enhance,install};
});
