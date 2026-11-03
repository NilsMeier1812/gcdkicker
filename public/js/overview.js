(() => {
  const main = document.querySelector('main');
  const toggleBtn = document.getElementById('edit-toggle-btn');
  const hint = document.getElementById('edit-hint');
  const modal = document.getElementById('edit-modal');
  const content = document.getElementById('modal-content');
  const saveBtn = document.getElementById('modal-save');

  // Frisch eingetragene Gruppe kurz hervorheben, danach URL aufräumen
  const params = new URLSearchParams(location.search);
  if (['neu', 'saved', 'edited'].some((k) => params.has(k))) {
    const fresh = document.querySelector('.game-card.is-new');
    if (fresh) setTimeout(() => fresh.classList.remove('is-new'), 4000);
    ['neu', 'saved', 'edited'].forEach((k) => params.delete(k));
    history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : ''));
  }

  // --- Bearbeiten-Modus ------------------------------------------------------
  function setEditMode(on) {
    main.classList.toggle('edit-mode', on);
    toggleBtn.setAttribute('aria-pressed', String(on));
    toggleBtn.textContent = on ? 'Fertig' : 'Bearbeiten';
    hint.hidden = !on;
    document.querySelectorAll('.game-card').forEach((c) => {
      if (on) { c.setAttribute('role', 'button'); c.tabIndex = 0; }
      else { c.removeAttribute('role'); c.tabIndex = -1; }
    });
  }
  toggleBtn.addEventListener('click', () => setEditMode(!main.classList.contains('edit-mode')));

  async function openGroup(card) {
    const groupId = card.dataset.groupId;
    content.innerHTML = '<p aria-busy="true">Lade…</p>';
    saveBtn.disabled = true;
    modal.dataset.groupId = groupId;
    modal.showModal();
    try {
      const res = await fetch(`/api/group/${encodeURIComponent(groupId)}`);
      if (!res.ok) throw new Error(await res.text() || 'Netzwerkfehler');
      content.innerHTML = await res.text();
      saveBtn.disabled = false;
      const first = content.querySelector('input[type=number]');
      if (first && matchMedia('(pointer: fine)').matches) first.focus();
    } catch (err) {
      content.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'flash flash-error';
      p.textContent = `Fehler beim Laden: ${err.message}`;
      content.appendChild(p);
    }
  }

  main.addEventListener('click', (e) => {
    if (!main.classList.contains('edit-mode')) return;
    const card = e.target.closest('.game-card');
    if (card) openGroup(card);
  });
  main.addEventListener('keydown', (e) => {
    if (!main.classList.contains('edit-mode') || (e.key !== 'Enter' && e.key !== ' ')) return;
    const card = e.target.closest('.game-card');
    if (card) { e.preventDefault(); openGroup(card); }
  });

  // --- Modal -----------------------------------------------------------------
  const close = () => modal.close();
  document.getElementById('modal-cancel').addEventListener('click', close);
  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); }); // Klick auf Hintergrund

  // Spiel zum Löschen markieren / Markierung aufheben
  content.addEventListener('click', (e) => {
    const btn = e.target.closest('.delete-game-btn');
    if (!btn) return;
    e.preventDefault();
    const form = document.getElementById('edit-group-form');
    const row = btn.closest('.edit-row');
    const id = btn.dataset.gameId;
    const existing = form.querySelector(`input[name="delete_game_ids"][value="${id}"]`);
    if (existing) {
      existing.remove();
      row.classList.remove('is-deleted');
      btn.classList.remove('is-marked');
      btn.title = 'Spiel löschen';
      row.querySelectorAll('input[type=number]').forEach((i) => { i.disabled = false; });
    } else {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'delete_game_ids';
      input.value = id;
      form.appendChild(input);
      row.classList.add('is-deleted');
      btn.classList.add('is-marked');
      btn.title = 'Löschen rückgängig';
      row.querySelectorAll('input[type=number]').forEach((i) => { i.disabled = true; });
    }
    document.getElementById('delete-hint').hidden = !form.querySelector('input[name="delete_game_ids"]');
  });

  saveBtn.addEventListener('click', async () => {
    const form = document.getElementById('edit-group-form');
    if (!form) return;
    if (!form.reportValidity()) return;
    const deleting = form.querySelectorAll('input[name="delete_game_ids"]').length;
    const total = form.querySelectorAll('.edit-row[data-game-id]').length;
    if (deleting === total && !confirm('Damit wird die komplette Spielgruppe gelöscht. Fortfahren?')) return;

    saveBtn.setAttribute('aria-busy', 'true');
    saveBtn.disabled = true;
    try {
      const res = await fetch(`/api/group/${encodeURIComponent(modal.dataset.groupId)}`, {
        method: 'POST',
        body: new FormData(form),
      });
      if (!res.ok) throw new Error(await res.text());
      const next = new URLSearchParams(location.search);
      next.set('edited', '1');
      location.href = `/overview?${next}`;
    } catch (err) {
      alert(`Fehler beim Speichern: ${err.message}`);
      saveBtn.disabled = false;
    } finally {
      saveBtn.removeAttribute('aria-busy');
    }
  });
})();
