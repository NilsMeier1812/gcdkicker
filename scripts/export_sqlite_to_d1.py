#!/usr/bin/env python3
"""
Exportiert die Daten aus der alten SQLite-Datenbank (kicker.db von PythonAnywhere)
in eine SQL-Datei, die mit `wrangler d1 execute` in Cloudflare D1 importiert werden kann.

Das Schema wird NICHT exportiert – das legen die Migrationen in ./migrations an.

Benutzung:
    python3 scripts/export_sqlite_to_d1.py pfad/zu/kicker.db data.sql
"""
import sqlite3
import sys

# Reihenfolge wichtig wegen Foreign Keys
TABLES = {
    "players": ["id", "name", "elo"],
    "games": ["id", "group_id", "red_score", "blue_score", "comment", "created_at", "time_played"],
    "game_players": ["id", "game_id", "player_id", "side", "position"],
    "elo_history": ["id", "game_id", "player_id", "elo_change"],
    "games_history": ["history_id", "game_id", "changed_at", "old_red_score", "new_red_score",
                      "old_blue_score", "new_blue_score"],
}

ROWS_PER_INSERT = 100


def sql_literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, bytes):
        return "X'" + value.hex() + "'"
    return "'" + str(value).replace("'", "''") + "'"


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]

    conn = sqlite3.connect(src)  # bewusst ohne detect_types -> Zeitstempel bleiben Strings
    existing = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    player_ids = {r[0] for r in conn.execute("SELECT id FROM players")}
    game_ids = {r[0] for r in conn.execute("SELECT id FROM games")}

    with open(dst, "w", encoding="utf-8") as out:
        out.write("-- Datenimport aus kicker.db\n")
        out.write("DELETE FROM games_history;\nDELETE FROM elo_history;\nDELETE FROM game_players;\n")
        out.write("DELETE FROM games;\nDELETE FROM players;\n\n")

        for table, cols in TABLES.items():
            if table not in existing:
                print(f"Tabelle {table} fehlt in der Quelle – übersprungen.")
                continue
            available = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
            use_cols = [c for c in cols if c in available]
            rows = conn.execute(f"SELECT {', '.join(use_cols)} FROM {table} ORDER BY 1").fetchall()

            # Verwaiste Einträge (gelöschte Spieler/Spiele) entfernen – D1 erzwingt Foreign Keys
            if "player_id" in use_cols or "game_id" in use_cols:
                pi = use_cols.index("player_id") if "player_id" in use_cols else None
                gi = use_cols.index("game_id") if "game_id" in use_cols else None
                before = len(rows)
                rows = [r for r in rows
                        if (pi is None or r[pi] in player_ids) and (gi is None or r[gi] in game_ids)]
                if before != len(rows):
                    print(f"{table}: {before - len(rows)} verwaiste Zeilen übersprungen.")

            for i in range(0, len(rows), ROWS_PER_INSERT):
                chunk = rows[i:i + ROWS_PER_INSERT]
                values = ",\n".join("(" + ", ".join(sql_literal(v) for v in row) + ")" for row in chunk)
                out.write(f"INSERT INTO {table} ({', '.join(use_cols)}) VALUES\n{values};\n")
            print(f"{table}: {len(rows)} Zeilen exportiert.")

    conn.close()
    print(f"Fertig: {dst}")


if __name__ == "__main__":
    main()
