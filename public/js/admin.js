(() => {
  const form = document.getElementById('admin-form');
  const btn = document.getElementById('admin-submit');
  const update = () => {
    const n = form.querySelectorAll('input[name="game_id"]:checked').length;
    btn.disabled = n === 0;
    btn.textContent = n === 0 ? 'Ausgewählte löschen' : n === 1 ? '1 Spiel löschen' : `${n} Spiele löschen`;
  };
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => {
    const n = form.querySelectorAll('input[name="game_id"]:checked').length;
    if (!n || !confirm(`${n === 1 ? '1 Spiel' : n + ' Spiele'} endgültig löschen?`)) e.preventDefault();
  });
  update();
})();
