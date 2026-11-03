document.addEventListener('DOMContentLoaded', () => {
    const mainElement = document.querySelector('main');
    const toggleBtn = document.getElementById('edit-toggle-btn');
    const modal = document.getElementById('edit-modal');
    const modalContent = document.getElementById('modal-content');
    const modalCancel = document.getElementById('modal-cancel');
    const modalSave = document.getElementById('modal-save');
    const modalCloseBtn = modal.querySelector('.close');

    // 1. Logik für den Bearbeiten-Toggle (Texte: "Edit" / "Done")
    toggleBtn.addEventListener('click', () => {
        const isEditMode = mainElement.classList.toggle('edit-mode');
        if (isEditMode) {
            toggleBtn.setAttribute('aria-checked', 'true');
            toggleBtn.textContent = 'Done';
        } else {
            toggleBtn.setAttribute('aria-checked', 'false');
            toggleBtn.textContent = 'Edit';
        }
    });

    // 2. Logik zum Öffnen des Modals (Event Delegation)
    mainElement.addEventListener('click', async (e) => {
        // Nur auslösen, wenn im Edit-Modus
        if (!mainElement.classList.contains('edit-mode')) return;

        const card = e.target.closest('.game-card');
        if (!card) return;

        const groupId = card.dataset.groupId;
        if (!groupId) return;

        // Modal anzeigen und Ladezustand setzen
        modalContent.innerHTML = '<p><progress></progress> Lade...</p>';
        modal.showModal();
        modal.dataset.currentGroupId = groupId; // Gruppen-ID am Modal speichern

        // Daten vom Server laden
        try {
            const response = await fetch(`/api/group/${groupId}`);
            if (!response.ok) throw new Error('Netzwerkfehler beim Laden');
            const html = await response.text();
            modalContent.innerHTML = html; // Geladenes Formular einfügen
        } catch (err) {
            modalContent.innerHTML = `<p>Fehler beim Laden: ${err.message}</p>`;
        }
    });

    // 3. Logik zum Schließen des Modals
    modalCancel.addEventListener('click', () => modal.close());
    modalCloseBtn.addEventListener('click', () => modal.close());

    // 4. Löschen-Logik (Event Delegation im Modal)
    modalContent.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-game-btn')) {
            e.preventDefault();

            if (confirm("Sicher löschen?")) {
                const btn = e.target;
                const gameId = btn.dataset.gameId;
                const row = btn.closest('tr');
                const form = document.getElementById('edit-group-form');

                if (form && row && gameId) {
                    // Hidden Input hinzufügen, damit es beim Absenden "gelöscht" wird
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = 'delete_game_ids';
                    input.value = gameId;
                    form.appendChild(input);

                    // Zeile visuell entfernen (ausblenden)
                    row.style.display = 'none';
                }
            }
        }
    });

    // 5. Logik zum Speichern der Änderungen
    modalSave.addEventListener('click', async () => {
        const groupId = modal.dataset.currentGroupId;
        if (!groupId) return;

        const form = document.getElementById('edit-group-form');
        if (!form) return;

        const formData = new FormData(form);
        modalSave.setAttribute('aria-busy', 'true'); // Lade-Indicator am Button

        try {
            const response = await fetch(`/api/group/${groupId}`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Fehler beim Speichern: ${errorText}`);
            }

            // Erfolg! Modal schließen und Seite neu laden, um Änderungen zu sehen
            modal.close();
            window.location.reload();

        } catch (err) {
            alert(err.message);
        } finally {
            modalSave.removeAttribute('aria-busy');
        }
    });
});
