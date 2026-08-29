# UI/UX Foundation

Basis: grüner Phase-3C-Checkpoint `ad3cd645267b769bc57f347e5bb9f0c1f811b760`.

## Ziel

Die Bedienoberfläche des ERM schrittweise modernisieren, ohne die gerade stabilisierte Datenmigration zu vermischen.

## Harte Grenzen

- Kein Merge und keine direkte Änderung von `main`.
- Keine Supabase-Schema-/Datenänderung.
- Kein Realtime-Cutover.
- Keine Änderung am Passwortmodul.
- Keine implizite Aktivierung des Task-Supabase-Piloten.
- Bestehende Daten- und Mutationsverträge bleiben unverändert; UI/UX-Änderungen müssen gegen die vorhandenen Smoke-/Phase-3C-Tests laufen.

## Erste UI/UX-Etappe

1. App-Shell und Navigation auf iPad/Mobile konsistent machen.
2. Seitenkopf, Abstände, Karten und Aktionsbuttons vereinheitlichen.
3. Aufgabenansicht für Touch-Bedienung und kleine Viewports verbessern, ohne Task-Logik zu verändern.
4. Modals/Formulare auf mobile Breiten, Fokus und sichere Touch-Ziele prüfen.
5. Dashboard-Informationshierarchie verbessern, nachdem Shell und Aufgabenansicht stabil sind.

## Umgesetzter Foundation-Schritt

Die UI/UX-Schicht liegt branch-isoliert unter `src/ui/` und wird über `src/core/utils.js` nachgeladen. Sie greift weder auf Supabase noch auf `S` oder die Task-Runtime zu.

- Touch-Ziele für Navigation, Buttons, Tabs und Formulare sind auf mindestens 44 px angehoben.
- iPad-/Tablet-Abstände, Sidebar-Breite, Karten und Inhaltsbreiten sind harmonisiert.
- Auf kleinen Viewports werden zentrale Grids einspaltig, Modals als besser erreichbare Bottom-Sheets dargestellt und Aktionsflächen vergrößert.
- Fokuszustände und `aria-current` verbessern Tastatur- und Screenreader-Navigation.
- Die neue Leiste **Verknüpft** verbindet inhaltlich passende Module, z. B. Aufgaben mit Projekte/Mitarbeiter/Kalender und Projekte mit Aufgaben/Kunden/Zeiterfassung.
- Diese Verknüpfungen erfinden ausdrücklich keine eigenen Routen. Sie suchen die bereits vorhandenen Navigationselemente und delegieren den Klick an genau diese bestehende Navigation. Fehlt ein Bereich in der aktuellen App, wird dafür kein Link angezeigt.
- Die Verknüpfung ist ausschließlich Navigation; sie verändert keine Datensätze, Flags oder Persistenz.

## Sicherheits- und Regressionstest

`tests/uiux-foundation.test.js` prüft insbesondere:

- stabile Normalisierung und Relationstabellen;
- nur tatsächlich vorhandene Navigation wird angeboten;
- Klicks werden an bestehende Nav-Controls delegiert;
- bestehender View-Inhalt bleibt erhalten;
- kein Legacy-State `S` und keine `TaskRuntimeBootstrap`-Kopplung wird erzeugt;
- die bestehende Phase-3C-Readiness-Suite bleibt ein separates CI-Gate.

## Vorgehen

Jede Etappe bleibt klein und reviewbar. Funktionale Änderungen an Persistenz/Auth werden getrennt behandelt. Vor und nach UI-Codeänderungen werden mindestens Legacy-Smoke-Tests und die Phase-3C-Readiness-Suite ausgeführt. Browser-/iPad-Prüfung folgt erst nach grüner CI.

## Nächster sicherer UI/UX-Schritt

Nach grüner CI und erfolgreichem Deploy-Preview wird die Informationshierarchie der Hauptansichten weiter vereinheitlicht: Seitenkopf, primäre Aktionen, Dashboard-KPIs und Aufgaben-Karten. Dabei bleiben Repository-, Auth-, Passwort- und Supabase-Verträge unverändert.
