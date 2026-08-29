# Phase 3C – Task-Cutover Readiness

Status: **Code-seitig vorbereitet; Live-WRITE-Pilot bleibt das nächste externe Gate.**

## Zweck

Dieser Checkpoint definiert den nächsten sicheren Migrationsschritt nach dem Phase-3C Runtime-/WRITE-Pilot. Er ändert weder Supabase-Schema noch Daten und aktiviert keinen Realtime-Pfad.

## Automatisierte Gates

Vor jedem weiteren Task-Cutover müssen auf dem Arbeitsbranch grün sein:

- Legacy-Smoke-Tests
- Task-Migrations- und Preflight-Tests
- Supabase-Repository-Tests
- Runtime-Gate- und Browser-Bridge-Tests
- Auth-/Runtime-Race-Tests
- tab-lokale WRITE-Scope-Tests
- Flag-Integrity-Tests (nur der exakte Wert `1` aktiviert READ/WRITE)
- synthetischer WRITE-Lifecycle-Dry-Run

## Fail-closed Invarianten

- READ ist ohne explizites `localStorage`-Flag aus.
- WRITE ist ohne explizites `sessionStorage`-Flag aus.
- Andere WRITE-Werte wie `true`, `01` oder `1 ` dürfen den Pilot nicht aktivieren.
- Fehlender/gesperrter Storage darf keinen WRITE-Pfad öffnen.
- Bei angefordertem READ und fehlgeschlagenem Preflight gibt es keinen Legacy-Schreibfallback.
- Entfernen des READ-Flags stoppt weitere Supabase-Reads und -Writes sofort, auch bei einer noch vorhandenen Supabase-Runtime.
- Ergebnisse bereits laufender Mutationen dürfen nach Pilot-Deaktivierung den Runtime-Cache nicht mehr aktualisieren.
- Auth-Wechsel und Logout verwerfen den Supabase-Task-Cache vor einem neuen Benutzer-Render.

## Noch ausstehendes Gate

Der authentifizierte Live-WRITE-Pilot muss in genau einem Browser-Tab mit einem dafür vorgesehenen Pilot-Konto durchgeführt werden:

1. READ-Flag aktivieren.
2. tab-lokales WRITE-Flag aktivieren.
3. genau eine synthetische Aufgabe erstellen.
4. Status ändern.
5. Soft Delete ausführen.
6. Reload kontrollieren.
7. beide Flags entfernen und erneut laden.
8. bestätigen, dass Legacy-State und andere Module unverändert geblieben sind.

Ohne dieses Gate wird kein breiterer Task-Cutover freigegeben.

## Nächster Branch nach erfolgreichem Live-Pilot

Erst nach erfolgreichem Live-Pilot einen separaten Folgebranch für die fachliche Aufgabenintegration anlegen. Dort können Projekt-/Mitarbeiter-Verknüpfungen, Filter und UI/UX schrittweise verbessert werden. Der relationale Datenpfad bleibt dabei hinter expliziten Gates; `main`, Realtime und das Passwortmodul bleiben außerhalb dieses Schritts.

## Rollback

Bei jeder Abweichung:

```js
sessionStorage.removeItem('IB_TASKS_SUPABASE_WRITE_PILOT');
localStorage.removeItem('IB_TASKS_SUPABASE_PILOT');
location.reload();
```

Danach muss das Aufgabenmodul wieder ausschließlich über den unveränderten Legacy-Pfad laufen.
