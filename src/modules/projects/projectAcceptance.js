(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.ProjectAcceptance=api;
  if(root&&root.document) api.install();
})(typeof window!=='undefined'?window:globalThis,function(global){
  const STATUS_VALUES=['Offen','Abgenommen','Abgenommen mit Mängeln','Nicht abgenommen'];

  function esc(value){
    return String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function today(){ return new Date().toISOString().slice(0,10); }

  function normalizeAcceptance(value){
    const src=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    return {
      datum:String(src.datum||today()),
      status:STATUS_VALUES.includes(src.status)?src.status:'Offen',
      kundeVertreter:String(src.kundeVertreter||''),
      auftragnehmerVertreter:String(src.auftragnehmerVertreter||''),
      bemerkungen:String(src.bemerkungen||''),
      maengel:String(src.maengel||''),
      unterschrift:String(src.unterschrift||''),
      bestaetigt:src.bestaetigt===true,
      gespeichertAm:String(src.gespeichertAm||''),
      protokollErstelltAm:String(src.protokollErstelltAm||'')
    };
  }

  function parseProjectHash(hash){
    const parts=String(hash||'').replace(/^#/,'').split('/').filter(Boolean);
    if(parts[0]!=='projekte'||!parts[1]) return null;
    return {projectId:decodeURIComponent(parts[1]),tab:parts[2]||'uebersicht'};
  }

  function protocolFilename(projectName){
    const safe=String(projectName||'Projekt').replace(/[^a-z0-9äöüß]+/gi,'_').replace(/^_+|_+$/g,'');
    return 'Abnahmeprotokoll_'+(safe||'Projekt')+'.pdf';
  }

  function projectById(id){
    try{
      if(typeof S==='undefined'||!S||!Array.isArray(S.projekte)) return null;
      return S.projekte.find(p=>String(p.id)===String(id))||null;
    }catch(_){ return null; }
  }

  function customerName(project){
    try{ return typeof kundeName==='function'?kundeName(project.kundeId):'–'; }catch(_){ return '–'; }
  }

  function currentEmployeeName(){
    try{
      if(typeof currentUser==='function'){
        const user=currentUser();
        return user&&user.name?String(user.name):'';
      }
    }catch(_){}
    return '';
  }

  function routeToAcceptance(projectId){
    try{
      if(typeof goTo==='function') goTo('#projekte/'+encodeURIComponent(projectId)+'/abnahme');
      else global.location.hash='#projekte/'+encodeURIComponent(projectId)+'/abnahme';
    }catch(_){}
  }

  function statusBadge(status){
    const cls=status==='Abgenommen'?'green':status==='Abgenommen mit Mängeln'?'amber':status==='Nicht abgenommen'?'red':'gray';
    return '<span class="badge '+cls+'">'+esc(status)+'</span>';
  }

  function ensureTab(projectId,active){
    const tabs=global.document&&global.document.querySelector('#view .tabs');
    if(!tabs) return null;
    let button=tabs.querySelector('[data-project-acceptance-tab="1"]');
    if(!button){
      const divider=global.document.createElement('div');
      divider.className='tabDivider uiuxAcceptanceDivider';
      divider.setAttribute('data-project-acceptance-divider','1');
      button=global.document.createElement('button');
      button.type='button';
      button.className='tabBtn uiuxAcceptanceTab';
      button.setAttribute('data-project-acceptance-tab','1');
      button.innerHTML='✍️ Abnahme';
      button.addEventListener('click',()=>routeToAcceptance(projectId));
      tabs.appendChild(divider);
      tabs.appendChild(button);
    }
    if(active){
      tabs.querySelectorAll('.tabBtn').forEach(tab=>tab.classList.remove('active'));
      button.classList.add('active');
      button.setAttribute('aria-current','page');
    }else{
      button.classList.remove('active');
      button.removeAttribute('aria-current');
    }
    return button;
  }

  function formHTML(project,data){
    const representative=data.auftragnehmerVertreter||currentEmployeeName();
    const signed=data.unterschrift?'<span class="badge green">Unterschrift vorhanden</span>':'<span class="badge gray">Noch nicht unterschrieben</span>';
    return '<div class="uiuxAcceptanceShell">'+
      '<div class="uiuxAcceptanceIntro card">'+
        '<div><div class="uiuxAcceptanceEyebrow">Projektabschluss</div><h2>Abnahme vor Ort</h2><p>Abnahme gemeinsam mit dem Auftraggeber durchführen, direkt auf dem Tablet unterschreiben und anschließend das Abnahmeprotokoll erzeugen.</p></div>'+
        '<div class="uiuxAcceptanceStatus">'+statusBadge(data.status)+signed+'</div>'+
      '</div>'+
      '<div class="uiuxAcceptanceGrid">'+
        '<section class="card uiuxAcceptanceForm">'+
          '<div class="uiuxAcceptanceSectionHead"><div><b>Abnahmedaten</b><div class="pageSub">'+esc(project.name)+' · '+esc(customerName(project))+'</div></div></div>'+
          '<div class="grid cols-2">'+
            '<div class="formRow"><label>Abnahmedatum</label><input id="paDatum" type="date" value="'+esc(data.datum)+'"></div>'+
            '<div class="formRow"><label>Ergebnis</label><select id="paStatus">'+STATUS_VALUES.map(s=>'<option '+(s===data.status?'selected':'')+'>'+esc(s)+'</option>').join('')+'</select></div>'+
            '<div class="formRow"><label>Auftraggeber / Vertreter</label><input id="paKundeVertreter" type="text" value="'+esc(data.kundeVertreter)+'" placeholder="Name der unterschreibenden Person"></div>'+
            '<div class="formRow"><label>Auftragnehmer / Bauleitung</label><input id="paAuftragnehmerVertreter" type="text" value="'+esc(representative)+'" placeholder="Name"></div>'+
          '</div>'+
          '<div class="formRow"><label>Bemerkungen zur Abnahme</label><textarea id="paBemerkungen" placeholder="Besondere Feststellungen, Restleistungen, Hinweise …">'+esc(data.bemerkungen)+'</textarea></div>'+
          '<div class="formRow"><label>Mängel / Vorbehalte</label><textarea id="paMaengel" placeholder="Keine Mängel oder vorhandene Mängel möglichst konkret beschreiben …">'+esc(data.maengel)+'</textarea></div>'+
          '<label class="uiuxAcceptanceConfirm"><input id="paBestaetigt" type="checkbox" '+(data.bestaetigt?'checked':'')+'> <span>Die Leistungen wurden gemeinsam besichtigt und das oben gewählte Abnahmeergebnis wurde besprochen.</span></label>'+
        '</section>'+
        '<section class="card uiuxAcceptanceSignature">'+
          '<div class="uiuxAcceptanceSectionHead"><div><b>Unterschrift Auftraggeber</b><div class="pageSub">Mit Finger oder Stift direkt auf dem Tablet unterschreiben.</div></div></div>'+
          '<div class="formRow"><canvas id="paSignature" width="760" height="260" aria-label="Unterschrift Auftraggeber"></canvas></div>'+
          '<button type="button" class="btn sm" id="paClearSignature">Unterschrift löschen</button>'+
          '<div class="pageSub uiuxAcceptanceSaved">'+(data.gespeichertAm?'Zuletzt gespeichert: '+esc(new Date(data.gespeichertAm).toLocaleString('de-DE')):'Noch nicht gespeichert')+'</div>'+
        '</section>'+
      '</div>'+
      '<div class="uiuxAcceptanceActions">'+
        '<button type="button" class="btn" id="paSave">Speichern</button>'+
        (data.unterschrift?'<button type="button" class="btn" id="paProtocol">Abnahmeprotokoll öffnen</button>':'')+
        '<button type="button" class="btn primary" id="paComplete">Abnahme abschließen & Protokoll</button>'+
      '</div>'+
    '</div>';
  }

  function initSignature(existing){
    const canvas=global.document.getElementById('paSignature');
    if(!canvas) return;
    global.__projectAcceptanceSignature=existing||'';
    if(typeof initSigPad==='function'){
      initSigPad('paSignature',existing||'',data=>{global.__projectAcceptanceSignature=data||'';});
    }else{
      const ctx=canvas.getContext&&canvas.getContext('2d');
      if(ctx){ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);}
    }
    const clear=global.document.getElementById('paClearSignature');
    if(clear) clear.addEventListener('click',()=>{
      if(typeof clearSigPad==='function') clearSigPad('paSignature');
      global.__projectAcceptanceSignature='';
    });
  }

  function readForm(existing){
    const doc=global.document;
    return normalizeAcceptance({
      ...existing,
      datum:doc.getElementById('paDatum')?.value||today(),
      status:doc.getElementById('paStatus')?.value||'Offen',
      kundeVertreter:doc.getElementById('paKundeVertreter')?.value.trim()||'',
      auftragnehmerVertreter:doc.getElementById('paAuftragnehmerVertreter')?.value.trim()||'',
      bemerkungen:doc.getElementById('paBemerkungen')?.value.trim()||'',
      maengel:doc.getElementById('paMaengel')?.value.trim()||'',
      bestaetigt:!!doc.getElementById('paBestaetigt')?.checked,
      unterschrift:global.__projectAcceptanceSignature||existing.unterschrift||'',
      gespeichertAm:new Date().toISOString()
    });
  }

  function persist(project,data){
    project.abnahme=normalizeAcceptance(data);
    try{ if(typeof saveState==='function') saveState(); }catch(_){}
    return project.abnahme;
  }

  function save(projectId,options){
    const project=projectById(projectId);if(!project) return null;
    const existing=normalizeAcceptance(project.abnahme);
    const data=readForm(existing);
    if(options&&options.requireComplete){
      if(!data.kundeVertreter){ try{toast('Bitte den Namen des Auftraggebers/Vertreters eintragen.','warn');}catch(_){} return null; }
      if(!data.bestaetigt){ try{toast('Bitte die gemeinsame Besichtigung und das Abnahmeergebnis bestätigen.','warn');}catch(_){} return null; }
      if(!data.unterschrift){ try{toast('Bitte zuerst direkt auf dem Tablet unterschreiben.','warn');}catch(_){} return null; }
      if(data.status==='Offen'){ try{toast('Bitte ein Abnahmeergebnis auswählen.','warn');}catch(_){} return null; }
    }
    persist(project,data);
    try{toast(options&&options.requireComplete?'Abnahme gespeichert.':'Abnahmedaten gespeichert.','success');}catch(_){}
    return data;
  }

  function buildProtocolDoc(project,data){
    if(typeof pdfNewDoc!=='function'||typeof pdfHeader!=='function') return null;
    const doc=pdfNewDoc();
    let y=pdfHeader(doc,'Abnahmeprotokoll');
    doc.setFontSize(10.5);
    const line=(label,value)=>{doc.setFont(undefined,'bold');doc.text(label,15,y);doc.setFont(undefined,'normal');doc.text(String(value||'–'),62,y);y+=6;};
    line('Projekt:',project.name);
    line('Adresse:',project.adresse||'–');
    line('Kunde:',customerName(project));
    line('Abnahmedatum:',typeof fmtDate==='function'?fmtDate(data.datum):data.datum);
    line('Ergebnis:',data.status);
    line('Auftraggeber:',data.kundeVertreter);
    line('Auftragnehmer:',data.auftragnehmerVertreter||'–');
    y+=5;
    doc.setFont(undefined,'bold');doc.text('Bemerkungen',15,y);doc.setFont(undefined,'normal');y+=6;
    y=typeof pdfWriteWrapped==='function'?pdfWriteWrapped(doc,data.bemerkungen||'Keine besonderen Bemerkungen.',15,y,180)+7:y+12;
    doc.setFont(undefined,'bold');doc.text('Mängel / Vorbehalte',15,y);doc.setFont(undefined,'normal');y+=6;
    y=typeof pdfWriteWrapped==='function'?pdfWriteWrapped(doc,data.maengel||'Keine Mängel oder Vorbehalte dokumentiert.',15,y,180)+10:y+15;
    if(y>225){doc.addPage();y=25;}
    doc.setFontSize(9.5);
    const statement='Die Leistungen wurden gemeinsam besichtigt. Das dokumentierte Abnahmeergebnis sowie die aufgeführten Bemerkungen und Mängel/Vorbehalte wurden festgehalten.';
    y=typeof pdfWriteWrapped==='function'?pdfWriteWrapped(doc,statement,15,y,180)+10:y+15;
    if(data.unterschrift){
      try{doc.addImage(data.unterschrift,'PNG',15,y,76,26);}catch(_){}
      y+=29;
    }
    doc.line(15,y,92,y);y+=5;
    doc.text('Unterschrift Auftraggeber / Vertreter',15,y);
    if(typeof pdfFooter==='function') pdfFooter(doc);
    return doc;
  }

  function exportProtocol(projectId,dataOverride){
    const project=projectById(projectId);if(!project) return false;
    const data=normalizeAcceptance(dataOverride||project.abnahme);
    if(!data.unterschrift){try{toast('Für das Abnahmeprotokoll fehlt noch die Unterschrift.','warn');}catch(_){}return false;}
    const doc=buildProtocolDoc(project,data);
    if(!doc){try{toast('PDF-Werkzeug ist noch nicht verfügbar.','warn');}catch(_){}return false;}
    if(typeof saveOrSharePdf==='function') saveOrSharePdf(doc,protocolFilename(project.name));
    else doc.save(protocolFilename(project.name));
    return true;
  }

  function render(projectId){
    const body=global.document&&global.document.getElementById('projektTabBody');
    const project=projectById(projectId);if(!body||!project) return false;
    const data=normalizeAcceptance(project.abnahme);
    body.setAttribute('data-project-acceptance-rendered',projectId+'|'+(data.gespeichertAm||''));
    body.innerHTML=formHTML(project,data);
    initSignature(data.unterschrift);
    global.document.getElementById('paSave')?.addEventListener('click',()=>{
      const saved=save(projectId);if(saved) render(projectId);
    });
    global.document.getElementById('paProtocol')?.addEventListener('click',()=>exportProtocol(projectId));
    global.document.getElementById('paComplete')?.addEventListener('click',()=>{
      const saved=save(projectId,{requireComplete:true});if(!saved) return;
      saved.protokollErstelltAm=new Date().toISOString();persist(project,saved);exportProtocol(projectId,saved);render(projectId);
    });
    return true;
  }

  function enhance(){
    const state=parseProjectHash(global.location&&global.location.hash);
    if(!state) return false;
    const body=global.document&&global.document.getElementById('projektTabBody');
    if(!body) return false;
    const active=state.tab==='abnahme';
    ensureTab(state.projectId,active);
    if(!active) return true;
    const project=projectById(state.projectId);if(!project) return false;
    const data=normalizeAcceptance(project.abnahme);
    const signature=state.projectId+'|'+(data.gespeichertAm||'');
    if(body.getAttribute('data-project-acceptance-rendered')===signature&&body.querySelector('.uiuxAcceptanceShell')) return true;
    return render(state.projectId);
  }

  let scheduled=false,installed=false;
  function schedule(){
    if(scheduled) return;scheduled=true;
    const run=()=>{scheduled=false;enhance();};
    if(typeof global.requestAnimationFrame==='function') global.requestAnimationFrame(run);else setTimeout(run,0);
  }

  function loadStyles(){
    if(!global.document||global.document.getElementById('projectAcceptanceStyles')) return;
    const link=global.document.createElement('link');link.id='projectAcceptanceStyles';link.rel='stylesheet';link.href='./src/modules/projects/projectAcceptance.css';global.document.head.appendChild(link);
  }

  function install(){
    if(installed||!global.document) return !!installed;
    installed=true;loadStyles();
    const start=()=>{
      schedule();
      global.addEventListener&&global.addEventListener('hashchange',schedule);
      const view=global.document.getElementById('view');
      if(view&&typeof global.MutationObserver==='function'){
        const observer=new global.MutationObserver(records=>{
          if(records.some(record=>record.type==='childList'&&[...record.addedNodes,...record.removedNodes].some(node=>!(node&&node.nodeType===1&&node.classList&&node.classList.contains('uiuxAcceptanceShell'))))) schedule();
        });
        observer.observe(view,{childList:true,subtree:true});
        global.__projectAcceptanceObserver=observer;
      }
    };
    if(global.document.readyState==='loading') global.document.addEventListener('DOMContentLoaded',start,{once:true});else start();
    return true;
  }

  return {STATUS_VALUES,normalizeAcceptance,parseProjectHash,protocolFilename,ensureTab,buildProtocolDoc,exportProtocol,render,enhance,install};
});
