# db.py
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "kicker.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, detect_types=sqlite3.PARSE_DECLTYPES|sqlite3.PARSE_COLNAMES)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # Spieler
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    );
    """)

    # Spiele
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS games (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        group_id     TEXT    NOT NULL,
        red_score    INTEGER NOT NULL,
        blue_score   INTEGER NOT NULL,
        comment      TEXT,
        created_at   DATETIME NOT NULL,
        time_played  DATETIME NOT NULL
    );
    """)

    # Spieler in Spielen
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS game_players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id INTEGER NOT NULL,
        player_id INTEGER NOT NULL,
        side TEXT CHECK(side IN ('red', 'blue')),
        position INTEGER,
        FOREIGN KEY (game_id) REFERENCES games(id),
        FOREIGN KEY (player_id) REFERENCES players(id)
    );
    """)

    conn.commit()
    conn.close()

