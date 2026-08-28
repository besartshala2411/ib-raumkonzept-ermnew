# Phase 2 – Teil 3: Migrationsplan, Pilotmodul, Validierung, Rollback, offene Entscheidungen

Status: **PLANUNG.** Keine Migration ausgeführt.

---

## 16. Baseline-Schema (Ist-Zustand Supabase)

**Wichtiger Hinweis, ehrlich benannt**: Ich habe in dieser Session **keinen direkten Lesezugriff-Tool auf das verbundene Supabase-Projekt** (kein Datenbank-MCP/keine Konsole verbunden). Ich kann daher das Live-Schema nicht selbst inventarisieren, ohne mich – wie in deiner Anweisung ausdrücklich verboten – mit dem Projekt zu verbinden. Statt etwas zu behaupten, das ich nicht geprüft habe:

**Was für ein vollständiges Baseline-Bild fehlt** (aus `supabase-schema.sql`, das laut Phase-0-Befund nur die RLS-Policy-Migration enthält, keine `CREATE TABLE`-Statements):
- Exakte Spaltenliste/-typen von `erm_data`, `push_subscriptions`, `erm_access`
- Vorhandene Indizes
- Vorhandene Functions (`erm_check_token` wird referenziert, Definition nicht im Repo)
- Vorhandene Storage Buckets (aktuell vermutlich keiner, da alles Base64 im Payload liegt)

**Wie du das für mich bereitstellen kannst, ohne dass ich selbst produktiv etwas ausführe**: Im Supabase-Dashboard unter *Database → Backups* einen Schema-Export ziehen, oder im SQL-Editor (nur lesend) `pg_dump --schema-only`-Äquivalent bzw. die Systemkataloge abfragen (z.B. `select * from information_schema.tables where table_schema='public';`) und mir das Ergebnis geben. Erst danach kann ich ein wirklich vollständiges Baseline-Dokument schreiben statt einer Annahme.

---

## 17. Statuswerte-Inventar (Ist-Zustand, Inkonsistenzen dokumentiert)

| Entity | Status-Werte (verifiziert) | Schreibweise | Inkonsistenz |
|---|---|---|---|
| `mitarbeiter.status` | `aktiv`, `inaktiv` | Kleinschreibung | – |
| `projekte.status` | `In Planung`, `Aktiv`, `Abgeschlossen` | Großschreibung, Leerzeichen | **Anders als Mitarbeiter/Rechnung** |
| `rechnungen.status` | `offen`, `bezahlt` (+ `rechnungEffectiveStatus()` kennt vermutlich weitere abgeleitete Zustände wie „überfällig" – berechnet, nicht gespeichert) | Kleinschreibung | – |
| `aufgaben.status` | `offen`, `in Arbeit`, `erledigt` | gemischt | `in Arbeit` hat Leerzeichen+Großbuchstabe mitten im String |
| `urlaubsantraege.status` | `offen`, (weitere vermutlich `genehmigt`/`abgelehnt` – nicht an dieser Stelle vollständig verifiziert) | Kleinschreibung | – |
| `vertraege.status` | `entwurf`, `unterschrieben` | Kleinschreibung | – |
| `ausschreibung[].status` | `versendet`, `angebot erhalten`, `beauftragt`, `abgelehnt` | Kleinschreibung, teils mit Leerzeichen | – |
| `bauzeitenplan[].status` | `geplant`, weitere über `bauphaseEffectiveStatus()` berechnet | Kleinschreibung | – |

**Befund**: Keine einheitliche Konvention (mal Enum-artig kleingeschrieben, mal UI-Label mit Großschreibung direkt als Statuswert verwendet – `projekte.status` speichert faktisch den Anzeige-Text). Für das Zielmodell empfehle ich durchgängig kleingeschriebene, leerzeichenfreie Enum-Werte (`in_planung`, `aktiv`, `abgeschlossen`) mit Mapping auf Anzeige-Labels im Frontend – **das ist eine Normalisierungsempfehlung für die Migration, keine jetzige Änderung** am Live-Code.

---

## 18. Foreign Keys / ON DELETE-Regeln

| Beziehung | Regel | Begründung |
|---|---|---|
| `customers → projects` | `ON DELETE RESTRICT` (oder `SET NULL` falls „Kunde archivieren, Projekt bleibt" gewünscht) | Kunde löschen darf Projekt-/Rechnungshistorie nicht mitreißen |
| `projects → invoices` | `ON DELETE RESTRICT` | Steuerrelevante Daten dürfen nie durch Projektlöschung verschwinden |
| `projects → documents/photos/tasks/...` | `ON DELETE CASCADE` **nur wenn Projekt selbst hart gelöscht wird** – da Projekte aber Soft Delete bekommen (Abschnitt 19), greift Cascade in der Praxis nie destruktiv |
| `invoices → invoice_items` | `ON DELETE CASCADE` | Positionen ohne Rechnung sind sinnlos, echte Löschung einer Rechnung ist ohnehin die Ausnahme |
| `invoices → payments` | `ON DELETE RESTRICT` | Zahlungen dürfen nie durch Rechnungslöschung verschwinden |
| `documents → document_versions` (falls eingeführt) | `ON DELETE CASCADE` | Version ohne Kopf-Dokument sinnlos |
| `employees → time_entries/leave_requests` | `ON DELETE RESTRICT` | Historische Arbeitszeitdaten dürfen nicht durch Mitarbeiterlöschung verschwinden – ohnehin Soft Delete bei `employees` |

Grundsatz: **`CASCADE` nur bei echten Kompositionsbeziehungen** (Kind ohne Elternteil ist bedeutungslos), **`RESTRICT`/`SET NULL` überall dort, wo das Kind eigenständigen historischen/steuerlichen Wert hat.**

---

## 19. Soft Delete / Archivierung

Klare Trennung von drei Konzepten:

- **Archivieren** (`archived_at`): Projekt ist fachlich fertig, bleibt aber vollständig sichtbar/durchsuchbar für Berichte. Betrifft: `projects` (Status „Abgeschlossen" ≠ archiviert – ein Projekt kann abgeschlossen und trotzdem aktiv einsehbar sein, „archiviert" ist eine zusätzliche, bewusste Nutzerhandlung).
- **Soft Delete** (`deleted_at`, `deleted_by`): Datensatz aus normalen Listen ausgeblendet, aber wiederherstellbar. Betrifft: `customers`, `projects`, `employees`, `documents`, `tasks`.
- **Endgültig löschen**: Nur für unkritische, nie referenzierte Daten (z.B. ein einzelner Chat-Verlauf-Eintrag, ein Entwurf ohne Signatur). **Rechnungen und alle steuerrelevanten Datensätze (`invoices`, `invoice_items`, `payments`) bekommen explizit KEINEN Hard-Delete-Pfad** – maximal `status = 'cancelled'` (siehe Abschnitt 20).

---

## 20. Rechnungen – Integritätsregeln (nur Planung, keine neue Funktion)

**Ist-Zustand**: `rechnungen[]` ist ein einfaches, jederzeit überschreibbares Objekt – `openRechnungForm(id)` lädt eine bestehende Rechnung vollständig zur Bearbeitung, auch nach `status:"bezahlt"`. Es gibt **keine** technische Sperre gegen nachträgliches, stilles Verändern einer bereits ausgestellten Rechnung.

**Zielmodell-Regeln** (nur Datenmodell/Constraint-Ebene geplant, keine UI-Änderung in Phase 2):
- Statusmodell: `draft → issued → paid | cancelled`.
- Sobald `status != 'draft'`: `invoice_items` sollten nicht mehr verändert werden dürfen (DB-Trigger/Check-Constraint denkbar, hier nur als Konzept benannt, nicht implementiert).
- Ein **Snapshot** der Rechnung zum Ausstellungszeitpunkt (z.B. als generiertes, unveränderliches PDF in Storage, analog zur Unterschrift-Regel in Teil 2) sollte parallel zur Statusänderung `issued` gesichert werden – das PDF-System dafür existiert bereits (`buildRechnungDoc`), es fehlt nur die Kopplung „PDF wird bei `issued` fest archiviert statt bei jedem Aufruf neu generiert".
- `payments` (Abschnitt 21, Teil 1) ermöglichen echte Teilzahlungen statt des heutigen binären `offen/bezahlt`.

---

## 21. LV/Kalkulation – siehe Teil 1, Abschnitt 6.11

Zusammengefasst: `lv_items` jetzt planen (1:1-Ersatz für `material[]`), `lv_documents`/`lv_sections` als eigenständige, versionierte Struktur bewusst als **spätere Erweiterung** zurückgestellt, weil sie im heutigen Code nicht existiert und ihre Einführung eine Fachfunktions-Erweiterung wäre.

---

## 22. Money Types

**Ist-Zustand**: Alle Beträge (`budget`, `preis`, `brutto`, `stundenlohn`, Rechnungspositionen) sind einfache JavaScript-`Number`-Werte, formatiert erst bei der Anzeige über `fmtCurrency()`. Keine Rundungs-/Präzisionsbibliothek im Einsatz – Berechnungen (Summenbildung über `reduce()`) passieren direkt mit Floats.

**Empfehlung für die Datenbank**: `numeric(12,2)` für alle Geldbeträge (**nicht** `float`/`double precision` – vermeidet klassische Rundungsfehler bei Summenbildung in Postgres). Kein Cent-Integer nötig, da Postgres' `numeric` exakt genug ist und die JS-Seite ohnehin mit Nachkommazahlen rechnet – eine Umstellung auf Cent-Integer würde eine Konvertierungsschicht im gesamten bestehenden JS-Code erfordern, was **nicht** im Sinne von „keine unnötige Umstellung" wäre. Diese Entscheidung betrifft nur die Spaltendefinition beim Anlegen der Tabelle, **keine Änderung der bestehenden Berechnungslogik**.

---

## 23. Mengen/Einheiten

`lv_items.menge`: `numeric(12,3)` (Dezimalgenauigkeit für m²/m/Stück-Mischungen, wie heute im Code als freier `Number`-Wert). `einheit`: **Freitext-Spalte**, kein Enum/Lookup – im heutigen Code ist `einheit` ein frei eingegebenes Textfeld (`m², Stk, kg...` als Platzhalter, kein festgelegter Katalog), eine Enum-Einführung wäre Overengineering ohne bestehende fachliche Notwendigkeit und würde bestehende Freitext-Werte (z.B. „psch" für Pauschal, verifiziert in dieser Session verwendet) potenziell brechen.

---

## 24. Unique Constraints

- `invoices`: `unique (company_id, invoice_number)` – entspricht dem bereits bestehenden `rechnungNrCounter`-Konzept.
- Für `projects`/`quotes` aktuell **keine** Geschäftsnummer im Code vorhanden (siehe Teil 1, Abschnitt 4) → kein Unique Constraint dafür, solange diese Nummernkreise nicht eingeführt werden.
- `profiles.auth_user_id` bzw. `employees.auth_user_id`: `unique` (ein Auth-Konto darf nicht zwei Mitarbeiterdatensätzen zugeordnet sein).
- `employees`: `unique (company_id, email)` nur falls E-Mail-Eindeutigkeit fachlich gewünscht ist – **nicht verifiziert, dass das heute erzwungen wird**, daher als Empfehlung, nicht als Fakt markiert.

---

## 25. Datenqualitäts-/Validator-Konzept (Pre-Migration)

Vor jeder echten Migration eines Moduls automatisiert prüfen:
1. Doppelte `id`-Werte innerhalb eines Arrays (sollte durch `uid()` praktisch nicht vorkommen, aber verifizieren statt annehmen).
2. Verwaiste Referenzen: z.B. `rechnungen[].kundeId`, die auf keinen existierenden `kunden[].id` zeigen; `projekte[].kundeId` ebenso; `aufgaben[].projektId` ebenso; `team[]`-Einträge, die auf gelöschte/nicht existierende Mitarbeiter zeigen.
3. Fehlende Pflichtfelder (z.B. Rechnung ohne `nr`, Projekt ohne `name`).
4. `checkliste[]`-Items ohne `id` (bekannter Befund, Teil 1) – bei Migration systematisch neue IDs vergeben und das im Migrationsprotokoll mitzählen.
5. Ungültige Datumswerte (z.B. `fmtDate()` bekommt bereits nicht-parsbare Strings robust behandelt, aber für eine `date`-Spalte in Postgres muss der Wert wirklich valide sein).
6. Uneinheitliche Status-Schreibweisen (Abschnitt 17) vor dem Mapping auf die neuen Enum-Werte zählen, damit keine stillen Datenverluste durch ein unvollständiges Mapping entstehen.

Dieser Validator sollte als **eigenständiges, rein lesendes Script** implementiert werden (läuft gegen einen JSON-Export von `S`, schreibt nichts), bevor Phase 3 beginnt.

---

## 26. Migration Validation (Vorher/Nachher)

Nach jeder Modul-Migration zwingend zu prüfen (automatisiert, nicht manuell):

- Anzahl Datensätze in der Quelle (`S.<key>.length`) == Anzahl Zeilen in der Zieltabelle.
- Summenkontrollen bei Geld (z.B. Summe `rechnungen[].positionen` vs. Summe `invoice_items.preis * menge` in der DB).
- Stichprobenweiser Feld-für-Feld-Vergleich einer zufälligen Teilmenge.
- Referenzintegrität: jede migrierte Fremdreferenz (`kundeId` etc.) muss in der Zieltabelle als gültiger Foreign Key auflösbar sein.
- Migration gilt **nur** als erfolgreich, wenn alle diese Prüfungen grün sind – sonst Rollback (Abschnitt 30).

---

## 27. Cloud-Sync-Migrationsstufen (M0–M8)

Angepasst an den tatsächlichen Code (nicht das generische Beispiel aus deiner Vorgabe, sondern konkret auf `persistState()`/`cloudSyncPush()`/`subscribeRealtime()` bezogen):

- **M0** (heute): `S` → IndexedDB/localStorage → `erm_data.payload` komplett → Realtime ersetzt kompletten State.
- **M1**: Neue Tabellen (z.B. `tasks`) werden angelegt, bleiben aber leer/unbenutzt. Kein Verhalten ändert sich.
- **M2**: Einmalige, geprüfte Migration der Bestandsdaten **eines Moduls** (siehe Pilotmodul, Abschnitt 29) aus `S.<key>` in die neue Tabelle. `S.<key>` bleibt im Payload unverändert (Redundanz bewusst vorübergehend in Kauf genommen).
- **M3**: Ein **Read-Adapter** wird eingeführt: Statt `S.aufgaben` direkt zu lesen, liest das Aufgaben-Modul über eine neue Funktion (z.B. `getTasks()`), die – hinter einem Feature-Flag – wahlweise aus `S.aufgaben` oder aus der neuen Tabelle liest. Noch alles lesend, kein Schreibverhalten geändert.
- **M4**: Schreibvorgänge des migrierten Moduls gehen **datensatzbezogen** auf die neue Tabelle (`UPDATE tasks WHERE id = ...` statt kompletten Payload zu speichern). `S.aufgaben` wird beim Speichern **nicht mehr mitgeschrieben** (kein Dual-Write, siehe Abschnitt 28 – bewusste Entscheidung gegen Dual-Write).
- **M5**: Alle anderen, noch nicht migrierten Module bleiben unverändert Payload-basiert – App läuft in einem **Hybridzustand**, das ist explizit vorgesehen und kein Fehlerzustand.
- **M6**: Nächstes Modul nach demselben Muster (M2–M4) migrieren, eines nach dem anderen, mit Test+Freigabe zwischen jedem Schritt (identisch zum Phase-1-Vorgehen).
- **M7**: Wenn alle produktiv wichtigen Module migriert sind, enthält `erm_data.payload` nur noch Restdaten/Legacy-Felder – wird zur reinen Absicherung/Backup-Quelle, nicht mehr aktiv gelesen.
- **M8**: Nach einer bewusst gewählten Beobachtungsfrist (nicht in dieser Phase festgelegt) kann der alte Payload-Pfad endgültig abgeschaltet werden – **explizite, separate Freigabe nötig**, keine Automatik.

---

## 28. Dual-Write kritisch bewertet

**Bewertung**: Dual-Write (Payload UND neue Tabelle bei jedem Schreibvorgang gleichzeitig befüllen) wird **nicht empfohlen**.

Risiken konkret für dieses System:
- **Divergenz**: Schlägt einer der beiden Writes fehl (z.B. Netzwerkfehler beim Supabase-Insert, aber `persistState()` lokal erfolgreich), laufen Payload und Tabelle sofort auseinander – und das System hat aktuell keinen Mechanismus, das zu erkennen.
- **Realtime-Loop-Risiko**: `subscribeRealtime()` reagiert heute auf `UPDATE`-Events der `erm_data`-Tabelle und ersetzt den kompletten State. Würde man zusätzlich Realtime auf die neue Tabelle legen, während noch Dual-Write auf den Payload läuft, entsteht ein reales Risiko für sich gegenseitig auslösende Update-Zyklen.
- **Doppelte Updates/Konflikte**: Zwei Schreibpfade für dieselbe fachliche Änderung erschweren die in Abschnitt 29 geplante Konfliktstrategie (welcher Pfad „gewinnt" bei einem Konflikt?).

**Empfohlene Alternative**: **Einmalige Migration + gezielter Modulwechsel** (M2–M4 oben) – der Payload wird für das migrierte Modul einmalig kopiert und danach **nicht mehr weiter befüllt**, der Lesepfad wechselt komplett. Sauberer, vorhersehbarer, leichter zu testen als dauerhaftes Dual-Write.

---

## 29. Realtime-Konzept (Ziel)

Nicht mehr: ein `UPDATE`-Event auf `erm_data` → kompletter State-Ersatz.

Stattdessen, **nur wo fachlich sinnvoll**:
- `project_chat_messages`: Realtime sinnvoll (Live-Chat-Charakter).
- `tasks`/`projects`: Realtime sinnvoll bei Teamarbeit (mehrere Bauleiter sehen Statusänderungen live) – aber **datensatzbezogen** (nur das geänderte Projekt/die geänderte Aufgabe kommt rein, nicht der komplette State).
- `invoices`/`employees`/`customers`: **kein** Realtime nötig – seltene Änderungen, normales Neuladen beim nächsten Öffnen reicht, spart Komplexität.
- `subscribeRealtime()` wird pro migriertem Modul durch einen gezielten `postgres_changes`-Listener auf genau diese eine Tabelle ersetzt, nicht eine einzige globale Payload-Subscription.

---

## 30. Konfliktstrategie

Mindestens `updated_at` auf jeder Tabelle mit Mehrbenutzerschreibzugriff (praktisch alle fachlichen Tabellen). **Optimistic Concurrency** (zusätzliches `version int`-Feld oder Vergleich gegen `updated_at` vor dem Schreiben) besonders wichtig bei:
- `invoices`/`invoice_items` (Geld, hohe Priorität)
- `projects` (Budget/Status – potenziell gleichzeitig von GF und Bauleiter bearbeitet)
- `lv_items` (mehrere Personen könnten am selben LV arbeiten)

Weniger kritisch (Konflikt selten/unwahrscheinlich, z.B. weil nur ein Verantwortlicher schreibt): `employees` (i.d.R. nur GF bearbeitet), `customers`.

**Konkretes Beispiel-Verhalten**: Nutzer A lädt Projekt mit `updated_at = T1`. Nutzer B speichert dasselbe Projekt, `updated_at` wird zu `T2`. Nutzer A versucht zu speichern und sendet seinen zuletzt bekannten `updated_at = T1` mit – Backend/RLS-Check (`WHERE id = ... AND updated_at = T1`) schlägt fehl (0 Zeilen betroffen), Frontend zeigt „Diese Änderung basiert auf einem veralteten Stand – bitte neu laden" statt B's Änderung still zu überschreiben.

---

## 31. Backup-/Restore-Konzept

1. **Supabase-DB-Backup**: Prüfen, ob Point-in-Time-Recovery im aktuellen Supabase-Plan aktiv ist (nicht von hier aus prüfbar ohne Dashboard-Zugriff – offene Frage an dich, Abschnitt 33).
2. **Storage-Backup**: Sobald Dateien in Supabase Storage liegen (Phase 4), regelmäßiger Export/Snapshot einplanen.
3. **JSON-Export**: Die bestehende manuelle Backup-Funktion in den Einstellungen (Phase 0 erwähnt) bleibt während der gesamten Migration die einfachste, sofort verfügbare Sicherung – **vor jedem Migrationsschritt manuell ausführen**, das ist der pragmatischste Rollback-Anker.
4. **Restore-Test**: Vor Phase 3 einmal bewusst einen Test-Restore aus einem JSON-Export durchführen (in einer Kopie/Testumgebung, nicht produktiv) – bisher laut Phase 0 nicht nachweislich getestet.
5. **Migrations-Backup**: Unmittelbar vor jedem `M2`-Schritt (Bestandsdaten-Kopie eines Moduls) einen frischen JSON-Export ziehen und aufbewahren, bis die Validierung (Abschnitt 26) für dieses Modul bestanden ist.

---

## 32. Feature Flags

**Empfehlung**: Ein **sehr einfaches** Flag reicht – kein eigenes Feature-Flag-System nötig. Beispiel: `LC.dataSource = { tasks: "legacy" | "supabase_table" }` im bereits bestehenden lokalen Config-Objekt (`LC`, gerätespezifisch, nicht Teil des synchronisierten Payloads) für den Übergangszeitraum eines einzelnen Piloten. Sobald M4 (Abschnitt 27) abgeschlossen ist, wird das Flag wieder entfernt – es ist ein Übergangswerkzeug, kein Dauerzustand.

---

## 33. Versionierte SQL-Migrationen – Zielstruktur

```
/supabase
  /migrations
    001_baseline_schema.sql       -- Abbild des tatsächlichen Live-Schemas (sobald inventarisiert, Abschnitt 16)
    002_companies_profiles.sql
    003_roles_permissions.sql
    004_customers_subcontractors.sql
    005_projects_core.sql
    006_tasks_pilot.sql            -- Pilotmodul, siehe Abschnitt 34
    ...
  /migrations-draft
    (Entwürfe vor Freigabe, siehe separate Datei in diesem Repo)
```

Jede Datei einzeln ausführbar, sicher wiederholbar (`create table if not exists`, `drop policy if exists` vor `create policy` – exakt das Muster, das die bestehende `supabase-schema.sql` für die RLS-Migration schon nutzt).

---

## 34. Modul-Migrationsreihenfolge – Bewertung möglicher Pilotmodule

| Kandidat | Komplexität | Abhängigkeiten | Datenrisiko | Dateien | RLS-Komplexität | Testbarkeit | Nutzen als Pilot | Gesamt |
|---|---|---|---|---|---|---|---|---|
| **Aufgaben** (`aufgaben`) | Niedrig (flache Struktur, 8 Felder) | Referenziert `projektId`/`zugeordnet`, aber optional (`nullable`) – keine harte Abhängigkeit | Niedrig (nicht steuerrelevant, kein Geld) | Keine | Niedrig (eine Sichtbarkeitsregel: eigene + zugewiesene Projekte) | Sehr gut (bereits mit Tests abgedeckt, klar abgrenzbar) | Direkt sichtbarer Nutzen (Multi-User-Aufgabenliste ohne Überschreibrisiko) | **Beste Wahl** |
| Kunden (`kunden`) | Niedrig | Wird von `projekte`/`rechnungen` referenziert (Fremdschlüssel-Ziel, nicht -Quelle) | Mittel (Stammdaten, aber kein Geld direkt) | Ja (`dokumente[]`) – erhöht Aufwand | Niedrig | Gut | Guter Kandidat, aber Dateien erhöhen den Umfang | Solide Alternative |
| Fahrzeuge (`fuhrpark`) | Niedrig-Mittel | Kaum verlinkt mit anderen Modulen | Niedrig | Teilweise (nicht tief geprüft) | Unklar (Fuhrpark in Phase 0/1 nicht tief analysiert) | Geringer Praxisnutzen als Pilot (Randmodul) | Nicht empfohlen als erster Test |
| Subunternehmer (`subunternehmer`) | Niedrig | Wird von `projekte.subunternehmer[]`/`ausschreibung[]` referenziert | Mittel | Ja (`dokumente[]`) | Mittel | Mittel | Ähnlich wie Kunden, aber weniger zentral genutzt | Solide, aber nicht erste Wahl |

**Bewusst nicht gewählt**: Projekte (wie von dir vorgegeben ausgeschlossen – zu viele Kindstrukturen für einen ersten Versuch) und Rechnungen (zu hohes Datenrisiko für einen ersten Testlauf, auch wenn das Modul selbst simpel wirkt).

---

## 35. Empfehlung für erstes Pilotmodul: **Aufgaben (`aufgaben` → `tasks`)**

Begründung: flachste Datenstruktur im gesamten State (8 Felder, keine Dateien, keine verschachtelten Arrays), bereits gut mit Tests abgedeckt, geringes fachliches Risiko bei einem Fehler (keine Geld-/Steuerrelevanz), und liefert trotzdem einen **echten** Multi-User-Nutzen als Proof-of-Concept: mehrere Bauleiter, die gleichzeitig Aufgaben anlegen/abhaken, sind heute exakt das Last-Write-Wins-Risiko aus Abschnitt 30 – hier ließe sich der Konfliktschutz zum ersten Mal wirklich beobachten.

---

## 36. Exakte Phase-3-Schritte für dieses eine Pilotmodul (nur Plan, keine Ausführung)

1. `tasks`-Tabelle per Migration anlegen (Entwurf liegt in `supabase/migrations-draft/`, **nicht ausgeführt**) inkl. RLS-Policy „sichtbar für zugewiesenen Mitarbeiter, verantwortlichen Bauleiter (falls Projektbezug) und Geschäftsführung".
2. Datenqualitäts-Validator (Abschnitt 25) gegen den aktuellen `S.aufgaben`-Export laufen lassen, Befunde beheben (in den Quelldaten, nicht am Code).
3. JSON-Backup ziehen (Abschnitt 31, Punkt 5).
4. Einmaliges Migrationsscript: jede `S.aufgaben[i]` → `tasks`-Zeile, `legacy_id` = alte `uid()`-ID mitführen.
5. Validierung (Abschnitt 26): Anzahl, Stichprobenvergleich, Referenzintegrität (`projektId`/`zugeordnet` lösen korrekt auf).
6. Read-Adapter `getTasks()` einführen, hinter Feature-Flag (Abschnitt 32) zunächst weiter auf `S.aufgaben` zeigend.
7. Flag für Testgerät/Testnutzer auf `supabase_table` umschalten, Kernflows manuell/automatisiert prüfen (Aufgabe anlegen/bearbeiten/löschen/Statuswechsel, Projekt-Übersicht-Widget „Offene Aufgaben").
8. Schreibpfad umstellen: `saveAufgabe()`/`setAufgabeStatus()` etc. schreiben direkt auf `tasks` (datensatzbezogenes `UPDATE`/`INSERT`), `S.aufgaben` wird nicht mehr aktiv befüllt.
9. Flag firmenweit umschalten, `S.aufgaben` bleibt vorerst als Altdaten im Payload stehen (kein Löschen).
10. Beobachtungszeitraum, danach separate Freigabe für den nächsten Modul-Kandidaten (z.B. Kunden).

---

## 37. Risiken

- Kein direkter Live-Schema-Zugriff → Baseline-Schema-Lücke bleibt bestehen, bis du mir einen Export/Dashboard-Auszug gibst (Abschnitt 16).
- `checkliste[]` ohne eigene `id` erfordert eine kleine Sonderbehandlung bei jeder Migration, die dieses Feld berührt.
- Rollenbasierte Projektsichtbarkeit (Bauleiter/Mitarbeiter nur zugewiesene Projekte) ist ein **fachlicher Verhaltenswechsel** gegenüber heute – siehe offene Entscheidung unten.
- Passwörter-Modul: reales, aktives Sicherheitsrisiko unabhängig von jeder Migration – siehe Teil 2, Abschnitt 11.
- Statuswert-Inkonsistenzen (Abschnitt 17) müssen vor jedem Modul-Mapping einzeln geprüft werden, sonst drohen stille Fehlklassifikationen beim Import.

---

## 38. Offene Entscheidungen, die du als Produktverantwortlicher treffen musst

1. **Rollensichtbarkeit von Projekten**: Sollen Bauleiter/Mitarbeiter künftig wirklich nur ihre zugewiesenen Projekte sehen (wie im RLS-Konzept, Teil 2, Abschnitt 12 vorgeschlagen), oder bewusst wie heute alle Projekte sehen dürfen? Das ist eine fachliche/kulturelle Entscheidung, keine rein technische.
2. **Passwörter-Modul**: Welches Verschlüsselungsniveau ist akzeptabel (Supabase Vault vs. clientseitige Verschlüsselung vs. vorerst nur RLS-Einschränkung auf Geschäftsführer)? Ohne diese Entscheidung migriere ich das Modul nicht.
3. **Baseline-Schema-Export**: Wie bekomme ich (sicher, nur lesend) ein aktuelles Abbild des Live-Schemas?
4. **Supabase-Plan/Backup-Status**: Ist Point-in-Time-Recovery aktiv? Das beeinflusst, wie vorsichtig wir bei Phase 3 vorgehen müssen.
5. **Nummernkreise**: Sollen Projekte/Angebote/Aufträge künftig eigene Geschäftsnummern bekommen (wie bei Rechnungen), oder reicht der freie Projektname weiterhin?
6. **Lohn-Datenschutz-Niveau**: Reicht eine RLS-Policy (nur Geschäftsführer liest `employee_compensation`), oder wird zusätzlicher Schutz (z.B. Audit-Log jedes Lesezugriffs auf Lohndaten) gewünscht?
7. **Zeitpunkt/Reihenfolge** für das zweite Pilotmodul nach Aufgaben – erst nach einer bewussten Beobachtungsphase entscheiden, nicht vorab festlegen.

---

*(Ende des dreiteiligen Phase-2-Berichts. SQL-Entwurf liegt separat unter `supabase/migrations-draft/001_pilot_tasks_DRAFT.sql`, ausdrücklich nicht ausgeführt.)*
