# flask_app.py
from flask import Flask, render_template, request, redirect, session
from datetime import datetime, timedelta
import uuid
from collections import defaultdict
from db import get_db_connection, init_db
from elo import recalculate_all_elo

app = Flask(__name__)
app.secret_key = "setz-dein-eigener-geheimschluessel-hier"

init_db()

@app.context_processor
def inject_now():
    return {'now': datetime.now()}

# --- Web-UI Routen ---

@app.route("/")
def index():
    conn = get_db_connection()
    players = conn.execute("SELECT id, name FROM players ORDER BY name").fetchall()
    conn.close()
    return render_template("index.html", players=players)

@app.route("/overview")
def overview():
    conn = get_db_connection()
    rows = conn.execute("""
        SELECT
            g.id AS game_id, g.group_id, g.red_score, g.blue_score, g.time_played,
            p.name AS player_name,
            gp.side,
            eh.elo_change
        FROM games g
        JOIN game_players gp ON g.id = gp.game_id
        JOIN players p ON gp.player_id = p.id
        LEFT JOIN elo_history eh ON g.id = eh.game_id AND p.id = eh.player_id
        ORDER BY g.time_played DESC, g.id DESC
    """).fetchall()
    conn.close()

    games_dict = {}
    for row in rows:
        game_id = row['game_id']
        if game_id not in games_dict:
            games_dict[game_id] = {
                'id': game_id, 'group_id': row['group_id'],
                'red_score': row['red_score'], 'blue_score': row['blue_score'],
                'time_played': row['time_played'],
                'red_team': [], 'blue_team': []
            }
        player_data = {'name': row['player_name'], 'elo_change': row['elo_change']}
        if row['side'] == 'red':
            games_dict[game_id]['red_team'].append(player_data)
        else:
            games_dict[game_id]['blue_team'].append(player_data)
    all_games = list(games_dict.values())

    groups = {}
    for game in all_games:
        group_id = game["group_id"] or f"single_{game['id']}"
        if group_id not in groups:
            groups[group_id] = []
        groups[group_id].append(game)

    sorted_groups = sorted(groups.values(), key=lambda g: g[0]["time_played"], reverse=True)
    return render_template("overview.html", grouped_games=sorted_groups)


@app.route("/players", methods=["GET"])
def players_page():
    conn = get_db_connection()
    players = conn.execute("SELECT id, name FROM players ORDER BY name").fetchall()
    conn.close()
    return render_template("players.html", players=players)

@app.route("/statistics")
def statistics():
    conn = get_db_connection()

    # --- TEIL 1: Elo-Ranking & TEIL 2: Stats (Zusammengefasst) ---
    players_elo_raw = conn.execute("SELECT id, name, elo FROM players").fetchall()

    latest_changes = {}
    latest_game_group_row = conn.execute("SELECT group_id FROM games ORDER BY time_played DESC, id DESC LIMIT 1").fetchone()

    if latest_game_group_row:
        group_id = latest_game_group_row['group_id']
        game_ids_raw = conn.execute("SELECT id FROM games WHERE group_id = ?", (group_id,)).fetchall()
        game_ids = [row['id'] for row in game_ids_raw]

        if game_ids:
            placeholders = ",".join("?" for _ in game_ids)
            latest_changes_raw = conn.execute(
                f"SELECT player_id, SUM(elo_change) as total_change FROM elo_history WHERE game_id IN ({placeholders}) GROUP BY player_id",
                game_ids
            ).fetchall()
            latest_changes = {row['player_id']: row['total_change'] for row in latest_changes_raw}

    players_elo_data = []
    for player_row in players_elo_raw:
        player_dict = dict(player_row)
        player_id = player_dict['id']
        last_change = latest_changes.get(player_id, 0)
        player_dict['last_elo_change'] = last_change
        player_dict['elo_previous'] = player_dict['elo'] - last_change
        players_elo_data.append(player_dict)

    current_ranking_sorted = sorted(players_elo_data, key=lambda p: p['elo'], reverse=True)
    previous_ranking_sorted = sorted(players_elo_data, key=lambda p: p['elo_previous'], reverse=True)
    previous_rank_map = {p['id']: rank for rank, p in enumerate(previous_ranking_sorted, 1)}

    players_for_template = []
    for current_rank, player in enumerate(current_ranking_sorted, 1):
        player_id = player['id']
        previous_rank = previous_rank_map.get(player_id, current_rank)
        player['current_rank'] = current_rank
        player['previous_rank'] = previous_rank
        player['rank_change'] = previous_rank - current_rank
        players_for_template.append(player)

    query = """
    SELECT
        p.name, p.id,
        COALESCE(SUM(CASE WHEN g.red_score != g.blue_score THEN 1 ELSE 0 END), 0) AS games_played,
        COALESCE(SUM(CASE WHEN (gp.side = 'red' AND g.red_score > g.blue_score) OR (gp.side = 'blue' AND g.blue_score > g.red_score) THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN (gp.side = 'red' AND g.red_score < g.blue_score) OR (gp.side = 'blue' AND g.blue_score < g.red_score) THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(CASE WHEN gp.side = 'red' THEN g.red_score ELSE g.blue_score END), 0) AS goals_for,
        COALESCE(SUM(CASE WHEN gp.side = 'red' THEN g.blue_score ELSE g.red_score END), 0) AS goals_against
    FROM players p
    LEFT JOIN game_players gp ON p.id = gp.player_id
    LEFT JOIN games g ON gp.game_id = g.id
    GROUP BY p.id, p.name
    ORDER BY p.name ASC;
    """
    player_stats_raw = conn.execute(query).fetchall()

    player_stats = []
    for row in player_stats_raw:
        stats = dict(row)
        stats['win_rate'] = (stats['wins'] / stats['games_played'] * 100) if stats['games_played'] > 0 else 0
        stats['goal_difference'] = stats['goals_for'] - stats['goals_against']
        player_stats.append(stats)

    # --- TEIL 3: Daten für den Elo-Verlauf Chart (GRUPPENBASIERT) ---

    history_query = """
        SELECT g.id, g.group_id, g.time_played, eh.player_id, eh.elo_change
        FROM games g
        JOIN elo_history eh ON g.id = eh.game_id
        ORDER BY g.time_played ASC, g.id ASC
    """
    history_rows = conn.execute(history_query).fetchall()

    chart_data_map = {}
    all_players_basic = conn.execute("SELECT id, name FROM players").fetchall()
    for p in all_players_basic:
        chart_data_map[p['id']] = {
            'name': p['name'],
            'current_elo': 1500.0,
            'history': [1500.0]
        }

    chart_labels = ["Start"]
    # Leeres Datum für Startpunkt, damit JS Date() nicht crashed
    chart_dates = [""]

    groups_ordered = []
    current_group_id = None
    current_group_data = {'timestamp': None, 'changes': defaultdict(float)}

    for row in history_rows:
        gid = row['group_id']
        if gid != current_group_id and current_group_id is not None:
            groups_ordered.append(current_group_data)
            current_group_data = {'timestamp': None, 'changes': defaultdict(float)}

        current_group_id = gid
        current_group_data['timestamp'] = row['time_played']
        current_group_data['changes'][row['player_id']] += row['elo_change']

    if current_group_id is not None:
        groups_ordered.append(current_group_data)

    for group in groups_ordered:
        raw_dt = group['timestamp']
        label_display = ""
        iso_date = ""

        # Robustes Date-Parsing
        if isinstance(raw_dt, str):
             try:
                # Versuch, SQLite String zu parsen (mit und ohne Millisekunden)
                if "." in raw_dt:
                    dt_obj = datetime.strptime(raw_dt.split('.')[0], "%Y-%m-%d %H:%M:%S")
                else:
                    dt_obj = datetime.strptime(raw_dt, "%Y-%m-%d %H:%M:%S")

                label_display = dt_obj.strftime("%d.%m.")
                iso_date = dt_obj.isoformat()
             except:
                label_display = "?"
                # Fallback auf heute, damit Chart nicht crashed, oder leer lassen
                iso_date = ""
        elif isinstance(raw_dt, datetime):
             label_display = raw_dt.strftime("%d.%m.")
             iso_date = raw_dt.isoformat()

        chart_labels.append(label_display)
        chart_dates.append(iso_date)

        changes = group['changes']
        for pid, change in changes.items():
            if pid in chart_data_map:
                chart_data_map[pid]['current_elo'] += change

        for pid in chart_data_map:
            val = round(chart_data_map[pid]['current_elo'])
            chart_data_map[pid]['history'].append(val)

    chart_datasets = []
    for pid, data in chart_data_map.items():
        chart_datasets.append({
            'label': data['name'],
            'data': data['history'],
            'playerId': pid
        })

    conn.close()

    return render_template("statistics.html",
                           players=players_for_template,
                           player_stats=player_stats,
                           latest_changes=latest_changes,
                           chart_labels=chart_labels,
                           chart_dates=chart_dates,
                           chart_datasets=chart_datasets)

# --- Formular-Endpunkte ---
@app.route("/submit", methods=["POST"])
def submit_games():
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        player_candidates = [
            ("team1_player1", "red"), ("team1_player2", "red"),
            ("team2_player1", "blue"), ("team2_player2", "blue")
        ]
        player_list = []
        for field, side in player_candidates:
            player_id = request.form.get(field)
            if player_id:
                player_list.append({'id': int(player_id), 'side': side})

        if not any(p['side'] == 'red' for p in player_list) or not any(p['side'] == 'blue' for p in player_list):
            return "Fehler: Es muss mindestens ein Spieler pro Team ausgewählt werden.", 400

        group_id = str(uuid.uuid4())
        now = datetime.now()
        game_index = 0
        while f"games[{game_index}][score1]" in request.form:
            score1 = int(request.form[f"games[{game_index}][score1]"])
            score2 = int(request.form[f"games[{game_index}][score2]"])
            swapped = request.form.get(f"games[{game_index}][swapped]", "0") == "1"
            red_score = score2 if swapped else score1
            blue_score = score1 if swapped else score2
            cur.execute("INSERT INTO games (group_id, red_score, blue_score, comment, created_at, time_played) VALUES (?, ?, ?, '', ?, ?)", (group_id, red_score, blue_score, now, now))
            game_id = cur.lastrowid
            for player in player_list:
                actual_side = "blue" if swapped and player['side'] == "red" else "red" if swapped and player['side'] == "blue" else player['side']
                cur.execute("INSERT INTO game_players (game_id, player_id, side) VALUES (?, ?, ?)", (game_id, player['id'], actual_side))
            game_index += 1
        conn.commit()
        recalculate_all_elo()
        return redirect("/")
    except Exception as e:
        conn.rollback()
        return f"Ein unerwarteter Fehler ist aufgetreten: {e}", 500
    finally:
        conn.close()

@app.route("/add_player", methods=["POST"])
def add_player():
    name = request.form.get("name")
    if name:
        conn = get_db_connection()
        try:
            conn.execute("INSERT INTO players (name) VALUES (?)", (name,))
            conn.commit()
        except conn.IntegrityError: pass
        except Exception: pass
        finally: conn.close()
    return redirect("/players")

@app.route("/delete_player", methods=["POST"])
def delete_player():
    player_id = request.form.get("player_id")
    if player_id:
        conn = get_db_connection()
        try:
            conn.execute("DELETE FROM players WHERE id = ?", (player_id,))
            conn.commit()
            recalculate_all_elo()
        except Exception: pass
        finally: conn.close()
    return redirect("/players")

@app.route("/admin/games", methods=["GET", "POST"])
def admin_games():
    conn = get_db_connection()
    if request.method == "POST":
        ids_to_delete = request.form.getlist("game_id")
        if ids_to_delete:
            try:
                placeholders = ",".join("?" for _ in ids_to_delete)
                conn.execute(f"DELETE FROM games WHERE id IN ({placeholders})", ids_to_delete)
                conn.commit()
                recalculate_all_elo()
            except Exception as e:
                conn.rollback()
                return f"Fehler beim Löschen der Spiele: {e}", 500
    games = conn.execute("""
        SELECT g.id, g.red_score, g.blue_score, COALESCE(g.time_played, g.created_at) as played_at,
            GROUP_CONCAT(CASE WHEN gp.side='red' THEN p.name END, ', ') AS red_players,
            GROUP_CONCAT(CASE WHEN gp.side='blue' THEN p.name END, ', ') AS blue_players
        FROM games g LEFT JOIN game_players gp ON g.id = gp.game_id LEFT JOIN players p ON gp.player_id = p.id
        GROUP BY g.id ORDER BY played_at DESC
    """).fetchall()
    conn.close()
    return render_template("admin_delete.html", games=games)

@app.route("/api/group/<group_id>", methods=["GET", "POST"])
def group_api(group_id):
    # Zusammenfassung der API Methoden für Übersichtlichkeit hier im Beispiel,
    # im echten Code bitte deine bestehende Struktur behalten (GET und POST getrennt wie du hattest)
    if request.method == "POST":
        return update_group_details(group_id)
    else:
        return get_group_details(group_id)

# Die Helper Funktionen für group_api müssen natürlich definiert bleiben (get_group_details, update_group_details)
# Ich lasse sie hier der Kürze halber wie in deinem ursprünglichen Upload, da sie funktionierten.
# WICHTIG: Bitte den Code aus der vorherigen Antwort für get_group_details und update_group_details behalten/einfügen.

if __name__ == "__main__":
    app.run(debug=True)