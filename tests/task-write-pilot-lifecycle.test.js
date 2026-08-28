const { createTaskSupabaseRepository } = require('../src/modules/tasks/taskSupabaseRepository.js');

let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }

function createStatefulClient(){
  const rows=[];
  const calls=[];
  let seq=0;

  function from(table){
    calls.push(['from',table]);
    let mode='list';
    let insertRow=null;
    let patch=null;
    let eqId=null;
    let onlyActive=false;

    const q={
      select(cols){ calls.push(['select',cols]); return q; },
      is(col,value){ calls.push(['is',col,value]); if(col==='deleted_at' && value===null) onlyActive=true; return q; },
      order(col,opts){
        calls.push(['order',col,opts]);
        let data=rows.slice();
        if(onlyActive) data=data.filter(r=>r.deleted_at==null);
        return Promise.resolve({data,error:null});
      },
      insert(row){ mode='insert'; insertRow={...row}; calls.push(['insert',insertRow]); return q; },
      update(row){ mode='update'; patch={...row}; calls.push(['update',patch]); return q; },
      eq(col,value){ calls.push(['eq',col,value]); if(col==='id') eqId=value; return q; },
      single(){
        if(mode==='insert'){
          const row={
            id:'pilot-'+(++seq), legacy_id:null, created_at:new Date().toISOString(), deleted_at:null,
            beschreibung:null, faellig:null, prioritaet:'mittel', project_id:null,
            zugeordnet_employee_id:null, status:'offen', ...insertRow,
          };
          rows.unshift(row);
          return Promise.resolve({data:{...row},error:null});
        }
        if(mode==='update'){
          const row=rows.find(r=>r.id===eqId);
          if(!row) return Promise.resolve({data:null,error:{message:'not found'}});
          Object.assign(row,patch);
          return Promise.resolve({data:{...row},error:null});
        }
        return Promise.resolve({data:null,error:{message:'unsupported'}});
      },
    };
    return q;
  }

  return { client:{from}, rows, calls };
}

(async()=>{
  console.log('\n== Task WRITE pilot lifecycle dry-run ==');
  const fake=createStatefulClient();
  const repo=createTaskSupabaseRepository(fake.client);

  const before=await repo.list();
  assert(before.length===0,'Dry-run startet ohne aktive Pilot-Aufgabe');

  const created=await repo.create({
    titel:'PHASE3C WRITE PILOT TEST',
    beschreibung:'synthetischer CI-Datensatz',
    prioritaet:'mittel',
    status:'offen',
    projektId:null,
    zugeordnet:null,
  });
  assert(created && created.id && created.status==='offen','Create liefert eine aktive synthetische Aufgabe zurück');
  assert(created.projektId===null && created.zugeordnet===null,'Create hält optionale Referenzen im UI-Modell frei von UUID-Zwang');

  const working=await repo.update(created.id,{status:'in Arbeit'});
  assert(working.status==='in Arbeit','Statuswechsel offen → in Arbeit funktioniert über den Repository-Pfad');

  const done=await repo.update(created.id,{status:'erledigt'});
  assert(done.status==='erledigt','Statuswechsel in Arbeit → erledigt funktioniert über den Repository-Pfad');

  const removed=await repo.remove(created.id);
  assert(!!removed.deletedAt,'Soft Delete setzt deleted_at und liefert es als deletedAt zurück');
  assert(!fake.calls.some(c=>c[0]==='delete'),'Lifecycle enthält keinen Hard Delete');

  const afterReload=await repo.list();
  assert(afterReload.length===0,'Reload/list blendet die soft-gelöschte Pilot-Aufgabe aus');
  assert(fake.rows.length===1 && fake.rows[0].id===created.id,'Soft Delete erhält den Datensatz physisch im Store');

  const insert=fake.calls.find(c=>c[0]==='insert');
  assert(insert && !('company_id' in insert[1]) && !('created_by' in insert[1]),
    'Pilot-Create versucht keine serververwalteten Tenant-/Audit-Felder zu setzen');

  console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
