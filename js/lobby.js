// ===== lobby.js — Lobby page controller =====

const lobby = {
    network: null,
    myName: '',
    myColor: '#e74c3c'
};

document.addEventListener('DOMContentLoaded', () => {
    // Color picker
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            lobby.myColor = btn.dataset.color;
        });
    });

    // Mode selection
    document.getElementById('soloPlay').addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
        document.getElementById('soloPlay').classList.add('active');
        document.getElementById('multiSection').classList.add('hidden');
        startSolo();
    });

    document.getElementById('multiPlay').addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
        document.getElementById('multiPlay').classList.add('active');
        document.getElementById('multiSection').classList.remove('hidden');
    });

    // Join room
    document.getElementById('joinRoom').addEventListener('click', () => joinRoom());
    document.getElementById('roomCode').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') joinRoom();
    });
});

function startSolo() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) { showStatus('Введите ваше имя!', 'error'); return; }

    const apiKey = document.getElementById('apiKey').value.trim();
    const provider = document.getElementById('aiProvider').value;

    // Save to sessionStorage for game page
    sessionStorage.setItem('dnd-mode', 'solo');
    sessionStorage.setItem('dnd-name', name);
    sessionStorage.setItem('dnd-color', lobby.myColor);
    sessionStorage.setItem('dnd-apikey', apiKey);
    sessionStorage.setItem('dnd-provider', provider);
    sessionStorage.setItem('dnd-room', 'solo');

    window.location.href = 'game.html';
}

function joinRoom() {
    const name = document.getElementById('playerName').value.trim();
    const code = document.getElementById('roomCode').value.trim();
    if (!name) { showStatus('Введите ваше имя!', 'error'); return; }
    if (!code) { showStatus('Введите код комнаты!', 'error'); return; }

    const apiKey = document.getElementById('apiKey').value.trim();
    const provider = document.getElementById('aiProvider').value;

    // Save to sessionStorage
    sessionStorage.setItem('dnd-mode', 'multi');
    sessionStorage.setItem('dnd-name', name);
    sessionStorage.setItem('dnd-color', lobby.myColor);
    sessionStorage.setItem('dnd-apikey', apiKey);
    sessionStorage.setItem('dnd-provider', provider);
    sessionStorage.setItem('dnd-room', code.toLowerCase().replace(/[^a-z0-9]/g, ''));

    window.location.href = 'game.html';
}

function showStatus(text, type) {
    const el = document.getElementById('lobbyStatus');
    el.textContent = text;
    el.className = 'status ' + type;
}
