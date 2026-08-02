// ===== lobby.js — Character creation + campaign selection =====

const lobby = { myColor: '#e74c3c', avatarSeed: 'hero' };

document.addEventListener('DOMContentLoaded', () => {
    // Color picker
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            lobby.myColor = btn.dataset.color;
        });
    });

    // Avatar generation
    const nameInput = document.getElementById('playerName');
    const raceSelect = document.getElementById('playerRace');
    const classSelect = document.getElementById('playerClass');
    const avatarImg = document.getElementById('avatarPreview');

    function updateAvatar() {
        const name = nameInput.value || 'hero';
        const race = raceSelect.value;
        const cls = classSelect.value;
        lobby.avatarSeed = `${name}-${race}-${cls}`;
        avatarImg.src = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(lobby.avatarSeed)}&backgroundColor=1a1a2e`;
    }

    nameInput.addEventListener('input', updateAvatar);
    raceSelect.addEventListener('change', updateAvatar);
    classSelect.addEventListener('change', updateAvatar);

    document.getElementById('regenAvatar').addEventListener('click', () => {
        lobby.avatarSeed = 'random-' + Date.now();
        avatarImg.src = `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(lobby.avatarSeed)}&backgroundColor=1a1a2e`;
    });

    // Stats
    const statInputs = ['STR','DEX','CON','INT','WIS','CHA'];
    statInputs.forEach(s => {
        const input = document.getElementById('stat'+s);
        const mod = document.getElementById('mod'+s);
        input.addEventListener('change', () => {
            const val = Math.max(3, Math.min(20, parseInt(input.value)||10));
            input.value = val;
            const m = Math.floor((val-10)/2);
            mod.textContent = m >= 0 ? '+'+m : m;
        });
    });

    // Roll stats
    document.getElementById('rollStats').addEventListener('click', () => {
        statInputs.forEach(s => {
            // 4d6 drop lowest
            const rolls = [];
            for (let i=0;i<4;i++) rolls.push(Math.floor(Math.random()*6)+1);
            rolls.sort((a,b)=>a-b);
            const total = rolls[1]+rolls[2]+rolls[3];
            const input = document.getElementById('stat'+s);
            input.value = total;
            input.dispatchEvent(new Event('change'));
        });
    });

    // Standard array
    document.getElementById('standardArray').addEventListener('click', () => {
        const arr = [15,14,13,12,10,8];
        // Shuffle
        for (let i=arr.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
        statInputs.forEach((s,i) => {
            const input = document.getElementById('stat'+s);
            input.value = arr[i];
            input.dispatchEvent(new Event('change'));
        });
    });

    // Point buy
    document.getElementById('pointBuy').addEventListener('click', () => {
        const arr = [15,14,13,12,10,8]; // 27 point buy
        statInputs.forEach((s,i) => {
            const input = document.getElementById('stat'+s);
            input.value = arr[i];
            input.dispatchEvent(new Event('change'));
        });
    });

    // Campaign description
    const campaignSelect = document.getElementById('campaignTheme');
    const campaignDesc = document.getElementById('campaignDesc');
    function updateCampaignDesc() {
        const camp = AI_DM.CAMPAIGNS[campaignSelect.value];
        if (camp) {
            campaignDesc.innerHTML = `<strong>${camp.name}</strong><br><br>${camp.desc}<br><br><em>${camp.backstory}</em>`;
        }
    }
    campaignSelect.addEventListener('change', updateCampaignDesc);
    updateCampaignDesc();

    // Mode selection
    document.getElementById('soloPlay').addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
        document.getElementById('soloPlay').classList.add('active');
        document.getElementById('multiSection').classList.add('hidden');
        startGame('solo');
    });

    document.getElementById('multiPlay').addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
        document.getElementById('multiPlay').classList.add('active');
        document.getElementById('multiSection').classList.remove('hidden');
    });

    // Join room
    document.getElementById('joinRoom').addEventListener('click', () => startGame('multi'));
    document.getElementById('roomCode').addEventListener('keydown', e => { if (e.key==='Enter') startGame('multi'); });
});

function startGame(mode) {
    const name = document.getElementById('playerName').value.trim();
    if (!name) { showStatus('Введите имя персонажа!', 'error'); return; }

    const roomCode = mode === 'multi' ? document.getElementById('roomCode').value.trim() : 'solo';
    if (mode === 'multi' && !roomCode) { showStatus('Введите код комнаты!', 'error'); return; }

    // Save character data
    const charData = {
        name: name,
        race: document.getElementById('playerRace').value,
        class: document.getElementById('playerClass').value,
        background: document.getElementById('playerBackground').value,
        color: lobby.myColor,
        avatarSeed: lobby.avatarSeed,
        stats: {
            STR: parseInt(document.getElementById('statSTR').value) || 10,
            DEX: parseInt(document.getElementById('statDEX').value) || 10,
            CON: parseInt(document.getElementById('statCON').value) || 10,
            INT: parseInt(document.getElementById('statINT').value) || 10,
            WIS: parseInt(document.getElementById('statWIS').value) || 10,
            CHA: parseInt(document.getElementById('statCHA').value) || 10
        }
    };

    sessionStorage.setItem('dnd-mode', mode);
    sessionStorage.setItem('dnd-char', JSON.stringify(charData));
    sessionStorage.setItem('dnd-apikey', document.getElementById('apiKey').value.trim());
    sessionStorage.setItem('dnd-provider', document.getElementById('aiProvider').value);
    sessionStorage.setItem('dnd-room', mode === 'solo' ? 'solo' : roomCode.toLowerCase().replace(/[^a-z0-9]/g, ''));
    sessionStorage.setItem('dnd-campaign', document.getElementById('campaignTheme').value);
    sessionStorage.setItem('dnd-mapstyle', document.getElementById('mapStyle').value);

    window.location.href = 'game.html';
}

function showStatus(text, type) {
    const el = document.getElementById('lobbyStatus');
    el.textContent = text;
    el.className = 'status ' + type;
}
