#!/usr/bin/env node
// Phase-3B-Preflight: prüft Auth-Mapping + Aufgabenreferenzen rein lokal.
// KEIN Supabase-Schreibzugriff. KEINE Voll-Backups verwenden.
// Erwartete Eingabe: JSON mit NUR { aufgaben, mitarbeiter, projekte }.
// Auth-Datei: JSON-Array mit auth.users UUIDs, ohne E-Mail-Adressen.

const fs = require('fs');
const { validateTasks } = require('./validateTasks.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_KEYS = new Set(['aufgaben', 'mitarbeiter', 'projekte']);

function analyzePilotInput(input, authUserIds) {
  const errors = [];
  const warnings = [];

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Pilot-Eingabe ist kein Objekt.'], warnings, summary: {} };
  }

  const extraKeys = Object.keys(input).filter((k) => !ALLOWED_KEYS.has(k));
  if (extraKeys.length) {
    errors.push('Nicht erlaubte Top-Level-Felder: ' + extraKeys.join(', ') + '. Nur aufgaben/mitarbeiter/projekte zulässig.');
  }
  if ('passwoerter' in input || 'payload' in input) {
    errors.push('ABBRUCH: Voll-State/Passwortdaten erkannt. Dieses Werkzeug darf solche Daten nicht verarbeiten.');
  }

  const aufgaben = Array.isArray(input.aufgaben) ? input.aufgaben : [];
  const mitarbeiter = Array.isArray(input.mitarbeiter) ? input.mitarbeiter : [];
  const projekte = Array.isArray(input.projekte) ? input.projekte : [];
  if (!Array.isArray(input.aufgaben)) errors.push('aufgaben muss ein Array sein.');
  if (!Array.isArray(input.mitarbeiter)) errors.push('mitarbeiter muss ein Array sein.');
  if (!Array.isArray(input.projekte)) errors.push('projekte muss ein Array sein.');

  if (!Array.isArray(authUserIds)) {
    errors.push('Auth-Datei muss ein JSON-Array aus UUID-Strings sein.');
    authUserIds = [];
  }
  const authSet = new Set();
  for (const id of authUserIds) {
    if (typeof id !== 'string' || !UUID_RE.test(id)) errors.push('Ungültige auth.users UUID in Auth-Datei.');
    else if (authSet.has(id)) errors.push('Doppelte auth.users UUID in Auth-Datei.');
    else authSet.add(id);
  }

  const employeeIds = mitarbeiter.map((m) => m && m.id).filter(Boolean);
  const projectIds = projekte.map((p) => p && p.id).filter(Boolean);
  const taskReport = validateTasks(aufgaben, { projektIds: projectIds, mitarbeiterIds: employeeIds });
  errors.push(...taskReport.errors.map((e) => 'Aufgabe: ' + e));
  warnings.push(...taskReport.warnings.map((w) => 'Aufgabe: ' + w));

  const linkedEmployees = mitarbeiter.filter((m) => m && m.authUserId);
  const seenEmployeeAuth = new Set();
  for (const m of linkedEmployees) {
    if (!UUID_RE.test(String(m.authUserId))) {
      errors.push('Mitarbeiter mit authUserId besitzt keine gültige UUID (legacy_id=' + String(m.id || '?') + ').');
      continue;
    }
    if (seenEmployeeAuth.has(m.authUserId)) errors.push('Dieselbe authUserId ist mehreren Mitarbeitern zugeordnet.');
    seenEmployeeAuth.add(m.authUserId);
    if (!authSet.has(m.authUserId)) errors.push('Mitarbeiter-authUserId existiert nicht in der READ-ONLY auth.users-Liste.');
  }

  const unmappedAuthCount = [...authSet].filter((id) => !seenEmployeeAuth.has(id)).length;
  if (unmappedAuthCount) warnings.push(unmappedAuthCount + ' auth.users-Konto/Konten sind keinem Mitarbeiter mit authUserId zugeordnet.');

  const projectless = aufgaben.filter((a) => a && !a.projektId);
  const projectlessUnassigned = projectless.filter((a) => !a.zugeordnet);
  if (projectlessUnassigned.length) {
    warnings.push(projectlessUnassigned.length + ' projektlose und unzugewiesene Aufgabe(n) wären nach neuer RLS nur für Geschäftsführer sichtbar.');
  }

  const assignedToUnauthed = aufgaben.filter((a) => {
    if (!a || !a.zugeordnet) return false;
    const m = mitarbeiter.find((x) => x && x.id === a.zugeordnet);
    return m && !m.authUserId;
  }).length;
  if (assignedToUnauthed) {
    warnings.push(assignedToUnauthed + ' Aufgabe(n) sind Mitarbeitern ohne Auth-Konto zugeordnet; diese können den Supabase-Pilot nicht selbst nutzen.');
  }

  const summary = {
    auth_users: authSet.size,
    employees_total: mitarbeiter.length,
    employees_auth_linked: linkedEmployees.length,
    auth_users_unmapped: unmappedAuthCount,
    projects_total: projekte.length,
    tasks_total: aufgaben.length,
    tasks_projectless: projectless.length,
    tasks_projectless_unassigned: projectlessUnassigned.length,
    tasks_assigned_to_employee_without_auth: assignedToUnauthed,
    task_validation_errors: taskReport.errors.length,
    errors: errors.length,
    warnings: warnings.length,
  };

  return { ok: errors.length === 0, errors, warnings, summary };
}

function main() {
  const [pilotFile, authFile] = process.argv.slice(2);
  if (!pilotFile || !authFile) {
    console.error('Nutzung: node tools/migration/phase3bPreflight.js <pilot-input.json> <auth-user-ids.json>');
    process.exit(1);
  }
  const input = JSON.parse(fs.readFileSync(pilotFile, 'utf8'));
  const authIds = JSON.parse(fs.readFileSync(authFile, 'utf8'));
  const report = analyzePilotInput(input, authIds);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 2);
}

if (require.main === module) main();
module.exports = { analyzePilotInput };
