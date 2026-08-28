// Phase 3B – Supabase-Datenzugriff für Aufgaben.
// NICHT in index.html eingebunden. Keine Laufzeitwirkung, solange der Pilot nicht explizit aktiviert wird.
// Sicherheit wird serverseitig durch RLS erzwungen; dieser Adapter ist nur Transport.

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
      if (!data || !String(data.titel || "").trim()) {
        throw new Error("TaskSupabaseRepository create: titel fehlt.");
      }
      const row = {
        titel: String(data.titel).trim(),
        beschreibung: data.beschreibung || null,
        faellig: data.faellig || null,
        prioritaet: data.prioritaet || "mittel",
        project_id: data.projektId || null,
        zugeordnet_employee_id: data.zugeordnet || null,
        status: data.status || "offen",
      };
      // company_id/created_by werden absichtlich NICHT vom Client gesetzt.
      // Der finale SQL-Draft setzt sie serverseitig aus auth.uid().
      const result = await client.from("tasks").insert(row).select().single();
      return dbTaskToLegacy(unwrap(result, "create"));
    },

    async update(id, changes) {
      if (!id) throw new Error("TaskSupabaseRepository update: id fehlt.");
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(changes, "titel")) patch.titel = changes.titel;
      if (Object.prototype.hasOwnProperty.call(changes, "beschreibung")) patch.beschreibung = changes.beschreibung || null;
      if (Object.prototype.hasOwnProperty.call(changes, "faellig")) patch.faellig = changes.faellig || null;
      if (Object.prototype.hasOwnProperty.call(changes, "prioritaet")) patch.prioritaet = changes.prioritaet || null;
      if (Object.prototype.hasOwnProperty.call(changes, "projektId")) patch.project_id = changes.projektId || null;
      if (Object.prototype.hasOwnProperty.call(changes, "zugeordnet")) patch.zugeordnet_employee_id = changes.zugeordnet || null;
      if (Object.prototype.hasOwnProperty.call(changes, "status")) patch.status = changes.status;
      delete patch.company_id;
      delete patch.created_by;
      delete patch.updated_by;
      delete patch.deleted_at;
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
