#!/usr/bin/env node
// migrateTasksDryRun.js – DRY-RUN-Migrationsvorschau S.aufgaben -> tasks (Phase 3A).
//
// Diese Datei kann AUSSCHLIESSLICH lesen, transformieren und anzeigen. Es gibt
// keinen Schreibpfad gegen Supabase - dieser wird erst in Phase 3B nach
// ausdrücklicher Freigabe implementiert (siehe
// docs/architecture/phase3a-00-preflight-report.md, Abschnitt 11). Die
// --apply-Option existiert nur, um das Fehlen dieser Fähigkeit kontrolliert und
// unmissverständlich zu machen - sie bricht immer ab.
//
// Nutzung:
//   node tools/migration/migrateTasksDryRun.js <aufgaben.json> --company-id <uuid>
//
// aufgaben.json: JSON-Array, NUR S.aufgaben (siehe validateTasks.js für die
// Warnung zu exportBackupJSON()).

const fs = require("fs");

// Bildet eine Ist-Aufgabe auf die DRAFT-Zielspalten von tasks ab (siehe
// supabase/migrations-draft/002_pilot_tasks_v2_DRAFT.sql). project_id und
// zugeordnet_employee_id werden in Phase 3A bewusst NICHT aufgelöst (kein Zugriff
// auf echte projects/employees-Zeilen) - Phase 3B löst das per legacy_id-Lookup.
function mapTask(legacyTask, companyId) {
  return {
    id: null, // von Postgres via gen_random_uuid() vergeben
    legacy_id: legacyTask.id,
    company_id: companyId,
    project_id: null,
    titel: legacyTask.titel,
    beschreibung: legacyTask.beschreibung || null,
    faellig: legacyTask.faellig || null,
    prioritaet: legacyTask.prioritaet || null,
    zugeordnet_employee_id: null,
    status: legacyTask.status,
    created_by: null, // in Ist-Daten nicht vorhanden - bleibt NULL für migrierte Zeilen
    created_at: null, // wird beim eigentlichen INSERT auf den Migrationszeitpunkt gesetzt - KEIN echtes historisches Datum
    updated_at: null,
    deleted_at: null,
    _sourceRef: { projektId: legacyTask.projektId || null, zugeordnet: legacyTask.zugeordnet || null },
  };
}

function dryRun(tasks, companyId) {
  const preview = [];
  const errors = [];

  if (!companyId) {
    errors.push("Kein --company-id angegeben (siehe Report Abschnitt 6, company_id-Strategie).");
    return { preview, errors, counts: { total: Array.isArray(tasks) ? tasks.length : 0, ok: 0, failed: Array.isArray(tasks) ? tasks.length : 1 } };
  }

  tasks.forEach((t, idx) => {
    try {
      if (!t.id) throw new Error("legacy id fehlt - Zeile kann nicht idempotent migriert werden (siehe legacy_id UNIQUE-Konzept).");
      preview.push(mapTask(t, companyId));
    } catch (e) {
      errors.push(`#${idx}: ${e.message}`);
    }
  });

  // Idempotenz-Vorschau: legacy_id muss innerhalb des Laufs eindeutig sein.
  const legacyIds = preview.map((p) => p.legacy_id);
  const dupes = legacyIds.filter((id, i) => legacyIds.indexOf(id) !== i);
  [...new Set(dupes)].forEach((id) => errors.push(`legacy_id "${id}" kommt mehrfach in der Quelle vor - würde beim Re-Import nicht eindeutig zugeordnet werden können.`));

  return { preview, errors, counts: { total: tasks.length, ok: preview.length, failed: errors.length } };
}

function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  const companyIdx = args.indexOf("--company-id");
  const companyId = companyIdx !== -1 ? args[companyIdx + 1] : null;
  const apply = args.includes("--apply");

  if (!file) {
    console.error("Nutzung: node migrateTasksDryRun.js <aufgaben.json> --company-id <uuid>");
    process.exit(1);
  }

  if (apply) {
    console.error("ABBRUCH: --apply ist in Phase 3A absichtlich NICHT implementiert.");
    console.error("Ein echter Schreibpfad gegen Supabase erfordert eine gesonderte Freigabe (Phase 3B).");
    process.exit(2);
  }

  const tasks = JSON.parse(fs.readFileSync(file, "utf8"));
  const result = dryRun(tasks, companyId);

  console.log(`Gesamt: ${result.counts.total}, transformierbar: ${result.counts.ok}, fehlerhaft: ${result.counts.failed}`);
  if (result.errors.length) {
    console.log("Fehler:");
    result.errors.forEach((e) => console.log("  - " + e));
  }
  console.log("Beispiel-Transformation (max. 3):");
  result.preview.slice(0, 3).forEach((p) => console.log(JSON.stringify(p, null, 2)));

  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { mapTask, dryRun };
