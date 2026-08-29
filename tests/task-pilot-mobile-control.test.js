let passed=0, failed=0;
function assert(cond,msg){ if(cond){passed++;console.log('  OK  '+msg);}else{failed++;console.log('  FAIL '+msg);} }

function createStorage(initial={}){
  const data={...initial};
  return {
    data,
    getItem(k){return Object.prototype.hasOwnProperty.call(data,k)?data[k]:null;},
    setItem(k,v){data[k]=String(v);},
    removeItem(k){delete data[k];},
  };
}

console.log('\n== Task pilot mobile controls ==');
const local=createStorage();
const session=createStorage();
global.localStorage=local;
global.sessionStorage=session;
delete require.cache[require.resolve('../src/core/utils.js')];
require('../src/core/utils.js');
const control=global.TaskPilotMobileControl;

assert(!!control,'Mobile-Pilot-Steuerung ist verfügbar, ohne den Pilot automatisch zu aktivieren');
assert(control.controlRequested('?ibTaskPilotControl=1')===true,'exakter URL-Control-Parameter zeigt die mobile Steuerung an');
assert(control.controlRequested('?ibTaskPilotControl=true')===false && control.controlRequested('?IBTASKPILOTCONTROL=1')===false,'nur exakter Control-Parameterwert aktiviert die Sichtbarkeit');
assert(local.getItem(control.READ_FLAG)===null && session.getItem(control.WRITE_FLAG)===null,'bloßes Laden setzt keinerlei Pilot-Flags');
assert(control.getState().active===false && control.getState().read===false && control.getState().write===false,'Status ist ohne Flags eindeutig AUS');

let result=control.enable();
assert(result.ok===true,'mobile Aktivierung setzt beide benötigten Flags erfolgreich');
assert(local.getItem(control.READ_FLAG)==='1','READ-Flag wird origin-weit in localStorage gesetzt');
assert(session.getItem(control.WRITE_FLAG)==='1','WRITE-Flag wird ausschließlich tab-lokal in sessionStorage gesetzt');
assert(local.getItem(control.WRITE_FLAG)===null,'WRITE-Flag wird niemals in localStorage gespiegelt');
assert(control.getState().active===true && control.getState().read===true && control.getState().write===true,'Status erkennt persistierte READ+WRITE-Flags nach Aktivierung als AKTIV');

const sameTabReloadState=control.getState();
assert(sameTabReloadState.active===true,'ein erneutes Auslesen im selben Tab erkennt die gesetzten Flags weiterhin als aktiv');

session.removeItem(control.WRITE_FLAG);
let state=control.getState();
assert(state.read===true && state.write===false && state.active===false,'READ ohne tab-lokales WRITE wird als READ-only erkannt');
session.setItem(control.WRITE_FLAG,'1');

result=control.disable();
assert(result.ok===true && local.getItem(control.READ_FLAG)===null && session.getItem(control.WRITE_FLAG)===null,'Deaktivierung entfernt READ und WRITE vollständig');
assert(control.getState().active===false,'Status ist nach Deaktivierung wieder AUS');

const failingSession={
  getItem(){return null;},
  setItem(){throw new Error('session blocked');},
  removeItem(){},
};
global.sessionStorage=failingSession;
result=control.enable();
assert(result.ok===false,'gesperrtes sessionStorage lässt mobile Aktivierung fail-closed scheitern');
assert(local.getItem(control.READ_FLAG)===null,'fehlgeschlagene WRITE-Aktivierung rollt ein bereits gesetztes READ-Flag zurück');
assert(control.getState().active===false,'fehlgeschlagene Aktivierung kann nie als AKTIV erscheinen');

Object.defineProperty(global,'sessionStorage',{configurable:true,get(){throw new Error('getter blocked');}});
result=control.enable();
assert(result.ok===false,'werfender sessionStorage-Property-Zugriff bleibt fail-closed');
assert(local.getItem(control.READ_FLAG)===null,'auch beim werfenden Property-Zugriff bleibt READ nach Rollback aus');
assert(control.getState().active===false,'werfender Storage-Zugriff bleibt im Status fail-closed');

Object.defineProperty(global,'sessionStorage',{configurable:true,writable:true,value:session});
console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed?1:0);
