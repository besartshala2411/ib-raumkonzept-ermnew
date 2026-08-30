(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.ProjectExpenses=api;
  if(root&&root.document) api.install();
})(typeof window!=='undefined'?window:globalThis,function(global){
  'use strict';

  const CATEGORIES=['Material','Nachunternehmer','Geräte / Miete','Fahrt / Transport','Entsorgung','Sonstiges'];
  function n(value){const out=Number(value);return Number.isFinite(out)?out:0;}
  function parseProjectHash(hash){
    const parts=String(hash||'').replace(/^#/,'').split('/').filter(Boolean);
    return parts[0]==='projekte'&&parts[1]?{projectId:decodeURIComponent(parts[1]),tab:parts[2]||'uebersicht'}:null;
  }
  function projectById(id){
    const state=global.S;
    return state&&Array.isArray(state.projekte)?state.projekte.find(p=>String(p.id)===String(id))||null:null;
  }
  function makeId(){
    try{if(typeof global.uid==='function')return global.uid();}catch(_){}
    return 'expense_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  }
  function esc(value){return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  function money(value){
    try{return typeof global.fmtCurrency==='function'?global.fmtCurrency(n(value)):new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n(value));}
    catch(_){return n(value).toFixed(2)+' €';}
  }
  function expenses(project){return Array.isArray(project&&project.ausgaben)?project.ausgaben:[];}
  function includedExpenses(project){return expenses(project).filter(item=>item&&item.inKalkulation!==false);}
  function expenseTotals(project){
    const items=includedExpenses(project);
    const byCategory={};
    CATEGORIES.forEach(category=>{byCategory[category]=0;});
    items.forEach(item=>{const category=CATEGORIES.includes(item.kategorie)?item.kategorie:'Sonstiges';byCategory[category]=(byCategory[category]||0)+n(item.betrag);});
    const total=items.reduce((sum,item)=>sum+n(item.betrag),0);
    return {total,byCategory,count:items.length,receiptCount:items.filter(item=>item.belegDataURL).length};
  }
  function readFile(file){
    return new Promise((resolve,reject)=>{
      if(!file){resolve(null);return;}
      if(typeof global.FileReader!=='function'){reject(new Error('Datei-Upload wird in diesem Browser nicht unterstützt.'));return;}
      const reader=new global.FileReader();
      reader.onload=()=>resolve({name:String(file.name||'Beleg'),type:String(file.type||''),size:n(file.size),dataURL:String(reader.result||'')});
      reader.onerror=()=>reject(new Error('Beleg konnte nicht gelesen werden.'));
      reader.readAsDataURL(file);
    });
  }
  function materialOptions(project){
    return (Array.isArray(project&&project.material)?project.material:[]).map(item=>'<option value="'+esc(item.id)+'">'+esc(item.bezeichnung||item.name||'Position')+'</option>').join('');
  }
  function openExpenseForm(project){
    if(!project||typeof global.openModal!=='function')return false;
    const today=new Date().toISOString().slice(0,10);
    global.openModal('<div class="modalHead"><div class="modalTitle">Baustellen-Ausgabe erfassen</div><button class="iconBtn" onclick="closeModal()">✖</button></div>'+
      '<div class="pageSub" style="margin-bottom:14px;">Beleg fotografieren oder hochladen und die Ausgabe direkt dieser Baustelle zuordnen.</div>'+
      '<div class="grid cols-2">'+
        '<div class="formRow"><label>Datum</label><input id="pexDate" type="date" value="'+today+'"></div>'+
        '<div class="formRow"><label>Kategorie</label><select id="pexCategory">'+CATEGORIES.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></div>'+
        '<div class="formRow"><label>Lieferant / Firma</label><input id="pexSupplier" type="text" placeholder="z. B. Bauhaus"></div>'+
        '<div class="formRow"><label>Betrag (€)</label><input id="pexAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="0,00"></div>'+
      '</div>'+
      '<div class="formRow"><label>Zu Material-/LV-Position (optional)</label><select id="pexMaterial"><option value="">Keine direkte Position</option>'+materialOptions(project)+'</select><div class="pageSub">Bei verknüpften Material- oder NU-Belegen ersetzt der Beleg die manuelle Kostenangabe dieser Position in der Kalkulation, damit nichts doppelt gezählt wird.</div></div>'+
      '<div class="formRow"><label>Beleg / Rechnung</label><input id="pexReceipt" type="file" accept="image/*,application/pdf"><div class="pageSub">Auf Tablet/Smartphone kann hier direkt die Kamera bzw. Fotomediathek verwendet werden.</div></div>'+
      '<div class="formRow"><label>Notiz</label><textarea id="pexNote" placeholder="Bestellung, Rechnungsnummer, Besonderheit …"></textarea></div>'+
      '<label class="projectExpenseCheck"><input id="pexInclude" type="checkbox" checked> In Baustellen-Kalkulation berücksichtigen</label>'+
      '<div class="modalFoot"><button class="btn" onclick="closeModal()">Abbrechen</button><button class="btn primary" id="pexSave">Ausgabe speichern</button></div>');
    const save=global.document.getElementById('pexSave');
    save?.addEventListener('click',async()=>{
      const amount=n(global.document.getElementById('pexAmount')?.value);
      if(amount<=0){try{global.toast?.('Bitte einen Betrag größer 0 eingeben.','error');}catch(_){}return;}
      save.disabled=true;
      try{
        const input=global.document.getElementById('pexReceipt');
        const receipt=await readFile(input&&input.files&&input.files[0]);
        if(!Array.isArray(project.ausgaben))project.ausgaben=[];
        project.ausgaben.push({
          id:makeId(),datum:String(global.document.getElementById('pexDate')?.value||today),
          kategorie:String(global.document.getElementById('pexCategory')?.value||'Sonstiges'),
          lieferant:String(global.document.getElementById('pexSupplier')?.value||'').trim(),betrag:amount,
          materialId:String(global.document.getElementById('pexMaterial')?.value||''),
          notiz:String(global.document.getElementById('pexNote')?.value||'').trim(),
          inKalkulation:!!global.document.getElementById('pexInclude')?.checked,
          belegName:receipt?receipt.name:'',belegTyp:receipt?receipt.type:'',belegGroesse:receipt?receipt.size:0,belegDataURL:receipt?receipt.dataURL:'',
          erstelltAm:new Date().toISOString()
        });
        try{if(typeof global.saveState==='function')global.saveState();}catch(_){}
        try{global.closeModal?.();}catch(_){}
        try{if(typeof global.route==='function')global.route(global.location.hash);}catch(_){}
      }catch(error){try{global.toast?.(error&&error.message||'Beleg konnte nicht gespeichert werden.','error');}catch(_){}save.disabled=false;}
    });
    return true;
  }
  function removeExpense(project,id){
    if(!project||!Array.isArray(project.ausgaben))return false;
    const index=project.ausgaben.findIndex(item=>String(item&&item.id)===String(id));if(index<0)return false;
    if(typeof global.confirm==='function'&&!global.confirm('Ausgabe wirklich löschen?'))return false;
    project.ausgaben.splice(index,1);
    try{if(typeof global.saveState==='function')global.saveState();}catch(_){}
    try{if(typeof global.route==='function')global.route(global.location.hash);}catch(_){}
    return true;
  }
  function make(tag,className,text){const el=global.document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;}
  function renderCard(project){
    const totals=expenseTotals(project),card=make('section','card projectExpensesCard');card.setAttribute('data-project-expenses','1');
    const head=make('div','projectExpensesHead'),title=make('div');title.appendChild(make('strong','','Ausgaben & Belege'));title.appendChild(make('div','pageSub','Rechnungen, Bons und Baustellenkosten direkt dem Projekt zuordnen.'));
    const add=make('button','btn primary sm','+ Ausgabe / Beleg');add.type='button';add.addEventListener('click',()=>openExpenseForm(project));head.appendChild(title);head.appendChild(add);card.appendChild(head);
    const summary=make('div','projectExpensesSummary');summary.appendChild(make('div','','Erfasste Ausgaben'));summary.appendChild(make('strong','',money(totals.total)));summary.appendChild(make('span','pageSub',totals.count+' Buchungen · '+totals.receiptCount+' Belege'));card.appendChild(summary);
    const items=expenses(project).slice().sort((a,b)=>String(b.datum||'').localeCompare(String(a.datum||'')));
    if(!items.length){card.appendChild(make('div','projectExpensesEmpty','Noch keine Baustellen-Ausgaben erfasst.'));return card;}
    const list=make('div','projectExpensesList');
    items.forEach(item=>{
      const row=make('div','projectExpenseRow');
      const main=make('div','projectExpenseMain');main.appendChild(make('strong','',String(item.lieferant||item.kategorie||'Ausgabe')));main.appendChild(make('div','pageSub',[item.datum,item.kategorie,item.notiz].filter(Boolean).join(' · ')));row.appendChild(main);
      row.appendChild(make('strong','projectExpenseAmount',money(item.betrag)));
      const actions=make('div','projectExpenseActions');
      if(item.belegDataURL){const receipt=make('button','btn sm','Beleg ansehen');receipt.type='button';receipt.addEventListener('click',()=>{try{global.open(item.belegDataURL,'_blank','noopener');}catch(_){}});actions.appendChild(receipt);}
      const del=make('button','btn sm','Löschen');del.type='button';del.addEventListener('click',()=>removeExpense(project,item.id));actions.appendChild(del);row.appendChild(actions);list.appendChild(row);
    });
    card.appendChild(list);return card;
  }
  function enhance(){
    const state=parseProjectHash(global.location&&global.location.hash);if(!state||state.tab!=='material'||!global.document)return false;
    const project=projectById(state.projectId),body=global.document.getElementById('projektTabBody');if(!project||!body)return false;
    if(!body.querySelector('[data-project-expenses="1"]'))body.insertBefore(renderCard(project),body.firstChild);
    return true;
  }
  function loadStyles(){if(!global.document||global.document.getElementById('projectExpensesStyles'))return;const link=global.document.createElement('link');link.id='projectExpensesStyles';link.rel='stylesheet';link.href='./src/modules/projects/projectExpenses.css';global.document.head.appendChild(link);}
  let observer=null;
  function install(){loadStyles();enhance();if(typeof global.MutationObserver==='function'&&global.document){const view=global.document.getElementById('view');if(view){observer=new global.MutationObserver(records=>{const relevant=records.some(r=>r.type==='childList'&&Array.from(r.addedNodes||[]).some(node=>node&&node.nodeType===1&&!node.closest?.('[data-project-expenses="1"]')));if(relevant)Promise.resolve().then(enhance);});observer.observe(view,{childList:true,subtree:true});}}global.addEventListener?.('hashchange',()=>Promise.resolve().then(enhance));return true;}
  return {CATEGORIES,n,parseProjectHash,projectById,expenses,includedExpenses,expenseTotals,readFile,openExpenseForm,removeExpense,renderCard,enhance,install};
});
