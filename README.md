# GCD Kicker

Kicker-App (Spiele eintragen, Übersicht, Spieler, Elo-Statistik) – läuft als
**Cloudflare Worker** mit **Cloudflare D1** als Datenbank.

Früher: Flask + SQLite auf PythonAnywhere. Funktionen, Aussehen und Elo-Berechnung
sind 1:1 übernommen (die Elo-Werte wurden gegen die alte Python-Version geprüft).

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/index.ts` | Alle Routen (`/`, `/overview`, `/players`, `/statistics`, `/submit`, `/add_player`, `/delete_player`, `/admin/games`, `/api/group/:id`) |
| `src/elo.ts` | Elo-Neuberechnung (wie vorher `elo.py`) |
| `src/views/` | HTML der Seiten (vorher `templates/`) |
| `public/` | CSS und Browser-JavaScript, werden von Cloudflare direkt ausgeliefert |
| `migrations/` | Datenbankschema für D1 |
| `scripts/export_sqlite_to_d1.py` | Überträgt die Daten aus der alten `kicker.db` nach D1 |
| `wrangler.jsonc` | Cloudflare-Konfiguration |

---

## Einrichtung bei Cloudflare (einmalig)

Voraussetzungen: ein kostenloser Cloudflare-Account, [Node.js](https://nodejs.org) ab Version 20 und Python 3 (für den Datenexport).

### 1. Projekt installieren und bei Cloudflare anmelden

```bash
npm install
npx wrangler login
```

Es öffnet sich ein Browserfenster, dort Wrangler den Zugriff erlauben.

### 2. D1-Datenbank anlegen

```bash
npx wrangler d1 create kicker-db
```

Die Ausgabe enthält eine `database_id`. Trag sie in `wrangler.jsonc` ein und ersetze damit
`00000000-0000-0000-0000-000000000000`. Wenn Wrangler anbietet, die Konfiguration
selbst zu ergänzen, achte darauf, dass am Ende nur **ein** Eintrag mit `"binding": "DB"`
und `"database_name": "kicker-db"` übrig bleibt.

### 3. Tabellen anlegen

```bash
npx wrangler d1 migrations apply kicker-db --remote
```

### 4. Bestehende Daten von PythonAnywhere übernehmen

1. Bei PythonAnywhere unter **Files** die aktuelle `kicker.db` herunterladen (liegt neben `flask_app.py`).
   Am besten kurz vorher keine Spiele mehr eintragen, damit nichts verloren geht.
2. Die Daten in eine SQL-Datei exportieren:
   ```bash
   python3 scripts/export_sqlite_to_d1.py ~/Downloads/kicker.db data.sql
   ```
   Einträge, die auf gelöschte Spiele oder Spieler zeigen, lässt das Skript weg und meldet sie.
   D1 prüft Fremdschlüssel nämlich strikt, die alte Datenbank nicht.
3. In D1 importieren:
   ```bash
   npx wrangler d1 execute kicker-db --remote --file=./data.sql
   ```
4. Prüfen:
   ```bash
   npx wrangler d1 execute kicker-db --remote --command "SELECT COUNT(*) FROM games"
   ```

`data.sql` und `*.db` stehen in `.gitignore` und landen nicht im Repo.

### 5. Deployen

```bash
npm run deploy
```

Danach läuft die App unter `https://gcdkicker.<dein-subdomain>.workers.dev`.

---

## Automatisches Deployment bei jedem Git-Push (optional, empfohlen)

1. Im Cloudflare-Dashboard: **Workers & Pages → Create → Import a repository**.
2. GitHub verbinden und `gcdkicker` auswählen.
3. Einstellungen:
   - **Project name:** `gcdkicker` (muss zu `name` in `wrangler.jsonc` passen)
   - **Build command:** leer lassen
   - **Deploy command:** `npx wrangler d1 migrations apply kicker-db --remote && npx wrangler deploy`
   - **Production branch:** `main`
4. Speichern. Ab jetzt wird jeder Push auf `main` automatisch deployt, und neue
   Migrationen werden vorher eingespielt.

Die `database_id` muss dafür in `wrangler.jsonc` committet sein (siehe Schritt 2). Sie ist kein Geheimnis.

## Eigene Domain (optional)

Im Dashboard beim Worker unter **Settings → Domains & Routes → Add → Custom domain**,
z. B. `kicker.deine-domain.de`. Die Domain muss bei Cloudflare verwaltet werden.

## Admin-Seite schützen (optional)

`/admin/games` ist wie vorher ohne Passwort erreichbar. Um sie zu schützen:
**Zero Trust → Access → Applications → Add an application → Self-hosted**, als Domain die
Worker-Adresse mit Pfad `/admin/*` angeben und eine Policy anlegen (z. B. nur deine E-Mail-Adresse).
Bis 50 Nutzer ist das kostenlos.

---

## Lokal entwickeln

```bash
npm run db:migrate:local
python3 scripts/export_sqlite_to_d1.py kicker.db data.sql
npm run db:import:local
npm run dev
```

Die App läuft dann unter http://localhost:8787 mit einer lokalen Kopie der Datenbank
(in `.wrangler/`, unabhängig von der echten D1-Datenbank).

Typprüfung: `npm run typecheck`

## Nützliche Befehle

```bash
# Backup der Live-Datenbank als SQL
npx wrangler d1 export kicker-db --remote --output=backup.sql

# Beliebige SQL-Abfrage auf der Live-Datenbank
npx wrangler d1 execute kicker-db --remote --command "SELECT name, elo FROM players ORDER BY elo DESC"

# Live-Logs des Workers
npx wrangler tail
```

D1 hat außerdem **Time Travel**: Du kannst die Datenbank auf jeden Zeitpunkt der letzten 30 Tage
zurücksetzen (`npx wrangler d1 time-travel restore kicker-db --timestamp=...`).

## Hinweise

- Zeitstempel werden wie vorher in UTC gespeichert. Die Datumsbeschriftungen im Elo-Chart werden
  jetzt in deutscher Zeit (Europe/Berlin) angezeigt.
- Das Löschen eines Spielers löscht jetzt auch seine Spieleinträge mit (`ON DELETE CASCADE`).
  Vorher blieben verwaiste Einträge zurück.
