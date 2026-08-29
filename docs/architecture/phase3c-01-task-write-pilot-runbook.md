# Phase 3C – Kontrollierter Aufgaben-WRITE-Pilot

Status: vorbereitet, **noch nicht live ausführen** ohne ausdrückliche Freigabe.

## Ziel

Den relationalen Aufgabenpfad im Browser kontrolliert für Create, Status-Update und Soft Delete prüfen, ohne den Legacy-State `S.aufgaben` zu verändern und ohne Realtime oder weitere Schemaänderungen.

## Sicherheitsbedingungen

- `main` bleibt unverändert.
- Keine neue Supabase-Migration und keine RLS-/Policy-Änderung.
- Kein Realtime-Cutover.
- Passwortmodul bleibt unangetastet.
- READ und WRITE sind getrennt freizugeben:
  - `IB_TASKS_SUPABASE_PILOT=1` liegt in `localStorage` und aktiviert den READ-Pilot für die Origin.
  - `IB_TASKS_SUPABASE_WRITE_PILOT=1` liegt absichtlich in `sessionStorage` und aktiviert WRITE nur im aktuellen Browser-Tab.
- Ein WRITE-Flag in `localStorage` allein wird ignoriert. Dadurch werden parallel geöffnete Tabs nicht versehentlich schreibend aktiviert.
- Fehlendes oder gesperrtes `sessionStorage` bleibt fail-closed; WRITE wird dann nicht aktiviert.
- Wenn das READ-Flag in einer bereits initialisierten Supabase-Runtime entfernt wird, werden Task-Mutationen sofort fail-closed blockiert. Ein zurückgelassenes WRITE-Flag darf bis zum vorgesehenen Reload/Runtime-Reset weder Supabase noch Legacy beschreiben.
- Wenn der READ-Pilot angefordert ist, aber der Supabase-Preflight fehlschlägt, werden Task-Mutationen fail-closed blockiert. Es gibt dann keinen Legacy-Schreibfallback.
- Bei einem Fehler nach Beginn einer Supabase-Mutation wird niemals dieselbe Mutation zusätzlich in Legacy ausgeführt.

## Vorbedingungen vor Freigabe

1. Aktueller Phase-3C-Head hat grüne CI.
2. Browser ist mit dem bereits verifizierten, relational gemappten Pilot-Konto angemeldet.
3. Keine parallele Bedienung des Aufgabenmoduls in einem zweiten Browser/Tab während des Tests.
4. Ausgangszustand der sichtbaren Tasks wird notiert.

## Aktivierung

Nur nach Freigabe im Test-Browser und ausschließlich in dem Tab, in dem der WRITE-Pilot ausgeführt wird.

### Desktop / DevTools

```js
localStorage.setItem('IB_TASKS_SUPABASE_PILOT', '1');
sessionStorage.setItem('IB_TASKS_SUPABASE_WRITE_PILOT', '1');
location.reload();
```

### iPad / Chrome / Safari ohne DevTools

Auf dem Phase-3C-Teststand die aktuelle App-URL einmal mit dem Query-Parameter `ibTaskPilotControl=1` öffnen. Beispiel: aus `https://test.example/app#aufgaben` wird `https://test.example/app?ibTaskPilotControl=1#aufgaben`.

Der Parameter **aktiviert den Pilot nicht automatisch**. Er blendet nur den branch-spezifischen Dialog `Phase 3C · Task WRITE Pilot` ein. Dort `Pilot aktivieren` wählen und die Sicherheitsabfrage bestätigen. Erst dieser Klick setzt READ in `localStorage` und WRITE in `sessionStorage` und lädt die Seite neu.

Wenn `sessionStorage` nicht sicher verfügbar ist, rollt die Aktivierung das READ-Flag wieder zurück und bleibt fail-closed. Der Dialog bietet außerdem `Pilot deaktivieren`; dabei werden WRITE zuerst tab-lokal und READ anschließend origin-weit entfernt und die Seite neu geladen.

Danach muss `TaskRuntimeBootstrap.getTaskRuntime().mode` den Wert `supabase` liefern und `TaskRuntimeBootstrap.isTaskWritePilotEnabled(sessionStorage)` muss `true` sein. Ist eine der Bedingungen nicht erfüllt, **keine Mutation durchführen**.

## Testsequenz

### 1. Create

Eine eindeutig benannte synthetische Aufgabe anlegen, z. B. `PHASE3C WRITE PILOT TEST`.

Erwartung:

- Aufgabe erscheint in der Aufgabenansicht.
- Runtime-Cache enthält die neue Aufgabe.
- `S.aufgaben` wird nicht um die neue Aufgabe erweitert.
- Referenzen auf Projekt/Mitarbeiter bleiben in der UI Legacy-IDs; UUIDs werden nur innerhalb der Repository-/Mapping-Schicht verwendet.

### 2. Status-Update

Status der synthetischen Aufgabe von `offen` auf `in Arbeit` und anschließend auf `erledigt` ändern.

Erwartung:

- Update erfolgt nur in Supabase.
- Kein Aufruf des Legacy-Save-Pfads.
- Runtime-Cache spiegelt den zurückgegebenen Datensatz.

### 3. Soft Delete

Synthetische Aufgabe löschen.

Erwartung:

- Repository führt ausschließlich Soft Delete aus.
- Aufgabe verschwindet aus der aktiven Runtime-Liste.
- Kein Hard Delete und kein Legacy-Delete.

### 4. Reload-Kontrolle

Browser neu laden, READ-Flag und tab-lokales WRITE-Flag weiterhin aktiv lassen.

Erwartung:

- Gelöschte synthetische Aufgabe wird nicht mehr über `list()` angezeigt.
- Es gibt keine UUID-Kontamination im Legacy-State.

### 5. Fail-closed-Kontrolle

WRITE-Flag aktiv lassen, READ-Preflight absichtlich **nicht** manipulieren. Fail-closed wird primär automatisiert getestet. Ein absichtliches Live-Stören der Verbindung ist für den Pilot nicht erforderlich.

Automatisiert wird zusätzlich geprüft:

- fehlendes oder gesperrtes `sessionStorage` aktiviert keinen WRITE-Pfad;
- ein entferntes READ-Flag stoppt WRITE sofort auch dann, wenn die aktuelle Runtime noch `supabase` ist;
- Legacy-Schreiben wird erst nach deaktiviertem READ-Flag und Runtime-Reset/Reload wieder freigegeben;
- die iPad-/Mobile-Steuerung aktiviert über den URL-Parameter selbst keine Flags und rollt eine fehlgeschlagene WRITE-Aktivierung vollständig zurück.

## Deaktivierung

Nach Abschluss im Pilot-Tab in dieser Reihenfolge:

```js
sessionStorage.removeItem('IB_TASKS_SUPABASE_WRITE_PILOT');
localStorage.removeItem('IB_TASKS_SUPABASE_PILOT');
location.reload();
```

Auf iPad/Chrome/Safari alternativ den eingeblendeten `Pilot deaktivieren`-Button verwenden.

Zwischen Entfernen der Flags und dem Reload bleiben Mutationen fail-closed, falls die Runtime noch den vorherigen Supabase-Zustand hält. Erst der Reload/Runtime-Reset stellt den unveränderten Legacy-Schreibpfad wieder her.

Erwartung: Task-Modul läuft nach dem Reload wieder vollständig über den unveränderten Legacy-Pfad. Andere Tabs waren zu keinem Zeitpunkt durch das WRITE-Flag aktiviert.

## Abbruchkriterien

Pilot sofort abbrechen und Flags entfernen, wenn eines davon eintritt:

- Runtime-Modus ist nicht `supabase`.
- Eine Mutation verändert `S.aufgaben`.
- UI zeigt UUIDs als Projekt-/Mitarbeiter-Referenzen.
- Eine Mutation wird nach Fehler zusätzlich im Legacy-State sichtbar.
- RLS-/Berechtigungsfehler treten unerwartet auf.
- Andere Module zeigen Regressionen.

## Nach erfolgreichem Pilot

Erst danach entscheiden, ob das Aufgabenmodul für einen breiteren kontrollierten Cutover freigegeben wird. Realtime, weitere Module und `main` bleiben separate Gates.
