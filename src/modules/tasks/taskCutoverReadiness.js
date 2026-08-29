// Phase 3C follow-up – pure, fail-closed cutover readiness assessment.
// This module performs no network, storage or runtime mutation. It cannot enable a cutover.

const REQUIRED_EVIDENCE = Object.freeze([
  'ciGreen',
  'readPathVerified',
  'createReadbackVerified',
  'statusPersistenceVerified',
  'softDeleteVerified',
  'legacyFallbackVerified',
]);

function assessTaskCutoverReadiness(input = {}) {
  const evidence = input && typeof input.evidence === 'object' && input.evidence ? input.evidence : {};
  const blockers = [];

  for (const key of REQUIRED_EVIDENCE) {
    if (evidence[key] !== true) blockers.push(`evidence:${key}`);
  }

  // Bundling unrelated/high-risk changes into the task cutover is prohibited.
  if (input.schemaMutationRequested === true) blockers.push('scope:schema-mutation-requested');
  if (input.realtimeCutoverRequested === true) blockers.push('scope:realtime-cutover-requested');
  if (input.passwordModuleChangeRequested === true) blockers.push('scope:password-module-change-requested');

  // A future production cutover must still receive a fresh, explicit approval.
  if (input.explicitCutoverApproval !== true) blockers.push('approval:explicit-cutover-approval-missing');

  return {
    ready: blockers.length === 0,
    blockers,
    evidence: REQUIRED_EVIDENCE.reduce((out, key) => {
      out[key] = evidence[key] === true;
      return out;
    }, {}),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { REQUIRED_EVIDENCE, assessTaskCutoverReadiness };
}
if (typeof window !== 'undefined') {
  window.TaskCutoverReadiness = { REQUIRED_EVIDENCE, assessTaskCutoverReadiness };
}
