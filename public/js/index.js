(() => {
  const form = document.getElementById('entry-form');
  const gamesEl = document.getElementById('games');
  const selects = Array.from(form.querySelectorAll('.player-select'));
  const errorEl = document.getElementById('form-error');
  const submitBtn = document.getElementById('submit-btn');
  const sel = (name) => form.querySelector(`select[name="${name}"]`);

  const SWAP_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg>';
  const MINUS_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
  const TRASH_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>';

  let gameCount = 0;

  // --- Spielzeilen -----------------------------------------------------------
  function addGameRow(focus) {
    const index = gameCount++;
    const rowNumber = gamesEl.children.length + 1;
    // Beim Kickern wird nach jedem Spiel die Seite gewechselt -> abwechselnd vorbelegen
    const swapped = gamesEl.children.length % 2 === 1;
    const row = document.createElement('div');
    row.className = 'score-row score-grid' + (swapped ? ' swapped' : '');
    row.innerHTML = `
      <button type="button" class="icon-btn swap-btn" title="Seiten tauschen" aria-label="Spiel ${rowNumber}: Farben tauschen">${SWAP_ICON}</button>
      <input type="number" inputmode="numeric" min="0" max="99" name="games[${index}][score1]" aria-label="Spiel ${rowNumber}: Tore Team 1">
      <span class="colon">:</span>
      <input type="number" inputmode="numeric" min="0" max="99" name="games[${index}][score2]" aria-label="Spiel ${rowNumber}: Tore Team 2">
      <button type="button" class="icon-btn remove-btn" title="Spiel entfernen" aria-label="Spiel ${rowNumber} entfernen">${MINUS_ICON}</button>
      <input type="hidden" name="games[${index}][swapped]" value="${swapped ? 1 : 0}">`;
    gamesEl.appendChild(row);
    updateRemovability();
    if (focus) row.querySelector('input[type=number]').focus();
  }

  function updateRemovability() {
    const rows = gamesEl.querySelectorAll('.score-row');
    rows.forEach((row) => {
      const btn = row.querySelector('.remove-btn');
      btn.classList.toggle('invisible', rows.length <= 1);
      btn.tabIndex = rows.length <= 1 ? -1 : 0;
      disarm(btn);
    });
  }

  function disarm(btn) {
    btn.classList.remove('armed', 'danger');
    btn.innerHTML = MINUS_ICON;
    clearTimeout(btn._timer);
  }

  gamesEl.addEventListener('click', (e) => {
    const swapBtn = e.target.closest('.swap-btn');
    if (swapBtn) {
      const row = swapBtn.closest('.score-row');
      row.classList.toggle('swapped');
      const hidden = row.querySelector('input[type=hidden]');
      hidden.value = hidden.value === '1' ? '0' : '1';
      return;
    }
    const removeBtn = e.target.closest('.remove-btn');
    if (removeBtn) {
      const row = removeBtn.closest('.score-row');
      const hasValues = Array.from(row.querySelectorAll('input[type=number]')).some((i) => i.value !== '');
      // Leere Zeilen sofort entfernen, ausgefüllte erst nach zweitem Tippen
      if (!hasValues || removeBtn.classList.contains('armed')) {
        row.remove();
        updateRemovability();
      } else {
        removeBtn.classList.add('armed', 'danger');
        removeBtn.innerHTML = TRASH_ICON;
        removeBtn._timer = setTimeout(() => disarm(removeBtn), 2500);
      }
    }
  });

  document.getElementById('add-game').addEventListener('click', () => addGameRow(true));

  // --- Spielerauswahl --------------------------------------------------------
  function updateDisabledPlayers() {
    const selected = selects.map((s) => s.value).filter(Boolean);
    selects.forEach((s) => {
      Array.from(s.options).forEach((opt) => {
        opt.disabled = opt.value !== '' && selected.includes(opt.value) && s.value !== opt.value;
      });
    });
  }

  function teamNames(n) {
    return [sel(`team${n}_player1`), sel(`team${n}_player2`)]
      .filter((s) => s.value)
      .map((s) => s.options[s.selectedIndex].text);
  }

  function updateTeamLabels() {
    document.getElementById('label-team1').textContent = teamNames(1).join(' & ') || 'Team 1';
    document.getElementById('label-team2').textContent = teamNames(2).join(' & ') || 'Team 2';
  }

  selects.forEach((s) => s.addEventListener('change', () => {
    updateDisabledPlayers();
    updateTeamLabels();
    hideError();
  }));

  // --- Absenden --------------------------------------------------------------
  function showError(msg, focusEl) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    if (focusEl) focusEl.focus();
  }
  function hideError() { errorEl.hidden = true; }

  form.addEventListener('input', hideError);

  form.addEventListener('submit', (e) => {
    // Wenn nur Spieler 2 gewählt ist, nach oben rücken
    for (const n of [1, 2]) {
      const p1 = sel(`team${n}_player1`), p2 = sel(`team${n}_player2`);
      if (!p1.value && p2.value) { p1.value = p2.value; p2.value = ''; }
    }
    updateDisabledPlayers();

    if (!sel('team1_player1').value) { e.preventDefault(); return showError('Bitte für Team 1 mindestens einen Spieler auswählen.', sel('team1_player1')); }
    if (!sel('team2_player1').value) { e.preventDefault(); return showError('Bitte für Team 2 mindestens einen Spieler auswählen.', sel('team2_player1')); }

    const rows = Array.from(gamesEl.querySelectorAll('.score-row'));
    for (const [i, row] of rows.entries()) {
      const [a, b] = row.querySelectorAll('input[type=number]');
      for (const input of [a, b]) {
        const v = input.value.trim();
        if (v === '' || !/^\d+$/.test(v) || Number(v) > 99) {
          e.preventDefault();
          return showError(`Bitte bei Spiel ${i + 1} beide Ergebnisse eintragen (0–99).`, input);
        }
      }
      if (a.value === b.value && !confirm(`Spiel ${i + 1} endet unentschieden (${a.value}:${b.value}). Trotzdem speichern?`)) {
        e.preventDefault();
        return a.focus();
      }
    }

    // Doppeltes Absenden verhindern
    submitBtn.disabled = true;
    submitBtn.setAttribute('aria-busy', 'true');
    submitBtn.textContent = 'Speichere…';
  });

  // Nach "Zurück" im Browser wieder bedienbar machen
  window.addEventListener('pageshow', () => {
    submitBtn.disabled = false;
    submitBtn.removeAttribute('aria-busy');
    submitBtn.textContent = 'Spiele speichern';
    updateDisabledPlayers();
    updateTeamLabels();
  });

  addGameRow(false);
  updateDisabledPlayers();
  updateTeamLabels();
})();
