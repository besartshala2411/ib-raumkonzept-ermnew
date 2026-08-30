(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.ProjectExpenses=api;
  if(root&&root.document) api.install();
})(typeof window!=='undefined'?window:globalThis,function(global){
  'use strict';

  const CATEGORIES=['Material','Nachunternehmer','Geräte / Miete','Fahrt / Transport','Entsorgung','Sonstiges'];
  const OCR_SCRIPT='https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const GENERIC_SUPPLIER_WORDS=/^(rechnung|kassenbon|bon|beleg|quittung|datum|kasse|filiale|steuer|ust|mwst|summe|gesamt|total|bar|ec|visa|mastercard|zahlbetrag|zu zahlen|kundenbeleg)$/i;
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
  function parseMoneyToken(value){
    let raw=String(value||'').replace(/\s/g,'').replace(/€/g,'');
    if(!raw)return 0;
    if(raw.includes(',')&&raw.includes('.'))raw=raw.lastIndexOf(',')>raw.lastIndexOf('.')?raw.replace(/\./g,'').replace(',','.'):raw.replace(/,/g,'');
    else if(raw.includes(','))raw=raw.replace(/\./g,'').replace(',','.');
    const out=Number(raw.replace(/[^0-9.-]/g,''));
    return Number.isFinite(out)?out:0;
  }
  function isoDate(day,month,year){
    const y=Number(year)<100?2000+Number(year):Number(year),m=Number(month),d=Number(day);
    if(y<2000||y>2100||m<1||m>12||d<1||d>31)return '';
    const date=new Date(Date.UTC(y,m-1,d));
    if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return '';
    return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0');
  }
  function detectCategory(text){
    const value=String(text||'').toLocaleLowerCase('de-DE');
    if(/container|deponie|entsorgung|abfall|recycling|wertstoff/.test(value))return 'Entsorgung';
    if(/miete|mietpark|maschine|ger[aä]t|r[üu]ttelplatte|bagger|hebeb[üu]hne/.test(value))return 'Geräte / Miete';
    if(/tankstelle|diesel|benzin|kraftstoff|aral|shell|esso|totalenergies/.test(value))return 'Fahrt / Transport';
    if(/nachunternehmer|subunternehmer|montageleistung|fremdleistung/.test(value))return 'Nachunternehmer';
    if(/bauhaus|hornbach|obi|toom|baustoff|farben|lack|fliesen|holz|schrauben|material/.test(value))return 'Material';
    return '';
  }
  function extractSupplier(lines){
    const candidates=lines.slice(0,10).map(line=>line.replace(/\s{2,}/g,' ').trim()).filter(Boolean);
    for(const line of candidates){
      if(line.length<3||line.length>70||GENERIC_SUPPLIER_WORDS.test(line))continue;
      if(!/[A-Za-zÄÖÜäöüß]{3}/.test(line))continue;
      if(/^\d/.test(line)||/@|www\.|https?:|tel\.?|fax/i.test(line))continue;
      return line.replace(/^[^A-Za-zÄÖÜäöüß]+|[^A-Za-zÄÖÜäöüß0-9&+ .,'/-]+$/g,'').trim();
    }
    return '';
  }
  function parseReceiptText(text){
    const raw=String(text||'').replace(/\r/g,'');
    const lines=raw.split('\n').map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
    const joined=lines.join('\n');
    let date='';
    const european=joined.match(/\b(0?[1-9]|[12]\d|3[01])[.\/-](0?[1-9]|1[0-2])[.\/-](20\d{2}|\d{2})\b/);
    if(european)date=isoDate(european[1],european[2],european[3]);
    if(!date){const iso=joined.match(/\b(20\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])\b/);if(iso)date=isoDate(iso[3],iso[2],iso[1]);}

    const moneyRe=/(?:€\s*)?(-?\d{1,6}(?:[.\s]\d{3})*(?:,\d{2})|-?\d{1,6}\.\d{2})(?:\s*€)?/g;
    const totalWords=/(zu zahlen|zahlbetrag|endbetrag|endsumme|gesamtbetrag|gesamt|summe|total|brutto)/i;
    let amount=0,amountSource='';
    lines.forEach(line=>{
      if(!totalWords.test(line))return;
      const values=Array.from(line.matchAll(moneyRe)).map(match=>parseMoneyToken(match[1])).filter(v=>v>0&&v<1000000);
      if(values.length){amount=values[values.length-1];amountSource=line;}
    });
    if(!amount){
      const tail=lines.slice(-16);const values=[];
      tail.forEach(line=>Array.from(line.matchAll(moneyRe)).forEach(match=>{const value=parseMoneyToken(match[1]);if(value>0&&value<1000000)values.push({value,line});}));
      if(values.length){values.sort((a,b)=>b.value-a.value);amount=values[0].value;amountSource=values[0].line;}
    }
    const supplier=extractSupplier(lines);
    const category=detectCategory(joined);
    let reference='';
    for(const line of lines){
      const match=line.match(/(?:rechnungs?(?:nr|nummer)?|beleg(?:nr|nummer)?|bon[- ]?nr|vorgang)[.:#\s-]*([A-Z0-9][A-Z0-9\-/.]{2,})/i);
      if(match){reference=match[1];break;}
    }
    const score=[supplier,date,amount>0].filter(Boolean).length+(category?0.5:0)+(reference?0.5:0);
    return {supplier,date,amount,category,reference,confidence:Math.min(1,score/4),amountSource};
  }
  function loadTesseract(){
    if(global.Tesseract&&typeof global.Tesseract.recognize==='function')return Promise.resolve(global.Tesseract);
    if(global.__projectExpenseOcrPromise)return global.__projectExpenseOcrPromise;
    if(!global.document)return Promise.reject(new Error('Belegerkennung ist hier nicht verfügbar.'));
    global.__projectExpenseOcrPromise=new Promise((resolve,reject)=>{
      let script=global.document.getElementById('projectExpenseOcrScript');
      if(script){script.addEventListener('load',()=>resolve(global.Tesseract),{once:true});script.addEventListener('error',()=>reject(new Error('Belegerkennung konnte nicht geladen werden.')),{once:true});return;}
      script=global.document.createElement('script');script.id='projectExpenseOcrScript';script.src=OCR_SCRIPT;script.async=true;
      script.onload=()=>global.Tesseract&&typeof global.Tesseract.recognize==='function'?resolve(global.Tesseract):reject(new Error('Belegerkennung konnte nicht gestartet werden.'));
      script.onerror=()=>reject(new Error('Belegerkennung konnte nicht geladen werden.'));
      global.document.head.appendChild(script);
    }).catch(error=>{global.__projectExpenseOcrPromise=null;throw error;});
    return global.__projectExpenseOcrPromise;
  }
  async function recognizeReceipt(dataURL,onProgress){
    const engine=await loadTesseract();
    const result=await engine.recognize(dataURL,'deu+eng',{logger:message=>{if(message&&message.status==='recognizing text'&&typeof onProgress==='function')onProgress(Math.max(0,Math.min(1,Number(message.progress)||0)));}});
    const text=result&&result.data&&result.data.text||'';
    if(!String(text).trim())throw new Error('Auf dem Foto konnte kein lesbarer Belegtext erkannt werden.');
    return {text:String(text),fields:parseReceiptText(text)};
  }
  function materialOptions(project){
    return (Array.isArray(project&&project.material)?project.material:[]).map(item=>'<option value="'+esc(item.id)+'">'+esc(item.bezeichnung||item.name||'Position')+'</option>').join('');
  }
  function setScanStatus(message,state,progress){
    const box=global.document&&global.document.getElementById('pexScanStatus');if(!box)return;
    box.className='projectExpenseScanStatus '+(state||'');box.textContent=String(message||'');
    const bar=global.document.getElementById('pexScanProgress');if(bar){bar.hidden=typeof progress!=='number';bar.firstElementChild&&(bar.firstElementChild.style.width=Math.round((progress||0)*100)+'%');}
  }
  function applyDetectedFields(fields){
    if(!fields||!global.document)return;
    const supplier=global.document.getElementById('pexSupplier'),date=global.document.getElementById('pexDate'),amount=global.document.getElementById('pexAmount'),category=global.document.getElementById('pexCategory'),note=global.document.getElementById('pexNote');
    if(supplier&&fields.supplier)supplier.value=fields.supplier;
    if(date&&fields.date)date.value=fields.date;
    if(amount&&fields.amount>0)amount.value=fields.amount.toFixed(2);
    if(category&&fields.category)category.value=fields.category;
    if(note&&fields.reference&&!note.value.trim())note.value='Beleg-Nr. '+fields.reference;
  }
  function openExpenseForm(project){
    if(!project||typeof global.openModal!=='function')return false;
    const today=new Date().toISOString().slice(0,10);let receiptCache=null,recognitionCache=null;
    global.openModal('<div class="modalHead"><div><div class="modalTitle">Baustellen-Ausgabe erfassen</div><div class="pageSub">Foto machen – Betrag, Datum und Lieferant werden automatisch vorgeschlagen.</div></div><button class="iconBtn" onclick="closeModal()">✖</button></div>'+
      '<div class="projectExpenseScanBox">'+
        '<label class="projectExpenseCamera" for="pexReceipt"><span class="projectExpenseCameraIcon">📷</span><span><strong>Beleg fotografieren oder auswählen</strong><small>Foto wird direkt im Browser gelesen; erkannte Werte kannst du vor dem Speichern ändern.</small></span></label>'+
        '<input id="pexReceipt" class="projectExpenseFileInput" type="file" accept="image/*,application/pdf" capture="environment">'+
        '<div id="pexReceiptPreview" class="projectExpenseReceiptPreview" hidden></div>'+
        '<div id="pexScanStatus" class="projectExpenseScanStatus">Noch kein Beleg ausgewählt.</div>'+
        '<div id="pexScanProgress" class="projectExpenseScanProgress" hidden><span></span></div>'+
        '<button type="button" class="btn sm projectExpenseRescan" id="pexRescan" hidden>↻ Erneut erkennen</button>'+
      '</div>'+
      '<div class="projectExpenseDetectedHint">Bitte kurz prüfen – die Erkennung macht Vorschläge, gespeichert wird erst mit deinem Klick.</div>'+
      '<div class="grid cols-2">'+
        '<div class="formRow"><label>Datum</label><input id="pexDate" type="date" value="'+today+'"></div>'+
        '<div class="formRow"><label>Kategorie</label><select id="pexCategory">'+CATEGORIES.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></div>'+
        '<div class="formRow"><label>Lieferant / Firma</label><input id="pexSupplier" type="text" placeholder="wird nach Foto vorgeschlagen"></div>'+
        '<div class="formRow"><label>Betrag (€)</label><input id="pexAmount" type="number" min="0" step="0.01" inputmode="decimal" placeholder="wird nach Foto vorgeschlagen"></div>'+
      '</div>'+
      '<div class="formRow"><label>Zu Material-/LV-Position (optional)</label><select id="pexMaterial"><option value="">Keine direkte Position</option>'+materialOptions(project)+'</select><div class="pageSub">Bei verknüpften Material- oder NU-Belegen ersetzt der Beleg die manuelle Kostenangabe dieser Position in der Kalkulation, damit nichts doppelt gezählt wird.</div></div>'+
      '<div class="formRow"><label>Notiz</label><textarea id="pexNote" placeholder="Rechnungsnummer, Bestellung, Besonderheit …"></textarea></div>'+
      '<label class="projectExpenseCheck"><input id="pexInclude" type="checkbox" checked> In Baustellen-Kalkulation berücksichtigen</label>'+
      '<div class="modalFoot"><button class="btn" onclick="closeModal()">Abbrechen</button><button class="btn primary" id="pexSave">Ausgabe speichern</button></div>');

    const input=global.document.getElementById('pexReceipt'),rescan=global.document.getElementById('pexRescan'),preview=global.document.getElementById('pexReceiptPreview');
    async function scanSelectedReceipt(force){
      const file=input&&input.files&&input.files[0];if(!file)return false;
      try{
        if(!receiptCache||force)receiptCache=await readFile(file);
        if(preview){preview.hidden=false;preview.innerHTML='';if(/^image\//i.test(receiptCache.type)){const img=global.document.createElement('img');img.src=receiptCache.dataURL;img.alt='Vorschau des Belegs';preview.appendChild(img);}else preview.textContent='📄 '+receiptCache.name;}
        if(!/^image\//i.test(receiptCache.type)){setScanStatus('PDF gespeichert. Automatische Texterkennung ist für Fotos optimiert.','neutral');if(rescan)rescan.hidden=true;return true;}
        if(rescan)rescan.hidden=true;setScanStatus('Beleg wird erkannt …','working',0);
        const recognized=await recognizeReceipt(receiptCache.dataURL,progress=>setScanStatus('Beleg wird erkannt … '+Math.round(progress*100)+' %','working',progress));
        recognitionCache=recognized.fields;applyDetectedFields(recognized.fields);
        const found=[];if(recognized.fields.supplier)found.push('Lieferant');if(recognized.fields.date)found.push('Datum');if(recognized.fields.amount>0)found.push('Betrag');if(recognized.fields.category)found.push('Kategorie');
        setScanStatus(found.length?'Erkannt: '+found.join(', ')+'. Bitte kurz prüfen.':'Text erkannt – Werte bitte kurz prüfen.','success');
        if(rescan)rescan.hidden=false;return true;
      }catch(error){setScanStatus((error&&error.message)||'Beleg konnte nicht automatisch erkannt werden. Bitte Werte manuell eintragen.','error');if(rescan)rescan.hidden=false;return false;}
    }
    input?.addEventListener('change',()=>{receiptCache=null;recognitionCache=null;scanSelectedReceipt(false);});
    rescan?.addEventListener('click',()=>scanSelectedReceipt(true));

    const save=global.document.getElementById('pexSave');
    save?.addEventListener('click',async()=>{
      const amount=n(global.document.getElementById('pexAmount')?.value);
      if(amount<=0){try{global.toast?.('Bitte einen Betrag größer 0 eingeben.','error');}catch(_){}return;}
      save.disabled=true;
      try{
        const file=input&&input.files&&input.files[0];
        const receipt=receiptCache||(await readFile(file));
        if(!Array.isArray(project.ausgaben))project.ausgaben=[];
        project.ausgaben.push({
          id:makeId(),datum:String(global.document.getElementById('pexDate')?.value||today),
          kategorie:String(global.document.getElementById('pexCategory')?.value||'Sonstiges'),
          lieferant:String(global.document.getElementById('pexSupplier')?.value||'').trim(),betrag:amount,
          materialId:String(global.document.getElementById('pexMaterial')?.value||''),
          notiz:String(global.document.getElementById('pexNote')?.value||'').trim(),
          inKalkulation:!!global.document.getElementById('pexInclude')?.checked,
          belegName:receipt?receipt.name:'',belegTyp:receipt?receipt.type:'',belegGroesse:receipt?receipt.size:0,belegDataURL:receipt?receipt.dataURL:'',
          belegAutomatischErkannt:!!recognitionCache,belegErkennungsSicherheit:recognitionCache?recognitionCache.confidence:0,
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
    const head=make('div','projectExpensesHead'),title=make('div');title.appendChild(make('strong','','Ausgaben & Belege'));title.appendChild(make('div','pageSub','Beleg fotografieren, automatisch erkennen und direkt der Baustelle zuordnen.'));
    const add=make('button','btn primary sm','📷 Beleg / Ausgabe');add.type='button';add.addEventListener('click',()=>openExpenseForm(project));head.appendChild(title);head.appendChild(add);card.appendChild(head);
    const summary=make('div','projectExpensesSummary');summary.appendChild(make('div','','Erfasste Ausgaben'));summary.appendChild(make('strong','',money(totals.total)));summary.appendChild(make('span','pageSub',totals.count+' Buchungen · '+totals.receiptCount+' Belege'));card.appendChild(summary);
    const items=expenses(project).slice().sort((a,b)=>String(b.datum||'').localeCompare(String(a.datum||'')));
    if(!items.length){card.appendChild(make('div','projectExpensesEmpty','Noch keine Baustellen-Ausgaben erfasst.'));return card;}
    const list=make('div','projectExpensesList');
    items.forEach(item=>{
      const row=make('div','projectExpenseRow');
      const main=make('div','projectExpenseMain');main.appendChild(make('strong','',String(item.lieferant||item.kategorie||'Ausgabe')));main.appendChild(make('div','pageSub',[item.datum,item.kategorie,item.notiz].filter(Boolean).join(' · ')));if(item.belegAutomatischErkannt)main.appendChild(make('span','projectExpenseAutoBadge','✓ Foto erkannt'));row.appendChild(main);
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
  return {CATEGORIES,OCR_SCRIPT,n,parseProjectHash,projectById,expenses,includedExpenses,expenseTotals,readFile,parseMoneyToken,detectCategory,parseReceiptText,recognizeReceipt,openExpenseForm,removeExpense,renderCard,enhance,install};
});
