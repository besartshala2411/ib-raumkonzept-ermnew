// TaskRepository – Adapter zwischen UI und Datenquelle für Aufgaben.
//
// STATUS: NICHT VERBUNDEN. Diese Datei wird von index.html NICHT geladen (kein
// <script src>-Tag verweist darauf) und hat daher keinerlei Auswirkung auf die
// laufende Anwendung. Sie ist Teil der Phase-3A-Planung (siehe
// docs/architecture/phase3a-00-preflight-report.md, Abschnitt 9) und bereitet
// Phase 3B vor, wird aber erst dort tatsächlich in index.html eingebunden.
//
// TASKS_DATA_SOURCE (künftig in LC, dem lokalen Geräte-State, NICHT in S, damit
// das Flag nicht über Cloud-Sync verteilt wird) steuert die Datenquelle:
//   "legacy"   – liest/schreibt ausschließlich S.aufgaben (heutiges Verhalten, Default)
//   "supabase" – Platzhalter, wirft bewusst einen Fehler (Implementierung folgt in Phase 3B)

function createTaskRepository(getDataSource) {
  const legacyImpl = {
    list(state) {
      return state.aufgaben;
    },
    create(state, data) {
      const task = {
        id: uid(),
        titel: data.titel,
        beschreibung: data.beschreibung || "",
        faellig: data.faellig || "",
        prioritaet: data.prioritaet || "mittel",
        projektId: data.projektId || null,
        zugeordnet: data.zugeordnet || null,
        status: "offen",
      };
      state.aufgaben.push(task);
      return task;
    },
    update(state, id, changes) {
      const task = state.aufgaben.find((a) => a.id === id);
      if (!task) throw new Error("Aufgabe nicht gefunden: " + id);
      Object.assign(task, changes);
      return task;
    },
    // Spiegelt deleteItemWithUndo() 1:1: physisches Entfernen. Die Undo-Toast-UX
    // bleibt Aufgabe der aufrufenden UI-Schicht, nicht des Repositories.
    remove(state, id) {
      const idx = state.aufgaben.findIndex((a) => a.id === id);
      if (idx === -1) return null;
      const removed = state.aufgaben.splice(idx, 1)[0];
      return removed;
    },
  };

  const supabaseImpl = {
    list() {
      throw new Error("TaskRepository(supabase): list() ist noch nicht implementiert (Phase 3B).");
    },
    create() {
      throw new Error("TaskRepository(supabase): create() ist noch nicht implementiert (Phase 3B).");
    },
    update() {
      throw new Error("TaskRepository(supabase): update() ist noch nicht implementiert (Phase 3B).");
    },
    remove() {
      throw new Error("TaskRepository(supabase): remove() ist noch nicht implementiert (Phase 3B).");
    },
  };

  function impl() {
    return getDataSource() === "supabase" ? supabaseImpl : legacyImpl;
  }

  return {
    list(state) {
      return impl().list(state);
    },
    create(state, data) {
      return impl().create(state, data);
    },
    update(state, id, changes) {
      return impl().update(state, id, changes);
    },
    remove(state, id) {
      return impl().remove(state, id);
    },
  };
}

// Default-Instanz für den künftigen Einsatz in index.html (Phase 3B): liest das
// Flag aus LC, fällt ohne LC (z.B. in Tests) auf "legacy" zurück.
const TaskRepository = createTaskRepository(function () {
  return (typeof LC !== "undefined" && LC && LC.TASKS_DATA_SOURCE) || "legacy";
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createTaskRepository, TaskRepository };
}
if (typeof window !== "undefined") {
  window.createTaskRepository = createTaskRepository;
  window.TaskRepository = TaskRepository;
}
