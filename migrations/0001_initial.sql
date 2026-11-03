-- Initiales Schema für die Kicker-App (Cloudflare D1 / SQLite)
-- Entspricht dem bisherigen Schema aus db.py (PythonAnywhere), aber mit
-- ON DELETE CASCADE überall, weil D1 Foreign Keys immer erzwingt.

CREATE TABLE IF NOT EXISTS players (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    elo  REAL NOT NULL DEFAULT 1500
);

CREATE TABLE IF NOT EXISTS games (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    TEXT    NOT NULL,
    red_score   INTEGER NOT NULL,
    blue_score  INTEGER NOT NULL,
    comment     TEXT,
    created_at  DATETIME NOT NULL,
    time_played DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS game_players (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id   INTEGER NOT NULL,
    player_id INTEGER NOT NULL,
    side      TEXT CHECK(side IN ('red', 'blue')),
    position  INTEGER,
    FOREIGN KEY (game_id)   REFERENCES games(id)   ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS elo_history (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id    INTEGER NOT NULL,
    player_id  INTEGER NOT NULL,
    elo_change REAL NOT NULL,
    FOREIGN KEY (game_id)   REFERENCES games(id)   ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS games_history (
    history_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id        INTEGER NOT NULL,
    changed_at     DATETIME NOT NULL,
    old_red_score  INTEGER NOT NULL,
    new_red_score  INTEGER NOT NULL,
    old_blue_score INTEGER NOT NULL,
    new_blue_score INTEGER NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_games_group_id     ON games(group_id);
CREATE INDEX IF NOT EXISTS idx_games_time_played  ON games(time_played);
CREATE INDEX IF NOT EXISTS idx_game_players_game  ON game_players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_player ON game_players(player_id);
CREATE INDEX IF NOT EXISTS idx_elo_history_game   ON elo_history(game_id);
