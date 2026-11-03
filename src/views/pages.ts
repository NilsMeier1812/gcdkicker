import { berlinParts, dayLabel, esc, jsonForScript, parseTimestamp, pyRound, signed } from "../util";
import { flash, icon, layout } from "./layout";

export type Player = { id: number; name: string };

const trashIcon =
  '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

// ---------------------------------------------------------------------------
// Eintragen (/)
// ---------------------------------------------------------------------------

function playerSelect(name: string, label: string, placeholder: string, players: Player[]): string {
  const options = players.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  return `<select name="${name}" class="player-select" aria-label="${esc(label)}">
          <option value="">${esc(placeholder)}</option>${options}
        </select>`;
}

export function indexPage(players: Player[]): string {
  const team = (n: 1 | 2) => `
      <fieldset class="team-box">
        <legend>Team ${n}</legend>
        ${playerSelect(`team${n}_player1`, `Team ${n}, Spieler 1`, "1. Spieler", players)}
        ${playerSelect(`team${n}_player2`, `Team ${n}, Spieler 2`, "2. Spieler", players)}
      </fieldset>`;

  const content = `
  <div class="page-head"><h1>Spiele eintragen</h1></div>

  <form method="POST" action="/submit" id="entry-form" novalidate>
    <div class="teams">${team(1)}${team(2)}
    </div>

    <section class="games-box">
      <div class="score-grid score-head" aria-hidden="true">
        <span></span>
        <span class="team-label" id="label-team1">Team 1</span>
        <span></span>
        <span class="team-label" id="label-team2">Team 2</span>
        <span></span>
      </div>
      <div id="games"></div>
      <button type="button" class="outline secondary add-game" id="add-game">${icon("plus", 18)} Spiel hinzufügen</button>
    </section>

    <p class="form-error" id="form-error" role="alert" hidden></p>
    <button type="submit" id="submit-btn">Spiele speichern</button>
  </form>`;

  return layout({
    title: "Eintragen",
    path: "/",
    content,
    scripts: `<script src="/js/index.js?v=2"></script>`,
  });
}

// ---------------------------------------------------------------------------
// Spieler (/players)
// ---------------------------------------------------------------------------

export type PlayerRow = { id: number; name: string; elo: number; games: number };

export function playersPage(players: PlayerRow[], message = ""): string {
  const rows = players
    .map(
      (p) => `
      <li class="player-row">
        <span class="player-name">${esc(p.name)}</span>
        <span class="player-meta">${p.games} ${p.games === 1 ? "Spiel" : "Spiele"} · Elo ${pyRound(p.elo)}</span>
        ${
          p.games === 0
            ? `<form method="POST" action="/delete_player" class="inline-form">
          <input type="hidden" name="player_id" value="${p.id}">
          <button type="submit" class="icon-btn danger confirm-btn" title="Spieler löschen" aria-label="${esc(p.name)} löschen">${trashIcon}</button>
        </form>`
            : ""
        }
      </li>`
    )
    .join("");

  const content = `
  <div class="page-head"><h1>Spieler</h1></div>
  ${message}
  <form method="POST" action="/add_player" class="add-form">
    <input type="text" name="name" placeholder="Name des neuen Spielers" required maxlength="30" autocomplete="off" aria-label="Name des neuen Spielers" />
    <button type="submit">Hinzufügen</button>
  </form>

  <ul class="player-list">${rows}
  </ul>
  <p class="hint">Spieler können nur gelöscht werden, solange sie noch keine Spiele haben.</p>`;

  return layout({
    title: "Spieler",
    path: "/players",
    content,
    scripts: `<script src="/js/confirm.js?v=2"></script>`,
  });
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

function gameCard(group: OverviewGame[], highlight: boolean): string {
  const first = group[0];
  if (first.red_team.length === 0 || first.blue_team.length === 0) return "";

  const redSorted = sortedNames(first.red_team);
  const blueSorted = sortedNames(first.blue_team);
  const [leftTeam, rightTeam] =
    redSorted[0] < blueSorted[0] ? [first.red_team, first.blue_team] : [first.blue_team, first.red_team];
  const leftSorted = sortedNames(leftTeam);

  // Elo-Summe der Gruppe aus Sicht des (alphabetisch) ersten Spielers im linken Team
  let totalElo = 0;
  let leftWins = 0;
  let rightWins = 0;
  for (const game of group) {
    const name = leftSorted[0];
    const p = game.red_team.find((m) => m.name === name) ?? game.blue_team.find((m) => m.name === name);
    if (p && p.elo_change !== null) totalElo += p.elo_change;
    const leftWasRed = sameList(sortedNames(game.red_team), leftSorted);
    const [l, r] = leftWasRed ? [game.red_score, game.blue_score] : [game.blue_score, game.red_score];
    if (l > r) leftWins++;
    else if (r > l) rightWins++;
  }
  const rounded = pyRound(totalElo);
  const cls = (v: number) => (v > 0 ? "elo-win" : v < 0 ? "elo-loss" : "elo-neutral");

  const scoreLines = group
    .map((game) => {
      const leftWasRed = sameList(sortedNames(game.red_team), leftSorted);
      const [l, r, lc, rc] = leftWasRed
        ? [game.red_score, game.blue_score, "red", "blue"]
        : [game.blue_score, game.red_score, "blue", "red"];
      return `<div class="score-line"><span class="dot ${lc}"></span><span class="${l > r ? "won" : ""}">${l}</span><span class="colon">:</span><span class="${r > l ? "won" : ""}">${r}</span><span class="dot ${rc}"></span></div>`;
    })
    .join("");

  const names = (team: TeamMember[], won: boolean) =>
    `<div class="team-names${won ? " winner" : ""}">${team.map((p) => `<span>${esc(p.name)}</span>`).join("")}</div>`;
  const groupId = first.group_id || `single_${first.id}`;

  return `
    <article class="game-card${highlight ? " is-new" : ""}" data-group-id="${esc(groupId)}" tabindex="-1">
      <div class="side left">
        ${names(leftTeam, leftWins > rightWins)}
        <span class="elo-box ${cls(rounded)}">${signed(rounded)}</span>
      </div>
      <div class="scores">
        ${scoreLines}
      </div>
      <div class="side right">
        ${names(rightTeam, rightWins > leftWins)}
        <span class="elo-box ${cls(-rounded)}">${signed(-rounded)}</span>
      </div>
    </article>`;
}

export function overviewPage(
  groupedGames: OverviewGame[][],
  opts: { page: number; hasMore: boolean; newGroupId?: string; message?: string }
): string {
  const now = new Date();
  let lastDay = "";
  const parts: string[] = [];
  for (const group of groupedGames) {
    const d = parseTimestamp(group[0].time_played);
    const day = d ? berlinParts(d).day : "";
    if (day !== lastDay) {
      parts.push(`<h2 class="day-head">${esc(day ? dayLabel(day, now) : "Unbekanntes Datum")}</h2>`);
      lastDay = day;
    }
    parts.push(gameCard(group, group[0].group_id === opts.newGroupId));
  }

  const pager = `
  <div class="pager">
    ${opts.page > 1 ? `<a href="/overview?page=${opts.page - 1}" role="button" class="secondary outline">Neuere</a>` : "<span></span>"}
    ${opts.hasMore ? `<a href="/overview?page=${opts.page + 1}" role="button" class="secondary outline">Ältere Spiele</a>` : "<span></span>"}
  </div>`;

  const content = `
  <div class="page-head">
    <h1>Letzte Spiele</h1>
    <button id="edit-toggle-btn" class="outline btn-auto" aria-pressed="false">Bearbeiten</button>
  </div>
  ${opts.message ?? ""}
  <p class="edit-hint" id="edit-hint" hidden>Tippe auf eine Spielgruppe, um sie zu bearbeiten.</p>
  ${parts.length ? parts.join("") : `<p class="empty">Noch keine Spiele eingetragen. <a href="/">Jetzt eintragen</a></p>`}
  ${opts.page > 1 || opts.hasMore ? pager : ""}

  <dialog id="edit-modal">
    <article>
      <header>
        <button type="button" class="modal-close" aria-label="Schließen">✕</button>
        <strong>Spielgruppe bearbeiten</strong>
      </header>
      <div id="modal-content"><p aria-busy="true">Lade…</p></div>
      <footer>
        <button type="button" id="modal-cancel" class="secondary">Abbrechen</button>
        <button type="button" id="modal-save">Speichern</button>
      </footer>
    </article>
  </dialog>`;

  return layout({
    title: "Übersicht",
    path: "/overview",
    content,
    scripts: `<script src="/js/overview.js?v=2"></script>`,
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
      const input = (side: "red" | "blue", label: string) =>
        `<input type="number" inputmode="numeric" name="score_${side}[${game.id}]" value="${side === "red" ? game.red_score : game.blue_score}" min="0" max="99" required aria-label="Spiel ${i + 1}, ${esc(label)}">`;
      const t1 = input(team1WasRed ? "red" : "blue", team1.join(" & "));
      const t2 = input(team1WasRed ? "blue" : "red", team2.join(" & "));
      return `
    <div class="edit-row" data-game-id="${game.id}">
      <span class="edit-label">Spiel ${i + 1}</span>
      ${t1}
      <span class="colon">:</span>
      ${t2}
      <button type="button" class="icon-btn danger delete-game-btn" data-game-id="${game.id}" title="Spiel löschen" aria-label="Spiel ${i + 1} löschen">${trashIcon}</button>
    </div>`;
    })
    .join("");

  return `<form id="edit-group-form">
  <div class="edit-row edit-head">
    <span></span>
    <span class="edit-team">${esc(team1.join(" & "))}</span>
    <span></span>
    <span class="edit-team">${esc(team2.join(" & "))}</span>
    <span></span>
  </div>${rows}
  <p class="hint" id="delete-hint" hidden>Gelöschte Spiele werden erst beim Speichern entfernt.</p>
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
  datasets: Array<{ label: string; data: number[]; playerId: number; games: number }>;
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
          ? `<span class="trend elo-win" title="${rc} Plätze gestiegen">▲${rc}</span>`
          : rc < 0
            ? `<span class="trend elo-loss" title="${-rc} Plätze gefallen">▼${-rc}</span>`
            : "";
      const diff =
        ec !== 0 || latestChangeIds.has(p.id)
          ? `<span class="elo-diff ${ec > 0 ? "elo-win" : ec < 0 ? "elo-loss" : "elo-neutral"}">${signed(ec)}</span>`
          : "";
      return `
        <tr${p.current_rank <= 3 ? ` class="podium-${p.current_rank}"` : ""}>
          <td class="rank">${p.current_rank}</td>
          <td class="name">${esc(p.name)} ${trend}</td>
          <td class="elo">${diff}<strong>${pyRound(p.elo)}</strong></td>
        </tr>`;
    })
    .join("");

  const statRows = stats
    .map(
      (s) => `
          <tr>
            <th scope="row">${esc(s.name)}</th>
            <td data-value="${s.games_played}">${s.games_played}</td>
            <td data-value="${s.wins}">${s.wins}</td>
            <td data-value="${s.losses}">${s.losses}</td>
            <td data-value="${s.win_rate}">${s.win_rate.toFixed(0)}%</td>
            <td data-value="${s.goals_for}">${s.goals_for}</td>
            <td data-value="${s.goals_against}">${s.goals_against}</td>
            <td data-value="${s.goal_difference}" class="${s.goal_difference > 0 ? "elo-win" : s.goal_difference < 0 ? "elo-loss" : ""}">${signed(s.goal_difference)}</td>
          </tr>`
    )
    .join("");

  const th = (label: string, title: string, extra = "") =>
    `<th scope="col" class="sortable" data-sort="number" title="${title}"${extra}><button type="button">${label}</button></th>`;

  const content = `
  <div class="page-head"><h1>Statistik</h1></div>

  <div class="segmented" role="tablist">
    <button role="tab" id="btn-elo" aria-controls="elo-view" aria-selected="true">Ranking</button>
    <button role="tab" id="btn-table" aria-controls="table-view" aria-selected="false">Details</button>
    <button role="tab" id="btn-chart" aria-controls="chart-view" aria-selected="false">Verlauf</button>
  </div>

  <div id="elo-view" class="stats-view active" role="tabpanel">
    <table class="ranking">
      <thead>
        <tr>
          <th scope="col" class="rank">#</th>
          <th scope="col">Spieler</th>
          <th scope="col" class="elo">Elo</th>
        </tr>
      </thead>
      <tbody>${eloRows}
      </tbody>
    </table>
    <p class="hint">Farbige Zahl neben der Elo = Änderung durch die letzte Spielgruppe. ▲/▼ = Plätze gewonnen/verloren.</p>
  </div>

  <div id="table-view" class="stats-view" role="tabpanel" hidden>
    <div class="table-scroll" tabindex="0">
      <table id="stats-table" class="details">
        <thead>
          <tr>
            <th scope="col" class="sortable" data-sort="string"><button type="button">Spieler</button></th>
            ${th("Sp.", "Spiele (ohne Unentschieden)")}
            ${th("S", "Siege", ' data-default="desc"')}
            ${th("N", "Niederlagen")}
            ${th("Sieg %", "Siegquote")}
            ${th("Tore", "Erzielte Tore")}
            ${th("GT", "Gegentore")}
            ${th("TD", "Tordifferenz")}
          </tr>
        </thead>
        <tbody>${statRows}
        </tbody>
      </table>
    </div>
    <p class="hint">Sp. = Spiele · S = Siege · N = Niederlagen · GT = Gegentore · TD = Tordifferenz. Auf eine Spalte tippen zum Sortieren.</p>
  </div>

  <div id="chart-view" class="stats-view" role="tabpanel" hidden>
    <div id="chart-container"></div>
    <p class="hint">Auf einen Namen tippen blendet ihn ein/aus. Spieler mit weniger als 5 Spielen sind anfangs ausgeblendet.</p>
  </div>`;

  return layout({
    title: "Statistik",
    path: "/statistics",
    head: `<script src="https://cdn.jsdelivr.net/npm/apexcharts@4.7.0/dist/apexcharts.min.js" defer></script>`,
    content,
    scripts: `<script type="application/json" id="chart-data">${jsonForScript(chart)}</script>
  <script src="/js/statistics.js?v=2" defer></script>`,
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

export function adminGamesPage(games: AdminGame[], formatDate: (s: string) => string, message = ""): string {
  const rows = games
    .map(
      (g) => `
      <label class="admin-row">
        <input type="checkbox" name="game_id" value="${g.id}">
        <span class="admin-main">
          <span><span class="dot red"></span>${esc(g.red_players || "–")} <strong>${g.red_score}</strong></span>
          <span><span class="dot blue"></span>${esc(g.blue_players || "–")} <strong>${g.blue_score}</strong></span>
        </span>
        <span class="admin-meta">${esc(formatDate(g.played_at))}<br>#${g.id}</span>
      </label>`
    )
    .join("");

  const content = `
  <div class="page-head"><h1>Spiele löschen</h1></div>
  ${message}
  <p class="hint">Spiele abhaken und unten auf „Ausgewählte löschen“ tippen. Die Elo wird danach neu berechnet.</p>
  <form method="POST" action="/admin/games" id="admin-form">
    <div class="admin-list">${rows || '<p class="empty">Keine Spiele vorhanden.</p>'}
    </div>
    <div class="sticky-actions">
      <button type="submit" class="danger-btn" id="admin-submit" disabled>Ausgewählte löschen</button>
    </div>
  </form>`;

  return layout({
    title: "Spiele löschen",
    path: "/admin/games",
    content,
    scripts: `<script src="/js/admin.js?v=2"></script>`,
  });
}

export { flash };
