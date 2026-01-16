# app.py
from flask import Flask, render_template, request, redirect, jsonify, session
from datetime import datetime
import uuid
from db import get_db_connection, init_db

app = Flask(__name__)

app.secret_key = "setz-dein-eigener-geheimschluessel-hier"
#app.run(host="0.0.0.0", port=5000, debug=False)

init_db()

# Damit {{ now }} in allen Templates verfügbar ist
@app.context_processor
def inject_now():
    return {'now': datetime.now()}

# --- Web-UI: Übersicht & Formularfluss ---
@app.route("/")
def index():
    conn = get_db_connection()
    players = conn.execute("SELECT id, name FROM players ORDER BY name").fetchall()
    games   = conn.execute("""
        SELECT id, group_id, red, blue, red_score, blue_score, comment, time_played FROM (
          SELECT
            g.id, g.group_id, g.red_score, g.blue_score, g.comment, g.time_played,
            GROUP_CONCAT(CASE WHEN gp.side='red'  THEN p.name END, ', ')   AS red,
            GROUP_CONCAT(CASE WHEN gp.side='blue' THEN p.name END, ', ')   AS blue
          FROM games g
          LEFT JOIN game_players gp ON g.id = gp.game_id
          LEFT JOIN players p ON gp.player_id = p.id
          GROUP BY g.id
        ) ORDER BY time_played DESC LIMIT 20
    """).fetchall()
    conn.close()

    return render_template(
        "index.html",
        players=players,
        games=games,
        game_count   = session.get("game_count"),
        current_game = session.get("current_game", 1)
    )

# --- Health-Check ---
@app.route("/status")
def status():
    return jsonify(status="ok", message="Kicker-Tracker läuft!")

# # --- API: Spieler verwalten ---
# @app.route("/players", methods=["GET", "POST"])
# def api_players():
#     conn = get_db_connection()
#     cur  = conn.cursor()

#     if request.method == "POST":
#         name = request.json.get("name")
#         try:
#             cur.execute("INSERT INTO players (name) VALUES (?)", (name,))
#             conn.commit()
#             return jsonify(status="ok", id=cur.lastrowid), 201
#         except Exception as e:
#             return jsonify(status="error", message=str(e)), 400

#     cur.execute("SELECT id, name FROM players ORDER BY name")
#     players = [dict(r) for r in cur.fetchall()]
#     conn.close()
#     return jsonify(players=players)

@app.route("/players", methods=["GET"])
def players_page():
    conn = get_db_connection()
    players = conn.execute("SELECT id, name FROM players ORDER BY name").fetchall()
    conn.close()
    return render_template("players.html", players=players)

@app.route("/add_player", methods=["POST"])
def add_player():
    name = request.form.get("name")
    if name:
        conn = get_db_connection()
        try:
            conn.execute("INSERT INTO players (name) VALUES (?)", (name,))
            conn.commit()
        except Exception as e:
            print("Fehler beim Hinzufügen:", e)
        finally:
            conn.close()
    return redirect("/players")

@app.route("/delete_player", methods=["POST"])
def delete_player():
    player_id = request.form.get("player_id")
    if player_id:
        conn = get_db_connection()
        try:
            conn.execute("DELETE FROM players WHERE id = ?", (player_id,))
            conn.commit()
        except Exception as e:
            print("Fehler beim Löschen:", e)
        finally:
            conn.close()
    return redirect("/players")

@app.route("/overview")
def overview():
    conn = get_db_connection()
    cur = conn.cursor()

    cur.execute("""
        SELECT
            g.id, g.group_id, g.red_score, g.blue_score, g.time_played, g.comment,
            GROUP_CONCAT(CASE WHEN gp.side = 'red' THEN p.name END, ', ') AS red,
            GROUP_CONCAT(CASE WHEN gp.side = 'blue' THEN p.name END, ', ') AS blue
        FROM games g
        LEFT JOIN game_players gp ON g.id = gp.game_id
        LEFT JOIN players p ON gp.player_id = p.id
        GROUP BY g.id
        ORDER BY g.time_played DESC
    """)
    rows = cur.fetchall()
    conn.close()

    # Spiele nach group_id sortieren
    groups = {}
    for row in rows:
        group = row["group_id"] or f"single_{row['id']}"
        if group not in groups:
            groups[group] = []
        groups[group].append(row)

    # sortiert nach neuester Spielzeit (erste Spiel in Gruppe)
    sorted_groups = sorted(groups.values(), key=lambda g: g[0]["time_played"], reverse=True)

    return render_template("overview.html", grouped_games=sorted_groups)


# --- API: Spiele einzeln anlegen / abfragen ---
@app.route("/games", methods=["GET", "POST"])
def api_games():
    conn = get_db_connection()
    cur  = conn.cursor()

    if request.method == "POST":
        data = request.get_json() or {}
        pls  = data.get("players", [])
        if not pls:
            return jsonify(status="error", message="Spieler fehlen"), 400

        try:
            group_id   = data.get("group_id") or str(uuid.uuid4())
            red_score  = data["red_score"]
            blue_score = data["blue_score"]
            comment    = data.get("comment","")
            now        = datetime.now()
            tp_str     = data.get("time_played")
            tp         = datetime.strptime(tp_str, "%Y-%m-%d %H:%M:%S") if tp_str else now

            cur.execute("""
                INSERT INTO games
                  (group_id, red_score, blue_score, comment, created_at, time_played)
                VALUES (?,?,?,?,?,?)
            """, (group_id, red_score, blue_score, comment, now, tp))
            gid = cur.lastrowid

            entries = [(gid, p["player_id"], p["side"], p.get("position",1)) for p in pls]
            cur.executemany("""
                INSERT INTO game_players (game_id, player_id, side, position)
                VALUES (?,?,?,?)
            """, entries)

            conn.commit()
            return jsonify(status="ok", game_id=gid), 201
        except Exception as e:
            conn.rollback()
            return jsonify(status="error", message=str(e)), 500

    # GET
    cur.execute("""
        SELECT
          g.id, g.group_id, g.red_score, g.blue_score, g.comment,
          g.time_played, g.created_at,
          GROUP_CONCAT(CASE WHEN gp.side='red'  THEN p.name END, ', ')   AS red,
          GROUP_CONCAT(CASE WHEN gp.side='blue' THEN p.name END, ', ')   AS blue
        FROM games g
        LEFT JOIN game_players gp ON g.id = gp.game_id
        LEFT JOIN players p ON gp.player_id = p.id
        GROUP BY g.id
        ORDER BY g.time_played DESC
    """)
    games = [dict(r) for r in cur.fetchall()]
    conn.close()
    return jsonify(games=games)

@app.route("/set_game_count", methods=["POST"])
def set_game_count():
    cnt = int(request.form["game_count"])
    session["game_count"]   = cnt
    session["current_game"] = 1
    session["group_id"]     = str(uuid.uuid4())
    return redirect("/")

@app.route("/submit", methods=["POST"])
def submit_games():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        # Spieler auslesen und filtern
        player_candidates = [
            ("team1_player1", "red", 1),
            ("team1_player2", "red", 2),
            ("team2_player1", "blue", 1),
            ("team2_player2", "blue", 2)
        ]
        player_list = []
        for field, side, pos in player_candidates:
            val = request.form.get(field)
            if val and val.strip() and val != "(leer)":  # Annahme: "(leer)" ist der String für leer
                try:
                    pid = int(val)
                    if pid > 0:  # Gültige positive ID
                        player_list.append((pid, side, pos))
                except ValueError:
                    pass  # Ignoriere ungültige IDs


        # ---- Normalisiere Positionen: Falls pos 1 fehlt, aber pos 2 gesetzt ist -> nach oben schieben
        # player_list enthält Tupel (player_id, side, pos)
        for side in ("red", "blue"):
            entries = [(pid, pos) for (pid, s, pos) in player_list if s == side]
            has_pos1 = any(pos == 1 for pid, pos in entries)
            if not has_pos1:
                # finde einen Eintrag mit pos==2 und setze ihn auf pos 1
                for idx, (pid, pos) in enumerate([(pid, pos) for (pid, s, pos) in player_list if s == side]):
                    if pos == 2:
                        # update player_list: replace tuple for this pid and side to pos=1
                        for j, (ppid, sside, ppos) in enumerate(player_list):
                            if ppid == pid and sside == side and ppos == pos:
                                player_list[j] = (ppid, sside, 1)
                                break
                        break
# Prüfen, ob jedes Team mindestens einen Spieler hat
        red_players = [p for p in player_list if p[1] == "red"]
        blue_players = [p for p in player_list if p[1] == "blue"]
        if len(red_players) < 1 or len(blue_players) < 1:
            return "Fehler: Jedes Team muss mindestens einen Spieler haben!", 400

        group_id = str(uuid.uuid4())
        now = datetime.now()

        # Spiele extrahieren
        games = []
        for key in request.form:
            if key.startswith("games[") and "score1" in key:
                i = key.split("[")[1].split("]")[0]
                score1 = int(request.form[f"games[{i}][score1]"])
                score2 = int(request.form[f"games[{i}][score2]"])
                swapped = request.form.get(f"games[{i}][swapped]", "0") == "1"

                red_score = score2 if swapped else score1
                blue_score = score1 if swapped else score2

                # Spiel speichern
                cur.execute("""
                    INSERT INTO games (group_id, red_score, blue_score, comment, created_at, time_played)
                    VALUES (?, ?, ?, '', ?, ?)
                """, (group_id, red_score, blue_score, now, now))
                game_id = cur.lastrowid

                # Spielerzuordnung (nur gültige, mit side_actual)
                for pid, side, pos in player_list:
                    side_actual = "blue" if swapped and side == "red" else "red" if swapped and side == "blue" else side
                    cur.execute("""
                        INSERT INTO game_players (game_id, player_id, side, position)
                        VALUES (?, ?, ?, ?)
                    """, (game_id, pid, side_actual, pos))

        conn.commit()
        return redirect("/")
    except Exception as e:
        conn.rollback()
        return f"Fehler: {e}", 500
    finally:
        conn.close()


@app.route("/add_games", methods=["POST"])
def add_games():
    conn = get_db_connection()
    cur  = conn.cursor()
    try:
        # Spieler auslesen und filtern
        player_candidates = [
            ("team1_player1", "red", 1),
            ("team1_player2", "red", 2),
            ("team2_player1", "blue", 1),
            ("team2_player2", "blue", 2)
        ]
        pls = []
        for field, side, pos in player_candidates:
            val = request.form.get(field)
            if val and val.strip() and val != "(leer)":  # Annahme: "(leer)" ist der String für leer
                try:
                    pid = int(val)
                    if pid > 0:  # Gültige positive ID
                        pls.append((pid, side, pos))
                except ValueError:
                    pass  # Ignoriere ungültige IDs

        # Prüfen, ob jedes Team mindestens einen Spieler hat
        red_players = [p for p in pls if p[1] == "red"]
        blue_players = [p for p in pls if p[1] == "blue"]
        if len(red_players) < 1 or len(blue_players) < 1:
            return "Fehler: Jedes Team muss mindestens einen Spieler haben!", 400

        tp = request.form.get("time_played")
        tp = datetime.strptime(tp, "%Y-%m-%dT%H:%M") if tp else datetime.now()
        comment  = request.form.get("comment","")
        group_id = session.get("group_id") or str(uuid.uuid4())

        # Anzahl Zeilen ermitteln
        keys = [k for k in request.form if k.startswith("games[") and k.endswith("][score1]")]
        total = len(keys)

        for i in range(total):
            s1      = int(request.form[f"games[{i}][score1]"])
            s2      = int(request.form[f"games[{i}][score2]"])
            swapped = request.form.get(f"games[{i}][swapped]","0")=="1"

            red_score  = s2 if swapped else s1
            blue_score = s1 if swapped else s2

            now = datetime.now()
            cur.execute("""
                INSERT INTO games
                  (group_id, red_score, blue_score, comment, created_at, time_played)
                VALUES (?,?,?,?,?,?)
            """, (group_id, red_score, blue_score, comment, now, tp))
            gid = cur.lastrowid

            # Spieler einfügen (nur gültige, Farben ggf. tauschen)
            entries = []
            for pid, side, pos in pls:
                actual_side = ("blue" if swapped and side=="red"
                               else "red"  if swapped and side=="blue"
                               else side)
                entries.append((gid, pid, actual_side, pos))

            cur.executemany("""
                INSERT INTO game_players (game_id, player_id, side, position)
                VALUES (?,?,?,?)
            """, entries)

        conn.commit()
        # nach letztem zurücksetzen
        session.pop("game_count", None)
        session.pop("current_game", None)
        session.pop("group_id", None)
        return redirect("/")
    except Exception as e:
        conn.rollback()
        return f"Fehler: {e}", 500
    finally:
        conn.close()

@app.route("/admin/games", methods=["GET", "POST"])
def admin_games():
    conn = get_db_connection()
    cur = conn.cursor()

    if request.method == "POST":
        ids = request.form.getlist("game_id")
        try:
            if ids:
                placeholders = ",".join("?" for _ in ids)
                cur.execute(f"DELETE FROM game_players WHERE game_id IN ({placeholders})", ids)
                cur.execute(f"DELETE FROM games WHERE id IN ({placeholders})", ids)
                conn.commit()
        except Exception as e:
            conn.rollback()
            conn.close()
            return f"Fehler beim Löschen: {e}", 500

    # Spiele laden
    cur.execute("""
        SELECT
            g.id,
            g.red_score, g.blue_score,
            COALESCE(g.time_played, g.created_at) as played_at,
            GROUP_CONCAT(CASE WHEN gp.side='red'  THEN p.name END, ', ')   AS red_players,
            GROUP_CONCAT(CASE WHEN gp.side='blue' THEN p.name END, ', ')   AS blue_players
        FROM games g
        LEFT JOIN game_players gp ON g.id = gp.game_id
        LEFT JOIN players p ON gp.player_id = p.id
        GROUP BY g.id
        ORDER BY played_at DESC, g.id DESC
    """)
    rows = cur.fetchall()
    conn.close()
    return render_template("admin_delete.html", games=rows)
# flask_app.py


@app.route("/statistics")
def statistics():
    conn = get_db_connection()

    # Diese Abfrage ist das Herzstück. Sie berechnet alles pro Spieler.
    query = """
    SELECT
        p.name,
        p.id,
        -- COALESCE stellt sicher, dass wir 0 statt NULL bekommen, falls ein Spieler keine Spiele hat
        COALESCE(COUNT(gp.game_id), 0) AS games_played,

        -- Zähle Siege
        COALESCE(SUM(CASE
            WHEN (gp.side = 'red' AND g.red_score > g.blue_score) OR (gp.side = 'blue' AND g.blue_score > g.red_score)
            THEN 1 ELSE 0 END), 0) AS wins,

        -- Zähle Niederlagen
        COALESCE(SUM(CASE
            WHEN (gp.side = 'red' AND g.red_score < g.blue_score) OR (gp.side = 'blue' AND g.blue_score < g.red_score)
            THEN 1 ELSE 0 END), 0) AS losses,

        -- Berechne geschossene Tore
        COALESCE(SUM(CASE
            WHEN gp.side = 'red' THEN g.red_score
            ELSE g.blue_score END), 0) AS goals_for,

        -- Berechne Gegentore
        COALESCE(SUM(CASE
            WHEN gp.side = 'red' THEN g.blue_score
            ELSE g.red_score END), 0) AS goals_against

    FROM players p
    -- LEFT JOIN ist wichtig, damit auch Spieler ohne Spiele in der Statistik auftauchen
    LEFT JOIN game_players gp ON p.id = gp.player_id
    LEFT JOIN games g ON gp.game_id = g.id
    GROUP BY p.id, p.name
    ORDER BY wins DESC, games_played DESC, p.name;
    """

    player_stats_raw = conn.execute(query).fetchall()
    conn.close()

    # Wir berechnen Win-Rate und Tordifferenz hier in Python, das ist oft einfacher
    player_stats = []
    for row in player_stats_raw:
        stats = dict(row)
        if stats['games_played'] > 0:
            stats['win_rate'] = (stats['wins'] / stats['games_played']) * 100
        else:
            stats['win_rate'] = 0
        stats['goal_difference'] = stats['goals_for'] - stats['goals_against']
        player_stats.append(stats)

    return render_template("statistics.html", player_stats=player_stats)




if __name__ == "__main__":
    app.run(debug=True)