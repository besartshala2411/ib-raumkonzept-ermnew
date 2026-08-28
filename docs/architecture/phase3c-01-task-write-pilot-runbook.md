# Phase 3C – Kontrollierter Aufgaben-WRITE-Pilot

Status: vorbereitet, **noch nicht live ausführen** ohne ausdrückliche Freigabe.

## Ziel

Den relationalen Aufgabenpfad im Browser kontrolliert für Create, Status-Update und Soft Delete prüfen, ohne den Legacy-State `S.aufgaben` zu verändern und ohne Realtime oder weitere Schemaänderungen.

## Sicherheitsbedingungen

- `main` bleibt unverändert.
- Keine neue Supabase-Migration und keine RLS-/Policy-Änderung.
- Kein Realtime-Cutover.
- Passwortmodul bleibt unangetastet.
- WRITE ist nur erlaubt, wenn **beide** Flags explizit gesetzt sind:
  - `IB_TASKS_SUPABASE_PILOT=1`
  - `IB_TASKS_SUPABASE_WRITE_PILOT=1`
- Wenn der READ-Pilot angefordert ist, aber der Supabase-Preflight fehlschlägt, werden Task-Mutationen fail-closed blockiert. Es gibt dann keinen Legacy-Schreibfallback.
- Bei einem Fehler nach Beginn einer Supabase-Mutation wird niemals dieselbe Mutation zusätzlich in Legacy ausgeführt.

## Vorbedingungen vor Freigabe

1. Aktueller Phase-3C-Head hat grüne CI.
2. Browser ist mit dem bereits verifizierten, relational gemappten Pilot-Konto angemeldet.
3. Keine parallele Bedienung des Aufgabenmoduls in einem zweiten Browser/Tab während des Tests.
4. Ausgangszustand der sichtbaren Tasks wird notiert.

## Aktivierung

Nur nach Freigabe im Test-Browser:

```js
localStorage.setItem('IB_TASKS_SUPABASE_PILOT', '1');
localStorage.setItem('IB_TASKS_SUPABASE_WRITE_PILOT', '1');
location.reload();
```

Danach muss `TaskRuntimeBootstrap.getTaskRuntime().mode` den Wert `supabase` liefern. Ist das nicht der Fall, **keine Mutation durchführen**.

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

Browser neu laden, beide Flags weiterhin aktiv lassen.

Erwartung:

- Gelöschte synthetische Aufgabe wird nicht mehr über `list()` angezeigt.
- Es gibt keine UUID-Kontamination im Legacy-State.

### 5. Fail-closed-Kontrolle

WRITE-Flag aktiv lassen, READ-Preflight absichtlich **nicht** manipulieren. Fail-closed wird primär automatisiert getestet. Ein absichtliches Live-Stören der Verbindung ist für den Pilot nicht erforderlich.

## Deaktivierung

Nach Abschluss:

```js
localStorage.removeItem('IB_TASKS_SUPABASE_WRITE_PILOT');
localStorage.removeItem('IB_TASKS_SUPABASE_PILOT');
location.reload();
```

Erwartung: Task-Modul läuft wieder vollständig über den unveränderten Legacy-Pfad.

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
