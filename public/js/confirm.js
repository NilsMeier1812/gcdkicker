// Lösch-Buttons mit Bestätigung durch zweites Antippen
document.querySelectorAll('.confirm-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    if (btn.classList.contains('armed')) return; // zweites Tippen -> absenden
    e.preventDefault();
    btn.classList.add('armed');
    btn.setAttribute('aria-label', 'Zum Bestätigen nochmal tippen');
    setTimeout(() => btn.classList.remove('armed'), 2500);
  });
});
