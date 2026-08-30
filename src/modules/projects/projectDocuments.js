(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.ProjectDocuments=api;
  if(root&&root.document) api.install();
})(typeof window!=='undefined'?window:globalThis,function(global){
  'use strict';

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
    return 'doc_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  }
  function archiveDataUrl(projectId,filename,dataURL,meta){
    const project=projectById(projectId);if(!project||!dataURL)return false;
    if(!Array.isArray(project.dokumente))project.dokumente=[];
    const name=String(filename||'Dokument.pdf');
    const existing=project.dokumente.find(doc=>doc&&doc.automatisch===true&&doc.name===name&&doc.dataURL===dataURL);
    if(existing)return existing;
    const doc={id:makeId(),name,dataURL,datum:new Date().toISOString(),automatisch:true,quelle:String(meta&&meta.quelle||'ERM'),typ:String(meta&&meta.typ||'Erzeugtes Dokument')};
    project.dokumente.push(doc);
    try{if(typeof global.saveState==='function')global.saveState();}catch(_){}
    return doc;
  }
  function jsPdfDataUrl(doc){
    if(!doc||typeof doc.output!=='function')return '';
    try{return doc.output('datauristring')||'';}catch(_){return '';}
  }
  function blobToDataUrl(blob){
    return new Promise(resolve=>{
      if(!blob){resolve('');return;}
      if(typeof global.FileReader!=='function'){resolve('');return;}
      const reader=new global.FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>resolve('');reader.readAsDataURL(blob);
    });
  }
  function activeProject(){
    const state=parseProjectHash(global.location&&global.location.hash);if(!state)return null;
    const project=projectById(state.projectId);return project?{state,project}:null;
  }
  function archivePdfIfProject(doc,filename){
    const active=activeProject();if(!active)return false;
    const dataURL=jsPdfDataUrl(doc);if(!dataURL)return false;
    return archiveDataUrl(active.project.id,filename,dataURL,{typ:'PDF',quelle:'Automatisch erzeugt'});
  }
  async function archiveBlobIfProject(blob,filename){
    const active=activeProject();if(!active)return false;
    const dataURL=await blobToDataUrl(blob);if(!dataURL)return false;
    return archiveDataUrl(active.project.id,filename,dataURL,{typ:(blob&&blob.type)||'Dokument',quelle:'Automatisch erzeugt'});
  }
  let wrappedPdf=false,wrappedBlob=false;
  function wrapExports(){
    if(!wrappedPdf&&typeof global.saveOrSharePdf==='function'){
      const original=global.saveOrSharePdf;
      global.saveOrSharePdf=function(doc,filename){archivePdfIfProject(doc,filename);return original.apply(this,arguments);};
      global.saveOrSharePdf.__projectDocumentsWrapped=true;wrappedPdf=true;
    }
    if(!wrappedBlob&&typeof global.saveOrShareBlob==='function'){
      const original=global.saveOrShareBlob;
      global.saveOrShareBlob=function(blob,filename){archiveBlobIfProject(blob,filename);return original.apply(this,arguments);};
      global.saveOrShareBlob.__projectDocumentsWrapped=true;wrappedBlob=true;
    }
    return wrappedPdf||wrappedBlob;
  }
  function enhanceDocumentsTab(){
    const active=activeProject();if(!active||active.state.tab!=='dokumente'||!global.document)return false;
    const body=global.document.getElementById('projektTabBody');if(!body)return false;
    const generated=(active.project.dokumente||[]).filter(doc=>doc&&doc.automatisch===true).length;
    let info=body.querySelector('[data-project-documents-info="1"]');
    if(!info){info=global.document.createElement('div');info.className='card projectDocumentsInfo';info.setAttribute('data-project-documents-info','1');body.insertBefore(info,body.firstChild);}
    info.innerHTML='<strong>Projektakte</strong><div class="pageSub">Projektbezogene PDFs und erzeugte Dokumente werden automatisch hier abgelegt. Automatisch archiviert: '+generated+'</div>';
    return true;
  }
  function enhance(){wrapExports();enhanceDocumentsTab();return true;}
  function install(){
    enhance();
    global.addEventListener?.('hashchange',()=>Promise.resolve().then(enhance));
    if(typeof global.MutationObserver==='function'&&global.document){const view=global.document.getElementById('view');if(view){const observer=new global.MutationObserver(()=>Promise.resolve().then(enhance));observer.observe(view,{childList:true,subtree:true});global.__projectDocumentsObserver=observer;}}
    return true;
  }
  return {parseProjectHash,projectById,archiveDataUrl,jsPdfDataUrl,blobToDataUrl,archivePdfIfProject,archiveBlobIfProject,wrapExports,enhanceDocumentsTab,enhance,install};
});
