# Phase 3C – Live-Pilot Ergebnis und UI/UX-Checkpoint

Stand: 2026-08-29

## Ergebnis des kontrollierten Browser-Piloten

Der Task-Pilot wurde auf dem Netlify-Branch-Deploy `phase3c-followup-cutover-readiness` mit getrennten READ-/WRITE-Flags kontrolliert durchgeführt.

Bestätigt wurden:

- Supabase-READ initialisiert mit `mode: supabase` und `reason: ready`.
- Der Runtime-READ lieferte zwei vorhandene Pilot-Tasks.
- Ein UI-Renderfehler, bei dem die Registry eine frühe `renderAufgaben`-Referenz hielt, wurde durch die Route-Bridge behoben.
- Nach dem Fix zeigte die Aufgabenansicht dieselben zwei Tasks, die der Runtime-Cache enthielt.
- WRITE wurde nur tab-lokal über `sessionStorage` aktiviert.
- Statusänderung `offen -> in Arbeit` wurde erfolgreich geschrieben.
- Nach Browser-Reload blieb die Statusänderung erhalten und wurde erneut über Supabase gelesen.
- Der Task `in Arbeit` wurde anschließend per Soft Delete entfernt.
- Nach Browser-Reload blieb der soft-gelöschte Task aus der aktiven Liste ausgeblendet; ein offener Pilot-Task blieb sichtbar.
- Nach Deaktivierung des Piloten fiel die UI erwartungsgemäß auf den unveränderten Legacy-State zurück. Supabase-Pilot-Tasks werden absichtlich nicht in `S.aufgaben` gespiegelt.

## Automatisierte Absicherung

Die bestehende Phase-3C-Readiness-Suite deckt die live bestätigten Verträge bereits ab:

- `tests/task-runtime-route-bridge.test.js`: Supabase-Tasks werden beim Route-Render verwendet, obwohl die Registry die ursprüngliche Renderer-Referenz hält; danach wird das exakte Legacy-Array wiederhergestellt; Flag-Off fällt sofort auf Legacy zurück.
- `tests/task-write-pilot-lifecycle.test.js`: Create, Statuswechsel, Soft Delete, Reload/List und Ausschluss von Hard Delete.
- `tests/task-runtime-create-readback.test.js`: Create gilt erst dann als erfolgreich, wenn der Datensatz im anschließenden Supabase-READ sichtbar ist.
- Race-, Auth-, Flag-Integritäts-, Tab-Scope- und Logout-Tests bleiben Teil von `npm run test:phase3c-readiness`.

## Sicherheitsgrenzen bleiben bestehen

Dieser Checkpoint ist **kein** Production-Cutover.

- `main` bleibt unverändert.
- Kein Realtime-Cutover.
- Keine weiteren Supabase-Schema-, RLS- oder Datenänderungen ohne neue ausdrückliche Freigabe.
- Keine Änderungen am Passwortmodul.
- Der Task-Pilot bleibt standardmäßig aus.
- Pilot AUS bedeutet weiterhin Legacy-Taskansicht; das ist aktuell beabsichtigt und kein Datenverlust.

## Checkpoint für UI/UX

UI/UX-Arbeit darf ab einem grünen CI-Stand auf einem separaten Folgebranch beginnen. Dieser Branch muss von einem grünen `phase3c-followup-cutover-readiness`-Commit abzweigen und darf weder `main` verändern noch den Task-Datenquellen-Cutover implizit einschalten.

Erste UI/UX-Arbeit soll sich auf Darstellung, Navigation, responsives/iPad-taugliches Layout und Bedienabläufe beschränken. Änderungen an Datenpersistenz, Realtime, Auth-/Passwortlogik oder Supabase-Schema bleiben separate Migration-Gates.
