# Phase 3A – Preflight-Report: Aufgaben-Pilot

Status: **Planung abgeschlossen. Keine Live-Migration durchgeführt.**
Geltungsbereich: **ausschließlich `S.aufgaben` → `tasks`.** Kein anderes Modul.
Änderungen an `index.html`: **keine.** Änderungen an Supabase: **keine.**
Neue Dateien in diesem Report sind entweder Dokumentation, als DRAFT markiertes,
nicht ausgeführtes SQL, oder eigenständige Node-Werkzeuge, die von keiner
laufenden Anwendung referenziert werden.

> 🔴 **Weiterhin uneingeschränkt gültig:** Das in Phase 2 dokumentierte
> Klartext-Passwort-Risiko (`S.passwoerter[].passwort`, siehe
> [phase2-00-abschlussbericht.md](phase2-00-abschlussbericht.md)) ist durch
> diesen Piloten **in keiner Weise entschärft**. Dieser Pilot migriert und
> berührt keine Passwortdaten. Die Aussage "tasks hat jetzt RLS" bedeutet
> **nicht** "das System ist jetzt sicher" – `erm_data.payload` bleibt exakt so
> ungeschützt wie zuvor, inklusive aller Passwörter darin.

---

## 1. Baseline-Schema-Anforderungen

Bevor irgendeine Phase-3B-Migration geplant werden darf, muss Folgendes über
das **echte Live-Schema** bekannt sein (aktuell nicht in Versionskontrolle
dokumentiert – `supabase-schema.sql` im Repo enthält nur die RLS-Policy-Skripte
des früheren Auth-Rollouts, keine `CREATE TABLE`-Definitionen):

1. Vollständige Tabellenliste im `public`-Schema (existieren bereits Tabellen,
   die mit den Entwurfsnamen `companies`, `employees`, `tasks` usw.
   kollidieren?).
2. Exakter Spaltentyp von `erm_data.payload` (muss `jsonb` sein – bereits
   einmal als Fehlerquelle dokumentiert, siehe Memory
   "Supabase payload column type").
3. Welche RLS-Policies aktuell aktiv sind (auf `erm_data`, `push_subscriptions`,
   `erm_access`) – insbesondere ob dort noch die grobe
   `auth.role() = 'authenticated'`-Regel gilt, die in Phase 2 als
   unzureichend identifiziert wurde.
4. Ob `auth.users` bereits Einträge hat (grobe Anzahl) – Grundlage für die
   `auth.uid()`-Zuordnungsstrategie (Abschnitt 7).
5. Ob bereits Storage-Buckets existieren, die mit der separat laufenden
   Storage-Migrationsplanung kollidieren könnten.

## 2. READ-ONLY SQL-Abfragen

Da ich keinen direkten Lesezugriff auf die Live-Datenbank habe, bitte folgende
Datei **unverändert** im Supabase SQL Editor ausführen und die Ergebnisse
zurückgeben:

→ [phase3a-01-baseline-readonly-queries.sql](phase3a-01-baseline-readonly-queries.sql)

Alle 9 Abfragen darin sind reine `SELECT`-Abfragen gegen
`information_schema` / `pg_catalog` / `pg_policies` / `storage.buckets`. Keine
enthält `CREATE`, `ALTER`, `DROP`, `INSERT`, `UPDATE`, `DELETE` oder
`TRUNCATE`. Es werden keine Anwendungsdaten (Zeileninhalte) gelesen, nur
Metadaten.

## 3. Aufgaben-Istmodell (vollständig, code-verifiziert)

Quelle: `index.html`, Abschnitt `MODULE: AUFGABEN` (`renderAufgaben`,
`openAufgabeForm`, `saveAufgabe`, `setAufgabeStatus`, `deleteAufgabe`,
`prioBadge`).

**Exaktes Feldschema von `S.aufgaben[]`:**

| Feld | Typ (Ist) | Pflicht | Werte / Bemerkung |
|---|---|---|---|
| `id` | string | ja | `uid()` – **kein UUID**, kein DB-Unique-Constraint |
| `titel` | string | ja | in `saveAufgabe()` geprüft (`trim()`, sonst Toast-Warnung) |
| `beschreibung` | string | nein | Default `""` |
| `faellig` | string (ISO-Datum) | nein | Default `""`, aus `<input type="date">` |
| `prioritaet` | string | ja (Formular-Default) | **exakt** `"niedrig"` \| `"mittel"` \| `"hoch"` |
| `projektId` | string \| `null` | nein | FK-artig auf `S.projekte[].id` |
| `zugeordnet` | string \| `null` | nein | FK-artig auf `S.mitarbeiter[].id` |
| `status` | string | ja | **exakt** `"offen"` \| `"in Arbeit"` \| `"erledigt"` (Leerzeichen + Großschreibung beachten) |

**Ausdrücklich NICHT vorhanden** (verifiziert, nicht erraten):

- Kein `created_at` / `updated_at`.
- Kein `created_by` / Ersteller-Feld.
- Keine Business-Nummer (anders als z. B. `rechnungen[].nr`) – nicht nötig,
  da Aufgaben nie referenziert/gedruckt werden.

**Schreibpfade (vollständig):**

- Erstellen: `saveAufgabe()` – **kein Bearbeiten-Dialog existiert.** Es gibt
  keine Funktion, die `titel`/`beschreibung`/`faellig`/`prioritaet`/
  `projektId`/`zugeordnet` nach dem Anlegen ändert.
- Statusänderung: `setAufgabeStatus(id, status)` – einziges Feld, das nach
  Erstellung änderbar ist.
- Löschen: `deleteAufgabe(id)` → `deleteItemWithUndo()`.

**Lösch-/Undo-Verhalten (`deleteItemWithUndo`, Zeilen 1177–1188):** physisches
`splice()` aus dem Array, sofort `saveState()`, dann ein Undo-Toast, der bei
Klick das Element per erneutem `splice()` an der ursprünglichen Position
wieder einfügt. Das ist **heute ein Hard Delete mit clientseitigem
Undo-Zeitfenster**, kein Soft Delete.

## 4. Abhängigkeitskarte

Alle Stellen in `index.html`, die `S.aufgaben` lesen oder schreiben:

| # | Ort | Zugriff | Beschreibung |
|---|---|---|---|
| 1 | `renderAufgaben()` | lesen | Kanban-Board (offen/in Arbeit/erledigt) |
| 2 | `openAufgabeForm()` / `saveAufgabe()` | schreiben | Neuanlage |
| 3 | `setAufgabeStatus()` | schreiben | Statusänderung |
| 4 | `deleteAufgabe()` → `deleteItemWithUndo()` | schreiben | Löschen + Undo |
| 5 | `globalSearchIndex()` (Zeile ~1030) | lesen | **unconditional**, für alle Rollen sichtbar (kein `hasAdminAccess()`-Gate, anders als z. B. Rechnungen/Verträge) |
| 6 | `buildDailyOverviewPrompt()` (Zeilen 1535–1544) | lesen | Dashboard-KI-Tagesübersicht, zählt offene Aufgaben |
| 7 | Projekt-Übersicht-Tab (Zeile ~3074) | lesen | `offeneAufgaben` gefiltert nach `projektId` |
| 8 | `buildArbeitsauftragDoc()` (Zeile ~3804) | lesen | Arbeitsauftrag-PDF, Checkliste ohne Preise |

**Konsequenz für Phase 3B:** Jede dieser 8 Stellen müsste beim Umschalten der
Datenquelle (Feature-Flag, Abschnitt 10) entweder über `TaskRepository`
umgeleitet oder weiterhin gegen `S.aufgaben` betrieben werden, solange der
Feature-Flag auf `"legacy"` steht. Stelle 5 (`globalSearchIndex`) ist
besonders zu beachten, da sie **ungefiltert für alle Rollen** läuft – die
künftige RLS-Sichtbarkeitsregel (Abschnitt 8) würde hier erstmals eine
Einschränkung einführen, die es heute nicht gibt (heute sehen alle
Mitarbeiter alle Aufgabentitel über die Suche, unabhängig von Zuordnung).

## 5. `tasks`-Tabelle (DRAFT, final für den Piloten)

→ [002_pilot_tasks_v2_DRAFT.sql](../../supabase/migrations-draft/002_pilot_tasks_v2_DRAFT.sql)
(verfeinert `001_pilot_tasks_DRAFT.sql` aus Phase 2 – 001 bleibt als
historisches Dokument unverändert bestehen)

Feldentscheidungen, gegen das Ist-Modell abgeglichen statt blind übernommen:

- **`id` (uuid) + `legacy_id` (text, unique je company)** – gleiches Muster
  wie das bestehende Vorbild `rechnungen[].id` vs. `.nr` (technischer PK vs.
  fachlicher Bezug), hier: technischer PK vs. Rückverfolgung zur alten
  `uid()`-ID. `legacy_id` ist der Idempotenz-Anker (Abschnitt 11).
- **`status`/`prioritaet`**: Ist-Werte **1:1 übernommen**, nicht normalisiert
  (kein Enum-Rename `"in Arbeit"` → `"in_arbeit"`). Normalisierung würde die
  in Abschnitt 12 geforderte "Status identisch"-Prüfung verkomplizieren und
  ist eine unabhängige, hier bewusst nicht gebündelte Änderung. Stattdessen
  per `CHECK`-Constraint auf die 3 bekannten Werte beschränkt.
- **`created_at`/`created_by`/`updated_at`/`updated_by`**: neu, da im
  Ist-Modell nicht vorhanden. Für migrierte Zeilen ist `created_at` **der
  Migrationszeitpunkt, kein echtes historisches Datum** – das wird in
  Validator- und Migrationswerkzeug-Ausgabe explizit dokumentiert, um keine
  falsche Historie vorzutäuschen.
- **`deleted_at`** (Soft Delete): ersetzt den heutigen physischen `splice()`.
  Vorschlag für Phase 3B, UI-Verhalten NICHT unnötig zu ändern: Der
  Undo-Toast bleibt bestehen, aber "Löschen" setzt `deleted_at = now()` statt
  zu splicen, und "Rückgängig" setzt `deleted_at = null` zurück statt erneut
  einzufügen – aus Nutzersicht identisch, technisch robuster (kein Race
  zwischen Undo-Timeout und Realtime-Pull).
- **Keine Business-Nummer** – im Ist-Modell nicht vorhanden, nicht erfunden.

## 6. `company_id`-Strategie

"Kleinste sichere Lösung" (Auftrag, Abschnitt 6): **genau eine Firma**, mit
einer **fest vergebenen UUID** (nicht `gen_random_uuid()` zur Laufzeit),
sodass SQL-Migration und `tools/migration/migrateTasksDryRun.js` denselben
Wert referenzieren, ohne ihn nachzuschlagen. Im DRAFT hinterlegt als
`00000000-0000-4000-8000-000000000001` (Platzhalter-Literal für die Planung;
der endgültige Wert wird unmittelbar vor einer echten Phase-3B-Ausführung neu
generiert und an einer einzigen Stelle dokumentiert, nicht mehrfach
verstreut). Keine Mandantenfähigkeit, kein `companies`-Onboarding-Flow – dafür
gibt es aktuell keinen Bedarf.

## 7. `auth.uid()`-Zuordnungsstrategie

Minimal-invasiv (Auftrag: "nicht alle Mitarbeiter migrieren, wenn nicht
nötig"): `employees` wird für den Piloten **nur mit den für RLS
erforderlichen Spalten** angelegt (`id`, `legacy_id`, `company_id`,
`auth_user_id`, `rolle`, `name`, `status` – siehe DRAFT Abschnitt
"Fundament: employees"). Befüllt würde diese Tabelle in Phase 3B
ausschließlich mit der **Teilmenge von `S.mitarbeiter`, die bereits einen
funktionierenden Supabase-Auth-Account besitzt** – nur diese Personen können
sich ohnehin einloggen und mit `tasks` über RLS interagieren. Die vollständige
HR-Spaltenliste (Gehalt, Vertrag, Urlaubstage) bleibt unverändert in
`S.mitarbeiter` / Legacy-Payload, bis Mitarbeiter selbst migriert wird –
das ist ausdrücklich **nicht** Teil dieses Piloten.

## 8. RLS-DRAFT (SELECT / INSERT / UPDATE / DELETE)

Vollständig in
[002_pilot_tasks_v2_DRAFT.sql](../../supabase/migrations-draft/002_pilot_tasks_v2_DRAFT.sql).
Kernprinzipien:

- Rolle und `company_id` werden **ausschließlich serverseitig** über
  `current_employee()` (SQL-Funktion, `auth.uid()` → `employees`-Zeile)
  aufgelöst. Keine Policy liest JWT-Claims, `localStorage` oder sonstige
  clientseitig beeinflussbare Werte.
- **SELECT**: Geschäftsführer sieht alle Aufgaben der Firma. Bauleiter/
  Mitarbeiter sehen nur: eigene zugewiesene Aufgaben, Aufgaben aus Projekten,
  denen sie über `project_members` zugeordnet sind, sowie Aufgaben ohne
  Projektbezug (Analogie zum heutigen `globalSearchIndex()`-Verhalten, das
  Aufgaben firmenweit sichtbar macht). Gelöschte Zeilen (`deleted_at`)
  niemals sichtbar.
- **INSERT**: nur wer laut `role_permissions` `tasks.create` hat
  (Bauleiter, Geschäftsführer).
- **UPDATE**: nur wer `tasks.edit` hat, und nur innerhalb der eigenen Firma
  (`company_id`-Check auch im `WITH CHECK`, verhindert Umhängen einer Aufgabe
  auf eine andere Firma).
- **DELETE**: nur wer `tasks.delete` hat (nur Geschäftsführer) – vorbereitet
  für ein mögliches späteres Hard-Delete-Admin-Werkzeug; im Regelbetrieb wird
  stattdessen Soft Delete über UPDATE verwendet.

Ziel-Sichtbarkeitsmodell für Projekte (zur Kenntnisnahme, **nicht Teil des
Migrationsumfangs dieses Piloten**, da `projects` nur als FK-Stub existiert):
Geschäftsführer sieht alle Projekte; Bauleiter sieht nur zugewiesene/
Mitgliedsprojekte, keine automatische Finanzsicht; Mitarbeiter sieht nur
zugewiesene/eingeplante Projekte mit nur den nötigen Daten. Langfristig
RLS-durchgesetzt – reine Frontend-Filterung zählt nicht als Sicherheit. Die
`projects_select_scoped`-Policy im DRAFT bildet dieses Zielmodell bereits ab,
wird aber in diesem Piloten nicht mit echten Produktivdaten befüllt.

## 9. Repository-/Adapter-Konzept

→ [src/modules/tasks/taskRepository.js](../../src/modules/tasks/taskRepository.js)
(nicht in `index.html` eingebunden, keine Laufzeitwirkung)

Kleines, klar begrenztes Interface: `TaskRepository.list/create/update/remove`.
Intern zwei Implementierungen, ausgewählt über ein Feature-Flag
(Abschnitt 10):

- `legacyImpl` – 1:1-Spiegel des heutigen Verhaltens (`saveAufgabe`,
  `setAufgabeStatus`, `deleteAufgabe`), operiert direkt auf `state.aufgaben`.
- `supabaseImpl` – für Phase 3B vorgesehen, wirft aktuell bewusst einen
  Fehler ("noch nicht implementiert"), statt eine Attrappe zu liefern, die
  fälschlich Erfolg vortäuscht.

Kein Enterprise-Overhead (kein generisches Repository-Framework, keine
Interfaces über mehrere Ebenen) – genau die 4 Methoden, die die 8
Abhängigkeitsstellen aus Abschnitt 4 tatsächlich brauchen.

Ergänzend: [src/modules/tasks/taskPermissions.js](../../src/modules/tasks/taskPermissions.js)
spiegelt die `role_permissions`-Seed-Daten als reine **UI-Convenience**
(z. B. Button ausblenden) – ausdrücklich **keine Sicherheitsgrenze**, im
Code mehrfach so kommentiert. Die einzige echte Durchsetzung bleibt
serverseitiges RLS (Abschnitt 8).

## 10. Feature-Flag-Konzept

Ein einziges lokales Flag, **`LC.TASKS_DATA_SOURCE`** (`"legacy"` |
`"supabase"`, Default `"legacy"`) – bewusst in `LC` (lokaler Geräte-State),
nicht in `S`, damit das Flag selbst nicht über Cloud-Sync verteilt wird und
nicht versehentlich alle Geräte gleichzeitig umschaltet. Kein Remote-
Feature-Flag-Service, keine zentrale Steuerung – ein einfaches lokales
Schalten reicht für einen kontrollierten Piloten-Rollout auf einem Gerät zur
Verifikation, bevor es (in einer separaten, hier nicht beauftragten
Entscheidung) firmenweit umgestellt würde.

## 11. Dry-Run-Migrationskonzept + Werkzeug

→ [tools/migration/migrateTasksDryRun.js](../../tools/migration/migrateTasksDryRun.js)

Eigenständiges Node-Skript, **kein** Supabase-Client, **keine** Netzwerk-
verbindung, **kein** Schreibpfad:

```bash
node tools/migration/migrateTasksDryRun.js <aufgaben.json> --company-id <uuid>
```

- Liest eine JSON-Datei mit **ausschließlich `S.aufgaben`** (nicht den vollen
  Backup-Export – siehe Warnung unten).
- Transformiert jede Aufgabe in die Zielspalten von `tasks` (Mapping-Logik in
  `mapTask()`), zeigt Zähler (`total/ok/failed`) und bis zu 3
  Beispiel-Transformationen.
- Erkennt fehlende `legacy_id` und **doppelte `legacy_id` innerhalb der
  Quelle** (Idempotenz-Vorschau, siehe Abschnitt "Idempotenz" unten).
- `project_id` / `zugeordnet_employee_id` werden in Phase 3A **bewusst nicht
  aufgelöst** (kein Zugriff auf echte `projects`/`employees`-Zeilen) – das
  ist Aufgabe des eigentlichen Phase-3B-Migrationslaufs (Lookup über
  `legacy_id`).
- Die Option `--apply` existiert nur, um **kontrolliert abzubrechen** ("noch
  nicht implementiert, Phase 3B") – es gibt aktuell keinen Code-Pfad, der
  tatsächlich schreiben könnte, selbst wenn die Option missbraucht würde.

**Sicherer Umgang mit Testdaten (siehe Rückfrage/Antwort zu Beginn dieser
Phase):** Es wurde bewusst **kein** `exportBackupJSON()`-Export angefordert
oder verwendet, da dieser Klartext-Passwörter enthalten kann. Validator,
Mapping, Dry-Run und alle zugehörigen Tests (`tests/tasks-migration.test.js`)
arbeiten ausschließlich mit **synthetischen, aber strukturell realistischen**
Beispiel-Aufgaben, deren Feldschema ausschließlich aus dem verifizierten
Anwendungscode (Abschnitt 3) abgeleitet wurde. Für eine tatsächliche
Phase-3B-Migration mit echten Daten ist weiterhin ein sicherer, rein lokaler
Weg nötig, nur `S.aufgaben` (ohne Passwörter) zu extrahieren – z. B. eine
gezielte Browser-Konsolen-Ausgabe `copy(JSON.stringify(S.aufgaben))` statt
eines vollständigen Backups. Das bleibt für Phase 3B zu klären, nicht für
diese Planungsphase nötig.

**Idempotenz:** `legacy_id UNIQUE` je `company_id` (siehe DRAFT-Indizes,
Abschnitt 5) verhindert doppelte Importe bei wiederholten Migrationsläufen
auf DB-Ebene; das Dry-Run-Werkzeug prüft dieselbe Bedingung bereits vorab
innerhalb der Quelle.

## 12. Validator (Konzept + Werkzeug)

→ [tools/migration/validateTasks.js](../../tools/migration/validateTasks.js)

Reines Berichtswerkzeug, **kein Auto-Fix**, **keine Schreibzugriffe**, **keine
DB-Verbindung**:

```bash
node tools/migration/validateTasks.js <aufgaben.json> [--projekte ids.json] [--mitarbeiter ids.json]
```

Prüft exakt die im Auftrag (Abschnitt 7) geforderten Punkte:

- Anzahl Datensätze.
- Vorhandensein und Eindeutigkeit von `id`.
- Referenzgültigkeit von `projektId`/`zugeordnet` (wenn Referenzlisten
  mitgegeben werden – ohne sie: klar ausgewiesene Warnung statt stiller
  Annahme).
- Gültige `status`-/`prioritaet`-Werte gegen die exakten Ist-Werte aus
  Abschnitt 3.
- Gültigkeit von `faellig` als Datum, falls gesetzt.
- Leere optionale Felder (nur Information, kein Fehler) – Beschreibung,
  Fälligkeitsdatum, Projekt- und Mitarbeiterzuordnung.

Exit-Code `1` bei mindestens einem Fehler (für CI/Skript-Nutzung), `0` sonst.

## 13. Rollback-Ablauf

Folgt dem in Phase 2 festgelegten Stufenmodell M0–M8
([phase2-03-migrationsplan.md](phase2-03-migrationsplan.md)) – **kein
Dual-Write**, stattdessen:

1. **Vor jeder Änderung:** vollständiges JSON-Backup des kompletten
   `S`-States (bestehende `exportBackupJSON()`-Funktion, lokal aufbewahrt,
   nicht Teil dieses Reports wegen des Passwort-Inhalts).
2. **Migration (M2):** einmaliger Kopierlauf `S.aufgaben` → `tasks` (per
   Dry-Run-Werkzeug erst geprüft, dann – nach Freigabe – mit einer künftigen
   `--apply`-Option ausgeführt, die es in Phase 3A **nicht gibt**).
   `S.aufgaben` bleibt dabei **vollständig unverändert** – keine Löschung,
   keine Umbenennung.
3. **Validierung (M3):** Validator-Lauf gegen die migrierten Zeilen (Anzahl,
   Referenzen, Werte) muss fehlerfrei sein, bevor der nächste Schritt erfolgt.
4. **Umschalten (M4):** `LC.TASKS_DATA_SOURCE = "supabase"` – nur lokal, nur
   auf einem Testgerät zur Verifikation.
5. **Rollback-Fall:** `LC.TASKS_DATA_SOURCE` zurück auf `"legacy"` setzen –
   sofortige Rückkehr zum unveränderten `S.aufgaben`, da dieses nie
   überschrieben wurde. Kein DB-Rollback nötig, da `tasks` in diesem Stadium
   nur eine Kopie ist, keine Quelle der Wahrheit.
6. Erst nach mehrtägiger fehlerfreier Verifikation würde (separate, hier
   nicht beauftragte Entscheidung) `tasks` firmenweit und dauerhaft zur
   Quelle der Wahrheit erklärt werden.

## 14. Testplan

**Baseline vor jeder Änderung geprüft:** `npm test` → 230/230 bestanden
(unverändert, siehe Git-Historie ab Phase 1).

**Neu in Phase 3A**, separates Werkzeug `tests/tasks-migration.test.js`
(`npm run test:tasks-migration`, **nicht** Teil von `npm test`, um die
bestehende Smoke-Suite nicht zu verändern) – 41 Tests, alle mit
synthetischen Daten:

| Kategorie | Abdeckung |
|---|---|
| Task Repository | `list/create/update/remove` gegen `legacyImpl`, Fehlerfall bei unbekannter `id` |
| Feature Flag | Umschalten `legacy` ↔ `supabase`, kontrollierter Fehler bei `supabase` (noch nicht implementiert) |
| Fallback | Zurückschalten auf `legacy` funktioniert nach einem `supabase`-Fehlversuch |
| Permission/RLS-nahe Clientlogik | `canPerformTaskAction()` für alle 3 Rollen + unbekannte Rolle (sicherer Default: keine Rechte) |
| Task Mapping | `mapTask()` – Feldübernahme, keine erfundene Historie, keine Referenzauflösung in Phase 3A |
| Task Validation | `validateTasks()` – alle Fehlerarten aus Abschnitt 12 einzeln erzwungen und geprüft |
| Migration Dry Run | Zähler, fehlende `--company-id`, fehlende `legacy_id` |
| Migration Idempotenz | doppelte `legacy_id` innerhalb einer Quelle wird erkannt |

Ergebnis: **41/41 bestanden**, bestehende 230/230 weiterhin unverändert
bestanden.

Für Phase 3B zusätzlich nötig (hier nur vorgemerkt, nicht Teil dieser Phase):
Integrationstest der echten RLS-Policies gegen eine echte (Test-)Supabase-
Instanz – das lässt sich nicht sinnvoll mit `jsdom`/Node allein abbilden.

## 15. Risiken

1. **Ungeschützte Legacy-Daten bleiben bestehen** – siehe Warnung am Anfang
   dieses Reports. Kein Baustein dieses Piloten verringert dieses Risiko.
2. **`globalSearchIndex()` zeigt Aufgaben heute uneingeschränkt allen
   Rollen** – die künftige RLS-Sichtbarkeit ist enger. Beim Umschalten auf
   `"supabase"` würden manche Nutzer plötzlich weniger Aufgaben in der Suche
   sehen als heute – eine bewusste Verschärfung, kein Bug, aber
   kommunikationsbedürftig vor einem echten Rollout.
3. **`created_at` migrierter Zeilen ist keine echte Historie** – Verwechslung
   mit dem tatsächlichen Erstellungsdatum wäre irreführend, falls das nicht
   an anderer Stelle (UI, Reporting) konsistent kommuniziert wird.
4. **`legacy_id`-Kollisionen** bei mehrfachen/parallelen Testläufen, falls das
   Dry-Run-Werkzeug versehentlich mehrfach mit sich überschneidenden
   Datensätzen kombiniert wird – durch die Unique-Index- und
   Idempotenz-Prüfung abgefangen, aber im Fehlerfall manuell zu klären.
5. **`employees`-Teilmenge** (nur Mitarbeiter mit bestehendem Auth-Account)
   bedeutet: Aufgaben, die einem Mitarbeiter OHNE Auth-Account zugeordnet
   sind, hätten in Phase 3B ein `zugeordnet_employee_id`, das ins Leere
   verweist (kein passender `employees`-Datensatz) – muss der Validator in
   Phase 3B explizit als eigenen Fall abfangen (in diesem Piloten mangels
   echter Referenzdaten noch nicht abschließend geprüft).
6. **Kein Bearbeiten-Dialog im Ist-Zustand** – falls Phase 3B UI-seitig mehr
   als Status ändern soll, wäre das eine **neue Funktion**, kein reiner
   Migrationsschritt, und explizit gesondert zu beauftragen.

## 16. Datei-Liste für Phase 3B

Bereits in Phase 3A angelegt (Planungsartefakte, keine Laufzeitwirkung):

- `docs/architecture/phase3a-00-preflight-report.md` (dieser Report)
- `docs/architecture/phase3a-01-baseline-readonly-queries.sql`
- `supabase/migrations-draft/002_pilot_tasks_v2_DRAFT.sql`
- `src/modules/tasks/taskRepository.js`
- `src/modules/tasks/taskPermissions.js`
- `tools/migration/validateTasks.js`
- `tools/migration/migrateTasksDryRun.js`
- `tests/tasks-migration.test.js`
- `package.json` (neues Skript `test:tasks-migration`, `npm test` unverändert)

Phase 3B würde voraussichtlich zusätzlich verändern (noch nicht ausgeführt):

- `index.html` – `<script src>`-Einbindung von `taskRepository.js` +
  `taskPermissions.js`; die 8 Stellen aus Abschnitt 4 auf `TaskRepository`
  umstellen; `openAufgabeForm`/`saveAufgabe`/`setAufgabeStatus`/
  `deleteAufgabe` intern auf Repository-Aufrufe umbauen (UI unverändert);
  `LC`-Default um `TASKS_DATA_SOURCE` ergänzen.
- `migrateTasksDryRun.js` – `--apply`-Pfad tatsächlich implementieren
  (Supabase-Client, echte Schreibzugriffe), inkl. Lookup von `projektId`/
  `zugeordnet` über `legacy_id`.
- `002_pilot_tasks_v2_DRAFT.sql` (oder Nachfolgedatei) – tatsächlich gegen
  Supabase ausgeführt, nach erneuter expliziter Freigabe.
- `tests/tasks-migration.test.js` – Integrationstests gegen eine echte
  (Test-)Supabase-Instanz ergänzt.
- Ggf. neue Dokumentation für den Soft-Delete-Undo-Umbau (Abschnitt 5).

---

## Zusammenfassung: Testlauf & Git-Status

```
npm test                    → 230 Tests bestanden, 0 fehlgeschlagen (unverändert)
npm run test:tasks-migration → 41 Tests bestanden, 0 fehlgeschlagen (neu)
```

Alle Änderungen dieser Phase sind **lokal committet, nicht nach
`origin/main` gepusht** (siehe Auftrag, Abschnitt 26).

---

## STOPP

Phase 3A ist damit abgeschlossen. **Es wurde und wird keine Live-Migration
durchgeführt.** Bevor irgendein Phase-3B-Schritt (insbesondere: tatsächliche
Ausführung von SQL gegen Supabase, tatsächliches Schreiben von Daten,
Einbindung von `taskRepository.js` in `index.html`) beginnt, warte ich auf
deine ausdrückliche Freigabe.
