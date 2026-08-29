const { REQUIRED_EVIDENCE, assessTaskCutoverReadiness } = require('../src/modules/tasks/taskCutoverReadiness.js');

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { passed++; console.log('  OK  ' + message); }
  else { failed++; console.log('  FAIL ' + message); }
}

console.log('\n== Task cutover readiness ==');

let result = assessTaskCutoverReadiness();
assert(result.ready === false, 'fehlende Eingabe ist niemals cutover-ready');
assert(result.blockers.includes('approval:explicit-cutover-approval-missing'), 'ohne frische ausdrückliche Freigabe wird fail-closed blockiert');
for (const key of REQUIRED_EVIDENCE) {
  assert(result.blockers.includes('evidence:' + key), 'fehlender Nachweis ' + key + ' blockiert');
}

const verifiedEvidence = Object.fromEntries(REQUIRED_EVIDENCE.map((key) => [key, true]));
result = assessTaskCutoverReadiness({ evidence: verifiedEvidence });
assert(result.ready === false, 'vollständige technische Evidenz ersetzt keine ausdrückliche Cutover-Freigabe');
assert(result.blockers.length === 1 && result.blockers[0] === 'approval:explicit-cutover-approval-missing', 'bei kompletter Evidenz bleibt nur die Freigabe als Blocker');

result = assessTaskCutoverReadiness({
  evidence: verifiedEvidence,
  explicitCutoverApproval: true,
  schemaMutationRequested: true,
  realtimeCutoverRequested: true,
  passwordModuleChangeRequested: true,
});
assert(result.ready === false, 'gebündelte Hochrisiko-Änderungen blockieren auch mit Freigabe');
assert(result.blockers.includes('scope:schema-mutation-requested'), 'Schema-Mutation wird als separater Blocker behandelt');
assert(result.blockers.includes('scope:realtime-cutover-requested'), 'Realtime-Cutover wird als separater Blocker behandelt');
assert(result.blockers.includes('scope:password-module-change-requested'), 'Passwortmodul-Änderung wird als separater Blocker behandelt');

result = assessTaskCutoverReadiness({
  evidence: verifiedEvidence,
  explicitCutoverApproval: true,
});
assert(result.ready === true && result.blockers.length === 0, 'nur vollständige Evidenz plus explizite Freigabe ergibt einen Cutover-Kandidaten');
assert(REQUIRED_EVIDENCE.every((key) => result.evidence[key] === true), 'Ergebnis spiegelt alle geprüften Evidenzsignale nachvollziehbar');

const almost = { ...verifiedEvidence, softDeleteVerified: 'true' };
result = assessTaskCutoverReadiness({ evidence: almost, explicitCutoverApproval: true });
assert(result.ready === false && result.blockers.includes('evidence:softDeleteVerified'), 'nur exakte boolesche true-Werte zählen als Evidenz');

console.log(`\n${passed} Tests bestanden, ${failed} fehlgeschlagen.`);
process.exit(failed ? 1 : 0);
