// Phase 3B – Supabase-Datenzugriff für Aufgaben.
// NICHT in index.html eingebunden. Keine Laufzeitwirkung, solange der Pilot nicht explizit aktiviert wird.
// Sicherheit wird serverseitig durch RLS erzwungen; dieser Adapter ist nur Transport.

const TASK_PRIORITIES = new Set(["niedrig", "mittel", "hoch"]);
const TASK_STATUSES = new Set(["offen", "in Arbeit", "erledigt"]);
const TASK_MUTABLE_FIELDS = new Set([
  "titel",
  "beschreibung",
  "faellig",
  "prioritaet",
  "projektId",
  "zugeordnet",
  "status",
]);

function assertSupabase(client) {
  if (!client || typeof client.from !== "function") {
    throw new Error("TaskSupabaseRepository: kein gültiger Supabase-Client übergeben.");
  }
}

function unwrap(result, operation) {
  if (result && result.error) {
    const msg = result.error.message || String(result.error);
    throw new Error(`TaskSupabaseRepository ${operation}: ${msg}`);
  }
  return result ? result.data : null;
}

function normalizeRequiredTitle(value, operation) {
  const title = String(value == null ? "" : value).trim();
  if (!title) throw new Error(`TaskSupabaseRepository ${operation}: titel fehlt.`);
  return title;
}

function normalizePriority(value, operation) {
  const priority = value || "mittel";
  if (!TASK_PRIORITIES.has(priority)) {
    throw new Error(`TaskSupabaseRepository ${operation}: ungültige Priorität.`);
  }
  return priority;
}

function normalizeStatus(value, operation) {
  const status = value || "offen";
  if (!TASK_STATUSES.has(status)) {
    throw new Error(`TaskSupabaseRepository ${operation}: ungültiger Status.`);
  }
  return status;
}

function dbTaskToLegacy(task) {
  if (!task) return null;
  return {
    id: task.id,
    legacyId: task.legacy_id || null,
    titel: task.titel,
    beschreibung: task.beschreibung || "",
    faellig: task.faellig || "",
    prioritaet: task.prioritaet || "mittel",
    projektId: task.project_id || null,
    zugeordnet: task.zugeordnet_employee_id || null,
    status: task.status,
    deletedAt: task.deleted_at || null,
  };
}

function createTaskSupabaseRepository(client) {
  assertSupabase(client);

  return {
    async list() {
      const result = await client
        .from("tasks")
        .select("id,legacy_id,titel,beschreibung,faellig,prioritaet,project_id,zugeordnet_employee_id,status,deleted_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return (unwrap(result, "list") || []).map(dbTaskToLegacy);
    },

    async create(data) {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error("TaskSupabaseRepository create: ungültige Eingabe.");
      }
      const row = {
        titel: normalizeRequiredTitle(data.titel, "create"),
        beschreibung: data.beschreibung || null,
        faellig: data.faellig || null,
        prioritaet: normalizePriority(data.prioritaet, "create"),
        project_id: data.projektId || null,
        zugeordnet_employee_id: data.zugeordnet || null,
        status: normalizeStatus(data.status, "create"),
      };
      // company_id/created_by/updated_by/deleted_at werden absichtlich NICHT vom Client gesetzt.
      // Der SQL-Draft setzt bzw. schützt diese Felder serverseitig.
      const result = await client.from("tasks").insert(row).select().single();
      return dbTaskToLegacy(unwrap(result, "create"));
    },

    async update(id, changes) {
      if (!id) throw new Error("TaskSupabaseRepository update: id fehlt.");
      if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
        throw new Error("TaskSupabaseRepository update: ungültige Änderungen.");
      }

      const patch = {};
      for (const key of Object.keys(changes)) {
        if (!TASK_MUTABLE_FIELDS.has(key)) continue;
        if (key === "titel") patch.titel = normalizeRequiredTitle(changes.titel, "update");
        else if (key === "beschreibung") patch.beschreibung = changes.beschreibung || null;
        else if (key === "faellig") patch.faellig = changes.faellig || null;
        else if (key === "prioritaet") patch.prioritaet = normalizePriority(changes.prioritaet, "update");
        else if (key === "projektId") patch.project_id = changes.projektId || null;
        else if (key === "zugeordnet") patch.zugeordnet_employee_id = changes.zugeordnet || null;
        else if (key === "status") patch.status = normalizeStatus(changes.status, "update");
      }

      if (!Object.keys(patch).length) {
        throw new Error("TaskSupabaseRepository update: keine erlaubten Änderungen.");
      }

      const result = await client.from("tasks").update(patch).eq("id", id).select().single();
      return dbTaskToLegacy(unwrap(result, "update"));
    },

    async remove(id) {
      if (!id) throw new Error("TaskSupabaseRepository remove: id fehlt.");
      const result = await client
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      return dbTaskToLegacy(unwrap(result, "remove"));
    },

    async restore(id) {
      if (!id) throw new Error("TaskSupabaseRepository restore: id fehlt.");
      const result = await client
        .from("tasks")
        .update({ deleted_at: null })
        .eq("id", id)
        .select()
        .single();
      return dbTaskToLegacy(unwrap(result, "restore"));
    },
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { createTaskSupabaseRepository, dbTaskToLegacy };
}
if (typeof window !== "undefined") {
  window.createTaskSupabaseRepository = createTaskSupabaseRepository;
}
