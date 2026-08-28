# Phase 3B – Auth-/Aufgaben-Preflight Ergebnis

Stand: 2026-08-28

## Status

Dieses Ergebnis basiert auf einer lokalen, read-only Auswertung des laufenden ERM-States plus der zuvor read-only ermittelten Anzahl/IDs der Supabase-Auth-Konten. Es wurden keine Daten in Supabase oder im ERM verändert.

## Ergebnis

- Supabase Auth: 2 Konten vorhanden.
- Davon ist aktuell genau 1 Konto über `S.mitarbeiter[].authUserId` eindeutig einem aktiven Mitarbeiter mit Rolle `Geschäftsführer` zugeordnet.
- Das zweite Auth-Konto hat aktuell keine Zuordnung in `S.mitarbeiter[].authUserId`.
- `S.aufgaben` enthält aktuell 0 Datensätze.
- Damit gibt es aktuell keine Aufgaben-Datenqualitätsfehler, keine Projekt-/Mitarbeiter-Referenzfehler und keine zu migrierenden Legacy-Aufgaben.

## Konsequenzen

1. Für einen echten Aufgaben-Datenimport gibt es aktuell nichts zu migrieren. Der Aufgaben-Pilot ist daher im nächsten Schritt primär ein Schema-/RLS-/Repository-Cutover-Test für neue Aufgaben, nicht ein Bestandsdaten-Migrationsfall.
2. Das eindeutig gemappte Geschäftsführer-Konto kann als kontrolliertes Testkonto für den Pilot dienen.
3. Das nicht gemappte Auth-Konto darf NICHT geraten oder automatisch einem Mitarbeiter zugeordnet werden. Es bleibt bis zur manuellen Klärung ungemappt und erhält dadurch über das neue `employees`-Mapping keine Task-RLS-Rechte.
4. Vor Live-DDL/DML ist weiterhin eine ausdrückliche Freigabe nötig. Insbesondere bleibt `erm_data` samt Legacy-Policy unverändert.
5. Da `S.aufgaben` leer ist, entfällt ein klassischer Aufgaben-Import-Dry-Run gegen Produktivdaten. Stattdessen müssen synthetische Repository-/RLS-Tests und ein kontrollierter Testkonto-Flow die Cutover-Sicherheit abdecken.

## Nächster technischer Schritt

Vorbereiten, aber noch nicht live ausführen:

- finalen Pilot-SQL-Draft auf genau ein verifiziertes Testkonto ausrichten,
- Seed/Mapping für Firma + Profil + minimalen Mitarbeiter-Anker des gemappten Kontos vorbereiten,
- nicht gemapptes Auth-Konto absichtlich unberührt lassen,
- TaskRepository-Supabase-Pfad implementieren,
- Feature-Flag standardmäßig `legacy` lassen,
- kontrollierten Testablauf für CREATE / SELECT / UPDATE / Soft Delete dokumentieren,
- erst danach Live-Ausführung separat freigeben.

## Sicherheitsgrenze

Keine Passwörter, E-Mails, Gehälter, Dokumente oder vollständigen Legacy-States wurden in dieses Ergebnis übernommen. Die Klartext-Passwortproblematik im Legacy-Payload bleibt separat Security Priority 0.
