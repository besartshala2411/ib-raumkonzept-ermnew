# UI/UX Foundation

Basis: grüner Phase-3C-Checkpoint `ad3cd645267b769bc57f347e5bb9f0c1f811b760`.

## Status

Die responsive UI/UX-Foundation ist auf dem isolierten Branch `phase3c-uiux-foundation` technisch abgeschlossen. Der Stand verändert keine Persistenz-, Auth-, Passwort- oder Supabase-Verträge und bleibt vollständig vom Production-Branch getrennt.

## Harte Grenzen

- Kein Merge und keine direkte Änderung von `main`.
- Keine Supabase-Schema-/Datenänderung.
- Kein Realtime-Cutover.
- Keine Änderung am Passwortmodul.
- Keine implizite Aktivierung des Task-Supabase-Piloten.
- Bestehende Daten- und Mutationsverträge bleiben unverändert.

## Abgeschlossene UI/UX-Bausteine

- App-Shell, Inhaltsbreiten, Seitenköpfe und Abstände sind über Desktop, iPad/Tablet und Mobile vereinheitlicht.
- Navigation, Buttons, Tabs, Eingaben und Schnellzugriffe verwenden sichere Touch-Ziele von mindestens 44 px.
- Dashboard-KPIs, Karten und Quick-Tiles folgen einer gemeinsamen visuellen Hierarchie.
- Aufgaben, Projekte, Kunden, Mitarbeiter, Kalender, Zeiterfassung, Rechnungen und Urlaub erhalten ausschließlich aus der aktiven bestehenden Navigation abgeleitete Section-Klassen. Es werden keine Datenzustände dafür verwendet oder verändert.
- Bestehende Karten, KPIs, Quick-Tiles und Hauptaktionen werden rein dekorativ markiert; die ursprünglichen DOM-Inhalte und Event-Handler bleiben erhalten.
- Tabellen sind auf schmalen Geräten horizontal touch-scrollbar und per Tastatur fokussierbar.
- Formulare, Modals und Modal-Aktionen sind für Mobile/iPad vergrößert; Modals werden auf kleinen Viewports als erreichbare Bottom-Sheets dargestellt.
- Fokuszustände, `aria-current` und reduzierte Bewegung verbessern Barrierefreiheit und Tastaturbedienung.
- Die Leiste **Verknüpft** verbindet Aufgaben, Projekte, Kunden, Mitarbeiter, Kalender, Zeiterfassung, Rechnungen und Urlaub nur über tatsächlich vorhandene Navigationselemente. Sie delegiert Klicks an die bestehende Navigation und erfindet keine eigenen Routen.
- Der UI/UX-Loader läuft erst nach dem Parser-/DOM-Boot, damit der bestehende Legacy-App-Start nicht blockiert wird.

## Sicherheits- und Regressionstests

`tests/uiux-foundation.test.js` prüft unter anderem:

- stabile Normalisierung und begrenzte Relationstabellen;
- Section-Klassen werden korrekt gesetzt und beim Ansichtswechsel sauber ersetzt;
- nur tatsächlich vorhandene Module erscheinen als Verknüpfungen;
- Klicks werden an bestehende Navigation delegiert;
- Karten/KPIs/Quick-Tiles/Hauptaktionen werden nur visuell dekoriert;
- Tabellen erhalten nur Zugänglichkeitsattribute, keine Datenänderungen;
- bestehender View-Inhalt bleibt erhalten;
- kein Legacy-State `S` und keine `TaskRuntimeBootstrap`-Kopplung wird erzeugt.

Zusätzlich bleiben Legacy-Smoke-Tests und die vollständige Phase-3C-Readiness-Suite zwingende CI-Gates.

## Abnahmegrenze

Technisch ist die Foundation abgeschlossen, sobald CI und Netlify Deploy Preview auf demselben Head grün sind. Eine spätere rein visuelle Feinabstimmung anhand realer iPad-/Desktop-Screenshots kann weiter auf diesem Branch erfolgen. Funktionale Änderungen an Datenflüssen oder Live-Supabase bleiben davon getrennt und benötigen weiterhin ihre eigene Freigabe.
