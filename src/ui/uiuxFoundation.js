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
  const SECTION_PREFIX='uiux-section-';

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

  function syncSection(body,view,active){
    Array.from(body.classList).filter(name=>name.indexOf(SECTION_PREFIX)===0).forEach(name=>body.classList.remove(name));
    const key=active&&active.key?active.key:'';
    if(key) body.classList.add(SECTION_PREFIX+key);
    if(key) view.setAttribute('data-uiux-section',key);
    else view.removeAttribute('data-uiux-section');
    return key;
  }

  function decorateView(view){
    view.classList.add('uiuxViewEnhanced');
    view.querySelectorAll('.pageHead').forEach(head=>head.classList.add('uiuxPrimaryHead'));
    view.querySelectorAll('.pageHead .btn').forEach((button,index)=>{
      if(index===0) button.classList.add('uiuxPrimaryAction');
    });
    view.querySelectorAll('.card').forEach(card=>card.classList.add('uiuxCard'));
    view.querySelectorAll('.kpi').forEach(kpi=>kpi.classList.add('uiuxKpi'));
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
    wrap.setAttribute('aria-label','Verknüpfte Bereiche für '+active.label);
    wrap.setAttribute('data-uiux-source',active.key);
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
    const active=activeNavigation(items);
    syncSection(body,view,active);
    decorateView(view);

    const old=global.document.getElementById('uiuxContextLinks');
    if(old) old.remove();
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
      const navRoot=global.document.getElementById('sidebar')||global.document.body;
      if(navRoot&&typeof global.MutationObserver==='function'){
        const observer=new global.MutationObserver(records=>{
          if(records.some(record=>record.type==='attributes'&&record.attributeName==='class')) scheduleEnhance();
        });
        observer.observe(navRoot,{attributes:true,subtree:true,attributeFilter:['class']});
        global.__uiuxFoundationObserver=observer;
      }
    };
    if(global.document.readyState==='loading') global.document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
    return true;
  }

  return {RELATIONS,SECTION_PREFIX,normalizeLabel,relationsFor,navLabel,findNavigation,activeNavigation,syncAria,syncSection,decorateView,makeContextLinks,enhance,install};
});
