// taskPermissions.js – rein clientseitige UI-Convenience-Funktion. Spiegelt die
// role_permissions-Seed-Daten aus dem SQL-DRAFT (siehe
// supabase/migrations-draft/002_pilot_tasks_v2_DRAFT.sql), damit UI und
// zukünftige RLS-Policies nicht auseinanderlaufen.
//
// WICHTIG (siehe docs/architecture/phase3a-00-preflight-report.md, Abschnitt 8):
// Dies ist AUSSCHLIESSLICH zur UI-Steuerung gedacht (z.B. einen Button
// ausblenden). Es ist KEINE Sicherheitsgrenze. Die einzige echte Durchsetzung
// ist serverseitiges RLS in Postgres. Ein manipulierter Client darf sich
// niemals auf diese Funktion verlassen können - Supabase muss jede Anfrage
// unabhängig über RLS prüfen, unabhängig davon, was diese Funktion zurückgibt.
//
// STATUS: NICHT VERBUNDEN. Wird von index.html nicht geladen (Phase 3A-Artefakt).

const TASK_ROLE_PERMISSIONS = {
  mitarbeiter: ["tasks.view"],
  bauleiter: ["tasks.view", "tasks.create", "tasks.edit"],
  geschaeftsfuehrer: ["tasks.view", "tasks.create", "tasks.edit", "tasks.delete"],
};

function canPerformTaskAction(role, action) {
  const perms = TASK_ROLE_PERMISSIONS[role];
  return !!perms && perms.includes(action);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TASK_ROLE_PERMISSIONS, canPerformTaskAction };
}
if (typeof window !== "undefined") {
  window.TASK_ROLE_PERMISSIONS = TASK_ROLE_PERMISSIONS;
  window.canPerformTaskAction = canPerformTaskAction;
}
