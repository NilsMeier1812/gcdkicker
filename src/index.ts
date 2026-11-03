import { Hono } from "hono";
import { STARTING_ELO, recalculateAllElo } from "./elo";
import { ensureMigrated } from "./migrate";
import { type Env, formatDateTime, formatDayMonth, nowTimestamp, parseTimestamp, pyRound } from "./util";
import { errorPage, flash } from "./views/layout";
import {
  type AdminGame,
  type Player,
  type PlayerRow,
  type ChartData,
  type EditGame,
  type OverviewGame,

  type PlayerStats,
  type RankedPlayer,
  adminGamesPage,
  editGroupForm,
  indexPage,
  overviewPage,
  playersPage,
  statisticsPage,
} from "./views/pages";

const app = new Hono<{ Bindings: Env }>();
const GROUPS_PER_PAGE = 30;

// Datenbank beim ersten Request automatisch einrichten (Schema + Daten-Import)
app.use("*", async (c, next) => {
  await ensureMigrated(c.env.DB);
  await next();
});

// ---------------------------------------------------------------------------
// Web-UI Routen
// ---------------------------------------------------------------------------

app.get("/", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, name FROM players ORDER BY name").all<Player>();
  return c.html(indexPage(results));
});

const PLAYER_MESSAGES: Record<string, () => string> = {
  added: () => flash("success", "Spieler hinzugefügt."),
  deleted: () => flash("success", "Spieler gelöscht."),
  duplicate: () => flash("error", "Diesen Namen gibt es schon."),
  hasgames: () => flash("error", "Spieler mit eingetragenen Spielen können nicht gelöscht werden."),
};

app.get("/players", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.name, p.elo, COUNT(gp.id) AS games
     FROM players p LEFT JOIN game_players gp ON gp.player_id = p.id
     GROUP BY p.id ORDER BY p.name COLLATE NOCASE`
  ).all<PlayerRow>();
  const msg = PLAYER_MESSAGES[c.req.query("msg") ?? ""]?.() ?? "";
  return c.html(playersPage(results, msg));
});

app.get("/overview", async (c) => {
  type Row = {
    game_id: number;
    group_id: string;
    red_score: number;
    blue_score: number;
    time_played: string;
    player_name: string;
    side: "red" | "blue";
    elo_change: number | null;
  };
  const { results: rows } = await c.env.DB.prepare(
    `SELECT g.id AS game_id, g.group_id, g.red_score, g.blue_score, g.time_played,
            p.name AS player_name, gp.side, eh.elo_change
     FROM games g
     JOIN game_players gp ON g.id = gp.game_id
     JOIN players p ON gp.player_id = p.id
     LEFT JOIN elo_history eh ON g.id = eh.game_id AND p.id = eh.player_id
     ORDER BY g.time_played DESC, g.id DESC, gp.id ASC`
  ).all<Row>();

  const games = new Map<number, OverviewGame>();
  for (const row of rows) {
    let game = games.get(row.game_id);
    if (!game) {
      game = {
        id: row.game_id,
        group_id: row.group_id,
        red_score: row.red_score,
        blue_score: row.blue_score,
        time_played: row.time_played,
        red_team: [],
        blue_team: [],
      };
      games.set(row.game_id, game);
    }
    const member = { name: row.player_name, elo_change: row.elo_change };
    (row.side === "red" ? game.red_team : game.blue_team).push(member);
  }

  const groups = new Map<string, OverviewGame[]>();
  for (const game of games.values()) {
    const key = game.group_id || `single_${game.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(game);
  }
  // Innerhalb einer Gruppe: Spiel 1 zuerst
  for (const g of groups.values()) g.sort((a, b) => a.id - b.id);
  const sorted = [...groups.values()].sort((a, b) =>
    a[0].time_played < b[0].time_played ? 1 : a[0].time_played > b[0].time_played ? -1 : 0
  );

  const page = Math.max(1, parseInt(c.req.query("page") ?? "1", 10) || 1);
  const pageGroups = sorted.slice((page - 1) * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE);
  const newGroupId = c.req.query("neu");
  const saved = parseInt(c.req.query("saved") ?? "", 10);
  const message =
    newGroupId && saved > 0
      ? flash("success", saved === 1 ? "1 Spiel gespeichert." : `${saved} Spiele gespeichert.`)
      : c.req.query("edited")
        ? flash("success", "Änderungen gespeichert.")
        : "";

  return c.html(
    overviewPage(pageGroups, { page, hasMore: sorted.length > page * GROUPS_PER_PAGE, newGroupId, message })
  );
});

app.get("/statistics", async (c) => {
  const db = c.env.DB;

  // --- TEIL 1: Elo-Ranking inkl. Trend seit der letzten Spielgruppe ---
  const [playersRes, latestGroupRes, statsRes, historyRes] = await db.batch([
    db.prepare("SELECT id, name, elo FROM players ORDER BY id"),
    db.prepare("SELECT group_id FROM games ORDER BY time_played DESC, id DESC LIMIT 1"),
    db.prepare(
      `SELECT p.name, p.id,
        COALESCE(SUM(CASE WHEN g.red_score != g.blue_score THEN 1 ELSE 0 END), 0) AS games_played,
        COALESCE(SUM(CASE WHEN (gp.side = 'red' AND g.red_score > g.blue_score) OR (gp.side = 'blue' AND g.blue_score > g.red_score) THEN 1 ELSE 0 END), 0) AS wins,
        COALESCE(SUM(CASE WHEN (gp.side = 'red' AND g.red_score < g.blue_score) OR (gp.side = 'blue' AND g.blue_score < g.red_score) THEN 1 ELSE 0 END), 0) AS losses,
        COALESCE(SUM(CASE WHEN gp.side = 'red' THEN g.red_score ELSE g.blue_score END), 0) AS goals_for,
        COALESCE(SUM(CASE WHEN gp.side = 'red' THEN g.blue_score ELSE g.red_score END), 0) AS goals_against
       FROM players p
       LEFT JOIN game_players gp ON p.id = gp.player_id
       LEFT JOIN games g ON gp.game_id = g.id
       GROUP BY p.id, p.name
       ORDER BY p.name ASC`
    ),
    db.prepare(
      `SELECT g.id, g.group_id, g.time_played, eh.player_id, eh.elo_change
       FROM games g
       JOIN elo_history eh ON g.id = eh.game_id
       ORDER BY g.time_played ASC, g.id ASC`
    ),
  ]);

  const players = playersRes.results as Array<{ id: number; name: string; elo: number }>;
  const latestGroup = (latestGroupRes.results as Array<{ group_id: string }>)[0];

  const latestChanges = new Map<number, number>();
  if (latestGroup) {
    const { results } = await db
      .prepare(
        `SELECT player_id, SUM(elo_change) AS total_change
         FROM elo_history
         WHERE game_id IN (SELECT id FROM games WHERE group_id = ?)
         GROUP BY player_id`
      )
      .bind(latestGroup.group_id)
      .all<{ player_id: number; total_change: number }>();
    for (const r of results) latestChanges.set(r.player_id, r.total_change);
  }

  const withPrev = players.map((p) => {
    const last = latestChanges.get(p.id) ?? 0;
    return { ...p, last_elo_change: last, elo_previous: p.elo - last };
  });
  const current = [...withPrev].sort((a, b) => b.elo - a.elo);
  const previous = [...withPrev].sort((a, b) => b.elo_previous - a.elo_previous);
  const previousRank = new Map(previous.map((p, i) => [p.id, i + 1]));
  const ranked: RankedPlayer[] = current.map((p, i) => {
    const rank = i + 1;
    return { ...p, current_rank: rank, rank_change: (previousRank.get(p.id) ?? rank) - rank };
  });

  // --- TEIL 2: Detail-Statistiken ---
  const stats: PlayerStats[] = (
    statsRes.results as Array<Omit<PlayerStats, "win_rate" | "goal_difference">>
  ).map((s) => ({
    ...s,
    win_rate: s.games_played > 0 ? (s.wins / s.games_played) * 100 : 0,
    goal_difference: s.goals_for - s.goals_against,
  }));

  // --- TEIL 3: Elo-Verlauf (gruppenbasiert) ---
  const history = historyRes.results as Array<{
    id: number;
    group_id: string;
    time_played: string;
    player_id: number;
    elo_change: number;
  }>;
  const chartMap = new Map<number, { name: string; current: number; history: number[] }>();
  for (const p of players) chartMap.set(p.id, { name: p.name, current: STARTING_ELO, history: [STARTING_ELO] });

  const chart: ChartData = { labels: ["Start"], dates: [""], datasets: [] };

  type GroupAgg = { timestamp: string; changes: Map<number, number> };
  const groupsOrdered: GroupAgg[] = [];
  let currentGroupId: string | null = null;
  let currentGroup: GroupAgg = { timestamp: "", changes: new Map() };
  for (const row of history) {
    if (row.group_id !== currentGroupId && currentGroupId !== null) {
      groupsOrdered.push(currentGroup);
      currentGroup = { timestamp: "", changes: new Map() };
    }
    currentGroupId = row.group_id;
    currentGroup.timestamp = row.time_played;
    currentGroup.changes.set(row.player_id, (currentGroup.changes.get(row.player_id) ?? 0) + row.elo_change);
  }
  if (currentGroupId !== null) groupsOrdered.push(currentGroup);

  for (const group of groupsOrdered) {
    const d = parseTimestamp(group.timestamp);
    chart.labels.push(d ? formatDayMonth(d) : "?");
    chart.dates.push(d ? d.toISOString() : "");
    for (const [pid, change] of group.changes) {
      const entry = chartMap.get(pid);
      if (entry) entry.current += change;
    }
    for (const entry of chartMap.values()) entry.history.push(pyRound(entry.current));
  }
  const gamesByName = new Map(stats.map((s) => [s.name, s.games_played]));
  for (const [pid, entry] of chartMap) {
    chart.datasets.push({ label: entry.name, data: entry.history, playerId: pid, games: gamesByName.get(entry.name) ?? 0 });
  }

  return c.html(statisticsPage(ranked, stats, new Set(latestChanges.keys()), chart));
});

// ---------------------------------------------------------------------------
// Formular-Endpunkte
// ---------------------------------------------------------------------------

app.post("/submit", async (c) => {
  const db = c.env.DB;
  const form = await c.req.formData();

  const candidates: Array<[string, "red" | "blue"]> = [
    ["team1_player1", "red"],
    ["team1_player2", "red"],
    ["team2_player1", "blue"],
    ["team2_player2", "blue"],
  ];
  const playerList: Array<{ id: number; side: "red" | "blue" }> = [];
  for (const [field, side] of candidates) {
    const raw = form.get(field);
    if (typeof raw === "string" && raw !== "") {
      const id = parseInt(raw, 10);
      if (!Number.isInteger(id)) return c.html(errorPage("Ungültige Spieler-ID."), 400);
      playerList.push({ id, side });
    }
  }
  if (!playerList.some((p) => p.side === "red") || !playerList.some((p) => p.side === "blue")) {
    return c.html(errorPage("Es muss mindestens ein Spieler pro Team ausgewählt werden."), 400);
  }
  if (new Set(playerList.map((p) => p.id)).size !== playerList.length) {
    return c.html(errorPage("Ein Spieler wurde mehrfach ausgewählt."), 400);
  }

  const groupId = crypto.randomUUID();
  const now = nowTimestamp();
  const statements: D1PreparedStatement[] = [];

  for (let i = 0; form.has(`games[${i}][score1]`); i++) {
    const score1 = parseInt(String(form.get(`games[${i}][score1]`)), 10);
    const score2 = parseInt(String(form.get(`games[${i}][score2]`)), 10);
    if (!Number.isInteger(score1) || !Number.isInteger(score2) || score1 < 0 || score2 < 0 || score1 > 99 || score2 > 99) {
      return c.html(errorPage(`Ungültiger Spielstand in Spiel ${i + 1}.`), 400);
    }
    const swapped = (form.get(`games[${i}][swapped]`) ?? "0") === "1";
    const redScore = swapped ? score2 : score1;
    const blueScore = swapped ? score1 : score2;

    statements.push(
      db
        .prepare(
          "INSERT INTO games (group_id, red_score, blue_score, comment, created_at, time_played) VALUES (?, ?, ?, '', ?, ?)"
        )
        .bind(groupId, redScore, blueScore, now, now)
    );
    // Die Spiel-ID ist im Batch noch unbekannt -> das zuletzt eingefügte Spiel dieser Gruppe verwenden.
    for (const p of playerList) {
      const side = swapped ? (p.side === "red" ? "blue" : "red") : p.side;
      statements.push(
        db
          .prepare(
            "INSERT INTO game_players (game_id, player_id, side) VALUES ((SELECT MAX(id) FROM games WHERE group_id = ?), ?, ?)"
          )
          .bind(groupId, p.id, side)
      );
    }
  }

  if (statements.length === 0) return c.html(errorPage("Keine Spiele übermittelt."), 400);

  try {
    await db.batch(statements); // atomar: alles oder nichts
    await recalculateAllElo(db);
  } catch (e) {
    return c.html(errorPage(`Beim Speichern ist ein Fehler aufgetreten: ${(e as Error).message}`), 500);
  }
  return c.redirect(`/overview?neu=${groupId}&saved=${statements.length / (1 + playerList.length)}`, 303);
});

app.post("/add_player", async (c) => {
  const form = await c.req.formData();
  const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 30);
  if (!name) return c.redirect("/players", 303);
  const existing = await c.env.DB.prepare("SELECT 1 FROM players WHERE lower(name) = lower(?)").bind(name).first();
  if (existing) return c.redirect("/players?msg=duplicate", 303);
  await c.env.DB.prepare("INSERT INTO players (name, elo) VALUES (?, ?)").bind(name, STARTING_ELO).run();
  return c.redirect("/players?msg=added", 303);
});

app.post("/delete_player", async (c) => {
  const form = await c.req.formData();
  const id = parseInt(String(form.get("player_id") ?? ""), 10);
  if (!Number.isInteger(id)) return c.redirect("/players", 303);
  // Nur Spieler ohne Spiele löschen – sonst würden durch ON DELETE CASCADE Spiele kaputtgehen.
  const used = await c.env.DB.prepare("SELECT 1 FROM game_players WHERE player_id = ? LIMIT 1").bind(id).first();
  if (used) return c.redirect("/players?msg=hasgames", 303);
  await c.env.DB.prepare("DELETE FROM players WHERE id = ?").bind(id).run();
  return c.redirect("/players?msg=deleted", 303);
});

app.on(["GET", "POST"], "/admin/games", async (c) => {
  const db = c.env.DB;
  let message = "";
  if (c.req.method === "POST") {
    const form = await c.req.formData();
    const ids = form
      .getAll("game_id")
      .map((v) => parseInt(String(v), 10))
      .filter(Number.isInteger);
    if (ids.length > 0) {
      try {
        await db.batch(ids.map((id) => db.prepare("DELETE FROM games WHERE id = ?").bind(id)));
        await recalculateAllElo(db);
        message = flash("success", ids.length === 1 ? "1 Spiel gelöscht." : `${ids.length} Spiele gelöscht.`);
      } catch (e) {
        return c.html(errorPage(`Fehler beim Löschen der Spiele: ${(e as Error).message}`, "/admin/games"), 500);
      }
    }
  }
  const { results } = await db
    .prepare(
      `SELECT g.id, g.red_score, g.blue_score, COALESCE(g.time_played, g.created_at) AS played_at,
              GROUP_CONCAT(CASE WHEN gp.side='red'  THEN p.name END, ', ') AS red_players,
              GROUP_CONCAT(CASE WHEN gp.side='blue' THEN p.name END, ', ') AS blue_players
       FROM games g
       LEFT JOIN game_players gp ON g.id = gp.game_id
       LEFT JOIN players p ON gp.player_id = p.id
       GROUP BY g.id
       ORDER BY played_at DESC, g.id DESC`
    )
    .all<AdminGame>();
  return c.html(adminGamesPage(results, formatDateTime, message));
});

// ---------------------------------------------------------------------------
// API für das Bearbeiten-Modal in der Übersicht
// ---------------------------------------------------------------------------

async function loadGroup(db: D1Database, groupId: string) {
  const single = /^single_(\d+)$/.exec(groupId);
  const where = single ? "g.id = ?" : "g.group_id = ?";
  const param = single ? parseInt(single[1], 10) : groupId;

  const { results } = await db
    .prepare(
      `SELECT g.id, g.red_score, g.blue_score, gp.side, p.name
       FROM games g
       JOIN game_players gp ON g.id = gp.game_id
       JOIN players p ON gp.player_id = p.id
       WHERE ${where}
       ORDER BY g.time_played ASC, g.id ASC, gp.id ASC`
    )
    .bind(param)
    .all<{ id: number; red_score: number; blue_score: number; side: "red" | "blue"; name: string }>();

  const games = new Map<number, EditGame & { blue_names: string[] }>();
  for (const r of results) {
    let g = games.get(r.id);
    if (!g) {
      g = { id: r.id, red_score: r.red_score, blue_score: r.blue_score, red_names: [], blue_names: [] };
      games.set(r.id, g);
    }
    (r.side === "red" ? g.red_names : g.blue_names).push(r.name);
  }
  return [...games.values()];
}

app.get("/api/group/:groupId", async (c) => {
  const games = await loadGroup(c.env.DB, c.req.param("groupId"));
  if (games.length === 0) return c.text("Spielgruppe nicht gefunden.", 404);

  // Team 1 = das Team, das in der Übersicht links steht (alphabetisch erster Spieler)
  const red = [...games[0].red_names].sort();
  const blue = [...games[0].blue_names].sort();
  const [team1, team2] = red[0] < blue[0] ? [red, blue] : [blue, red];
  return c.html(editGroupForm(team1, team2, games));
});

app.post("/api/group/:groupId", async (c) => {
  const db = c.env.DB;
  const games = await loadGroup(db, c.req.param("groupId"));
  if (games.length === 0) return c.text("Spielgruppe nicht gefunden.", 404);
  const byId = new Map(games.map((g) => [g.id, g]));

  const form = await c.req.formData();
  const deleteIds = new Set(
    form
      .getAll("delete_game_ids")
      .map((v) => parseInt(String(v), 10))
      .filter((id) => byId.has(id))
  );

  const now = nowTimestamp();
  const statements: D1PreparedStatement[] = [];

  for (const id of deleteIds) {
    statements.push(db.prepare("DELETE FROM games WHERE id = ?").bind(id));
  }

  for (const game of games) {
    if (deleteIds.has(game.id)) continue;
    const redRaw = form.get(`score_red[${game.id}]`);
    const blueRaw = form.get(`score_blue[${game.id}]`);
    if (redRaw === null || blueRaw === null) continue;
    const red = parseInt(String(redRaw), 10);
    const blue = parseInt(String(blueRaw), 10);
    if (!Number.isInteger(red) || !Number.isInteger(blue) || red < 0 || blue < 0) {
      return c.text("Ungültiger Spielstand.", 400);
    }
    if (red === game.red_score && blue === game.blue_score) continue;

    statements.push(
      db.prepare("UPDATE games SET red_score = ?, blue_score = ? WHERE id = ?").bind(red, blue, game.id),
      db
        .prepare(
          `INSERT INTO games_history (game_id, changed_at, old_red_score, new_red_score, old_blue_score, new_blue_score)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .bind(game.id, now, game.red_score, red, game.blue_score, blue)
    );
  }

  if (statements.length > 0) {
    try {
      await db.batch(statements);
      await recalculateAllElo(db);
    } catch (e) {
      return c.text(`Fehler beim Speichern: ${(e as Error).message}`, 500);
    }
  }
  return c.json({ success: true });
});

app.notFound((c) => c.html(errorPage("Diese Seite gibt es nicht."), 404));

app.onError((err, c) => {
  console.error(err);
  if (c.req.path.startsWith("/api/")) return c.text(err.message, 500);
  return c.html(errorPage(`Ein unerwarteter Fehler ist aufgetreten: ${err.message}`), 500);
});

export default app;
