#!/usr/bin/env node
// validateTasks.js – Datenqualitäts-Validator für S.aufgaben (Phase 3A, Vorbereitung Phase 3B).
//
// Prüft AUSSCHLIESSLICH (kein Auto-Fix, kein Schreibzugriff, keine DB-Verbindung):
//   - Anzahl Datensätze
//   - Vorhandensein/Eindeutigkeit von id
//   - Referenz-Gültigkeit von projektId / zugeordnet (wenn Referenzlisten übergeben werden)
//   - Gültige status-/prioritaet-Werte (exakte Ist-Werte aus index.html, siehe
//     docs/architecture/phase3a-00-preflight-report.md, Abschnitt 3)
//   - Gültigkeit von faellig (Datum), falls gesetzt
//   - leere optionale Felder (nur Information, kein Fehler)
//
// Nutzung:
//   node tools/migration/validateTasks.js <aufgaben.json> [--projekte projekt-ids.json] [--mitarbeiter mitarbeiter-ids.json]
//
// aufgaben.json muss ein JSON-Array sein, das NUR S.aufgaben enthält (z.B. per
// `copy(JSON.stringify(S.aufgaben))` in der Browser-Konsole erzeugt).
//
// WARNUNG: Niemals einen vollständigen exportBackupJSON()-Export hier einspeisen.
// Dieser enthält u.a. Klartext-Passwörter (Prioritäts-0-Fund, siehe
// docs/architecture/phase2-00-abschlussbericht.md).

const fs = require("fs");

const STATUS_VALUES = ["offen", "in Arbeit", "erledigt"];
const PRIO_VALUES = ["niedrig", "mittel", "hoch"];

function validateTasks(tasks, { projektIds = null, mitarbeiterIds = null } = {}) {
  const report = { total: 0, errors: [], warnings: [], info: [] };

  if (!Array.isArray(tasks)) {
    report.errors.push("Eingabe ist kein Array.");
    return report;
  }
  report.total = tasks.length;

  const seenIds = new Set();
  let emptyBeschreibung = 0,
    emptyFaellig = 0,
    emptyProjekt = 0,
    emptyZugeordnet = 0;

  tasks.forEach((t, idx) => {
    const ref = `#${idx}${t && t.id ? " (id=" + t.id + ")" : ""}`;

    if (!t || typeof t !== "object") {
      report.errors.push(`${ref}: kein gültiges Objekt.`);
      return;
    }

    if (!t.id) {
      report.errors.push(`${ref}: id fehlt.`);
    } else if (seenIds.has(t.id)) {
      report.errors.push(`${ref}: id "${t.id}" ist nicht eindeutig (Duplikat).`);
    } else {
      seenIds.add(t.id);
    }

    if (!t.titel || !String(t.titel).trim()) {
      report.errors.push(`${ref}: titel fehlt oder ist leer.`);
    }

    if (!STATUS_VALUES.includes(t.status)) {
      report.errors.push(`${ref}: status "${t.status}" ist kein bekannter Ist-Wert (erwartet: ${STATUS_VALUES.join(" | ")}).`);
    }

    if (t.prioritaet && !PRIO_VALUES.includes(t.prioritaet)) {
      report.errors.push(`${ref}: prioritaet "${t.prioritaet}" ist kein bekannter Ist-Wert (erwartet: ${PRIO_VALUES.join(" | ")}).`);
    }

    if (t.faellig) {
      const d = new Date(t.faellig);
      if (isNaN(d.getTime())) {
        report.errors.push(`${ref}: faellig "${t.faellig}" ist kein gültiges Datum.`);
      }
    } else {
      emptyFaellig++;
    }

    if (t.projektId) {
      if (projektIds && !projektIds.includes(t.projektId)) {
        report.errors.push(`${ref}: projektId "${t.projektId}" referenziert kein bekanntes Projekt.`);
      }
    } else {
      emptyProjekt++;
    }

    if (t.zugeordnet) {
      if (mitarbeiterIds && !mitarbeiterIds.includes(t.zugeordnet)) {
        report.errors.push(`${ref}: zugeordnet "${t.zugeordnet}" referenziert keinen bekannten Mitarbeiter.`);
      }
    } else {
      emptyZugeordnet++;
    }

    if (!t.beschreibung || !String(t.beschreibung).trim()) {
      emptyBeschreibung++;
    }
  });

  if (!projektIds) report.warnings.push("Keine Projekt-Referenzliste übergeben (--projekte) – projektId wird nicht auf Gültigkeit geprüft.");
  if (!mitarbeiterIds) report.warnings.push("Keine Mitarbeiter-Referenzliste übergeben (--mitarbeiter) – zugeordnet wird nicht auf Gültigkeit geprüft.");

  report.info.push(`${emptyBeschreibung}/${report.total} ohne Beschreibung.`);
  report.info.push(`${emptyFaellig}/${report.total} ohne Fälligkeitsdatum.`);
  report.info.push(`${emptyProjekt}/${report.total} ohne Projektzuordnung.`);
  report.info.push(`${emptyZugeordnet}/${report.total} ohne zugeordneten Mitarbeiter.`);

  return report;
}

function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  if (!file) {
    console.error("Nutzung: node validateTasks.js <aufgaben.json> [--projekte ids.json] [--mitarbeiter ids.json]");
    process.exit(1);
  }
  const tasks = JSON.parse(fs.readFileSync(file, "utf8"));

  let projektIds = null,
    mitarbeiterIds = null;
  const pIdx = args.indexOf("--projekte");
  if (pIdx !== -1) projektIds = JSON.parse(fs.readFileSync(args[pIdx + 1], "utf8"));
  const mIdx = args.indexOf("--mitarbeiter");
  if (mIdx !== -1) mitarbeiterIds = JSON.parse(fs.readFileSync(args[mIdx + 1], "utf8"));

  const report = validateTasks(tasks, { projektIds, mitarbeiterIds });

  console.log(`Aufgaben gesamt: ${report.total}`);
  console.log(`Fehler: ${report.errors.length}`);
  report.errors.forEach((e) => console.log("  FEHLER: " + e));
  console.log(`Warnungen: ${report.warnings.length}`);
  report.warnings.forEach((w) => console.log("  WARNUNG: " + w));
  console.log("Info:");
  report.info.forEach((i) => console.log("  - " + i));

  process.exit(report.errors.length > 0 ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { validateTasks, STATUS_VALUES, PRIO_VALUES };
