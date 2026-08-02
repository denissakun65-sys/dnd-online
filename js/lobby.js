// ===== lobby.js — Character creation with balance, AI avatars =====

const lobby = {
    myColor: '#e74c3c',
    statsMethod: 'pointbuy', // 'roll', 'standard', 'pointbuy'
    raceBonus: { str:0, dex:0, con:0, int:0, wis:0, cha:0 },
    baseStats: { STR:8, DEX:8, CON:8, INT:8, WIS:8, CHA:8 },
    totalPoints: 27,
    avatarUrl: ''
};

// Point buy cost table
function pointBuyCost(value) {
    if (value <= 8) return 0;
    if (value <= 13) return value - 8;
    if (value === 14) return 7;
    if (value === 15) return 9;
    return 999; // impossible
}

document.addEventListener('DOMContentLoaded', () => {
    // Color picker
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            lobby.myColor = btn.dataset.color;
        });
    });

    // Race bonus
    const raceSelect = document.getElementById('playerRace');
    const classSelect = document.getElementById('playerClass');
    const nameInput = document.getElementById('playerName');

    function updateRaceBonus() {
        const opt = raceSelect.options[raceSelect.selectedIndex];
        const bonusStr = opt.dataset.bonus || '';
        lobby.raceBonus = { str:0, dex:0, con:0, int:0, wis:0, cha:0 };

        bonusStr.split(',').forEach(part => {
            const match = part.trim().match(/(str|dex|con|int|wis|cha)\+(\d+)/i);
            if (match) lobby.raceBonus[match[1].toLowerCase()] = parseInt(match[2]);
        });

        // Update race bonus display
        const statNames = ['STR','DEX','CON','INT','WIS','CHA'];
        const shortNames = ['str','dex','con','int','wis','cha'];
        statNames.forEach((s, i) => {
            const bonus = lobby.raceBonus[shortNames[i]];
            const el = document.getElementById('race' + s);
            el.textContent = bonus > 0 ? '+' + bonus : '';
            el.style.color = bonus > 0 ? '#2ecc71' : '#888';
        });

        updateAllMods();
        generateAvatar();
    }

    raceSelect.addEventListener('change', updateRaceBonus);
    updateRaceBonus();

    // Stats
    const statNames = ['STR','DEX','CON','INT','WIS','CHA'];

    function updateAllMods() {
        statNames.forEach(s => {
            const input = document.getElementById('stat' + s);
            const mod = document.getElementById('mod' + s);
            const base = parseInt(input.value) || 8;
            const bonus = lobby.raceBonus[s.toLowerCase()];
            const total = base + bonus;
            const m = Math.floor((total - 10) / 2);
            mod.textContent = m >= 0 ? '+' + m : '' + m;
            mod.style.color = m >= 0 ? '#2ecc71' : '#e74c3c';
        });
        updatePointsLeft();
    }

    function updatePointsLeft() {
        if (lobby.statsMethod !== 'pointbuy') {
            document.getElementById('pointsLeft').textContent = '—';
            return;
        }
        let spent = 0;
        statNames.forEach(s => {
            const base = parseInt(document.getElementById('stat' + s).value) || 8;
            spent += pointBuyCost(base);
        });
        const left = lobby.totalPoints - spent;
        document.getElementById('pointsLeft').textContent = left;
        document.getElementById('pointsLeft').style.color = left < 0 ? '#e74c3c' : left === 0 ? '#2ecc71' : '#f1c40f';

        // Warning
        const warning = document.getElementById('statsWarning');
        if (left < 0) {
            warning.textContent = '⚠️ Потрачено больше очков, чем доступно! Уменьшите характеристики.';
            warning.classList.remove('hidden');
        } else {
            warning.classList.add('hidden');
        }
    }

    // Input change handler with balance enforcement
    statNames.forEach(s => {
        const input = document.getElementById('stat' + s);
        input.addEventListener('change', () => {
            let val = parseInt(input.value) || 8;

            if (lobby.statsMethod === 'pointbuy') {
                val = Math.max(8, Math.min(15, val));
                // Check if we can afford it
                let tempSpent = 0;
                statNames.forEach(other => {
                    if (other === s) tempSpent += pointBuyCost(val);
                    else tempSpent += pointBuyCost(parseInt(document.getElementById('stat' + other).value) || 8);
                });
                if (tempSpent > lobby.totalPoints) {
                    // Reduce to affordable value
                    while (val > 8 && tempSpent > lobby.totalPoints) {
                        val--;
                        tempSpent = 0;
                        statNames.forEach(other => {
                            if (other === s) tempSpent += pointBuyCost(val);
                            else tempSpent += pointBuyCost(parseInt(document.getElementById('stat' + other).value) || 8);
                        });
                    }
                }
            } else if (lobby.statsMethod === 'roll' || lobby.statsMethod === 'standard') {
                val = Math.max(3, Math.min(18, val));
            }

            input.value = val;
            updateAllMods();
        });
    });

    // Roll stats (4d6 drop lowest)
    document.getElementById('rollStats').addEventListener('click', () => {
        lobby.statsMethod = 'roll';
        document.getElementById('statsMethod').textContent = 'Бросок 4d6';
        document.querySelectorAll('.stats-buttons .btn').forEach(b => b.classList.remove('active'));
        document.getElementById('rollStats').classList.add('active');

        statNames.forEach(s => {
            const rolls = [];
            for (let i = 0; i < 4; i++) rolls.push(Math.floor(Math.random() * 6) + 1);
            rolls.sort((a, b) => a - b);
            const total = rolls[1] + rolls[2] + rolls[3];
            document.getElementById('stat' + s).value = total;
        });
        updateAllMods();
        document.getElementById('pointsLeft').textContent = '—';
    });

    // Standard array
    document.getElementById('standardArray').addEventListener('click', () => {
        lobby.statsMethod = 'standard';
        document.getElementById('statsMethod').textContent = 'Стандартный набор';
        document.querySelectorAll('.stats-buttons .btn').forEach(b => b.classList.remove('active'));
        document.getElementById('standardArray').classList.add('active');

        const arr = [15, 14, 13, 12, 10, 8];
        // Shuffle
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        statNames.forEach((s, i) => {
            document.getElementById('stat' + s).value = arr[i];
        });
        updateAllMods();
        document.getElementById('pointsLeft').textContent = '—';
    });

    // Point buy
    document.getElementById('pointBuy').addEventListener('click', () => {
        lobby.statsMethod = 'pointbuy';
        document.getElementById('statsMethod').textContent = 'Покупка очков';
        document.querySelectorAll('.stats-buttons .btn').forEach(b => b.classList.remove('active'));
        document.getElementById('pointBuy').classList.add('active');

        statNames.forEach(s => { document.getElementById('stat' + s).value = 8; });
        updateAllMods();
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

    document.getElementById('joinRoom').addEventListener('click', () => startGame('multi'));
    document.getElementById('roomCode').addEventListener('keydown', e => { if (e.key === 'Enter') startGame('multi'); });

    // ===== AI AVATAR GENERATION =====
    let avatarTimeout = null;

    function generateAvatar() {
        const name = nameInput.value.trim() || 'hero';
        const race = raceSelect.value;
        const cls = classSelect.value;

        // Use Pollinations.ai — free, no API key
        const prompt = `D&D fantasy portrait, ${race} ${cls}, ${name}, detailed face, fantasy art style, dark background, high quality RPG character portrait`;
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=256&height=256&nologo=true&seed=${Date.now()}`;

        // Show loading
        document.getElementById('avatarLoading').classList.remove('hidden');
        document.getElementById('avatarPreview').classList.add('hidden');
        document.getElementById('avatarImg').classList.add('hidden');

        const img = document.getElementById('avatarImg');
        img.onload = () => {
            document.getElementById('avatarLoading').classList.add('hidden');
            document.getElementById('avatarImg').classList.remove('hidden');
            lobby.avatarUrl = url;
        };
        img.onerror = () => {
            document.getElementById('avatarLoading').classList.add('hidden');
            document.getElementById('avatarPreview').classList.remove('hidden');
            document.getElementById('avatarImg').classList.add('hidden');
            lobby.avatarUrl = '';
        };
        img.src = url;
    }

    // Debounced avatar generation
    function debouncedAvatar() {
        clearTimeout(avatarTimeout);
        avatarTimeout = setTimeout(generateAvatar, 1500);
    }

    nameInput.addEventListener('input', debouncedAvatar);
    raceSelect.addEventListener('change', debouncedAvatar);
    classSelect.addEventListener('change', debouncedAvatar);

    // Regenerate avatar button
    document.getElementById('regenAvatar').addEventListener('click', () => {
        generateAvatar();
    });

    // Initial stats
    updateAllMods();
});

function startGame(mode) {
    const name = document.getElementById('playerName').value.trim();
    if (!name) { showStatus('Введите имя персонажа!', 'error'); return; }

    const roomCode = mode === 'multi' ? document.getElementById('roomCode').value.trim() : 'solo';
    if (mode === 'multi' && !roomCode) { showStatus('Введите код комнаты!', 'error'); return; }

    // Validate stats
    if (lobby.statsMethod === 'pointbuy') {
        let spent = 0;
        ['STR','DEX','CON','INT','WIS','CHA'].forEach(s => {
            spent += pointBuyCost(parseInt(document.getElementById('stat' + s).value) || 8);
        });
        if (spent > lobby.totalPoints) {
            showStatus('Слишком много очков! Уменьшите характеристики.', 'error');
            return;
        }
    }

    const charData = {
        name: name,
        race: document.getElementById('playerRace').value,
        class: document.getElementById('playerClass').value,
        background: document.getElementById('playerBackground').value,
        color: lobby.myColor,
        avatarUrl: lobby.avatarUrl,
        stats: {
            STR: parseInt(document.getElementById('statSTR').value) || 8,
            DEX: parseInt(document.getElementById('statDEX').value) || 8,
            CON: parseInt(document.getElementById('statCON').value) || 8,
            INT: parseInt(document.getElementById('statINT').value) || 8,
            WIS: parseInt(document.getElementById('statWIS').value) || 8,
            CHA: parseInt(document.getElementById('statCHA').value) || 8
        },
        raceBonus: { ...lobby.raceBonus },
        statsMethod: lobby.statsMethod
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
