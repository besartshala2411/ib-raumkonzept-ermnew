(function(root,factory){
  const api=factory(root||globalThis);
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.UIUXFoundation=api;
  if(root&&root.document) api.install();
})(typeof window!=='undefined'?window:globalThis,function(global){
  'use strict';

  const RELATIONS={
    aufgaben:['Projekte','Mitarbeiter','Kalender'],
    projekte:['Aufgaben','Kunden','Zeiterfassung'],
    kunden:['Projekte','Rechnungen','Aufgaben'],
    mitarbeiter:['Aufgaben','Zeiterfassung','Urlaub'],
    kalender:['Aufgaben','Projekte','Mitarbeiter'],
    zeiterfassung:['Projekte','Mitarbeiter','Aufgaben'],
    rechnungen:['Kunden','Projekte'],
    urlaub:['Mitarbeiter','Kalender'],
    dashboard:['Projekte','Aufgaben','Kalender']
  };

  function normalizeLabel(value){
    return String(value||'')
      .toLocaleLowerCase('de-DE')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'')
      .trim();
  }

  function relationsFor(label){
    return (RELATIONS[normalizeLabel(label)]||[]).slice();
  }

  function navLabel(el){
    if(!el) return '';
    const clone=el.cloneNode(true);
    clone.querySelectorAll('.navIcon,.navBadge').forEach(node=>node.remove());
    return String(clone.textContent||'').replace(/\s+/g,' ').trim();
  }

  function findNavigation(){
    if(!global.document) return [];
    return Array.from(global.document.querySelectorAll('.navItem')).map(el=>({
      el,
      label:navLabel(el),
      key:normalizeLabel(navLabel(el))
    })).filter(item=>item.key);
  }

  function activeNavigation(items){
    return items.find(item=>item.el.classList.contains('active')||item.el.getAttribute('aria-current')==='page')||null;
  }

  function syncAria(items){
    items.forEach(item=>{
      if(item.el.classList.contains('active')) item.el.setAttribute('aria-current','page');
      else item.el.removeAttribute('aria-current');
    });
  }

  function makeContextLinks(items,active){
    const doc=global.document;
    if(!doc||!active) return null;
    const wanted=relationsFor(active.label);
    const targets=wanted.map(label=>{
      const key=normalizeLabel(label);
      return items.find(item=>item.key===key)||null;
    }).filter(Boolean);
    if(!targets.length) return null;

    const wrap=doc.createElement('nav');
    wrap.id='uiuxContextLinks';
    wrap.setAttribute('aria-label','Verknüpfte Bereiche');
    const caption=doc.createElement('span');
    caption.className='uiuxContextLabel';
    caption.textContent='Verknüpft';
    wrap.appendChild(caption);

    targets.forEach(target=>{
      const button=doc.createElement('button');
      button.type='button';
      button.className='uiuxContextChip';
      button.textContent=target.label;
      button.setAttribute('aria-label','Zu '+target.label+' wechseln');
      button.addEventListener('click',()=>{
        if(target.el&&typeof target.el.click==='function') target.el.click();
      });
      wrap.appendChild(button);
    });
    return wrap;
  }

  let scheduled=false;
  function enhance(){
    if(!global.document) return false;
    const body=global.document.body;
    const view=global.document.getElementById('view');
    if(!body||!view) return false;
    body.classList.add('uiux-foundation');

    const items=findNavigation();
    syncAria(items);
    const old=global.document.getElementById('uiuxContextLinks');
    if(old) old.remove();
    const active=activeNavigation(items);
    const links=makeContextLinks(items,active);
    if(links) view.insertBefore(links,view.firstChild);
    return true;
  }

  function scheduleEnhance(){
    if(scheduled) return;
    scheduled=true;
    const run=()=>{scheduled=false;enhance();};
    if(typeof global.requestAnimationFrame==='function') global.requestAnimationFrame(run);
    else setTimeout(run,0);
  }

  function loadStyles(){
    if(!global.document||global.document.getElementById('uiuxFoundationStyles')) return;
    const link=global.document.createElement('link');
    link.id='uiuxFoundationStyles';
    link.rel='stylesheet';
    link.href='./src/ui/uiuxFoundation.css';
    global.document.head.appendChild(link);
  }

  function install(){
    if(!global.document) return false;
    loadStyles();
    const start=()=>{
      enhance();
      global.addEventListener&&global.addEventListener('hashchange',scheduleEnhance);
      const view=global.document.getElementById('view');
      if(view&&typeof global.MutationObserver==='function'){
        const observer=new global.MutationObserver(scheduleEnhance);
        observer.observe(view,{childList:true,subtree:false});
        global.__uiuxFoundationObserver=observer;
      }
    };
    if(global.document.readyState==='loading') global.document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
    return true;
  }

  return {RELATIONS,normalizeLabel,relationsFor,navLabel,findNavigation,activeNavigation,syncAria,makeContextLinks,enhance,install};
});
