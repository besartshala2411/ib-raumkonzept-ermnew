# Phase 2 – Teil 2: RLS-Konzept, Storage-Konzept, Base64-Migrationsmatrix, sensible Daten

Status: **PLANUNG.** Kein RLS live geändert, kein Storage-Bucket angelegt.

---

## 10. Sensible Personaldaten

`employees.brutto` und `employees.stundenlohn` sind heute im selben Objekt wie Name/Telefon/Projektzuordnung – im UI zwar über `hasAdminAccess()` in der Lohn-Ansicht abgesichert (`if(tab==="lohn" && !hasAdminAccess()) tab = "stammdaten"`, verifiziert Zeile 1630), aber **das ist reine UI-Absicherung**, kein Datenbankschutz (siehe Phase 0/1: aktuelle RLS lässt jeden authentifizierten Nutzer die komplette `erm_data`-Zeile lesen).

**Planung für Zielmodell**: `employees`-Tabelle bleibt eine Tabelle (kein Overengineering mit separater `employee_salary`-Tabelle nötig, wenn RLS spaltenweise nicht ausreicht) – stattdessen: Für `brutto`/`stundenlohn` eine **eigene RLS-geschützte View** (`employees_public` ohne Lohnspalten für `Mitarbeiter`/`Bauleiter`, volle Tabelle nur für `Geschäftsführer`) ODER, falls Supabase/Postgres Column-Level-Security via RLS+Views zu unhandlich wird, doch eine separate `employee_compensation`-Tabelle (`employee_id FK`, `brutto`, `stundenlohn`) mit eigener, strengerer RLS-Policy. **Empfehlung**: separate Tabelle – sauberer mit RLS abzubilden als Column-Level-Tricks.

---

## 11. Passwörter & Zugänge – Security-Risiko (kritisch, ausdrücklich markiert)

**Ist-Zustand, verifiziert** (`openPasswortForm`/`savePasswort`, Zeile 5422ff.): `S.passwoerter[]` speichert `{id, bezeichnung, benutzername, passwort, url, notiz}` – das Feld `passwort` wird als **reiner Klartext-String** erfasst (`<input type="text">`, keine Verschlüsselung, kein Hashing, keine client-seitige Verschlüsselung vor dem Speichern) und landet im selben `erm_data.payload`, der:

1. Per Realtime an **jedes eingeloggte Gerät** verteilt wird.
2. Von **jedem authentifizierten Nutzer** über die aktuelle RLS-Policy (`auth.role() = 'authenticated'`, keine Rollenprüfung) lesbar ist – unabhängig davon, ob dieser Nutzer im UI Zugriff auf das Modul hat.
3. In IndexedDB/localStorage auf **jedem Gerät**, das sich je eingeloggt hat, unverschlüsselt auf der Festplatte liegt.

**Das ist ein reales, aktives Sicherheitsrisiko in der Produktivanwendung**, nicht nur ein theoretisches Migrationsproblem. Es betrifft vermutlich Zugangsdaten zu Drittsystemen (Software-Logins, Portale) des Betriebs.

**Ähnliches, geringeres Risiko**: `p.zugaenge[].info` (Baustellen-Zugangscodes/Schlüssel-PINs) – gleiche Klasse (Klartext im gemeinsamen Payload), aber niedrigere Kritikalität (physische Codes statt Account-Zugangsdaten).

**Ich entwerfe in Phase 2 bewusst keine eigene Kryptografie-Lösung** (das wäre Implementierung, nicht Planung). Optionen, die in einer eigenen, dedizierten Sicherheits-Phase bewertet werden sollten:

- Supabase Vault (server-seitige Verschlüsselung via `pgsodium`/Vault-Erweiterung) für das `passwort`-Feld.
- Client-seitige Verschlüsselung mit einem vom Nutzer gehaltenen Schlüssel (Zero-Knowledge) – höherer UX-Aufwand, aber stärkster Schutz.
- Mindestlösung als Zwischenschritt: RLS so verschärfen, dass `credentials`-Tabelle **nur** für `Geschäftsführer`-Rolle lesbar ist (reduziert Angriffsfläche drastisch, verschlüsselt aber immer noch nicht „at rest" gegen einen kompromittierten Admin-Account oder DB-Zugriff).

**Empfehlung für Phase 3**: Das Passwörter-Modul **nicht** als Teil der ersten Pilot-Migration mitnehmen, bis eine explizite Verschlüsselungsentscheidung getroffen wurde – sonst wird das heutige Risiko nur 1:1 in eine neue Tabelle kopiert.

---

## 12. RLS-Konzept (Entwurf, noch nicht live umgesetzt)

Grundprinzip: **`company_id` + `auth.uid()` + Rolle + (optional) Projektzugehörigkeit**, nie pauschal `auth.role() = 'authenticated'` wie heute.

Beispiel-Policy-Muster (**DRAFT, nicht ausgeführt** – vollständige Entwürfe liegen in `supabase/migrations-draft/`):

```sql
-- Muster: unternehmensweit lesbar für alle Mitarbeiter der Firma
create policy "customers_select" on customers for select
  using ( company_id = (select company_id from employees where auth_user_id = auth.uid()) );

-- Muster: nur Geschäftsführer/Bauleiter dürfen anlegen/ändern
create policy "customers_write" on customers for insert with check ( ... rolle in (...) ... );

-- Muster: Projekte nur für zugewiesene Mitarbeiter/Bauleiter sichtbar, GF sieht alles
create policy "projects_select" on projects for select
  using (
    exists (select 1 from employees e where e.auth_user_id = auth.uid() and e.company_id = projects.company_id and e.rolle = 'Geschäftsführer')
    or exists (select 1 from project_members pm join employees e on e.id = pm.employee_id where pm.project_id = projects.id and e.auth_user_id = auth.uid())
  );

-- Muster: Rechnungen ausschließlich für Admin-Rollen
create policy "invoices_select" on invoices for select
  using ( exists (select 1 from employees e where e.auth_user_id = auth.uid() and e.company_id = invoices.company_id and e.rolle in ('Geschäftsführer','Bauleiter')) );

-- Muster: Lohn-Tabelle ausschließlich Geschäftsführer
create policy "employee_compensation_select" on employee_compensation for select
  using ( exists (select 1 from employees e where e.auth_user_id = auth.uid() and e.rolle = 'Geschäftsführer') );
```

**Rollenmatrix für RLS** (Zusammenfassung aus Abschnitt 9, Teil 1):

- **Geschäftsführer**: volle Unternehmenssicht (alle Projekte, alle Finanzdaten, alle Mitarbeiterdaten inkl. Lohn).
- **Bauleiter**: zugewiesene Projekte + zugehörige Stammdaten (Kunde, Team, Dokumente), **keine** Finanzdaten (Rechnungen/Verträge), **keine** Lohndaten.
- **Mitarbeiter**: eigene Zeiterfassung/Urlaub/Aufgaben + Basisinformationen zugewiesener Projekte (kein Budget, keine Rechnungen, keine Verträge, keine fremden Personaldaten).

**Wichtig**: „Nur zugewiesene Projekte sichtbar" für `Mitarbeiter`/`Bauleiter` ist im heutigen UI **nicht** umgesetzt (alle sehen alle Projekte) – das RLS-Konzept geht hier bewusst über den heutigen Ist-Zustand hinaus, weil es fachlich sinnvoll ist. Das wird explizit als **offene Entscheidung** in Teil 3 markiert, da es das Nutzerverhalten sichtbar verändert.

---

## 13. Storage-Konzept

**Entscheidung: ein privater Bucket mit Pfadstruktur**, nicht viele einzelne Buckets – einfacher zu verwalten, RLS greift ohnehin über Pfad-Präfixe, nicht über Bucket-Grenzen.

```
erm-files (privat, kein öffentlicher Zugriff)
  /{company_id}/employees/{employee_id}/{document_id}.{ext}
  /{company_id}/customers/{customer_id}/{document_id}.{ext}
  /{company_id}/subcontractors/{subcontractor_id}/{document_id}.{ext}
  /{company_id}/projects/{project_id}/photos/{photo_id}.{ext}
  /{company_id}/projects/{project_id}/documents/{document_id}.{ext}
  /{company_id}/projects/{project_id}/floorplans/{document_id}.{ext}
  /{company_id}/projects/{project_id}/signatures/{signature_id}.png
  /{company_id}/invoices/{invoice_id}/signature.png
```

- **Upload**: über Netlify Function oder direkten Supabase-Storage-Client-Upload mit RLS-geprüften Storage-Policies (Pfad muss `company_id` des eingeloggten Nutzers entsprechen).
- **Download**: **signed URLs** (zeitlich begrenzt), keine dauerhaft öffentlichen Links – entspricht dem heutigen Sicherheitsniveau eher als dauerhafte URLs.
- **Delete**: an Soft-Delete der zugehörigen `documents`-Zeile gekoppelt; physisches Storage-Delete erst nach Aufbewahrungsfrist/manueller Bereinigung (siehe Backup/Restore, Teil 3).
- **Versionierung**: Supabase Storage unterstützt keine native Objekt-Versionierung im Sinne von Dateiversionen – falls `document_versions` (siehe Tabellenkatalog, als LATER markiert) später gebraucht wird, bekäme jede Version einen eigenen `storage_path` mit Versionssuffix.

---

## 14. Base64-Migrationsmatrix

Alle 62 in Phase 0 gefundenen DataURL-Stellen, klassifiziert nach Dateiklasse (nicht jede Fundstelle einzeln, sondern nach Muster gruppiert – die Muster wiederholen sich modulweise):

| Dateiklasse | Modul/Entity | Aktuelles Feld | Größenordnung | Ziel-Bucket-Pfad | RLS nötig | Versionierung | Migrationsaufwand |
|---|---|---|---|---|---|---|---|
| Projektfoto | `p.fotos[].dataURL` | DataURL (komprimiert via `compressImage`, max 1600px/0.75 Qualität) | ~100–400 KB/Foto, potenziell hunderte pro Projekt | `projects/{id}/photos/` | Projektzugehörigkeit | Nein | Mittel (viele Dateien, aber einheitliches Muster) |
| Projektdokument | `p.dokumente[].dataURL` | DataURL (unkomprimiert, Original-PDF/Bild) | Sehr variabel, PDFs bis mehrere MB | `projects/{id}/documents/` | Projektzugehörigkeit | Später möglich | Mittel |
| Grundriss | `p.grundrisse[].dataURL` | DataURL (Bild) | ~1–5 MB | `projects/{id}/floorplans/` | Projektzugehörigkeit | Nein | Niedrig (neues Feature, wenig Bestand) |
| Mitarbeiterdokument | `mitarbeiter[].dokumente[].dataURL` | DataURL, inkl. Pflichtdokumente mit `gueltigBis` | Variabel | `employees/{id}/` | **Streng** (Personaldaten) | Nein | Mittel |
| Kundendokument | `kunden[].dokumente[].dataURL` | DataURL | Variabel | `customers/{id}/` | Firmenweite Sichtbarkeit | Nein | Niedrig |
| Subunternehmerdokument | `subunternehmer[].dokumente[].dataURL` | DataURL | Variabel | `subcontractors/{id}/` | Firmenweite Sichtbarkeit | Nein | Niedrig |
| Unterschrift (mehrfach) | Urlaubsantrag, Bautagebuch, Rechnung, Verträge, Vorlagen, Schlüssel, Checkliste | `dataURL`/PNG, klein (Canvas-Export) | ~5–20 KB | `.../signatures/` | Wie Elternentität | Nein | Niedrig (klein, aber **viele** Fundstellen – 8+ verschiedene Signatur-Felder) |
| Vorlagen-Instanz (generiertes PDF) | `S.vorlagen[].` (PDF wird zusätzlich in `p.dokumente[]` gespiegelt) | DataURL | Variabel | `projects/{id}/documents/` (bereits über Dokumente-Pfad abgedeckt) | Wie Projektdokument | Nein | Niedrig |
| Firmenlogo/Icon | `firma.logo`/`firma.icon` | DataURL | Klein-Mittel | eigener Pfad `companies/{id}/branding/` | Firmenweite Sichtbarkeit | Nein | Sehr niedrig (1 Datensatz) |
| Zentrale Dokumente | `S.dokumente[].dataURL` | DataURL | Variabel | `documents/` mit optionalem `project_id` | Firmenweite Sichtbarkeit | Nein | Niedrig |

**Priorisierung für Phase 4 (Storage-Migration, noch nicht jetzt)**: Projektfotos zuerst (größter Payload-Anteil, größter Performance-Gewinn), dann Projektdokumente, dann die restlichen kleineren Klassen.

---

## 15. Unterschriften – technische Integrität

Unterschriften sind funktional Bestandteil eines **Nachweisdokuments** (Urlaubsantrag, Rechnung, Bautagebuch, Verträge, Checkliste, Schlüsselübergabe). Technische (nicht juristische) Planung:

- Unterschrift wird zusammen mit dem PDF-Snapshot des Dokuments zum Zeitpunkt der Unterzeichnung als **unveränderliches Artefakt** behandelt: sobald `unterschrift`/`unterschriftAG`/`unterschriftAN` gesetzt ist und das zugehörige PDF erzeugt wurde, sollte weder die Unterschrift-Datei noch das erzeugte PDF nachträglich überschreibbar sein (heute technisch möglich, da alles nur State-Felder sind).
- Im Zielmodell: `signature_storage_path` wird **einmalig** gesetzt, danach nur noch lesbar (RLS ohne `update`-Policy auf dieses Feld nach Erstsetzung, oder Prüfung in einer Funktion/Trigger).
- Keine Aussage zur rechtlichen Wirksamkeit der Unterschrift wird hier getroffen – nur zur **technischen Unveränderlichkeit** nach Erstellung.
