const selects = document.querySelectorAll('.player-select');

selects.forEach(select => {
  select.addEventListener("change", updateDisabledOptions);
});

function updateDisabledOptions() {
  const selected = Array.from(selects).map(s => s.value);
  selects.forEach(select => {
    Array.from(select.options).forEach(opt => {
      opt.disabled = selected.includes(opt.value) && opt.value !== select.value;
    });
  });
}

let gameCount = 0;

function addGameRow() {
  const games = document.getElementById("games");
  const container = document.createElement("div");
  container.className = "score-row";
  container.dataset.index = gameCount;

  const swapped = gameCount % 2 === 1;
  if (swapped) container.classList.add("swapped");

  container.innerHTML = `
    <button type="button" class="swap-btn" onclick="swapSides(this)" title="Seiten tauschen">🔁</button>
    <input type="number" min="0" name="games[${gameCount}][score1]" required>
    <span class="separator">:</span>
    <input type="number" min="0" name="games[${gameCount}][score2]" required>
    <button type="button" class="remove-btn invisible" onclick="removeGameRow(this)" title="Spiel entfernen">−</button>
    <input type="hidden" name="games[${gameCount}][swapped]" value="${swapped ? 1 : 0}">
  `;

  games.appendChild(container);
  gameCount++;
  updateRemovability();
}



function swapSides(button) {
  const row = button.closest(".score-row");
  row.classList.toggle("swapped");
  const hidden = row.querySelector("input[type=hidden]");
  hidden.value = hidden.value === "1" ? "0" : "1";
}

function removeGameRow(button) {
  const row = button.closest(".score-row");

  if (button.dataset.confirmed === "true") {
    row.remove();
    updateRemovability();
  } else {
    button.dataset.confirmed = "true";
    button.textContent = "🗑️";
    setTimeout(() => {
      button.dataset.confirmed = "false";
      button.textContent = "−";
    }, 2000);
  }
}

function updateRemovability() {
  const rows = document.querySelectorAll(".score-row");
  rows.forEach((row, idx) => {
    const removeBtn = row.querySelector(".remove-btn");
    if (rows.length > 1) {
      removeBtn.classList.remove("invisible");
    } else {
      removeBtn.classList.add("invisible");
    }
    removeBtn.dataset.confirmed = "false";
    removeBtn.textContent = "−";
  });
}


// Erste Spielzeile automatisch hinzufügen
addGameRow();

// --- Player selection placeholder + uniqueness handling ---
function updateDisabledPlayers() {
  const selects = Array.from(document.querySelectorAll('.player-select'));
  const selected = selects.map(s => s.value).filter(v => v && v !== "");
  selects.forEach(select => {
    Array.from(select.options).forEach(opt => {
      if (opt.value === "") {
        opt.disabled = false;
        return;
      }
      // disable if selected elsewhere (and not the current selection)
      opt.disabled = selected.includes(opt.value) && select.value !== opt.value;
    });
  });
}

function updateTeamLabels() {
    const labelTeam1 = document.getElementById('label-team1');
    const labelTeam2 = document.getElementById('label-team2');

    const selectsTeam1 = [
        document.querySelector('select[name="team1_player1"]'),
        document.querySelector('select[name="team1_player2"]')
    ];
    const selectsTeam2 = [
        document.querySelector('select[name="team2_player1"]'),
        document.querySelector('select[name="team2_player2"]')
    ];

    const team1Names = selectsTeam1
        .map(s => s.options[s.selectedIndex].text)
        .filter(name => name !== '(leer)');

    const team2Names = selectsTeam2
        .map(s => s.options[s.selectedIndex].text)
        .filter(name => name !== '(leer)');

    labelTeam1.textContent = team1Names.join(' & ') || 'Team 1';
    labelTeam2.textContent = team2Names.join(' & ') || 'Team 2';
}

document.querySelectorAll('.player-select').forEach(s => {
  // ensure placeholder is selected by default if nothing selected
  if (!s.value) s.value = "";
  s.addEventListener('change', () => {
    updateDisabledPlayers();
    updateTeamLabels(); // Namen aktualisieren
  });
});

// Form submit handling: reorder players and validate teams
document.querySelector('form[action="/submit"]').addEventListener('submit', function(e) {
  // Reorder: if player1 is empty and player2 filled -> move up
  const t1_p1 = this.querySelector('select[name="team1_player1"]');
  const t1_p2 = this.querySelector('select[name="team1_player2"]');
  const t2_p1 = this.querySelector('select[name="team2_player1"]');
  const t2_p2 = this.querySelector('select[name="team2_player2"]');

  if (t1_p1 && t1_p2 && !t1_p1.value && t1_p2.value) {
    t1_p1.value = t1_p2.value;
    t1_p2.value = "";
  }
  if (t2_p1 && t2_p2 && !t2_p1.value && t2_p2.value) {
    t2_p1.value = t2_p2.value;
    t2_p2.value = "";
  }

  // Update disabled options before validation
  updateDisabledPlayers();

  // Validate: each team must have at least one real player
  if ((!t1_p1 || !t1_p1.value) && (!t1_p2 || !t1_p2.value)) {
    e.preventDefault();
    alert("Fehler: Team 1 muss mindestens einen Spieler haben.");
    return false;
  }
  if ((!t2_p1 || !t2_p1.value) && (!t2_p2 || !t2_p2.value)) {
    e.preventDefault();
    alert("Fehler: Team 2 muss mindestens einen Spieler haben.");
    return false;
  }

  // Before submit, ensure placeholder "(leer)" is not sent as literal.
  // Since our placeholder uses empty value "", nothing special needed.
  // Allow form to submit.
  return true;
});

// Run once on load to set disabled state and labels
updateDisabledPlayers();
updateTeamLabels();

