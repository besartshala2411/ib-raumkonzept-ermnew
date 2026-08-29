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

## Vorgehen

Jede Etappe bleibt klein und reviewbar. Funktionale Änderungen an Persistenz/Auth werden getrennt behandelt. Vor und nach UI-Codeänderungen werden mindestens Legacy-Smoke-Tests und die Phase-3C-Readiness-Suite ausgeführt. Browser-/iPad-Prüfung folgt erst nach grüner CI.

## Nächster Code-Schritt

Als erster Implementierungsschritt wird ausschließlich die responsive App-Shell untersucht und mit Regressionstests abgesichert. Task-Repository, Task-Runtime, Supabase-Konfiguration und Passwortlogik bleiben unangetastet.
