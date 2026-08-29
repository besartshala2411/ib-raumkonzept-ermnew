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
    stundenzettel:['Projekte','Mitarbeiter','Aufgaben'],
    rechnungen:['Kunden','Projekte'],
    urlaub:['Mitarbeiter','Kalender'],
    dashboard:['Projekte','Aufgaben','Kalender']
  };

  const PRIMARY_NAV_KEYS=new Set([
    'dashboard','kunden','projekte','aufgaben','kalender','mitarbeiter','stundenzettel','rechnungen'
  ]);

  const SECTION_CLASSES=[
    'uiux-section-dashboard','uiux-section-aufgaben','uiux-section-projekte','uiux-section-kunden',
    'uiux-section-mitarbeiter','uiux-section-kalender','uiux-section-zeiterfassung','uiux-section-stundenzettel',
    'uiux-section-rechnungen','uiux-section-urlaub'
  ];

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

  function applySection(body,active){
    if(!body) return '';
    SECTION_CLASSES.forEach(name=>body.classList.remove(name));
    const key=active?normalizeLabel(active.label):'';
    if(key&&RELATIONS[key]) body.classList.add('uiux-section-'+key);
    if(key) body.setAttribute('data-uiux-section',key);
    else body.removeAttribute('data-uiux-section');
    return key;
  }

  function decorateView(view){
    if(!view) return;
    Array.from(view.querySelectorAll('.card')).forEach(card=>card.classList.add('uiuxCard'));
    Array.from(view.querySelectorAll('.kpi')).forEach(kpi=>kpi.classList.add('uiuxKpi'));
    Array.from(view.querySelectorAll('.quickTile')).forEach(tile=>tile.classList.add('uiuxQuickTile'));
    Array.from(view.querySelectorAll('.pageHead')).forEach(head=>{
      head.classList.add('uiuxPrimaryHead');
      const directButtons=Array.from(head.querySelectorAll('.btn'));
      if(directButtons.length) directButtons[directButtons.length-1].classList.add('uiuxPrimaryAction');
    });
    Array.from(view.querySelectorAll('.tableWrap')).forEach(table=>{
      table.setAttribute('tabindex','0');
      if(!table.getAttribute('aria-label')) table.setAttribute('aria-label','Tabelle horizontal scrollen');
    });
  }

  function isPrimaryNavigation(item){
    return !!(item&&PRIMARY_NAV_KEYS.has(item.key));
  }

  function ensureNavigationToggle(sidebar,items,active){
    if(!sidebar||!global.document) return null;
    const secondary=items.filter(item=>!isPrimaryNavigation(item));
    items.forEach(item=>{
      item.el.classList.toggle('uiuxNavPrimary',isPrimaryNavigation(item));
      item.el.classList.toggle('uiuxNavSecondary',!isPrimaryNavigation(item));
    });

    let toggle=global.document.getElementById('uiuxMoreNavToggle');
    if(!secondary.length){
      if(toggle) toggle.remove();
      sidebar.classList.remove('uiuxNavExpanded');
      return null;
    }

    if(!toggle){
      toggle=global.document.createElement('button');
      toggle.id='uiuxMoreNavToggle';
      toggle.type='button';
      toggle.className='uiuxMoreNavToggle';
      toggle.addEventListener('click',()=>{
        sidebar.classList.toggle('uiuxNavExpanded');
        syncNavigationToggle(sidebar,toggle,secondary.length);
      });
      sidebar.appendChild(toggle);
    }

    if(active&&!isPrimaryNavigation(active)) sidebar.classList.add('uiuxNavExpanded');
    syncNavigationToggle(sidebar,toggle,secondary.length);
    return toggle;
  }

  function syncNavigationToggle(sidebar,toggle,count){
    if(!sidebar||!toggle) return;
    const expanded=sidebar.classList.contains('uiuxNavExpanded');
    toggle.setAttribute('aria-expanded',expanded?'true':'false');
    toggle.setAttribute('aria-controls','sidebar');
    toggle.textContent=expanded?'Weniger anzeigen':'Weitere Bereiche ('+count+')';
  }

  function contextTargets(items,active){
    if(!active) return [];
    return relationsFor(active.label).map(label=>{
      const key=normalizeLabel(label);
      return items.find(item=>item.key===key)||null;
    }).filter(Boolean);
  }

  function contextSignature(items,active){
    const source=active?normalizeLabel(active.label):'';
    const targets=contextTargets(items,active).map(item=>item.key).join('|');
    return source+'>'+targets;
  }

  function makeContextLinks(items,active){
    const doc=global.document;
    if(!doc||!active) return null;
    const targets=contextTargets(items,active);
    if(!targets.length) return null;

    const wrap=doc.createElement('nav');
    wrap.id='uiuxContextLinks';
    wrap.setAttribute('aria-label','Verknüpfte Bereiche');
    wrap.setAttribute('data-uiux-signature',contextSignature(items,active));
    const caption=doc.createElement('span');
    caption.className='uiuxContextLabel';
    caption.textContent='Schnell wechseln';
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

  function shouldRefreshForViewMutations(records){
    return Array.from(records||[]).some(record=>{
      if(record.type!=='childList') return false;
      const changed=[...Array.from(record.addedNodes||[]),...Array.from(record.removedNodes||[])];
      if(!changed.length) return false;
      return changed.some(node=>!(node&&node.nodeType===1&&node.id==='uiuxContextLinks'));
    });
  }

  let scheduled=false;
  function enhance(){
    if(!global.document) return false;
    const body=global.document.body;
    const view=global.document.getElementById('view');
    const sidebar=global.document.getElementById('sidebar');
    if(!body||!view) return false;
    body.classList.add('uiux-foundation');

    const items=findNavigation();
    syncAria(items);
    const active=activeNavigation(items);
    applySection(body,active);
    decorateView(view);
    ensureNavigationToggle(sidebar,items,active);

    const old=global.document.getElementById('uiuxContextLinks');
    const signature=contextSignature(items,active);
    if(old&&old.getAttribute('data-uiux-signature')===signature) return true;
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
      if(global.addEventListener) global.addEventListener('hashchange',scheduleEnhance);

      const sidebar=global.document.getElementById('sidebar');
      if(sidebar&&typeof sidebar.addEventListener==='function'){
        sidebar.addEventListener('click',event=>{
          const target=event&&event.target&&typeof event.target.closest==='function'?event.target.closest('.navItem'):null;
          if(target) scheduleEnhance();
        });
      }

      const observers=[];
      if(typeof global.MutationObserver==='function'){
        if(sidebar){
          const navObserver=new global.MutationObserver(records=>{
            if(records.some(record=>record.type==='attributes'&&record.attributeName==='class')) scheduleEnhance();
          });
          navObserver.observe(sidebar,{attributes:true,subtree:true,attributeFilter:['class']});
          observers.push(navObserver);
        }
        const view=global.document.getElementById('view');
        if(view){
          const viewObserver=new global.MutationObserver(records=>{
            if(shouldRefreshForViewMutations(records)) scheduleEnhance();
          });
          viewObserver.observe(view,{childList:true,subtree:true});
          observers.push(viewObserver);
        }
      }
      global.__uiuxFoundationObserver={disconnect(){observers.forEach(observer=>observer.disconnect());}};
    };
    if(global.document.readyState==='loading') global.document.addEventListener('DOMContentLoaded',start,{once:true});
    else start();
    return true;
  }

  return {RELATIONS,PRIMARY_NAV_KEYS,SECTION_CLASSES,normalizeLabel,relationsFor,navLabel,findNavigation,activeNavigation,syncAria,applySection,decorateView,isPrimaryNavigation,ensureNavigationToggle,syncNavigationToggle,contextTargets,contextSignature,makeContextLinks,shouldRefreshForViewMutations,enhance,install};
});
