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
    toDbTaskPatch(changes) {
      if (!this.ok) throw new Error('TaskReferenceMapper: Mapping ist nicht eindeutig.');
      const patch = { ...changes };
      if (Object.prototype.hasOwnProperty.call(patch, 'projektId')) {
        patch.projektId = requireMapped(patch.projektId, projectLegacyToUuid, 'Projekt-Legacy-ID');
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'zugeordnet')) {
        patch.zugeordnet = requireMapped(patch.zugeordnet, employeeLegacyToUuid, 'Mitarbeiter-Legacy-ID');
      }
      return patch;
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

function createMappedTaskRepository(rawRepository, mapper) {
  if (!rawRepository || !mapper || !mapper.ok) {
    throw new Error('MappedTaskRepository: Repository oder Mapping ungültig.');
  }
  return {
    async list() {
      const rows = await rawRepository.list();
      return (rows || []).map((task) => mapper.toLegacyTask(task));
    },
    async create(data) {
      const created = await rawRepository.create(mapper.toDbTask(data || {}));
      return mapper.toLegacyTask(created);
    },
    async update(id, changes) {
      const updated = await rawRepository.update(id, mapper.toDbTaskPatch(changes || {}));
      return mapper.toLegacyTask(updated);
    },
    async remove(id) {
      const removed = await rawRepository.remove(id);
      return mapper.toLegacyTask(removed);
    },
    async restore(id) {
      const restored = await rawRepository.restore(id);
      return mapper.toLegacyTask(restored);
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

    const rawRepository = createRepository(client);
    const repository = createMappedTaskRepository(rawRepository, mapper);
    const tasks = await repository.list();
    return { mode: 'supabase', reason: 'ready', tasks, repository, mapper };
  } catch (error) {
    return { mode: 'legacy', reason: 'preflight-failed', error, tasks: legacyTasks };
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TASK_RUNTIME_FLAG, isTaskSupabasePilotEnabled, createTaskReferenceMapper, createMappedTaskRepository, validateLegacyTaskCoverage, prepareTaskSupabaseRuntime };
}
if (typeof window !== 'undefined') {
  window.TaskRuntimeGate = { TASK_RUNTIME_FLAG, isTaskSupabasePilotEnabled, createTaskReferenceMapper, createMappedTaskRepository, validateLegacyTaskCoverage, prepareTaskSupabaseRuntime };
}
