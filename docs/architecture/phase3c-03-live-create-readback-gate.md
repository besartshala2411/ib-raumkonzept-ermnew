# Phase 3C – Live-Create READ-Back Gate

Stand: 2026-08-29

Status: **Live-WRITE-Pilot nach erstem Create angehalten; Code-Gate gehärtet, erneuter Browser-Check erforderlich.**

## Beobachtung im kontrollierten Branch-Deploy

Im authentifizierten Phase-3C-Branch-Deploy waren READ und tab-lokales WRITE sichtbar aktiv. Anschließend wurde genau eine synthetische Aufgabe mit dem vorgesehenen Pilot-Titel gespeichert. Direkt danach zeigte die Aufgabenansicht weiterhin `0 offen` und keine Task-Karte.

Aus dem Browser-Screenshot allein lässt sich nicht sicher unterscheiden, ob der INSERT serverseitig erfolgreich war und nur der Runtime/UI-READ nicht aktualisiert wurde oder ob die Mutation vorher fehlgeschlagen ist. Deshalb wird **kein zweiter Live-Create** ausgeführt, bevor der Zustand read-only erneut geprüft wurde.

## Code-Härtung

Der Create-Pfad akzeptiert einen erfolgreichen `repository.create()`-Rückgabewert nicht mehr als ausreichenden Erfolg.

Nach jedem Pilot-Create muss jetzt unmittelbar über dasselbe gemappte Supabase-Repository ein neuer `list()`-READ erfolgen. Nur wenn die zurückgegebene Liste die neu erzeugte Task-ID enthält:

- wird `runtime.tasks` durch diesen verifizierten READ ersetzt;
- wird das Create-Formular geschlossen;
- wird die Aufgabenansicht neu gerendert;
- wird eine Erfolgsmeldung ausgegeben.

Ist die neue ID im direkten READ nicht sichtbar, bleibt der Vorgang fail-closed: kein Legacy-Fallback, keine Erfolgsmeldung und kein stilles Runtime-Append. Die Fehlermeldung weist ausdrücklich darauf hin, keine weitere Aufgabe anzulegen.

## Regressionstest

`tests/task-runtime-create-readback.test.js` deckt beide Fälle ab:

1. INSERT + unmittelbar sichtbarer READ-Back → Runtime wird ausschließlich aus dem bestätigten READ aktualisiert.
2. INSERT liefert ID, READ-Back enthält sie nicht → Formular bleibt offen, Runtime/Legacy bleiben unverändert und der Pilot meldet den Fehler eindeutig.

Der Test ist Bestandteil von `test:phase3c-readiness`.

## Nächster Live-Schritt

Nach erfolgreichem CI und veröffentlichtem Branch-Deploy:

1. Branch-Deploy mit `?ibTaskPilotControl=1` neu laden.
2. READ/WRITE-Status prüfen.
3. **Noch keinen neuen Task erstellen.** Zuerst die Aufgabenansicht read-only öffnen bzw. neu laden.
4. Falls der zuvor versuchte Pilot-Task sichtbar ist, genau diesen Datensatz für die weiteren Status-/Soft-Delete-Schritte verwenden; keinen zweiten Pilot-Task anlegen.
5. Falls weiterhin kein Pilot-Task sichtbar ist, darf genau ein erneuter synthetischer Create durchgeführt werden. Der neue Code muss ihn unmittelbar per Supabase-READ bestätigen und anzeigen. Bei jeder Abweichung sofort stoppen.

## Grenzen unverändert

- kein Merge nach `main`;
- keine weiteren Live-Supabase-Schema-/Datenänderungen außerhalb des ausdrücklich kontrollierten Task-Piloten;
- kein Realtime-Cutover;
- keine Änderungen am Passwortmodul;
- kein Legacy-WRITE-Fallback während aktivem READ-Pilot.
