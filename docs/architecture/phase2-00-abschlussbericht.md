# Phase 2 – Vollständiger Abschlussbericht

**Status: Planung abgeschlossen. Keine Code-Änderung, keine Supabase-Änderung, kein SQL ausgeführt, kein Push.**
Verifiziert am Ende dieses Dokuments per `git status` / `git diff --stat`.

---

## 🔴 KRITISCH / PRIORITÄT 0 — Klartext-Passwörter im geteilten Payload

Bevor der reguläre 24-Punkte-Bericht beginnt, wird dieser Befund hier bewusst vorangestellt, wie ausdrücklich gefordert.

**Befund**: `S.passwoerter[].passwort` (Modul „Passwörter & Zugänge") wird als **reiner Klartext-String** erfasst und gespeichert – keine Verschlüsselung, kein Hashing, keine client-seitige Absicherung, an keiner Stelle im Code.

**Verifizierte Verbreitungswege** (in dieser Phase 2 gezielt nachgeprüft, nicht nur vermutet):

1. **Cloud-Sync Push** (`cloudSyncPush()`): Der komplette State `S` – inklusive `passwoerter` – wird bei *jedem* Speichervorgang (nicht nur bei Änderungen am Passwörter-Modul) an `erm_data.payload` in Supabase gesendet.
2. **Cloud-Sync Pull / Realtime** (`cloudSyncPull()`, `subscribeRealtime()`): Jedes Gerät, das sich mit dem System verbindet, empfängt den kompletten Payload inklusive aller Klartext-Passwörter und speichert ihn lokal.
3. **IndexedDB + localStorage**: Auf jedem Gerät, das je eingeloggt war, liegt der komplette Payload unverschlüsselt auf der Festplatte.
4. **Backup-Export – schwerwiegendster Einzelfund**: `exportBackupJSON()` erzeugt `JSON.stringify(S, null, 2)` als lokale Download-Datei „ERM_Backup_*.json". Die UI-Beschreibung lautet „Vollständige Sicherung aller Daten inkl. Fotos/Dokumente" – **ohne jeden Hinweis**, dass diese Datei auch sämtliche Klartext-Passwörter enthält. Diese Datei kann anschließend beliebig geteilt, per Mail verschickt oder in einen Cloud-Speicher hochgeladen werden – der Bruch verlässt an dieser Stelle vollständig die Kontrolle des Systems selbst.
5. **Backup-Import**: symmetrisches Risiko – eine unsicher weitergegebene Backup-Datei reaktiviert die enthaltenen Passwörter beim Import direkt wieder im System.
6. **Globale Suche**: indexiert `bezeichnung`, `benutzername`, `url` der Passwort-Einträge (nicht das Passwort selbst), sichtbar für alle Nutzer mit `hasAdminAccess()`. Geringeres, aber vorhandenes Metadaten-Expositionsrisiko.
7. **Supabase RLS (aktueller Stand)**: Die aktive Policy prüft nur `auth.role() = 'authenticated'`, **keine Rollenprüfung**. Das bedeutet: Ein Mitarbeiter-Konto ohne UI-Zugriff auf das Passwörter-Modul (`hasAdminAccess()` gate greift nur im Frontend) könnte über einen direkten Supabase-API-Aufruf trotzdem die komplette `erm_data`-Zeile inklusive Klartext-Passwörtern lesen. **Die UI-Sperre ist kein Sicherheitsmodell**, wie bereits in Phase 0/1 grundsätzlich festgestellt – hier zeigt sich das konkret an einem realen, sensiblen Datensatz statt nur theoretisch.

**Explizit nicht betroffen** (verifiziert, nicht vermutet): Netlify-Functions (`grep` über beide `.mjs`-Dateien: keine Treffer für „passwoerter"/„passwort"), CSV-Export (`exportAllCSV()` enthält nur Mitarbeiter/Kunden/Projekte/Rechnungen), sämtliche PDF-Export-Funktionen (keine referenziert `S.passwoerter`). Die Masken-Anzeige (`••••••••`) im UI ist nicht trivial über „Element untersuchen" umgehbar – der Klartextwert steht nicht im DOM, solange nicht aktiv auf „anzeigen" geklickt wird. Das ist ein kleiner positiver Fund, ändert aber nichts an den obigen sieben Verbreitungswegen.

**Weisung befolgt**: Es wurden in dieser Phase **keine** Passwörter gelöscht, verschlüsselt, migriert oder sonst verändert. Dieser Befund ist ausschließlich dokumentiert.

**Empfehlung** (Entscheidung liegt bei dir, siehe offene Entscheidungen, Punkt 24.2): Bis eine Verschlüsselungsentscheidung getroffen ist, sollte dieses Modul weder in eine neue Tabelle migriert noch in seiner heutigen Form weiter ausgebaut werden. Eine kurzfristig wirksame *Teil*-Abmilderung (löst das Grundproblem „Klartext" nicht, würde aber Befund 7 schließen) wäre eine RLS-Policy, die `erm_data`-Lesezugriff auf Nutzer mit Admin-Rolle einschränkt – das wäre allerdings bereits eine Supabase-Änderung und damit **nicht** Teil dieser Planungsphase.

---

## 1. Executive Summary

Phase 2 liefert einen vollständigen, am tatsächlichen Code verifizierten Bauplan für die Migration vom heutigen Einzel-Payload-Modell zu einem relationalen Mehrbenutzer-Datenmodell. Das fachliche Datenmodell ist bereits heute solide (u.a. eine echte Geometrie-Engine im Aufmaß, sauber getrennte technische/geschäftliche IDs bei Rechnungen). Die zentralen Risiken sind strukturell (gemeinsamer Payload ohne Datensatz-Granularität, siehe Abschnitt 13–15) und **ein konkretes, aktives Sicherheitsproblem** (Klartext-Passwörter, oben). Empfohlener erster Migrationsschritt: das Modul „Aufgaben" (Abschnitt 21).

## 2. Ist-Datenmodell

Single-Tenant-PWA, ein State-Objekt `S` mit ~20 Top-Level-Bereichen, persistiert über IndexedDB/localStorage lokal und als ein JSON-Blob (`erm_data.payload`) in Supabase. Vollständige Herleitung: `phase2-01-datenmodell.md`, Abschnitt 1.

## 3. Vollständiges State-Inventar

Jeder Top-Level-Key tabellarisch erfasst: Datentyp, Kernfelder, Lese-/Schreibstatus, Modul, Dateien/Base64-Anteil, Sensibilität, Zieltabelle, Priorität. Korrektur gegenüber Phase 0: `planung` ist **aktiv** (Plantafel-Modul, 6 Fundstellen inkl. Testabdeckung), nicht Legacy. Nur `tagesaufgaben` ist bestätigter Dead Code (1 Fundstelle, nur die Default-Initialisierung selbst). Vollständige Tabelle: `phase2-01-datenmodell.md`, Abschnitt 2.

## 4. Projekt-Unterstruktur

Alle 12 tatsächlich vorhandenen Unterbereiche (`team, subunternehmer, fotos, dokumente, grundrisse, material, ausschreibung, bautagebuch, zugaenge, checkliste, aufmasse, bauzeitenplan, chat`) einzeln bewertet nach: Struktur, Referenzen, Tabelle-vs-JSONB, Storage-Bezug, Löschverhalten, erwartete Größe, RLS-Besonderheit. Zwei Detailfunde: `checkliste[]`-Items haben **keine eigene `id`** (Migrationssonderfall), `aufmasse[]` wird bewusst hybrid geplant (Raum-Kopf relational, Wandsegment-Geometrie als JSONB, da nie einzeln abgefragt). Vollständig: `phase2-01-datenmodell.md`, Abschnitt 3.

## 5. Ziel-ER-Modell

Mermaid-ER-Diagramm mit allen geplanten Kernbeziehungen (`companies → employees/customers/subcontractors/projects`, `projects → project_members (N:M) → employees`, `invoices → invoice_items/payments`, `documents → document_versions` usw.). Vollständig: `phase2-01-datenmodell.md`, Abschnitt 5.

## 6. Tabellenkatalog

25 Tabellen, klassifiziert MUST HAVE / SHOULD HAVE / LATER, jeweils mit Zweck, Kernspalten, Primary/Foreign Keys, Indizes, Soft-Delete-Bedarf, RLS-Anforderung. Bewusste Zurückstellung: `lv_documents`/`lv_sections` als eigenständige, versionierte Struktur (existiert fachlich heute nicht – nur `lv_items` als 1:1-Ersatz für `material[]` ist MUST HAVE). `payments` neu geplant für Teilzahlungen (heute nur binär `offen/bezahlt`) – reine Datenmodell-Vorbereitung, keine neue Funktion in dieser Phase. Vollständig: `phase2-01-datenmodell.md`, Abschnitt 6.

## 7. Auth-Zielmodell

Heute: `resolveAndEnter()` matcht `session.user.email` gegen `mitarbeiter[].email`; ein `authUserId`-Feld existiert bereits, wird aber nicht als primäre Zuordnung genutzt. Ziel: `employees.auth_user_id uuid FK → profiles.id` als stabile Zuordnung, E-Mail-Matching nur noch als Fallback bei Erstanlage. Bestehende `authUserId`-Werte werden bei Migration direkt übernommen, kein erneutes Matching nötig. Vollständig: `phase2-01-datenmodell.md`, Abschnitt 8.

## 8. Rollen-/Permission-Zielmodell

Bestätigt (Phase 1): `hasAdminAccess()` ist bereits die einzige zentrale Prüfstelle (11 Aufrufstellen), keine verstreuten `role===`-Vergleiche gefunden. Empfohlene Zielvariante: schlanke DB-Tabellen (`roles`, `permissions`, `role_permissions`), kein `user_permissions` (keine Fachanforderung dafür erkennbar). Begründeter Variantenvergleich: `phase2-01-datenmodell.md`, Abschnitt 9.

## 9. Permission-Matrix

Konkrete Matrix für 15 Bereiche × 3 Rollen (Mitarbeiter/Bauleiter/Geschäftsführer), deckt sich mit dem heutigen `RESTRICTED_MODULES`-Verhalten, erweitert es um projektbezogene Sichtbarkeit (als **offene Entscheidung** markiert, siehe Abschnitt 24.1). Vollständig: `phase2-01-datenmodell.md`, Abschnitt 9 (Tabelle am Ende).

## 10. RLS-Konzept

Grundprinzip `company_id + auth.uid() + Rolle + Projektzugehörigkeit` statt der heutigen pauschalen `auth.role()='authenticated'`-Policy. Konkrete SQL-Muster für Kunden/Projekte/Rechnungen/Lohn-Daten. Vollständig inkl. Beispiel-Policies: `phase2-02-security-storage.md`, Abschnitt 12.

## 11. Storage-Konzept

Ein privater Bucket (`erm-files`) mit klarer Pfadstruktur nach `company_id/entität/id/`, signed URLs statt dauerhafter öffentlicher Links, Upload/Download/Delete-Regeln definiert. Vollständig: `phase2-02-security-storage.md`, Abschnitt 13.

## 12. Base64-Migrationsmatrix

11 Dateiklassen (Projektfoto, Projektdokument, Grundriss, Mitarbeiter-/Kunden-/Subunternehmerdokument, 8+ verschiedene Unterschrift-Stellen, Vorlagen-PDF, Firmenlogo, zentrale Dokumente) einzeln mit Zielpfad, RLS-Bedarf, Versionierungsbedarf, Migrationsaufwand bewertet. Vollständig: `phase2-02-security-storage.md`, Abschnitt 14.

## 13. Offline-/Sync-Konzept

Bestehendes PWA-Verhalten (Service Worker, IndexedDB/localStorage) bleibt Grundlage – nicht zerstören. Pragmatische Einordnung: Baustellenfunktionen (Zeiterfassung, Bautagebuch, Fotos, Aufgaben) profitieren am meisten von Offline-Fähigkeit, Finanzdaten (Rechnungen) müssen nicht zwingend identisch offlinefähig sein. Sync-Queue-Konzept (`pending_operations`) nur skizziert, nicht implementiert. Vollständig: `phase2-03-migrationsplan.md`, Abschnitte 27/28 (Kontext).

## 14. Realtime-Konzept

Ziel: kein globales „ein Update ersetzt alles" mehr, sondern gezielte, tabellenspezifische Realtime-Subscriptions nur dort, wo fachlich sinnvoll (Chat, Aufgaben/Projekte bei Teamarbeit) – nicht bei selten geänderten Daten (Rechnungen, Mitarbeiter, Kunden). Vollständig: `phase2-03-migrationsplan.md`, Abschnitt 29.

## 15. Konfliktstrategie

`updated_at` auf allen Mehrbenutzer-Tabellen, Optimistic-Concurrency-Prüfung besonders bei `invoices`, `projects`, `lv_items`. Konkretes Ablaufbeispiel (Nutzer A/B, veralteter Stand wird erkannt statt still überschrieben) ausformuliert. Vollständig: `phase2-03-migrationsplan.md`, Abschnitt 30.

## 16. SQL-Migrationsstruktur

Zielverzeichnis `/supabase/migrations/001…nnn`, jede Datei einzeln und sicher wiederholbar (`create table if not exists`, `drop policy if exists` vor `create policy` – Muster bereits aus der bestehenden RLS-Migration bekannt). Vollständig: `phase2-03-migrationsplan.md`, Abschnitt 33.

## 17. Backup-/Restore-Konzept

5-stufig: Supabase-DB-Backup-Status prüfen (offene Frage, Abschnitt 24.4), künftiges Storage-Backup, die bestehende JSON-Export-Funktion als sofort verfügbarer pragmatischer Anker, ein bewusster Test-Restore vor Phase 3, sowie ein frischer Export unmittelbar vor jedem Migrationsschritt. Vollständig: `phase2-03-migrationsplan.md`, Abschnitt 31.

**Wichtiger Querverweis**: Genau diese Backup-Export-Funktion ist auch der schwerwiegendste Verbreitungsweg des Klartext-Passwort-Befunds oben (Punkt 4) – Backup-Konzept und Sicherheitsbefund hängen an derselben Funktion und müssen gemeinsam betrachtet werden, bevor an der Backup-Funktion irgendetwas geändert wird.

## 18. Datenqualitäts-/Validator-Konzept

Pre-Migration-Prüfungen definiert: doppelte IDs, verwaiste Referenzen (`kundeId`, `projektId`, Team-Zuordnungen), fehlende Pflichtfelder, die bekannte fehlende `id` bei Checkliste-Items, ungültige Datumswerte, uneinheitliche Statuswerte (siehe Fund unten). Als eigenständiges, rein lesendes Script vorgesehen. Vollständig: `phase2-03-migrationsplan.md`, Abschnitt 25.

**Zusatzfund dieser Phase**: Statuswerte sind heute uneinheitlich geschrieben (`mitarbeiter.status` klein, `projekte.status` groß mit Leerzeichen, `aufgaben.status` gemischt „in Arbeit") – vor jedem Modul-Mapping einzeln zu prüfen, sonst drohen stille Fehlklassifikationen. Vollständige Tabelle: `phase2-03-migrationsplan.md`, Abschnitt 17.

## 19. Modul-Migrationsreihenfolge

Bewertungsmatrix für 4 Kandidaten (Aufgaben, Kunden, Fahrzeuge, Subunternehmer) nach Komplexität, Abhängigkeiten, Datenrisiko, Dateien, RLS-Komplexität, Testbarkeit, Pilotnutzen. Vollständig: `phase2-03-migrationsplan.md`, Abschnitt 34.

## 20. Bewertung möglicher Pilotmodule

Projekte und Rechnungen bewusst **nicht** als erster Versuch gewählt (zu komplex bzw. zu hohes Datenrisiko für einen Erstversuch) – wie ausdrücklich vorgegeben. Detailbegründung je Kandidat: `phase2-03-migrationsplan.md`, Abschnitt 34 (Tabelle).

## 21. Empfehlung für erstes Pilotmodul

**Aufgaben (`aufgaben` → `tasks`)**: flachste Datenstruktur (8 Felder, keine verschachtelten Arrays, keine Dateien), bereits mit automatisierten Tests abgedeckt, geringes fachliches Risiko bei Fehlern (kein Geld, keine Steuerrelevanz), liefert aber einen echten Multi-User-Proof-of-Concept (paralleles Anlegen/Abhaken durch mehrere Bauleiter ist der klassische Last-Write-Wins-Fall). Begründung vollständig: `phase2-03-migrationsplan.md`, Abschnitt 35.

## 22. Exakte Phase-3-Schritte für dieses eine Pilotmodul

10 konkrete, sequenzielle Schritte – von Tabellenanlage über Validator-Lauf, Backup, einmalige Migration mit `legacy_id`-Rückverfolgung, Validierung, Read-Adapter hinter Feature-Flag, testweise Umschaltung, Schreibpfad-Umstellung, bis zur firmenweiten Umschaltung. Vollständig ausformuliert: `phase2-03-migrationsplan.md`, Abschnitt 36.

## 23. Risiken

- **Priorität 0**: Klartext-Passwörter (siehe oben) – unabhängig von jeder Migration bereits heute aktiv.
- Fehlender Baseline-Schema-Zugriff (kein DB-Lesetool in dieser Session verbunden) – siehe offene Entscheidung 24.3.
- `checkliste[]` ohne eigene `id` erfordert Sonderbehandlung bei Migration.
- Rollenbasierte Projektsichtbarkeit ist ein fachlicher Verhaltenswechsel gegenüber heute, nicht rein technisch – siehe offene Entscheidung 24.1.
- Statuswert-Inkonsistenzen (Abschnitt 18) müssen vor jedem Modul-Mapping geprüft werden.
- Dual-Write wurde geprüft und **bewusst nicht empfohlen** (Divergenz-/Realtime-Loop-Risiko) – stattdessen einmalige Migration + gezielter Modulwechsel, siehe `phase2-03-migrationsplan.md`, Abschnitt 28.

## 24. Offene Entscheidungen, die du treffen musst

1. **Projektsichtbarkeit**: Sollen Bauleiter/Mitarbeiter künftig nur zugewiesene Projekte sehen, oder wie heute alle? Der SQL-Entwurf (`001_pilot_tasks_DRAFT.sql`) enthält bereits beide RLS-Varianten, eine davon auskommentiert.
2. **Passwörter-Modul**: Welches Schutzniveau (Supabase Vault / clientseitige Verschlüsselung / vorerst nur RLS-Einschränkung auf Geschäftsführer)? Ohne diese Entscheidung wird das Modul nicht migriert.
3. **Baseline-Schema-Export**: Wie bekomme ich sicher, nur lesend, ein aktuelles Abbild des Live-Schemas (Supabase-Dashboard-Export oder `information_schema`-Abfrage)?
4. **Supabase-Backup-Status**: Ist Point-in-Time-Recovery im aktuellen Plan aktiv? Beeinflusst die Vorsicht bei Phase 3.
5. **Nummernkreise**: Sollen Projekte/Angebote/Aufträge künftig eigene Geschäftsnummern bekommen (wie Rechnungen), oder reicht der freie Projektname weiter?
6. **Lohn-Datenschutz-Niveau**: Reicht eine RLS-Policy (nur Geschäftsführer liest `employee_compensation`), oder wird zusätzliches Audit-Logging von Lesezugriffen gewünscht?
7. **Backup-Export-Sicherheit** (neu, aus dem Prioritäts-0-Befund): Soll `exportBackupJSON()` kurzfristig einen Warnhinweis bekommen bzw. optional eine Variante ohne Passwörter anbieten? Das wäre eine reine UI-Änderung außerhalb dieser Planungsphase – nur als Entscheidungsbedarf hier vermerkt, nicht umgesetzt.
8. Zeitpunkt/Reihenfolge für das zweite Pilotmodul nach Aufgaben – erst nach Beobachtungsphase entscheiden.

---

## Verifikation: Keine Code-/Supabase-Änderung

```
$ git status
```
```
$ git diff --stat
```
(Ausgabe siehe Chat-Antwort direkt im Anschluss an dieses Dokument.)

---

*Vollständige Detailherleitung in `phase2-01-datenmodell.md`, `phase2-02-security-storage.md`, `phase2-03-migrationsplan.md`. SQL-Entwurf in `supabase/migrations-draft/001_pilot_tasks_DRAFT.sql` (DRAFT, nicht ausgeführt).*
