(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.ProjectCommercial=api;
  if(root&&root.document) api.install();
})(typeof window!=='undefined'?window:globalThis,function(global){
  'use strict';

  const CHANGE_STATUS=['Entwurf','Freigegeben','Abgerechnet'];
  function n(v){const x=Number(v);return Number.isFinite(x)?x:0;}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function today(){return new Date().toISOString().slice(0,10);}
  function parseProjectHash(hash){const p=String(hash||'').replace(/^#/,'').split('/').filter(Boolean);return p[0]==='projekte'&&p[1]?{projectId:decodeURIComponent(p[1]),tab:p[2]||'uebersicht'}:null;}
  function projectById(id){const s=global.S;return s&&Array.isArray(s.projekte)?s.projekte.find(p=>String(p.id)===String(id))||null:null;}
  function projectInvoices(projectId){const s=global.S;return s&&Array.isArray(s.rechnungen)?s.rechnungen.filter(r=>String(r.projektId||'')===String(projectId)):[];}
  function projectTasks(projectId){const s=global.S;return s&&Array.isArray(s.aufgaben)?s.aufgaben.filter(a=>String(a.projektId||'')===String(projectId)):[];}
  function changes(project){return Array.isArray(project&&project.nachtraege)?project.nachtraege:[];}
  function approvedChangeRevenue(project){return changes(project).filter(x=>x&&['Freigegeben','Abgerechnet'].includes(x.status)).reduce((sum,x)=>sum+n(x.betrag),0);}
  function invoiceGross(invoice){
    if(invoice==null)return 0;
    if(invoice.brutto!=null)return n(invoice.brutto);
    if(invoice.gesamt!=null)return n(invoice.gesamt);
    if(invoice.betrag!=null)return n(invoice.betrag);
    const positions=Array.isArray(invoice.positionen)?invoice.positionen:[];
    const netto=positions.reduce((s,p)=>s+n(p.menge||1)*n(p.preis||p.einzelpreis),0);
    const tax=invoice.mwst!=null?n(invoice.mwst):19;
    return netto*(1+tax/100);
  }
  function isPaid(invoice){const status=String(invoice&&invoice.status||'').toLocaleLowerCase('de-DE');return status.includes('bezahlt')||status.includes('gezahlt');}
  function invoiceSummary(projectId){
    const invoices=projectInvoices(projectId);const total=invoices.reduce((s,r)=>s+invoiceGross(r),0);const paid=invoices.filter(isPaid).reduce((s,r)=>s+invoiceGross(r),0);return {count:invoices.length,total,paid,open:Math.max(0,total-paid)};
  }
  function fallbackEconomics(project){
    const material=Array.isArray(project.material)?project.material:[];
    const expenses=Array.isArray(project.ausgaben)?project.ausgaben.filter(x=>x&&x.inKalkulation!==false):[];
    const sales=material.reduce((s,m)=>s+n(m.verkaufspreis!=null?m.verkaufspreis:m.preis),0);
    const materialCost=material.reduce((s,m)=>s+n(m.einkaufspreis),0);
    const subCost=material.reduce((s,m)=>s+n(m.subunternehmerPreis),0);
    const other=expenses.reduce((s,e)=>s+n(e.betrag),0);
    const base=n(project.auftragspreis)||n(project.budget)||sales;
    const revenue=base+approvedChangeRevenue(project);const costs=materialCost+subCost+other;const grossProfit=revenue-costs;
    return {revenue,costs,grossProfit,margin:revenue>0?grossProfit/revenue*100:0,materialCost,subcontractorCost:subCost,otherExpenses:other,sales};
  }
  function economics(project){try{if(global.ProjectEconomics&&typeof global.ProjectEconomics.projectEconomics==='function')return global.ProjectEconomics.projectEconomics(project);}catch(_){}return fallbackEconomics(project);}
  function money(v){try{return typeof global.fmtCurrency==='function'?global.fmtCurrency(n(v)):new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n(v));}catch(_){return n(v).toFixed(2)+' €';}}
  function fmtDate(v){try{return typeof global.fmtDate==='function'?global.fmtDate(v):String(v||'–');}catch(_){return String(v||'–');}}
  function go(hash){try{if(typeof global.goTo==='function')global.goTo(hash);else global.location.hash=hash;}catch(_){} }
  function make(tag,cls,text){const el=global.document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;}
  function metric(label,value,detail,kind){const box=make('div','projectCommercialMetric'+(kind?' '+kind:''));box.appendChild(make('span','projectCommercialMetricLabel',label));box.appendChild(make('strong','projectCommercialMetricValue',value));if(detail)box.appendChild(make('span','projectCommercialMetricDetail',detail));return box;}
  function warningList(project,eco,inv){
    const warnings=[];const now=today();
    projectTasks(project.id).forEach(t=>{if(t.status!=='erledigt'&&t.faellig&&String(t.faellig)<now)warnings.push('Aufgabe überfällig: '+String(t.titel||'Aufgabe'));});
    if(project.deadline&&String(project.deadline)<now&&project.status!=='Abgeschlossen')warnings.push('Projekttermin überschritten');
    if(eco.grossProfit<0)warnings.push('Baustellenkosten liegen über dem Auftragserlös');
    if(inv.open>0)warnings.push('Offener Rechnungsbetrag: '+money(inv.open));
    return warnings.slice(0,5);
  }
  function quickButton(label,hash){const b=make('button','btn sm projectCommercialQuick',label);b.type='button';b.addEventListener('click',()=>go(hash));return b;}
  function cockpit(project){
    const eco=economics(project),inv=invoiceSummary(project.id),ch=changes(project),approved=approvedChangeRevenue(project),openTasks=projectTasks(project.id).filter(t=>t.status!=='erledigt').length;
    const shell=make('section','card projectCommercialCockpit');shell.setAttribute('data-project-commercial-cockpit','1');
    const head=make('div','projectCommercialHead');const left=make('div');left.appendChild(make('div','projectCommercialEyebrow','Projekt-Cockpit'));left.appendChild(make('h2','','Baustelle wirtschaftlich steuern'));left.appendChild(make('div','pageSub','Auftrag, Kosten, Nachträge, Rechnungen und offene Arbeit auf einen Blick.'));head.appendChild(left);shell.appendChild(head);
    const metrics=make('div','projectCommercialMetrics');metrics.appendChild(metric('Auftrag + Nachträge',money(eco.revenue),approved?'davon Nachträge '+money(approved):'ohne freigegebene Nachträge'));metrics.appendChild(metric('Ist-Kosten',money(eco.costs),'Material, NU und weitere Ausgaben'));metrics.appendChild(metric('Deckungsbeitrag',money(eco.grossProfit),(n(eco.margin)).toFixed(1).replace('.',',')+' %',eco.grossProfit<0?'negative':''));metrics.appendChild(metric('Offene Rechnungen',money(inv.open),inv.count+' Rechnung(en)'));metrics.appendChild(metric('Offene Aufgaben',String(openTasks),'Projektbezogen'));metrics.appendChild(metric('Nachträge',String(ch.length),approved?money(approved)+' freigegeben':'noch keine Freigabe'));shell.appendChild(metrics);
    const quick=make('div','projectCommercialQuickRow');quick.appendChild(quickButton('LV / Material','#projekte/'+encodeURIComponent(project.id)+'/material'));quick.appendChild(quickButton('Aufmaß','#projekte/'+encodeURIComponent(project.id)+'/aufmass'));quick.appendChild(quickButton('Nachträge','#projekte/'+encodeURIComponent(project.id)+'/nachtraege'));quick.appendChild(quickButton('Nachunternehmer','#projekte/'+encodeURIComponent(project.id)+'/ausschreibung'));quick.appendChild(quickButton('Dokumente','#projekte/'+encodeURIComponent(project.id)+'/dokumente'));quick.appendChild(quickButton('Abnahme','#projekte/'+encodeURIComponent(project.id)+'/abnahme'));shell.appendChild(quick);
    const warnings=warningList(project,eco,inv);if(warnings.length){const area=make('div','projectCommercialWarnings');area.appendChild(make('strong','','Achtung'));warnings.forEach(w=>area.appendChild(make('div','projectCommercialWarning','⚠ '+w)));shell.appendChild(area);}
    return shell;
  }
  function enhanceOverview(project,body){if(body.querySelector('[data-project-commercial-cockpit="1"]'))return true;body.insertBefore(cockpit(project),body.firstChild);return true;}

  function ensureChangeTab(projectId,active){
    const tabs=global.document&&global.document.querySelector('#view .tabs');if(!tabs)return null;
    let b=tabs.querySelector('[data-project-change-tab="1"]');if(!b){b=make('button','tabBtn uiuxChangeOrderTab','➕ Nachträge');b.type='button';b.setAttribute('data-project-change-tab','1');b.addEventListener('click',()=>go('#projekte/'+encodeURIComponent(projectId)+'/nachtraege'));tabs.appendChild(b);}
    if(active){tabs.querySelectorAll('.tabBtn').forEach(x=>x.classList.remove('active'));b.classList.add('active');b.setAttribute('aria-current','page');}else{b.classList.remove('active');b.removeAttribute('aria-current');}
    return b;
  }
  function statusBadge(status){const cls=status==='Abgerechnet'?'green':status==='Freigegeben'?'blue':'gray';return '<span class="badge '+cls+'">'+esc(status)+'</span>';}
  function changeForm(project){
    const material=Array.isArray(project.material)?project.material:[];
    return '<div class="projectChangeForm card"><div class="projectCommercialSectionHead"><div><b>Nachtrag erfassen</b><div class="pageSub">Zusatzleistung direkt dem Projekt und optional einer LV-Position zuordnen.</div></div></div><div class="grid cols-2">'+
      '<div class="formRow"><label>Bezeichnung *</label><input id="pcTitle" type="text" placeholder="z. B. Zusatzarbeiten Trockenbau"></div><div class="formRow"><label>Betrag netto (€)</label><input id="pcAmount" type="number" min="0" step="0.01"></div><div class="formRow"><label>Datum</label><input id="pcDate" type="date" value="'+today()+'"></div><div class="formRow"><label>LV-Position</label><select id="pcMaterial"><option value="">Keine direkte Zuordnung</option>'+material.map(m=>'<option value="'+esc(m.id||'')+'">'+esc(m.bezeichnung||m.titel||'Position')+'</option>').join('')+'</select></div></div><div class="formRow"><label>Beschreibung / Begründung</label><textarea id="pcNote" placeholder="Leistungsänderung, Bauherrnwunsch, zusätzliche Menge …"></textarea></div><div class="projectCommercialActions"><button type="button" class="btn primary" id="pcAdd">Nachtrag speichern</button></div></div>';
  }
  function changesTable(project){
    const list=changes(project);const total=list.reduce((s,x)=>s+n(x.betrag),0),approved=approvedChangeRevenue(project),billed=list.filter(x=>x.status==='Abgerechnet').reduce((s,x)=>s+n(x.betrag),0);
    return '<div class="projectChangeSummary">'+metricHTML('Erfasst',money(total))+metricHTML('Freigegeben',money(approved))+metricHTML('Abgerechnet',money(billed))+'</div><div class="card"><div class="tableWrap"><table><thead><tr><th>Nachtrag</th><th>Datum</th><th>Betrag</th><th>Status</th><th></th></tr></thead><tbody>'+list.map(x=>'<tr><td><b>'+esc(x.titel)+'</b>'+(x.beschreibung?'<div class="pageSub">'+esc(x.beschreibung)+'</div>':'')+'</td><td>'+esc(fmtDate(x.datum))+'</td><td>'+esc(money(x.betrag))+'</td><td>'+statusBadge(x.status)+'</td><td class="projectChangeActions"><button class="btn sm" data-change-action="advance" data-id="'+esc(x.id)+'">'+(x.status==='Entwurf'?'Freigeben':x.status==='Freigegeben'?'Als abgerechnet markieren':'Abgerechnet')+'</button><button class="iconBtn" data-change-action="delete" data-id="'+esc(x.id)+'">🗑️</button></td></tr>').join('')+(list.length?'':'<tr><td colspan="5"><div class="empty">Noch keine Nachträge erfasst.</div></td></tr>')+'</tbody></table></div></div>';
  }
  function metricHTML(label,value){return '<div class="projectCommercialMiniMetric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong></div>';}
  function saveState(){try{if(typeof global.saveState==='function')global.saveState();}catch(_){} }
  function refresh(){try{if(typeof global.route==='function')global.route(global.location.hash);else enhance();}catch(_){enhance();}}
  function addChange(project){
    const title=String(global.document.getElementById('pcTitle')?.value||'').trim();if(!title){try{global.toast?.('Bitte eine Bezeichnung eingeben.','warn');}catch(_){}return false;}
    if(!Array.isArray(project.nachtraege))project.nachtraege=[];
    const id=typeof global.uid==='function'?global.uid():'chg_'+Date.now();project.nachtraege.push({id,titel:title,betrag:n(global.document.getElementById('pcAmount')?.value),datum:global.document.getElementById('pcDate')?.value||today(),materialId:global.document.getElementById('pcMaterial')?.value||'',beschreibung:String(global.document.getElementById('pcNote')?.value||'').trim(),status:'Entwurf',erstelltAm:new Date().toISOString()});saveState();refresh();try{global.toast?.('Nachtrag gespeichert.','success');}catch(_){}return true;
  }
  function advanceChange(project,id){const x=changes(project).find(v=>String(v.id)===String(id));if(!x)return false;x.status=x.status==='Entwurf'?'Freigegeben':x.status==='Freigegeben'?'Abgerechnet':'Abgerechnet';x.aktualisiertAm=new Date().toISOString();saveState();refresh();return true;}
  function deleteChange(project,id){project.nachtraege=changes(project).filter(x=>String(x.id)!==String(id));saveState();refresh();return true;}
  function renderChanges(project,body){body.innerHTML='<div class="projectCommercialPage"><div class="projectCommercialPageHead"><div><div class="projectCommercialEyebrow">Zusatzleistungen</div><h2>Nachträge</h2><div class="pageSub">Vom Entwurf über die Freigabe bis zur Abrechnung projektbezogen verfolgen.</div></div></div>'+changeForm(project)+changesTable(project)+'</div>';global.document.getElementById('pcAdd')?.addEventListener('click',()=>addChange(project));body.querySelectorAll('[data-change-action]').forEach(btn=>btn.addEventListener('click',()=>btn.dataset.changeAction==='advance'?advanceChange(project,btn.dataset.id):deleteChange(project,btn.dataset.id)));return true;}

  function enhanceLvRows(project,body){
    const table=body.querySelector('.tableWrap table');if(!table)return false;const rows=Array.from(table.querySelectorAll('tbody tr'));
    (project.material||[]).forEach((m,i)=>{const row=rows[i];if(!row||row.dataset.commercialLv==='1')return;row.dataset.commercialLv='1';const cells=row.querySelectorAll('td');if(cells.length<2)return;const sales=n(m.verkaufspreis!=null?m.verkaufspreis:m.preis),cost=n(m.einkaufspreis)+n(m.subunternehmerPreis),db=sales-cost,margin=sales>0?db/sales*100:0;const line=make('div','projectCommercialLvLine');line.appendChild(make('span','projectCommercialLvPill','VK '+money(sales)));line.appendChild(make('span','projectCommercialLvPill','Kosten '+money(cost)));line.appendChild(make('span','projectCommercialLvPill '+(db<0?'negative':''),'DB '+money(db)+' · '+margin.toFixed(1).replace('.',',')+' %'));cells[1].appendChild(line);});return true;
  }
  function enhanceMaterial(project,body){enhanceLvRows(project,body);return true;}
  function enhance(){
    const state=parseProjectHash(global.location&&global.location.hash);if(!state||!global.document)return false;const project=projectById(state.projectId),body=global.document.getElementById('projektTabBody');if(!project||!body)return false;
    ensureChangeTab(project.id,state.tab==='nachtraege');
    if(state.tab==='nachtraege')return renderChanges(project,body);
    if(state.tab==='uebersicht')return enhanceOverview(project,body);
    if(state.tab==='material')return enhanceMaterial(project,body);
    return true;
  }
  function loadStyles(){if(!global.document||global.document.getElementById('projectCommercialStyles'))return;const l=global.document.createElement('link');l.id='projectCommercialStyles';l.rel='stylesheet';l.href='./src/modules/projects/projectCommercial.css';global.document.head.appendChild(l);}
  let observer=null;function install(){loadStyles();enhance();if(typeof global.MutationObserver==='function'&&global.document){const view=global.document.getElementById('view');if(view){observer=new global.MutationObserver(records=>{const relevant=records.some(r=>r.type==='childList'&&Array.from(r.addedNodes||[]).some(n=>n&&n.nodeType===1&&!n.classList.contains('projectCommercialCockpit')&&!n.closest?.('.projectCommercialPage')));if(relevant)Promise.resolve().then(enhance);});observer.observe(view,{childList:true,subtree:true});}}global.addEventListener?.('hashchange',()=>Promise.resolve().then(enhance));return true;}
  return {CHANGE_STATUS,n,parseProjectHash,projectById,projectInvoices,projectTasks,approvedChangeRevenue,invoiceGross,isPaid,invoiceSummary,fallbackEconomics,economics,warningList,enhanceOverview,ensureChangeTab,addChange,advanceChange,deleteChange,renderChanges,enhanceLvRows,enhance,install};
});
