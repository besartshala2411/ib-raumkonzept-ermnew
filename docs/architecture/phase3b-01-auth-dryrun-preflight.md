# Phase 3B – Auth-Mapping + lokaler Dry-Run

Status: Vorbereitung. Keine Live-DDL/DML, kein Supabase-Schreibzugriff.

## Ziel

Vor jeder echten Pilot-Migration müssen die 2 vorhandenen `auth.users`-Konten eindeutig auf bestehende Mitarbeiter verweisen und alle Aufgaben-Referenzen auf Mitarbeiter/Projekte konsistent sein. Der Check läuft lokal und gibt standardmäßig nur Kennzahlen/Fehler aus.

## Datenschutz-/Security-Grenze

Keinen vollständigen `erm_data.payload`- oder Backup-Export verwenden. Insbesondere dürfen `S.passwoerter` und andere nicht benötigte Module nicht in den Preflight gelangen.

Zulässige Pilot-Eingabe enthält ausschließlich:

- `aufgaben`: Kopie von `S.aufgaben`
- `mitarbeiter`: nur `id`, `authUserId`, `rolle`, `status`
- `projekte`: nur `id`

Die Auth-Datei enthält nur UUIDs aus `auth.users`, keine E-Mail-Adressen.

## 1. READ-ONLY Auth-IDs in Supabase

Im SQL Editor ausschließlich ausführen:

```sql
select id
from auth.users
order by created_at;
```

Das Ergebnis enthält bei der verifizierten Baseline 2 UUIDs. Keine E-Mails oder Metadaten exportieren.

Als lokale Datei `auth-user-ids.json` speichern:

```json
[
  "UUID-1",
  "UUID-2"
]
```

## 2. Pilotdaten aus der laufenden ERM-App erzeugen

In der Browser-DevTools-Konsole der bereits angemeldeten ERM-App ausführen. Der Ausdruck kopiert nur die drei erlaubten Bereiche in die Zwischenablage:

```js
copy(JSON.stringify({
  aufgaben: (S.aufgaben || []).map(a => ({
    id: a.id,
    titel: a.titel,
    beschreibung: a.beschreibung || "",
    faellig: a.faellig || "",
    prioritaet: a.prioritaet,
    projektId: a.projektId || null,
    zugeordnet: a.zugeordnet || null,
    status: a.status
  })),
  mitarbeiter: (S.mitarbeiter || []).map(m => ({
    id: m.id,
    authUserId: m.authUserId || null,
    rolle: m.rolle,
    status: m.status
  })),
  projekte: (S.projekte || []).map(p => ({ id: p.id }))
}, null, 2));
```

In eine lokale Datei `phase3b-pilot-input.json` speichern. Diese Datei nicht committen und nicht in Tickets/Chats hochladen; sie kann Aufgabentitel/-beschreibungen enthalten.

## 3. Lokal prüfen

```bash
node tools/migration/phase3bPreflight.js phase3b-pilot-input.json auth-user-ids.json
```

Zusätzlich bleiben die bestehenden Phase-3A-Checks gültig:

```bash
npm run test:tasks-migration
npm run test:phase3b-preflight
npm test
```

## 4. Freigabekriterien

Für den nächsten Schritt gilt: `errors = 0`; beide Auth-Konten sind entweder eindeutig gemappt oder ein nicht gemapptes Test-/Alt-Konto ist bewusst erklärt; keine ungültige `projektId`/`zugeordnet`-Referenz; projektlose/unzugewiesene Aufgaben werden bewusst bewertet, da sie nach der neuen RLS nur Geschäftsführer sehen; Aufgaben an Mitarbeiter ohne Auth-Konto werden gezählt und dürfen nicht still als "migriert und nutzbar" gelten.

## 5. Was zurückgemeldet werden darf

Für Review reichen die `summary`-Kennzahlen sowie anonymisierte Fehler-/Warntexte. Keine Aufgabentitel, Beschreibungen, Mitarbeiternamen, E-Mails, Passwörter, JWTs oder Service-Role-Keys teilen.

## STOP-Grenze

Auch bei grünem Preflight wird Draft 003 noch nicht live ausgeführt. Danach folgen: konkrete Minimal-Seed-Daten für Profiles/Employees/Projects/Project-Members, idempotenter Importplan, Testkonto/RLS-Matrix und ausdrückliche Live-Freigabe.
