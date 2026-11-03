# GCD Kicker

Kicker-App (Spiele eintragen, Übersicht, Spieler, Elo-Statistik). Sie läuft als
**Cloudflare Worker** mit **Cloudflare D1** als Datenbank.

Früher lief sie mit Flask + SQLite auf PythonAnywhere. Funktionen, Aussehen und
Elo-Berechnung sind 1:1 übernommen (die Elo-Werte wurden gegen die alte Python-Version geprüft).

## Einrichtung (nur über die Cloudflare-Website)

Lokal musst du nichts installieren. Der Worker richtet sich selbst ein:

- **Datenbank:** Beim ersten Deploy legt Cloudflare die D1-Datenbank `kicker-db` automatisch an.
- **Tabellen und Daten:** Beim ersten Aufruf der Seite erstellt der Worker die Tabellen und
  importiert alle Spiele aus `data/kicker.db` (Stand 03.11.2026, über `src/migrations/0002_seed.sql`).
  Das passiert genau einmal.

### Schritte

1. Bei [dash.cloudflare.com](https://dash.cloudflare.com) anmelden (kostenloser Account reicht).
2. Links **Compute (Workers) → Workers & Pages** öffnen und dann **Create** klicken.
3. **Import a repository** wählen und GitHub verbinden. Dabei der Cloudflare-App den Zugriff
   auf das Repo `gcdkicker` erlauben.
4. Das Repo `gcdkicker` auswählen. Die Einstellungen kannst du so lassen:
   - **Project name:** `gcdkicker`
   - **Build command:** leer
   - **Deploy command:** `npx wrangler deploy` (Standard)
   - Unter **Advanced settings** prüfen, dass der Produktions-Branch `main` ist.
5. **Deploy** klicken und warten, bis der Build grün ist (1–2 Minuten).
6. Die angezeigte Adresse `https://gcdkicker.<dein-name>.workers.dev` öffnen.
   Der allererste Aufruf dauert ein paar Sekunden, weil die Daten importiert werden.

Ab jetzt wird jeder Push auf `main` automatisch deployt. Die Daten bleiben dabei erhalten.

> **Wichtig:** Der Code muss dafür auf dem Branch `main` liegen. Den Branch `claude/…`
> vorher per Pull Request in `main` mergen, oder in Schritt 4 diesen Branch als Produktions-Branch wählen.

### Kontrolle im Dashboard

- **Storage & Databases → D1 → kicker-db:** Hier siehst du die Tabellen. Unter **Console**
  kannst du SQL ausführen, z. B. `SELECT name, elo FROM players ORDER BY elo DESC`.
- **Workers & Pages → gcdkicker → Logs:** Hier stehen Fehler und die Meldungen
  `Migration 0001_schema angewendet.` und `Migration 0002_seed angewendet.`

### Eigene Domain (optional)

**Workers & Pages → gcdkicker → Settings → Domains & Routes → Add → Custom domain**,
z. B. `kicker.deine-domain.de`. Die Domain muss bei Cloudflare verwaltet werden.

### Admin-Seite schützen (optional)

`/admin/games` ist wie vorher ohne Passwort erreichbar. Zum Schützen:
**Zero Trust → Access → Applications → Add an application → Self-hosted**, als Adresse
`gcdkicker.<dein-name>.workers.dev/admin` angeben und eine Policy anlegen (z. B. nur deine E-Mail).
Bis 50 Nutzer ist das kostenlos.

### Backup / Wiederherstellen

D1 hat **Time Travel**: Die Datenbank lässt sich auf jeden Zeitpunkt der letzten 30 Tage zurücksetzen.
Ein Export als SQL ist im Dashboard bei der Datenbank möglich.

### Falls der Build fehlschlägt

Wenn im Build-Log ein Berechtigungsfehler beim Anlegen der Datenbank steht, lege sie von Hand an:
**Storage & Databases → D1 → Create database**, Name genau `kicker-db`. Danach den Build unter
**Deployments** neu starten. Der Worker findet die Datenbank über den Namen.

---

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/index.ts` | Alle Routen (`/`, `/overview`, `/players`, `/statistics`, `/submit`, `/add_player`, `/delete_player`, `/admin/games`, `/api/group/:id`) |
| `src/elo.ts` | Elo-Neuberechnung (wie vorher `elo.py`) |
| `src/migrate.ts` | Richtet die Datenbank beim ersten Request automatisch ein |
| `src/migrations/` | `0001_schema.sql` (Tabellen) und `0002_seed.sql` (Datenimport) |
| `src/views/` | HTML der Seiten (vorher `templates/`) |
| `public/` | CSS und Browser-JavaScript, werden von Cloudflare direkt ausgeliefert |
| `data/kicker.db` | Letzter Stand der alten PythonAnywhere-Datenbank |
| `scripts/export_sqlite_to_d1.py` | Erzeugt `0002_seed.sql` aus einer `kicker.db` |
| `wrangler.jsonc` | Cloudflare-Konfiguration |

### Schema später ändern

Eine neue Datei `src/migrations/0003_<name>.sql` anlegen und in `src/migrate.ts` in der Liste
`MIGRATIONS` ergänzen. Beim nächsten Deploy wird sie automatisch einmalig ausgeführt.
Bestehende Migrationen nie nachträglich ändern.

### Lokal entwickeln (optional)

```bash
npm install
npm run dev
```

Die App läuft dann unter http://localhost:8787 mit einer lokalen Datenbank in `.wrangler/`.

## Hinweise

- Zeitstempel werden wie vorher in UTC gespeichert. Die Datumsbeschriftungen im Elo-Chart werden
  in deutscher Zeit angezeigt.
- Das Löschen eines Spielers löscht auch seine Spieleinträge mit. Vorher blieben verwaiste Einträge zurück.
