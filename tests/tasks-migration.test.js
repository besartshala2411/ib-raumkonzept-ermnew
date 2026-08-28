// tasks-migration.test.js – Tests für die Phase-3A-Artefakte des Aufgaben-Piloten
// (TaskRepository, taskPermissions, validateTasks, migrateTasksDryRun).
//
// Alle Daten hier sind SYNTHETISCH (frei erfunden), NICHT aus einem echten
// Backup-Export. Die Struktur ist ausschließlich aus index.html abgeleitet
// (MODULE: AUFGABEN, siehe docs/architecture/phase3a-00-preflight-report.md,
// Abschnitt 3). Diese Datei ist separat von tests/smoke.test.js, da sie
// eigenständige Node-Tools testet, keine index.html-Boot-Simulation.
//
// Aufruf: node tests/tasks-migration.test.js  (auch über: npm run test:tasks-migration)

const { createTaskRepository } = require("../src/modules/tasks/taskRepository.js");
const { TASK_ROLE_PERMISSIONS, canPerformTaskAction } = require("../src/modules/tasks/taskPermissions.js");
const { validateTasks, STATUS_VALUES, PRIO_VALUES } = require("../tools/migration/validateTasks.js");
const { mapTask, dryRun } = require("../tools/migration/migrateTasksDryRun.js");

let failures = 0,
  passed = 0;
function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log("  OK  " + msg);
  } else {
    failures++;
    console.log("  FAIL " + msg);
  }
}

// Minimaler globaler uid()-Ersatz, wie in src/core/utils.js (Phase 1), damit
// legacyImpl.create() unabhängig von index.html lauffähig ist.
global.uid = function () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
};

function synthState() {
  return {
    aufgaben: [
      { id: "t1", titel: "Baustelle absperren", beschreibung: "", faellig: "2026-09-01", prioritaet: "hoch", projektId: "p1", zugeordnet: "m1", status: "offen" },
      { id: "t2", titel: "Material bestellen", beschreibung: "20x Dämmplatten", faellig: "", prioritaet: "mittel", projektId: "p1", zugeordnet: null, status: "in Arbeit" },
      { id: "t3", titel: "Abnahme vorbereiten", beschreibung: "", faellig: "2026-08-20", prioritaet: "niedrig", projektId: null, zugeordnet: "m2", status: "erledigt" },
    ],
  };
}

console.log("\n== Phase 3A: TaskRepository (legacy, Feature-Flag) ==");
{
  let flag = "legacy";
  const repo = createTaskRepository(() => flag);
  const state = synthState();

  assert(repo.list(state).length === 3, "list() liefert alle synthetischen Aufgaben");

  const created = repo.create(state, { titel: "Neue Aufgabe", projektId: "p1" });
  assert(state.aufgaben.length === 4, "create() fügt eine Aufgabe zum State hinzu");
  assert(created.status === "offen", "create() setzt status=offen wie saveAufgabe() im Ist-Zustand");
  assert(typeof created.id === "string" && created.id.length > 0, "create() vergibt eine id via uid()");

  const updated = repo.update(state, "t1", { status: "erledigt" });
  assert(updated.status === "erledigt", "update() ändert den Status wie setAufgabeStatus() im Ist-Zustand");

  const removed = repo.remove(state, "t2");
  assert(removed && removed.id === "t2", "remove() liefert das entfernte Element zurück");
  assert(state.aufgaben.length === 3, "remove() entfernt physisch aus dem Array (spiegelt deleteItemWithUndo-Splice)");

  let updateThrew = false;
  try {
    repo.update(state, "does-not-exist", {});
  } catch (e) {
    updateThrew = true;
  }
  assert(updateThrew, "update() wirft bei unbekannter id (kein stiller Fehlschlag)");

  flag = "supabase";
  let threw = false;
  try {
    repo.list(state);
  } catch (e) {
    threw = true;
  }
  assert(threw, "Feature-Flag 'supabase' wirft kontrolliert (Fallback: noch nicht implementiert, Phase 3B)");

  flag = "legacy";
  assert(repo.list(state).length === 3, "Zurückschalten des Flags auf 'legacy' funktioniert (Fallback-Pfad)");
}

console.log("\n== Phase 3A: taskPermissions (UI-Convenience, KEINE Sicherheitsgrenze) ==");
{
  assert(canPerformTaskAction("mitarbeiter", "tasks.view") === true, "mitarbeiter darf tasks.view (laut Rollen-Matrix)");
  assert(canPerformTaskAction("mitarbeiter", "tasks.delete") === false, "mitarbeiter darf NICHT tasks.delete");
  assert(canPerformTaskAction("bauleiter", "tasks.edit") === true, "bauleiter darf tasks.edit");
  assert(canPerformTaskAction("bauleiter", "tasks.delete") === false, "bauleiter darf NICHT tasks.delete (nur Geschäftsführer)");
  assert(canPerformTaskAction("geschaeftsfuehrer", "tasks.delete") === true, "geschaeftsfuehrer darf tasks.delete");
  assert(canPerformTaskAction("unbekannte-rolle", "tasks.view") === false, "unbekannte Rolle hat keine Rechte (sicherer Default)");
  assert(JSON.stringify(Object.keys(TASK_ROLE_PERMISSIONS).sort()) === JSON.stringify(["bauleiter", "geschaeftsfuehrer", "mitarbeiter"]), "Rollen-Matrix enthält genau die 3 bekannten Ist-Rollen");
}

console.log("\n== Phase 3A: validateTasks (Datenqualitäts-Validator) ==");
{
  const state = synthState();
  const clean = validateTasks(state.aufgaben, { projektIds: ["p1"], mitarbeiterIds: ["m1", "m2"] });
  assert(clean.total === 3, "validateTasks zählt korrekt (3 synthetische Aufgaben)");
  assert(clean.errors.length === 0, "saubere synthetische Daten erzeugen 0 Fehler");

  const withIssues = validateTasks(
    [
      { id: "t1", titel: "OK", status: "offen" },
      { id: "t1", titel: "Duplikat-ID", status: "offen" },
      { id: "", titel: "Fehlende ID", status: "offen" },
      { id: "t4", titel: "", status: "offen" },
      { id: "t5", titel: "Ungültiger Status", status: "irgendwas" },
      { id: "t6", titel: "Ungültige Priorität", status: "offen", prioritaet: "super-dringend" },
      { id: "t7", titel: "Ungültiges Datum", status: "offen", faellig: "nicht-parsebar-xyz" },
      { id: "t8", titel: "Unbekanntes Projekt", status: "offen", projektId: "p-existiert-nicht" },
      { id: "t9", titel: "Unbekannter Mitarbeiter", status: "offen", zugeordnet: "m-existiert-nicht" },
    ],
    { projektIds: ["p1"], mitarbeiterIds: ["m1"] }
  );
  assert(withIssues.errors.some((e) => e.includes("nicht eindeutig")), "erkennt doppelte id");
  assert(withIssues.errors.some((e) => e.includes("id fehlt")), "erkennt fehlende id");
  assert(withIssues.errors.some((e) => e.includes("titel fehlt")), "erkennt fehlenden titel");
  assert(withIssues.errors.some((e) => e.includes('status "irgendwas"')), "erkennt unbekannten status-Wert");
  assert(withIssues.errors.some((e) => e.includes("super-dringend")), "erkennt unbekannten prioritaet-Wert");
  assert(withIssues.errors.some((e) => e.includes("kein gültiges Datum")), "erkennt ungültiges faellig-Datum");
  assert(withIssues.errors.some((e) => e.includes("kein bekanntes Projekt")), "erkennt ungültige projektId-Referenz");
  assert(withIssues.errors.some((e) => e.includes("keinen bekannten Mitarbeiter")), "erkennt ungültige zugeordnet-Referenz");

  const noRefLists = validateTasks(state.aufgaben);
  assert(noRefLists.warnings.length === 2, "ohne Referenzlisten werden 2 Warnungen ausgegeben (keine Referenzprüfung möglich)");

  assert(JSON.stringify(STATUS_VALUES) === JSON.stringify(["offen", "in Arbeit", "erledigt"]), "STATUS_VALUES entspricht exakt dem Ist-Zustand (Leerzeichen+Großschreibung in 'in Arbeit')");
  assert(JSON.stringify(PRIO_VALUES) === JSON.stringify(["niedrig", "mittel", "hoch"]), "PRIO_VALUES entspricht exakt dem Ist-Zustand");
}

console.log("\n== Phase 3A: migrateTasksDryRun (Mapping) ==");
{
  const mapped = mapTask({ id: "t1", titel: "Baustelle absperren", beschreibung: "", faellig: "2026-09-01", prioritaet: "hoch", projektId: "p1", zugeordnet: "m1", status: "offen" }, "company-fixed-uuid");
  assert(mapped.legacy_id === "t1", "mapTask() übernimmt die alte id als legacy_id");
  assert(mapped.company_id === "company-fixed-uuid", "mapTask() setzt die übergebene company_id");
  assert(mapped.titel === "Baustelle absperren", "mapTask() übernimmt titel unverändert");
  assert(mapped.status === "offen", "mapTask() übernimmt status als Ist-Wert (keine Normalisierung)");
  assert(mapped.created_at === null, "mapTask() erfindet KEIN historisches created_at (Ist-Daten haben keins)");
  assert(mapped.project_id === null && mapped.zugeordnet_employee_id === null, "mapTask() löst Referenzen in Phase 3A bewusst nicht auf (kein echter projects/employees-Datenbestand verfügbar)");
}

console.log("\n== Phase 3A: migrateTasksDryRun (Dry-Run, Fehlerfälle, Idempotenz) ==");
{
  const state = synthState();
  const ok = dryRun(state.aufgaben, "company-fixed-uuid");
  assert(ok.counts.total === 3 && ok.counts.ok === 3 && ok.counts.failed === 0, "Dry-Run transformiert alle 3 sauberen synthetischen Aufgaben fehlerfrei");
  assert(ok.preview.every((p) => p.id === null), "Dry-Run vergibt KEINE neue id (das bleibt Postgres in Phase 3B vorbehalten) - reine Vorschau, kein Schreibzugriff");

  const noCompany = dryRun(state.aufgaben, null);
  assert(noCompany.errors.some((e) => e.includes("company-id")), "Dry-Run ohne --company-id bricht mit klarer Fehlermeldung ab, statt zu raten");

  const missingLegacyId = dryRun([{ titel: "Ohne ID", status: "offen" }], "company-fixed-uuid");
  assert(missingLegacyId.counts.failed === 1, "Aufgabe ohne id wird als Fehler markiert (nicht idempotent migrierbar)");

  const duplicateLegacyId = dryRun(
    [
      { id: "dup1", titel: "Erste", status: "offen" },
      { id: "dup1", titel: "Zweite (gleiche legacy id)", status: "offen" },
    ],
    "company-fixed-uuid"
  );
  assert(duplicateLegacyId.errors.some((e) => e.includes('legacy_id "dup1"') && e.includes("mehrfach")), "Idempotenz-Vorschau erkennt doppelte legacy_id innerhalb der Quelle");
}

console.log(`\n=================================\n${passed} Tests bestanden, ${failures} fehlgeschlagen.\n=================================`);
process.exit(failures > 0 ? 1 : 0);
