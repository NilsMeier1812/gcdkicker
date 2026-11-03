import { pyRound } from "./util";

// --- ELO-Konstanten ---
export const STARTING_ELO = 1500;
export const K_FACTOR = 32;

// Mehrere Zeilen pro INSERT, damit wir nicht hunderte Einzel-Queries brauchen.
const INSERT_CHUNK_SIZE = 500;

type GameRow = {
  id: number;
  group_id: string;
  red_score: number;
  blue_score: number;
  red_team_ids: string | null;
  blue_team_ids: string | null;
};

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .filter((s) => s.trim() !== "")
    .map((s) => parseInt(s, 10));
}

/** Zahl sicher als SQL-Literal (nur endliche Zahlen). */
function num(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Ungültige Zahl: ${n}`);
  return String(n);
}

/**
 * Baut die Statements, die die Elo-Werte aller Spieler von Grund auf neu berechnen.
 * Änderungen werden pro Spiel berechnet, aber erst pro Gruppe auf die
 * Basis-Elo-Werte der Spieler angewendet (identisch zur alten Python-Logik).
 */
export async function buildRecalculateStatements(db: D1Database): Promise<D1PreparedStatement[]> {
  const players = (await db.prepare("SELECT id FROM players ORDER BY id").all<{ id: number }>()).results;
  const playerElos = new Map<number, number>();
  for (const p of players) playerElos.set(p.id, STARTING_ELO);

  const games = (
    await db
      .prepare(
        `SELECT g.id, g.group_id, g.red_score, g.blue_score,
                GROUP_CONCAT(CASE WHEN gp.side = 'red'  THEN gp.player_id END) AS red_team_ids,
                GROUP_CONCAT(CASE WHEN gp.side = 'blue' THEN gp.player_id END) AS blue_team_ids
         FROM games g
         JOIN game_players gp ON g.id = gp.game_id
         GROUP BY g.id
         ORDER BY g.time_played ASC, g.id ASC`
      )
      .all<GameRow>()
  ).results;

  const history: Array<[number, number, number]> = [];
  let currentGroupId: string | null = null;
  let groupChanges = new Map<number, number>();

  const applyGroupChanges = () => {
    for (const [pid, change] of groupChanges) {
      if (playerElos.has(pid)) playerElos.set(pid, playerElos.get(pid)! + change);
    }
    groupChanges = new Map();
  };

  for (const game of games) {
    if (game.group_id !== currentGroupId && currentGroupId !== null) {
      applyGroupChanges();
    }
    currentGroupId = game.group_id;

    const red = parseIds(game.red_team_ids).filter((id) => playerElos.has(id));
    const blue = parseIds(game.blue_team_ids).filter((id) => playerElos.has(id));
    if (red.length === 0 || blue.length === 0) continue;

    const avgRed = red.reduce((s, id) => s + playerElos.get(id)!, 0) / red.length;
    const avgBlue = blue.reduce((s, id) => s + playerElos.get(id)!, 0) / blue.length;

    const expectedRed = 1 / (1 + 10 ** ((avgBlue - avgRed) / 400));
    const actualRed = game.red_score > game.blue_score ? 1.0 : game.blue_score > game.red_score ? 0.0 : 0.5;
    const change = K_FACTOR * (actualRed - expectedRed);

    for (const pid of red) {
      history.push([game.id, pid, change]);
      groupChanges.set(pid, (groupChanges.get(pid) ?? 0) + change);
    }
    for (const pid of blue) {
      history.push([game.id, pid, -change]);
      groupChanges.set(pid, (groupChanges.get(pid) ?? 0) - change);
    }
  }
  applyGroupChanges();

  const statements: D1PreparedStatement[] = [db.prepare("DELETE FROM elo_history")];

  if (playerElos.size > 0) {
    const cases = [...playerElos].map(([pid, elo]) => `WHEN ${num(pid)} THEN ${num(pyRound(elo))}`).join(" ");
    statements.push(db.prepare(`UPDATE players SET elo = CASE id ${cases} ELSE ${STARTING_ELO} END`));
  }

  for (let i = 0; i < history.length; i += INSERT_CHUNK_SIZE) {
    const values = history
      .slice(i, i + INSERT_CHUNK_SIZE)
      .map(([gid, pid, change]) => `(${num(gid)}, ${num(pid)}, ${num(change)})`)
      .join(",");
    statements.push(db.prepare(`INSERT INTO elo_history (game_id, player_id, elo_change) VALUES ${values}`));
  }

  return statements;
}

/** Berechnet alle Elo-Werte neu und schreibt sie atomar (ein Batch = eine Transaktion). */
export async function recalculateAllElo(db: D1Database): Promise<void> {
  const statements = await buildRecalculateStatements(db);
  await db.batch(statements);
}
