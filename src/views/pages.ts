import { esc, jsonForScript, pyRound, signed } from "../util";
import { layout } from "./layout";

export type Player = { id: number; name: string };

// ---------------------------------------------------------------------------
// Eintragen (/)
// ---------------------------------------------------------------------------

function playerSelect(name: string, players: Player[]): string {
  const options = players.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("\n          ");
  return `<select name="${name}" class="player-select">
          <option value="">(leer)</option>
          ${options}
        </select>`;
}

export function indexPage(players: Player[]): string {
  const content = `
  <h2>Spieler auswählen</h2>

  <form method="POST" action="/submit">
    <div class="grid">
      <section>
        <label for="team1_player1">Team 1</label>
        ${playerSelect("team1_player1", players)}
        ${playerSelect("team1_player2", players)}
      </section>

      <section>
        <label for="team2_player1">Team 2</label>
        ${playerSelect("team2_player1", players)}
        ${playerSelect("team2_player2", players)}
      </section>
    </div>

    <h3 class="centered" style="margin-bottom: 10px;">Spiele</h3>
    <div class="game-container">
      <div class="score-header">
        <span class="team-label" id="label-team1">Team 1</span>
        <span class="team-label" id="label-team2">Team 2</span>
      </div>
      <div id="games"></div>
    </div>

    <div class="centered">
      <button type="button" class="contrast" onclick="addGameRow()">➕ Spiel hinzufügen</button>
    </div>

    <button type="submit" class="primary">Spiele eintragen</button>
  </form>`;

  return layout({
    title: "Kicker-Spielerfassung",
    path: "/",
    css: "index",
    content,
    scripts: `<script src="/js/index.js"></script>`,
  });
}

// ---------------------------------------------------------------------------
// Spieler (/players)
// ---------------------------------------------------------------------------

export function playersPage(players: Player[]): string {
  const rows = players
    .map(
      (p) => `
      <tr>
        <td>${esc(p.name)}</td>
        <td style="text-align: right;"></td>
      </tr>`
    )
    .join("");

  const content = `
  <h2>Spieler verwalten</h2>

  <table>
    <tbody>${rows}
    </tbody>
  </table>

  <form method="POST" action="/add_player" class="add-form">
    <input type="text" name="name" placeholder="Neuer Spieler" required />
    <button type="submit" class="contrast">+</button>
  </form>`;

  return layout({ title: "Spieler verwalten", path: "/players", css: "players", content });
}

// ---------------------------------------------------------------------------
// Übersicht (/overview)
// ---------------------------------------------------------------------------

export type TeamMember = { name: string; elo_change: number | null };
export type OverviewGame = {
  id: number;
  group_id: string;
  red_score: number;
  blue_score: number;
  time_played: string;
  red_team: TeamMember[];
  blue_team: TeamMember[];
};

const sortedNames = (team: TeamMember[]) => team.map((p) => p.name).sort();
const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

function gameCard(group: OverviewGame[]): string {
  const first = group[0];
  if (first.red_team.length === 0 || first.blue_team.length === 0) return "";

  const redSorted = sortedNames(first.red_team);
  const blueSorted = sortedNames(first.blue_team);
  const [leftTeam, rightTeam] = redSorted[0] < blueSorted[0] ? [first.red_team, first.blue_team] : [first.blue_team, first.red_team];
  const leftSorted = sortedNames(leftTeam);

  // Elo-Summe der Gruppe aus Sicht des (alphabetisch) ersten Spielers im linken Team
  let totalElo = 0;
  for (const game of group) {
    const name = leftSorted[0];
    const p = game.red_team.find((m) => m.name === name) ?? game.blue_team.find((m) => m.name === name);
    if (p && p.elo_change !== null) totalElo += p.elo_change;
  }
  const rounded = pyRound(totalElo);
  const leftClass = rounded > 0 ? "elo-win" : rounded < 0 ? "elo-loss" : "elo-neutral";
  const rightClass = rounded < 0 ? "elo-win" : rounded > 0 ? "elo-loss" : "elo-neutral";

  const scoreLines = group
    .map((game) => {
      const leftWasRed = sameList(sortedNames(game.red_team), leftSorted);
      return leftWasRed
        ? `<div class="score-line">
                <span class="color-dot red"></span>
                <span>${game.red_score}:${game.blue_score}</span>
                <span class="color-dot blue"></span>
              </div>`
        : `<div class="score-line">
                <span class="color-dot blue"></span>
                <span>${game.blue_score}:${game.red_score}</span>
                <span class="color-dot red"></span>
              </div>`;
    })
    .join("\n          ");

  const names = (team: TeamMember[]) => team.map((p) => `${esc(p.name)}<br>`).join("");
  const groupId = first.group_id || `single_${first.id}`;

  return `
  <article class="game-card" data-group-id="${esc(groupId)}">
    <div class="team-left"><div class="team-names">${names(leftTeam)}</div></div>
    <div class="elo-left"><div class="elo-box ${leftClass}">${signed(rounded)}</div></div>
    <div class="scores">
          ${scoreLines}
    </div>
    <div class="elo-right"><div class="elo-box ${rightClass}">${signed(-rounded)}</div></div>
    <div class="team-right"><div class="team-names">${names(rightTeam)}</div></div>
  </article>`;
}

export function overviewPage(groupedGames: OverviewGame[][]): string {
  const content = `
  <div class="header-with-toggle">
    <h2>Letzte Spiele</h2>
    <button id="edit-toggle-btn" class="secondary outline" role="switch" aria-checked="false">Edit</button>
  </div>
  ${groupedGames.map(gameCard).join("")}

  <dialog id="edit-modal">
    <article>
      <header>
        <a href="#close" aria-label="Close" class="close" data-target="edit-modal"></a>
        <strong>Spielgruppe bearbeiten</strong>
      </header>

      <div id="modal-content">
        <p><progress></progress> Lade...</p>
      </div>

      <footer>
        <button id="modal-cancel" class="secondary" data-target="edit-modal">Abbrechen</button>
        <button id="modal-save">Speichern</button>
      </footer>
    </article>
  </dialog>`;

  return layout({
    title: "Spielübersicht",
    path: "/overview",
    css: "overview",
    content,
    scripts: `<script src="/js/overview.js"></script>`,
  });
}

// ---------------------------------------------------------------------------
// Bearbeiten-Formular (Fragment für das Modal, /api/group/:id)
// ---------------------------------------------------------------------------

export type EditGame = { id: number; red_score: number; blue_score: number; red_names: string[] };

export function editGroupForm(team1: string[], team2: string[], games: EditGame[]): string {
  const rows = games
    .map((game, i) => {
      const team1WasRed = sameList([...game.red_names].sort(), team1);
      const red = `<td><input type="number" name="score_red[${game.id}]" value="${game.red_score}" min="0" required></td>`;
      const blue = `<td><input type="number" name="score_blue[${game.id}]" value="${game.blue_score}" min="0" required></td>`;
      return `
      <tr data-game-id="${game.id}">
        <td>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span>Spiel ${i + 1}</span>
            <button type="button" class="delete-game-btn outline contrast" data-game-id="${game.id}"
              style="width: auto; height: auto; padding: 0.2rem 0.5rem; font-size: 0.8rem; margin-bottom: 0; border-color: var(--del-color);"
              title="Spiel löschen">X</button>
          </div>
        </td>
        ${team1WasRed ? red + blue : blue + red}
      </tr>`;
    })
    .join("");

  return `<form id="edit-group-form">
  <div class="grid">
    <section>
      <h6 style="margin-bottom: 0.5rem;">Team 1</h6>
      <p>${esc(team1.join(" & "))}</p>
    </section>
    <section>
      <h6 style="margin-bottom: 0.5rem;">Team 2</h6>
      <p>${esc(team2.join(" & "))}</p>
    </section>
  </div>

  <table role="grid">
    <thead>
      <tr>
        <th>Spiel</th>
        <th style="text-align: center;">Team 1</th>
        <th style="text-align: center;">Team 2</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>
</form>`;
}

// ---------------------------------------------------------------------------
// Statistik (/statistics)
// ---------------------------------------------------------------------------

export type RankedPlayer = {
  id: number;
  name: string;
  elo: number;
  last_elo_change: number;
  current_rank: number;
  rank_change: number;
};

export type PlayerStats = {
  name: string;
  games_played: number;
  wins: number;
  losses: number;
  win_rate: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
};

export type ChartData = {
  labels: string[];
  dates: string[];
  datasets: Array<{ label: string; data: number[]; playerId: number }>;
};

export function statisticsPage(
  players: RankedPlayer[],
  stats: PlayerStats[],
  latestChangeIds: Set<number>,
  chart: ChartData
): string {
  const eloRows = players
    .map((p) => {
      const rc = p.rank_change;
      const ec = pyRound(p.last_elo_change);
      const trend =
        rc > 0
          ? `<span class="trend-icon elo-win">▲</span><span class="elo-change-value elo-win">${rc}</span>`
          : rc < 0
            ? `<span class="trend-icon elo-loss">▼</span><span class="elo-change-value elo-loss">${Math.abs(rc)}</span>`
            : `<span class="trend-icon elo-neutral">•</span>`;
      const diff =
        ec > 0
          ? `<span class="elo-change-value elo-win">(+${ec})</span>`
          : ec < 0
            ? `<span class="elo-change-value elo-loss">(${ec})</span>`
            : latestChangeIds.has(p.id)
              ? `<span class="elo-change-value elo-neutral">(0)</span>`
              : "";
      return `
          <tr>
            <td style="text-align: center;">${trend}</td>
            <td style="text-align: center; font-weight: bold;">${p.current_rank}</td>
            <td style="text-align: left;">${esc(p.name)}</td>
            <td style="text-align: right;">${diff}</td>
            <td class="elo-total" style="text-align: right;">${pyRound(p.elo)}</td>
          </tr>`;
    })
    .join("");

  const statRows = stats
    .map(
      (s) => `
          <tr>
            <td class="player-name">${esc(s.name)}</td>
            <td>${s.games_played}</td>
            <td>${s.wins}</td>
            <td>${s.losses}</td>
            <td>${s.win_rate.toFixed(1)}%</td>
            <td>${s.goals_for}</td>
            <td>${s.goals_against}</td>
            <td>${s.goal_difference}</td>
          </tr>`
    )
    .join("");

  const content = `
  <h2>Statistiken</h2>

  <div class="view-toggle">
    <button id="btn-elo" class="active">Elo-Ranking</button>
    <button id="btn-table">Details</button>
    <button id="btn-chart">Verlauf</button>
  </div>

  <div id="elo-view" class="stats-view active">
    <figure>
      <table role="grid">
        <thead>
          <tr>
            <th scope="col" style="width: 10%; text-align: center;">Trend</th>
            <th scope="col" style="width: 5%; text-align: center;">#</th>
            <th scope="col" style="text-align: left;">Spieler</th>
            <th scope="col" style="width: 10%; text-align: right;">Diff</th>
            <th scope="col" style="width: 12%; text-align: right;">Elo</th>
          </tr>
        </thead>
        <tbody>${eloRows}
        </tbody>
      </table>
    </figure>
  </div>

  <div id="table-view" class="stats-view">
    <div role="region" tabindex="0">
      <table id="stats-table">
        <thead>
          <tr>
            <th class="sortable player-name" data-sort="string" data-sort-state="desc">Spieler</th>
            <th class="sortable" data-sort="number" data-sort-state="unsorted">Spiele</th>
            <th class="sortable" data-sort="number" data-sort-state="unsorted">S</th>
            <th class="sortable" data-sort="number" data-sort-state="unsorted">N</th>
            <th class="sortable" data-sort="number" data-sort-state="unsorted">Sieg %</th>
            <th class="sortable" data-sort="number" data-sort-state="unsorted">Tore</th>
            <th class="sortable" data-sort="number" data-sort-state="unsorted">GT</th>
            <th class="sortable" data-sort="number" data-sort-state="unsorted">TD</th>
          </tr>
        </thead>
        <tbody>${statRows}
        </tbody>
      </table>
    </div>
  </div>

  <div id="chart-view" class="stats-view">
    <div id="chart-container"></div>
    <div style="text-align: center; margin-top: 0.5rem; font-size: 0.9rem; color: var(--muted-color);">
      <small>Tipp: Ziehe mit der Maus im Diagramm, um zu zoomen. Klicke oben auf Spielernamen, um sie auszublenden.</small>
    </div>
  </div>`;

  return layout({
    title: "Statistiken",
    path: "/statistics",
    css: "statistics",
    head: `<script src="https://cdn.jsdelivr.net/npm/apexcharts"></script>`,
    content,
    scripts: `<script type="application/json" id="chart-data">${jsonForScript(chart)}</script>
  <script src="/js/statistics.js"></script>`,
  });
}

// ---------------------------------------------------------------------------
// Admin: Spiele löschen (/admin/games)
// ---------------------------------------------------------------------------

export type AdminGame = {
  id: number;
  red_score: number;
  blue_score: number;
  played_at: string;
  red_players: string | null;
  blue_players: string | null;
};

export function adminGamesPage(games: AdminGame[], formatDate: (s: string) => string): string {
  const rows = games
    .map(
      (g) => `
        <tr>
          <td><input type="checkbox" name="game_id" value="${g.id}"></td>
          <td>${g.id}</td>
          <td>${esc(formatDate(g.played_at))}</td>
          <td>${esc(g.red_players || "-")} (${g.red_score})</td>
          <td>${esc(g.blue_players || "-")} (${g.blue_score})</td>
        </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin: Spiele löschen</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css" />
</head>
<body class="container">
  <h2>Admin: Spiele löschen</h2>
  <p>Einfach abhaken, was gelöscht werden soll, und unten auf "Ausgewählte löschen" klicken.</p>

  <form method="POST" action="/admin/games">
    <table role="grid">
      <thead>
        <tr>
          <th>Löschen</th>
          <th>ID</th>
          <th>Wann</th>
          <th>Rot (Score)</th>
          <th>Blau (Score)</th>
        </tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
    <button type="submit" class="contrast">Ausgewählte löschen</button>
  </form>
</body>
</html>`;
}
