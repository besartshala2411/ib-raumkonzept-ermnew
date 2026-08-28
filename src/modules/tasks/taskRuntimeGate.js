// Phase 3C – Runtime-Gate für einen kontrollierten Aufgaben-Cutover.
// Default ist OFF. Unvollständige oder mehrdeutige Referenzauflösung fällt
// geschlossen auf den Legacy-Pfad zurück.

const TASK_RUNTIME_FLAG = 'IB_TASKS_SUPABASE_PILOT';

function isTaskSupabasePilotEnabled(storage) {
  try {
    return !!storage && storage.getItem(TASK_RUNTIME_FLAG) === '1';
  } catch (_) {
    return false;
  }
}

function createTaskReferenceMapper({ projects = [], employees = [] } = {}) {
  const projectLegacyToUuid = new Map();
  const projectUuidToLegacy = new Map();
  const employeeLegacyToUuid = new Map();
  const employeeUuidToLegacy = new Map();
  const errors = [];

  function addPair(kind, legacyId, uuid, forward, reverse) {
    if (!legacyId || !uuid) return;
    if (forward.has(legacyId) && forward.get(legacyId) !== uuid) {
      errors.push(`${kind}: Legacy-ID ${legacyId} ist mehrfach gemappt.`);
      return;
    }
    if (reverse.has(uuid) && reverse.get(uuid) !== legacyId) {
      errors.push(`${kind}: UUID ${uuid} ist mehrfach gemappt.`);
      return;
    }
    forward.set(legacyId, uuid);
    reverse.set(uuid, legacyId);
  }

  for (const p of projects) addPair('Projekt', p && p.legacy_id, p && p.id, projectLegacyToUuid, projectUuidToLegacy);
  for (const e of employees) addPair('Mitarbeiter', e && e.legacy_id, e && e.id, employeeLegacyToUuid, employeeUuidToLegacy);

  function requireMapped(value, map, label) {
    if (!value) return null;
    const mapped = map.get(value);
    if (!mapped) throw new Error(`TaskReferenceMapper: ${label} ${value} ist nicht gemappt.`);
    return mapped;
  }

  return {
    ok: errors.length === 0,
    errors,
    hasProjectLegacyId(value) { return !value || projectLegacyToUuid.has(value); },
    hasEmployeeLegacyId(value) { return !value || employeeLegacyToUuid.has(value); },
    toDbTask(task) {
      if (!this.ok) throw new Error('TaskReferenceMapper: Mapping ist nicht eindeutig.');
      return {
        ...task,
        projektId: requireMapped(task && task.projektId, projectLegacyToUuid, 'Projekt-Legacy-ID'),
        zugeordnet: requireMapped(task && task.zugeordnet, employeeLegacyToUuid, 'Mitarbeiter-Legacy-ID'),
      };
    },
    toLegacyTask(task) {
      if (!this.ok) throw new Error('TaskReferenceMapper: Mapping ist nicht eindeutig.');
      return {
        ...task,
        projektId: requireMapped(task && task.projektId, projectUuidToLegacy, 'Projekt-UUID'),
        zugeordnet: requireMapped(task && task.zugeordnet, employeeUuidToLegacy, 'Mitarbeiter-UUID'),
      };
    },
  };
}

function validateLegacyTaskCoverage(legacyTasks, mapper) {
  const errors = [];
  for (const task of Array.isArray(legacyTasks) ? legacyTasks : []) {
    if (task && task.projektId && !mapper.hasProjectLegacyId(task.projektId)) {
      errors.push(`Aufgabe ${task.id || '(ohne ID)'}: Projekt ${task.projektId} ist nicht relational gemappt.`);
    }
    if (task && task.zugeordnet && !mapper.hasEmployeeLegacyId(task.zugeordnet)) {
      errors.push(`Aufgabe ${task.id || '(ohne ID)'}: Mitarbeiter ${task.zugeordnet} ist nicht relational gemappt.`);
    }
  }
  return errors;
}

async function prepareTaskSupabaseRuntime({ storage, client, createRepository, legacyTasks = [] } = {}) {
  if (!isTaskSupabasePilotEnabled(storage)) {
    return { mode: 'legacy', reason: 'feature-flag-off', tasks: legacyTasks };
  }
  if (!client || typeof client.from !== 'function' || typeof createRepository !== 'function') {
    return { mode: 'legacy', reason: 'supabase-unavailable', tasks: legacyTasks };
  }

  try {
    // Live-Pilot-Schema 004: projects besitzt bewusst kein deleted_at. RLS liefert
    // ausschließlich sichtbare Projekte; daher nur die Mapping-Spalten selektieren.
    const [projectsResult, employeesResult] = await Promise.all([
      client.from('projects').select('id,legacy_id'),
      client.from('employees').select('id,legacy_id').eq('status', 'aktiv'),
    ]);
    if (projectsResult.error) throw projectsResult.error;
    if (employeesResult.error) throw employeesResult.error;

    const mapper = createTaskReferenceMapper({
      projects: projectsResult.data || [],
      employees: employeesResult.data || [],
    });
    if (!mapper.ok) return { mode: 'legacy', reason: 'mapping-invalid', errors: mapper.errors, tasks: legacyTasks };

    const coverageErrors = validateLegacyTaskCoverage(legacyTasks, mapper);
    if (coverageErrors.length) {
      return { mode: 'legacy', reason: 'legacy-reference-gap', errors: coverageErrors, tasks: legacyTasks, mapper };
    }

    const repository = createRepository(client);
    const dbTasks = await repository.list();
    const tasks = dbTasks.map((task) => mapper.toLegacyTask(task));
    return { mode: 'supabase', reason: 'ready', tasks, repository, mapper };
  } catch (error) {
    return { mode: 'legacy', reason: 'preflight-failed', error, tasks: legacyTasks };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TASK_RUNTIME_FLAG, isTaskSupabasePilotEnabled, createTaskReferenceMapper, validateLegacyTaskCoverage, prepareTaskSupabaseRuntime };
}
if (typeof window !== 'undefined') {
  window.TaskRuntimeGate = { TASK_RUNTIME_FLAG, isTaskSupabasePilotEnabled, createTaskReferenceMapper, validateLegacyTaskCoverage, prepareTaskSupabaseRuntime };
}
