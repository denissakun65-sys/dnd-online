// ===== lobby.js — Robust character creation =====

const lobby = {
    myColor: '#e74c3c',
    statsMethod: 'pointbuy',
    raceBonus: { str:0, dex:0, con:0, int:0, wis:0, cha:0 },
    totalPoints: 27,
    avatarUrl: ''
};

function pointBuyCost(value) {
    if (value <= 8) return 0;
    if (value <= 13) return value - 8;
    if (value === 14) return 7;
    if (value === 15) return 9;
    return 999;
}

// ===== GLOBAL ERROR HANDLER =====
window.onerror = function(msg) {
    console.error('Lobby error:', msg);
    var el = document.getElementById('lobbyStatus');
    if (el) { el.textContent = '⚠️ Ошибка: ' + msg; el.className = 'status error'; }
};

document.addEventListener('DOMContentLoaded', function() {
    try {
        console.log('[Lobby] Initializing...');
        setupLobby();
        console.log('[Lobby] Ready!');
    } catch(e) {
        console.error('[Lobby] Init error:', e);
        var el = document.getElementById('lobbyStatus');
        if (el) { el.textContent = '⚠️ Ошибка: ' + e.message; el.className = 'status error'; }
    }
});

function setupLobby() {
    // Color picker
    document.querySelectorAll('.color-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            document.querySelectorAll('.color-btn').forEach(function(b) { b.classList.remove('selected'); });
            btn.classList.add('selected');
            lobby.myColor = btn.dataset.color;
        });
    });

    var raceSelect = document.getElementById('playerRace');
    var classSelect = document.getElementById('playerClass');
    var nameInput = document.getElementById('playerName');
    var statNames = ['STR','DEX','CON','INT','WIS','CHA'];

    // Race bonus
    function updateRaceBonus() {
        try {
            var opt = raceSelect.options[raceSelect.selectedIndex];
            var bonusStr = opt.getAttribute('data-bonus') || '';
            lobby.raceBonus = { str:0, dex:0, con:0, int:0, wis:0, cha:0 };

            bonusStr.split(',').forEach(function(part) {
                var match = part.trim().match(/(str|dex|con|int|wis|cha)\+(\d+)/i);
                if (match) lobby.raceBonus[match[1].toLowerCase()] = parseInt(match[2]);
            });

            statNames.forEach(function(s) {
                var bonus = lobby.raceBonus[s.toLowerCase()];
                var el = document.getElementById('race' + s);
                if (el) { el.textContent = bonus > 0 ? '+' + bonus : ''; el.style.color = bonus > 0 ? '#2ecc71' : '#888'; }
            });
            updateAllMods();
        } catch(e) { console.error('Race bonus error:', e); }
    }

    raceSelect.addEventListener('change', updateRaceBonus);
    updateRaceBonus();

    // Stats
    function updateAllMods() {
        statNames.forEach(function(s) {
            var input = document.getElementById('stat' + s);
            var mod = document.getElementById('mod' + s);
            if (!input || !mod) return;
            var base = parseInt(input.value) || 8;
            var bonus = lobby.raceBonus[s.toLowerCase()] || 0;
            var total = base + bonus;
            var m = Math.floor((total - 10) / 2);
            mod.textContent = m >= 0 ? '+' + m : '' + m;
            mod.style.color = m >= 0 ? '#2ecc71' : '#e74c3c';
        });
        updatePointsLeft();
    }

    function updatePointsLeft() {
        var el = document.getElementById('pointsLeft');
        if (!el) return;
        if (lobby.statsMethod !== 'pointbuy') { el.textContent = '—'; return; }
        var spent = 0;
        statNames.forEach(function(s) {
            var base = parseInt(document.getElementById('stat' + s).value) || 8;
            spent += pointBuyCost(base);
        });
        var left = lobby.totalPoints - spent;
        el.textContent = left;
        el.style.color = left < 0 ? '#e74c3c' : left === 0 ? '#2ecc71' : '#f1c40f';
        var warning = document.getElementById('statsWarning');
        if (warning) {
            if (left < 0) { warning.textContent = '⚠️ Слишком много очков!'; warning.classList.remove('hidden'); }
            else { warning.classList.add('hidden'); }
        }
    }

    // Input change
    statNames.forEach(function(s) {
        var input = document.getElementById('stat' + s);
        if (!input) return;
        input.addEventListener('change', function() {
            var val = parseInt(input.value) || 8;
            if (lobby.statsMethod === 'pointbuy') {
                val = Math.max(8, Math.min(15, val));
                var tempSpent = 0;
                statNames.forEach(function(other) {
                    var v = other === s ? val : (parseInt(document.getElementById('stat' + other).value) || 8);
                    tempSpent += pointBuyCost(v);
                });
                while (val > 8 && tempSpent > lobby.totalPoints) {
                    val--;
                    tempSpent = 0;
                    statNames.forEach(function(other) {
                        var v = other === s ? val : (parseInt(document.getElementById('stat' + other).value) || 8);
                        tempSpent += pointBuyCost(v);
                    });
                }
            } else {
                val = Math.max(3, Math.min(18, val));
            }
            input.value = val;
            updateAllMods();
        });
    });

    // Roll stats
    document.getElementById('rollStats').addEventListener('click', function() {
        lobby.statsMethod = 'roll';
        document.getElementById('statsMethod').textContent = 'Бросок 4d6';
        document.querySelectorAll('.stats-buttons .btn').forEach(function(b){b.classList.remove('active');});
        document.getElementById('rollStats').classList.add('active');
        statNames.forEach(function(s) {
            var rolls = [];
            for (var i=0;i<4;i++) rolls.push(Math.floor(Math.random()*6)+1);
            rolls.sort(function(a,b){return a-b;});
            document.getElementById('stat' + s).value = rolls[1]+rolls[2]+rolls[3];
        });
        updateAllMods();
    });

    // Standard array
    document.getElementById('standardArray').addEventListener('click', function() {
        lobby.statsMethod = 'standard';
        document.getElementById('statsMethod').textContent = 'Стандартный набор';
        document.querySelectorAll('.stats-buttons .btn').forEach(function(b){b.classList.remove('active');});
        document.getElementById('standardArray').classList.add('active');
        var arr = [15,14,13,12,10,8];
        for (var i=arr.length-1;i>0;i--) { var j=Math.floor(Math.random()*(i+1)); var t=arr[i];arr[i]=arr[j];arr[j]=t; }
        statNames.forEach(function(s,i) { document.getElementById('stat' + s).value = arr[i]; });
        updateAllMods();
    });

    // Point buy
    document.getElementById('pointBuy').addEventListener('click', function() {
        lobby.statsMethod = 'pointbuy';
        document.getElementById('statsMethod').textContent = 'Покупка очков';
        document.querySelectorAll('.stats-buttons .btn').forEach(function(b){b.classList.remove('active');});
        document.getElementById('pointBuy').classList.add('active');
        statNames.forEach(function(s) { document.getElementById('stat' + s).value = 8; });
        updateAllMods();
    });

    // Campaign description
    var campaignSelect = document.getElementById('campaignTheme');
    var campaignDesc = document.getElementById('campaignDesc');
    function updateCampaignDesc() {
        try {
            if (typeof AI_DM !== 'undefined' && AI_DM.CAMPAIGNS) {
                var camp = AI_DM.CAMPAIGNS[campaignSelect.value];
                if (camp) {
                    campaignDesc.innerHTML = '<strong>' + camp.name + '</strong><br><br>' + camp.desc + '<br><br><em>' + camp.backstory + '</em>';
                }
            }
        } catch(e) { console.error('Campaign desc error:', e); }
    }
    campaignSelect.addEventListener('change', updateCampaignDesc);
    updateCampaignDesc();

    // ===== BUTTONS — THE MOST IMPORTANT PART =====
    console.log('[Lobby] Setting up buttons...');

    document.getElementById('soloPlay').addEventListener('click', function() {
        console.log('[Lobby] Solo clicked!');
        document.querySelectorAll('.mode-card').forEach(function(c){c.classList.remove('active');});
        document.getElementById('soloPlay').classList.add('active');
        document.getElementById('multiSection').classList.add('hidden');
        startGame('solo');
    });

    document.getElementById('multiPlay').addEventListener('click', function() {
        console.log('[Lobby] Multi clicked!');
        document.querySelectorAll('.mode-card').forEach(function(c){c.classList.remove('active');});
        document.getElementById('multiPlay').classList.add('active');
        document.getElementById('multiSection').classList.remove('hidden');
    });

    document.getElementById('joinRoom').addEventListener('click', function() {
        console.log('[Lobby] Join clicked!');
        startGame('multi');
    });

    document.getElementById('roomCode').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') startGame('multi');
    });

    console.log('[Lobby] Buttons ready!');

    // AI Avatar
    var avatarTimeout = null;
    function generateAvatar() {
        try {
            var name = nameInput.value.trim() || 'hero';
            var race = raceSelect.value;
            var cls = classSelect.value;
            var prompt = 'D&D fantasy portrait, ' + race + ' ' + cls + ', ' + name + ', detailed face, fantasy art, dark background, RPG character';
            var url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=256&height=256&nologo=true&seed=' + Date.now();

            var preview = document.getElementById('avatarPreview');
            var img = document.getElementById('avatarImg');
            var loading = document.getElementById('avatarLoading');
            if (loading) loading.classList.remove('hidden');
            if (preview) preview.classList.add('hidden');
            if (img) img.classList.add('hidden');

            img.onload = function() {
                if (loading) loading.classList.add('hidden');
                img.classList.remove('hidden');
                lobby.avatarUrl = url;
            };
            img.onerror = function() {
                if (loading) loading.classList.add('hidden');
                if (preview) preview.classList.remove('hidden');
                img.classList.add('hidden');
                lobby.avatarUrl = '';
            };
            img.src = url;
        } catch(e) { console.error('Avatar error:', e); }
    }

    function debouncedAvatar() { clearTimeout(avatarTimeout); avatarTimeout = setTimeout(generateAvatar, 1500); }
    nameInput.addEventListener('input', debouncedAvatar);
    raceSelect.addEventListener('change', debouncedAvatar);
    classSelect.addEventListener('change', debouncedAvatar);
    document.getElementById('regenAvatar').addEventListener('click', generateAvatar);

    updateAllMods();
}

// ===== START GAME =====
function startGame(mode) {
    console.log('[Lobby] startGame called, mode:', mode);
    try {
        var name = document.getElementById('playerName').value.trim();
        if (!name) { showStatus('Введите имя персонажа!', 'error'); return; }

        var roomCode = mode === 'multi' ? document.getElementById('roomCode').value.trim() : 'solo';
        if (mode === 'multi' && !roomCode) { showStatus('Введите код комнаты!', 'error'); return; }

        // Validate stats
        if (lobby.statsMethod === 'pointbuy') {
            var spent = 0;
            ['STR','DEX','CON','INT','WIS','CHA'].forEach(function(s) {
                spent += pointBuyCost(parseInt(document.getElementById('stat' + s).value) || 8);
            });
            if (spent > lobby.totalPoints) { showStatus('Слишком много очков!', 'error'); return; }
        }

        var charData = {
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
            raceBonus: JSON.parse(JSON.stringify(lobby.raceBonus)),
            statsMethod: lobby.statsMethod
        };

        console.log('[Lobby] Saving data and redirecting...');

        sessionStorage.setItem('dnd-mode', mode);
        sessionStorage.setItem('dnd-char', JSON.stringify(charData));
        sessionStorage.setItem('dnd-apikey', document.getElementById('apiKey').value.trim());
        sessionStorage.setItem('dnd-provider', document.getElementById('aiProvider').value);
        sessionStorage.setItem('dnd-room', mode === 'solo' ? 'solo' : roomCode.toLowerCase().replace(/[^a-z0-9]/g, ''));
        sessionStorage.setItem('dnd-campaign', document.getElementById('campaignTheme').value);
        sessionStorage.setItem('dnd-mapstyle', document.getElementById('mapStyle').value);

        window.location.href = 'game.html';
    } catch(e) {
        console.error('[Lobby] startGame error:', e);
        showStatus('Ошибка: ' + e.message, 'error');
    }
}

function showStatus(text, type) {
    var el = document.getElementById('lobbyStatus');
    if (el) { el.textContent = text; el.className = 'status ' + type; }
}
