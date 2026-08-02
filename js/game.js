// ===== game.js — Main game controller v2 =====
// WASD/Arrow movement, pathfinding, character sheet, inventory, combat tracker,
// quick actions, sound effects, toast notifications, minimap, keyboard shortcuts

const app = {
    network: null, map: null, ai: null,
    myId: '', myName: '', myColor: '#e74c3c',
    isHost: false, isSolo: false, roomCode: '',
    players: {}, playerOrder: [],
    charData: null, campaignTheme: '',
    voiceEnabled: false, micEnabled: true,
    voiceStream: null, audioContext: null, analyser: null,
    tutorialStep: 0, aiBusy: false, campaignStarted: false,
    // New systems
    inventory: [], gold: 0,
    combatActive: false, combatRound: 1, combatTurn: 0, combatOrder: [],
    hp: 10, maxHp: 10, ac: 10, level: 1, xp: 0,
    soundEnabled: true, soundCtx: null,
    minimapVisible: false,
    keysDown: new Set(),
    lastMoveTime: 0,
    moveCooldown: 150, // ms between WASD moves
};

const TUTORIAL = [
    { title: '⚔️ Добро пожаловать!', text: 'Это D&D Online — игра с ИИ Мастером Подземелий. Давайте быстро разберёмся!', icon: '🎮' },
    { title: '🗺️ Карта и движение', text: 'WASD или стрелки — двигать персонажа. ЛКМ — идти по пути. Колёсико — зум. Ctrl+ЛКМ — двигать камеру. Камера следует за вами!', icon: '🗺️' },
    { title: '💬 Чат и действия', text: 'Пишите действия в чат: "Осматриваю комнату", "Атакую гоблина". ИИ Ведущий ответит!', icon: '💬' },
    { title: '⚔️ Быстрые действия', text: 'Внизу карты — панель быстрых действий: Атака, Защита, Проверка навыка, Заклинание и другие. Или нажмите клавиши A, D, S, Z, H, F, T, G, R.', icon: '⚔️' },
    { title: '👤 Лист персонажа', text: 'Нажмите 👤 или C — открыть лист персонажа. Там HP, AC, характеристики, инвентарь. 🎒 или I — инвентарь. ⚔️ или B — трекер боя.', icon: '👤' },
    { title: '🎲 Кубики', text: '/roll 1d20+5 — бросить кубик. Результат влияет на историю! ИИ тоже бросает автоматически.', icon: '🎲' },
    { title: '📌 Мини-карта', text: 'Нажмите 📌 или M — показать мини-карту. Помогает ориентироваться! ? — показать все горячие клавиши.', icon: '📌' },
    { title: '✅ Готово!', text: 'Пишите в чат — и приключение начнётся! /help — помощь. Удачи! 🎲', icon: '🎉' }
];

// Safe DOM helper
function $(id) { return document.getElementById(id); }

// ===== ERROR HANDLER =====
window.onerror = function(msg, url, line) { console.error('JS Error:', msg, line); };

document.addEventListener('DOMContentLoaded', () => {
    try { init(); }
    catch (e) {
        console.error('Init error:', e);
        document.body.innerHTML = '<div style="color:white;padding:40px;font-size:18px;">' +
            '<h2>⚠️ Ошибка загрузки</h2><p>' + e.message + '</p>' +
            '<a href="lobby.html" style="color:#c9a84c">← Назад в лобби</a></div>';
    }
});

function init() {
    const mode = sessionStorage.getItem('dnd-mode');
    if (!mode) { window.location.href = 'lobby.html'; return; }

    // Load character data
    const charJson = sessionStorage.getItem('dnd-char');
    app.charData = charJson ? JSON.parse(charJson) : null;
    app.myName = app.charData ? app.charData.name : 'Герой';
    app.myColor = app.charData ? app.charData.color : '#e74c3c';
    app.roomCode = sessionStorage.getItem('dnd-room') || 'solo';
    app.isSolo = mode === 'solo';
    app.campaignTheme = sessionStorage.getItem('dnd-campaign') || 'custom';

    // Calculate HP/AC from stats
    if (app.charData && app.charData.stats) {
        const con = app.charData.stats.CON || 10;
        const dex = app.charData.stats.DEX || 10;
        app.maxHp = 10 + Math.floor((con - 10) / 2);
        app.hp = app.maxHp;
        app.ac = 10 + Math.floor((dex - 10) / 2);
    }

    // Init map
    const canvas = $('mapCanvas');
    if (!canvas) throw new Error('mapCanvas не найден');
    app.map = new GameMap(canvas);

    // Init minimap
    const mmCanvas = $('minimapCanvas');
    if (mmCanvas) app.map.initMinimap(mmCanvas);

    // Init AI
    app.ai = new AI_DM();
    app.ai.setProvider(sessionStorage.getItem('dnd-provider') || 'groq');
    app.ai.setApiKey(sessionStorage.getItem('dnd-apikey') || '');
    app.ai.setCampaign(app.campaignTheme);

    // Map callbacks
    app.map.onMapChange = () => {
        try { app.network.publish('map', { map: app.map.map }); } catch (e) { }
    };
    app.map.onPlayerMove = (playerId, x, y) => {
        try {
            app.map.revealFog(playerId);
            app.network.publish('move', { playerId, x, y });
            if (app.ai.updateMapContext && app.map.getMapDescription) {
                app.ai.updateMapContext(app.map.getMapDescription());
            }
        } catch (e) { }
    };

    // AI typing indicator
    app.ai.onTyping = (isTyping) => {
        app.aiBusy = isTyping;
        const el = $('typingIndicator');
        if (el) el.classList.toggle('visible', isTyping);
        const input = $('chatInput');
        const btn = $('chatSend');
        if (input) {
            input.placeholder = isTyping ? '🧙 Мастер думает...' : 'Действие или /roll 1d20...';
            input.disabled = isTyping;
            if (!isTyping) input.focus();
        }
        if (btn) btn.disabled = isTyping;
    };

    // Setup all UI
    setupMapTools();
    setupTopBar();
    setupChat();
    setupTutorial();
    setupKeyboard();
    setupQuickActions();
    setupPanels();
    setupSound();

    // Init network
    app.network = new Network();

    app.network.onConnect = () => {
        app.myId = app.network.myId;
        app.isHost = app.network.isHost;

        addPlayer(app.myId, app.myName, app.myColor, app.isHost, app.charData);

        app.map.myPlayerId = app.myId;
        app.map.isHost = app.isHost;

        const roomEl = $('roomDisplay');
        if (roomEl) roomEl.textContent = app.roomCode.toUpperCase();
        const modeEl = $('modeLabel');
        if (modeEl) modeEl.textContent = app.isSolo ? '⚔️ Одиночка' : '👥 Онлайн';
        updateConnectionCount();

        // Auto-generate map
        const camp = AI_DM.CAMPAIGNS[app.campaignTheme];
        if (camp && camp.mapType) {
            app.map.generate(camp.mapType);
            addSystemMessage('🗺️ Карта: ' + camp.name);
        }

        showTutorial();
    };

    app.network.onError = (err) => addSystemMessage('❌ ' + err);
    app.network.onMessage = (msg) => handleNetMessage(msg);

    // Connect
    if (app.isSolo) {
        app.network.connectSolo();
    } else {
        app.network.connect(app.roomCode, app.myName, app.myColor, app.charData);
        setTimeout(() => {
            if (Object.keys(app.players).length <= 1 && !app.isHost) {
                app.isHost = true;
                app.map.isHost = true;
                app.network.isHost = true;
                updatePlayersList();
                addSystemMessage('👑 Вы — хост!');
            }
        }, 3000);
    }
}

// ===== SOUND SYSTEM =====
function setupSound() {
    try {
        app.soundCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { }
}

function playSound(type) {
    if (!app.soundEnabled || !app.soundCtx) return;
    try {
        const ctx = app.soundCtx;
        if (ctx.state === 'suspended') ctx.resume();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        switch (type) {
            case 'dice':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.2);
                break;
            case 'move':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.05);
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.08);
                break;
            case 'attack':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(300, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.2);
                gain.gain.setValueAtTime(0.12, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.25);
                break;
            case 'heal':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.35);
                break;
            case 'levelup':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523, ctx.currentTime);
                osc.frequency.setValueAtTime(659, ctx.currentTime + 0.15);
                osc.frequency.setValueAtTime(784, ctx.currentTime + 0.3);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.5);
                break;
            case 'toast':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, ctx.currentTime);
                gain.gain.setValueAtTime(0.08, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.1);
                break;
            case 'damage':
                osc.type = 'square';
                osc.frequency.setValueAtTime(150, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2);
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.25);
                break;
        }
    } catch (e) { }
}

// ===== TOAST NOTIFICATIONS =====
function showToast(message, type = 'info', duration = 3000) {
    const container = $('toastContainer');
    if (!container) return;
    playSound('toast');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌', dice: '🎲', combat: '⚔️', loot: '💎' };
    toast.innerHTML = '<span class="toast-icon">' + (icons[type] || 'ℹ️') + '</span><span class="toast-text">' + message + '</span>';
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===== KEYBOARD CONTROLS =====
function setupKeyboard() {
    document.addEventListener('keydown', e => {
        // Don't handle if typing in input
        if (document.activeElement && document.activeElement.tagName === 'INPUT') return;

        app.keysDown.add(e.key);

        // WASD / Arrow movement
        const moveMap = {
            'w': [0, -1], 'ArrowUp': [0, -1],
            's': [0, 1], 'ArrowDown': [0, 1],
            'a': [-1, 0], 'ArrowLeft': [-1, 0],
            'd': [1, 0], 'ArrowRight': [1, 0],
        };
        if (moveMap[e.key]) {
            e.preventDefault();
            const now = Date.now();
            if (now - app.lastMoveTime >= app.moveCooldown) {
                const [dx, dy] = moveMap[e.key];
                app.map.movePlayerStep(app.myId, dx, dy);
                playSound('move');
                app.lastMoveTime = now;
            }
            return;
        }

        // Panel toggles
        switch (e.key.toLowerCase()) {
            case 'c': toggleCharSheet(); break;
            case 'i': toggleInventory(); break;
            case 'b': toggleCombat(); break;
            case 'm': toggleMinimap(); break;
            case 'escape':
                closeAllPanels();
                break;
            case '?':
                showToast('WASD/↑↓←→ — движение | C — персонаж | I — инвентарь | B — бой | M — мини-карта | Shift+ЛКМ — рисовать | Enter — чат', 'info', 5000);
                break;
        }
    });

    document.addEventListener('keyup', e => {
        app.keysDown.delete(e.key);
    });
}

// ===== QUICK ACTIONS =====
function setupQuickActions() {
    document.querySelectorAll('.qa-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            const actions = {
                attack: '⚔️ Атакую!',
                defend: '🛡️ Защищаюсь!',
                skill: '🎯 Проверка навыка: ',
                cast: '✨ Применяю заклинание: ',
                heal: '❤️ Лечусь!',
                search: '🔍 Обыскиваю окрестности',
                talk: '💬 Говорю с NPC: ',
                stealth: '🥷 Двигаюсь скрытно',
                rest: '🏕️ Отдыхаю'
            };
            const text = actions[action];
            if (!text) return;

            // Some actions need extra input
            if (action === 'skill' || action === 'cast' || action === 'talk') {
                const input = $('chatInput');
                if (input) {
                    input.value = text;
                    input.focus();
                    input.setSelectionRange(text.length, text.length);
                }
                return;
            }

            // Send to AI
            playSound(action === 'attack' ? 'attack' : action === 'heal' ? 'heal' : 'toast');
            addChatMessage(app.myName, text, app.myColor);
            try { app.network.publish('chat', { name: app.myName, text, color: app.myColor }); } catch (e) { }
            if (app.ai.apiKey) {
                if (app.isHost) handleAIRequest(text, app.myName);
                else try { app.network.publish('request-ai', { text, playerName: app.myName }); } catch (e) { }
            }
        });
    });
}

// ===== PANELS =====
function setupPanels() {
    const charBtn = $('toggleCharSheet');
    if (charBtn) charBtn.addEventListener('click', toggleCharSheet);
    const closeChar = $('closeCharSheet');
    if (closeChar) closeChar.addEventListener('click', () => toggleCharSheet());

    const invBtn = $('toggleInventory');
    if (invBtn) invBtn.addEventListener('click', toggleInventory);
    const closeInv = $('closeInventory');
    if (closeInv) closeInv.addEventListener('click', () => toggleInventory());

    const combatBtn = $('toggleCombat');
    if (combatBtn) combatBtn.addEventListener('click', toggleCombat);
    const closeCombat = $('closeCombat');
    if (closeCombat) closeCombat.addEventListener('click', () => toggleCombat());

    const minimapBtn = $('toggleMinimap');
    if (minimapBtn) minimapBtn.addEventListener('click', toggleMinimap);
}

function toggleCharSheet() {
    const panel = $('charSheet');
    if (!panel) return;
    const isOpen = !panel.classList.contains('hidden');
    if (isOpen) {
        panel.classList.add('hidden');
    } else {
        closeAllPanels();
        panel.classList.remove('hidden');
        renderCharSheet();
    }
}

function toggleInventory() {
    const panel = $('inventoryPanel');
    if (!panel) return;
    const isOpen = !panel.classList.contains('hidden');
    if (isOpen) {
        panel.classList.add('hidden');
    } else {
        closeAllPanels();
        panel.classList.remove('hidden');
        renderInventory();
    }
}

function toggleCombat() {
    const panel = $('combatPanel');
    if (!panel) return;
    const isOpen = !panel.classList.contains('hidden');
    if (isOpen) {
        panel.classList.add('hidden');
    } else {
        closeAllPanels();
        panel.classList.remove('hidden');
        renderCombatTracker();
    }
}

function toggleMinimap() {
    const container = $('minimapContainer');
    if (!container) return;
    app.minimapVisible = !app.minimapVisible;
    container.classList.toggle('hidden', !app.minimapVisible);
    const btn = $('toggleMinimap');
    if (btn) btn.classList.toggle('active', app.minimapVisible);
    if (app.minimapVisible) {
        app.map.minimapDirty = true;
    }
}

function closeAllPanels() {
    const cs = $('charSheet'); if (cs) cs.classList.add('hidden');
    const inv = $('inventoryPanel'); if (inv) inv.classList.add('hidden');
    const combat = $('combatPanel'); if (combat) combat.classList.add('hidden');
}

function renderCharSheet() {
    const body = $('charSheetBody');
    if (!body) return;
    const cd = app.charData || {};
    const stats = cd.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
    const statNames = ['СИЛ', 'ЛОВ', 'ТЕЛ', 'ИНТ', 'МДР', 'ХАР'];
    const statKeys = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];

    const avatarHtml = cd.avatarUrl
        ? '<img src="' + cd.avatarUrl + '" class="cs-avatar">'
        : '<div class="cs-avatar cs-avatar-placeholder">🧙</div>';

    const hpPercent = Math.max(0, Math.min(100, (app.hp / app.maxHp) * 100));
    const hpColor = hpPercent > 60 ? 'var(--accent-green)' : hpPercent > 30 ? 'var(--accent-orange)' : 'var(--accent-red)';

    body.innerHTML = `
        <div class="cs-top">
            ${avatarHtml}
            <div class="cs-info">
                <div class="cs-name">${app.myName}</div>
                <div class="cs-race-class">${cd.race || 'Человек'} ${cd.class || 'Воин'}</div>
                <div class="cs-background">${cd.background || 'Странник'}</div>
            </div>
        </div>
        <div class="cs-hp-bar">
            <div class="cs-hp-fill" style="width:${hpPercent}%;background:${hpColor}"></div>
            <div class="cs-hp-text">❤️ ${app.hp} / ${app.maxHp}</div>
        </div>
        <div class="cs-ac-level">
            <div class="cs-stat-big">🛡️ AC ${app.ac}</div>
            <div class="cs-stat-big">⭐ Ур. ${app.level}</div>
            <div class="cs-stat-big">✨ XP ${app.xp}</div>
        </div>
        <div class="cs-stats-grid">
            ${statKeys.map((k, i) => {
                const v = stats[k] || 10;
                const mod = Math.floor((v - 10) / 2);
                const modStr = mod >= 0 ? '+' + mod : '' + mod;
                return `<div class="cs-stat-item">
                    <div class="cs-stat-name">${statNames[i]}</div>
                    <div class="cs-stat-val">${v}</div>
                    <div class="cs-stat-mod">${modStr}</div>
                </div>`;
            }).join('')}
        </div>
        <div class="cs-actions">
            <button class="cs-btn" onclick="modifyHP(-1)">− HP</button>
            <button class="cs-btn" onclick="modifyHP(1)">+ HP</button>
            <button class="cs-btn" onclick="addXP(10)">+ XP</button>
            <button class="cs-btn" onclick="levelUp()">⬆ Уровень</button>
        </div>
    `;
}

function modifyHP(delta) {
    app.hp = Math.max(0, Math.min(app.maxHp, app.hp + delta));
    if (delta < 0) playSound('damage');
    else if (delta > 0) playSound('heal');
    if (app.hp <= 0) {
        showToast('💀 Вы пали! HP = 0', 'error', 5000);
    }
    renderCharSheet();
}

function addXP(amount) {
    app.xp += amount;
    showToast('✨ +' + amount + ' XP!', 'success');
    // Auto level up
    if (app.xp >= app.level * 300) {
        levelUp();
    }
    renderCharSheet();
}

function levelUp() {
    app.level++;
    app.maxHp += Math.floor(Math.random() * 6) + 4 + Math.floor(((app.charData?.stats?.CON || 10) - 10) / 2);
    app.hp = app.maxHp;
    playSound('levelup');
    showToast('🎉 Уровень ' + app.level + '! HP: ' + app.maxHp, 'success', 4000);
    renderCharSheet();
}

function renderInventory() {
    const body = $('invBody');
    if (!body) return;
    const slots = $('invSlots');
    const gold = $('invGold');
    if (gold) gold.textContent = app.gold;

    if (slots) {
        if (app.inventory.length === 0) {
            slots.innerHTML = '<div class="inv-empty">Инвентарь пуст. Обыщите сундуки или попросите ИИ!</div>';
        } else {
            slots.innerHTML = app.inventory.map((item, i) => `
                <div class="inv-item" data-idx="${i}">
                    <span class="inv-item-icon">${item.icon || '📦'}</span>
                    <span class="inv-item-name">${item.name}</span>
                    <span class="inv-item-desc">${item.desc || ''}</span>
                    <button class="inv-use-btn" onclick="useItem(${i})">Исп.</button>
                </div>
            `).join('');
        }
    }
}

function addItem(name, icon, desc) {
    app.inventory.push({ name, icon, desc });
    showToast('💎 Получено: ' + name, 'loot');
    renderInventory();
}

function useItem(idx) {
    if (idx < 0 || idx >= app.inventory.length) return;
    const item = app.inventory[idx];
    const text = 'Использую: ' + item.name;
    addChatMessage(app.myName, text, app.myColor);
    try { app.network.publish('chat', { name: app.myName, text, color: app.myColor }); } catch (e) { }
    if (app.ai.apiKey) {
        if (app.isHost) handleAIRequest(text, app.myName);
        else try { app.network.publish('request-ai', { text, playerName: app.myName }); } catch (e) { }
    }
    // Remove after use
    app.inventory.splice(idx, 1);
    renderInventory();
}

function renderCombatTracker() {
    const body = $('combatBody');
    if (!body) return;
    const round = $('combatRound');
    if (round) round.textContent = app.combatRound;

    const order = $('combatTurnOrder');
    if (order) {
        const entries = [];
        // Players
        for (const [id, p] of Object.entries(app.players)) {
            const isMe = id === app.myId;
            entries.push({
                name: p.name, type: 'player', hp: isMe ? app.hp : '?',
                maxHp: isMe ? app.maxHp : '?', ac: isMe ? app.ac : '?', color: p.color, isMe
            });
        }
        // NPCs
        for (const [id, n] of Object.entries(app.map.npcs)) {
            entries.push({ name: n.name, type: n.type, hp: n.hp || '?', maxHp: '?', ac: '?', color: n.type === 'enemy' ? '#e74c3c' : n.type === 'boss' ? '#9b59b6' : n.type === 'ally' ? '#27ae60' : '#2980b9' });
        }

        order.innerHTML = entries.map((e, i) => `
            <div class="combat-entry ${e.isMe ? 'combat-self' : ''} ${e.type}">
                <span class="combat-entry-dot" style="background:${e.color}"></span>
                <span class="combat-entry-name">${e.name}</span>
                <span class="combat-entry-hp">❤️${e.hp}/${e.maxHp}</span>
                <span class="combat-entry-ac">🛡️${e.ac}</span>
                ${e.isMe ? `<button class="combat-hp-btn" onclick="modifyHP(-1)">−</button><button class="combat-hp-btn" onclick="modifyHP(1)">+</button>` : ''}
            </div>
        `).join('');
    }
}

// ===== SETUP (all null-safe) =====
function setupMapTools() {
    const btn = $('toggleMapTools');
    if (btn) btn.addEventListener('click', () => {
        const tools = $('mapTools');
        if (tools) tools.classList.toggle('hidden');
        btn.classList.toggle('active');
    });

    document.querySelectorAll('.map-tool-btn[data-tool]').forEach(b => {
        b.addEventListener('click', () => {
            document.querySelectorAll('.map-tool-btn[data-tool]').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            app.map.selectedTool = TILE[b.dataset.tool.toUpperCase()];
        });
    });

    const fogBtn = $('toggleFog');
    if (fogBtn) fogBtn.addEventListener('click', () => {
        app.map.fogEnabled = !app.map.fogEnabled;
        fogBtn.classList.toggle('active', app.map.fogEnabled);
        if (!app.map.fogEnabled) {
            for (let y = 0; y < app.map.gridH; y++)
                for (let x = 0; x < app.map.gridW; x++) app.map.fogMap[y][x] = false;
        }
        app.map.minimapDirty = true;
    });

    const genBtn = $('generateMap');
    if (genBtn) genBtn.addEventListener('click', () => {
        const m = $('genModal'); if (m) m.classList.remove('hidden');
    });

    const closeBtn = $('closeGenModal');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        const m = $('genModal'); if (m) m.classList.add('hidden');
    });

    document.querySelectorAll('.gen-btn').forEach(b => {
        b.addEventListener('click', () => {
            app.map.generate(b.dataset.gen);
            try { app.network.publish('map', { map: app.map.map }); } catch (e) { }
            const m = $('genModal'); if (m) m.classList.add('hidden');
            addSystemMessage('🗺️ Карта: ' + b.textContent);
        });
    });
}

function setupTopBar() {
    const roomEl = $('roomDisplay');
    if (roomEl) roomEl.addEventListener('click', () => {
        navigator.clipboard.writeText(roomEl.textContent).then(() => showToast('📋 Скопировано!', 'success'));
    });

    const voiceBtn = $('toggleVoice');
    if (voiceBtn) voiceBtn.addEventListener('click', toggleVoice);
    const micBtn = $('toggleMic');
    if (micBtn) micBtn.addEventListener('click', toggleMic);
}

function setupChat() {
    const sendBtn = $('chatSend');
    if (sendBtn) sendBtn.addEventListener('click', sendChat);
    const input = $('chatInput');
    if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
}

function setupTutorial() {
    const prev = $('tutorialPrev');
    if (prev) prev.addEventListener('click', () => { app.tutorialStep--; updateTutorialStep(); });
    const next = $('tutorialNext');
    if (next) next.addEventListener('click', () => {
        app.tutorialStep++;
        if (app.tutorialStep >= TUTORIAL.length) hideTutorial();
        else updateTutorialStep();
    });
    const skip = $('tutorialSkip');
    if (skip) skip.addEventListener('click', hideTutorial);
}

// ===== TUTORIAL =====
function showTutorial() {
    const overlay = $('tutorialOverlay');
    if (!overlay) return;
    app.tutorialStep = 0;
    overlay.classList.remove('hidden');
    updateTutorialStep();
}

function updateTutorialStep() {
    const step = TUTORIAL[app.tutorialStep];
    if (!step) { hideTutorial(); return; }
    const el = (id) => $(id);
    if (el('tutorialIcon')) el('tutorialIcon').textContent = step.icon;
    if (el('tutorialTitle')) el('tutorialTitle').textContent = step.title;
    if (el('tutorialText')) el('tutorialText').textContent = step.text;
    if (el('tutorialProgress')) el('tutorialProgress').textContent = `${app.tutorialStep + 1}/${TUTORIAL.length}`;
    if (el('tutorialPrev')) el('tutorialPrev').style.visibility = app.tutorialStep === 0 ? 'hidden' : 'visible';
    if (el('tutorialNext')) el('tutorialNext').textContent = app.tutorialStep === TUTORIAL.length - 1 ? '🎮 Начать!' : 'Далее →';
}

function hideTutorial() {
    const overlay = $('tutorialOverlay');
    if (overlay) overlay.classList.add('hidden');
    if (app.ai.apiKey && app.isHost && !app.campaignStarted) {
        addSystemMessage('🧙 Мастер начинает кампанию...');
        setTimeout(startCampaign, 800);
    }
}

// ===== NETWORK MESSAGES =====
function handleNetMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.from === app.myId && msg.type !== 'state') return;

    try {
        switch (msg.type) {
            case 'join':
                if (msg.playerId && msg.playerId !== app.myId) {
                    addPlayer(msg.playerId, msg.name, msg.color, false, msg.charData || null);
                    addSystemMessage('👋 ' + msg.name + ' присоединился!');
                    showToast('👋 ' + msg.name + ' присоединился!', 'info');
                    updateConnectionCount();
                    if (app.isHost) {
                        setTimeout(() => {
                            app.network.publish('state', { map: app.map.map, players: app.map.players, targetPlayer: msg.playerId });
                        }, 500);
                    }
                }
                break;
            case 'leave':
                if (msg.playerId && app.players[msg.playerId]) {
                    const name = app.players[msg.playerId].name;
                    removePlayer(msg.playerId);
                    addSystemMessage('👋 ' + name + ' покинул игру.');
                }
                break;
            case 'state':
                if (!app.isHost && msg.targetPlayer === app.myId) {
                    if (msg.map) app.map.setMapData(msg.map);
                    if (msg.players) {
                        for (const [id, p] of Object.entries(msg.players)) {
                            if (id !== app.myId && !app.players[id]) {
                                app.map.addPlayer(id, p.name, p.color);
                                app.players[id] = { name: p.name, color: p.color, isHost: false, charData: null };
                                app.playerOrder.push(id);
                            }
                        }
                    }
                    addSystemMessage('📥 Данные загружены!');
                }
                break;
            case 'move':
                if (msg.playerId && msg.playerId !== app.myId) {
                    app.map.setPlayerPosition(msg.playerId, msg.x, msg.y);
                }
                break;
            case 'map':
                if (!app.isHost && msg.map) app.map.setMapData(msg.map);
                break;
            case 'chat':
                if (msg.name && msg.text) addChatMessage(msg.name, msg.text, msg.color || '#e0d5c0');
                break;
            case 'ai':
                if (msg.text) processAIResponse(msg.text, false);
                break;
            case 'dice':
                if (msg.text) addDiceMessage(msg.text);
                break;
            case 'request-ai':
                if (app.isHost && msg.text) handleAIRequest(msg.text, msg.playerName || 'Игрок');
                break;
            case 'voice-signal':
                if (msg.type === 'voice-on') {
                    addSystemMessage('🎤 ' + msg.name + ' включил голос');
                    updateVoiceUsers();
                }
                break;
            case 'npc':
                if (msg.action === 'add') app.map.addNPC('npc_' + msg.name, msg.name, msg.x, msg.y, msg.type);
                else if (msg.action === 'move') app.map.setNPCPosition('npc_' + msg.name, msg.x, msg.y);
                else if (msg.action === 'dead') app.map.removeNPC('npc_' + msg.name);
                break;
        }
    } catch (e) { console.error('Net msg error:', e); }
}

// ===== PLAYERS =====
function addPlayer(id, name, color, isHost, charData) {
    if (app.players[id]) return;
    app.players[id] = { name, color, isHost, charData: charData || null };
    app.playerOrder.push(id);
    app.map.addPlayer(id, name, color);
    updatePlayersList();
}

function removePlayer(id) {
    delete app.players[id];
    app.playerOrder = app.playerOrder.filter(p => p !== id);
    app.map.removePlayer(id);
    updatePlayersList();
}

function updatePlayersList() {
    const list = $('playersList');
    if (!list) return;
    list.innerHTML = '';
    for (const [id, p] of Object.entries(app.players)) {
        const div = document.createElement('div');
        div.className = 'player-item';
        const isMe = id === app.myId;
        const avatar = (p.charData && p.charData.avatarUrl)
            ? '<img src="' + p.charData.avatarUrl + '" style="width:24px;height:24px;border-radius:50%;object-fit:cover;margin-right:4px;">'
            : '<span class="player-dot" style="background:' + p.color + '"></span>';
        const ci = p.charData ? '<span class="player-class">' + p.charData.race + ' ' + p.charData.class + '</span>' : '';
        const hb = p.isHost ? '<span class="player-host">👑</span>' : '';
        const hpBadge = isMe ? '<span class="player-hp">❤️' + app.hp + '</span>' : '';
        div.innerHTML = avatar + '<span>' + p.name + '</span>' + ci + hpBadge + hb;
        list.appendChild(div);
    }
}

function updateConnectionCount() {
    const el = $('connectionCount');
    if (el) el.textContent = app.isSolo ? '1' : Object.keys(app.players).length + '/4';
}

// ===== CHAT =====
function sendChat() {
    if (app.aiBusy) return;
    const input = $('chatInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // Dice
    if (text.toLowerCase().startsWith('/roll ') || text.toLowerCase().startsWith('/r ')) {
        const notation = text.replace(/^\/(roll|r)\s+/i, '');
        const result = rollDice(notation);
        const msg = formatDiceResult(result, app.myName);
        addDiceMessage(msg);
        playSound('dice');
        try { app.network.publish('dice', { text: msg }); } catch (e) { }
        if (app.ai.apiKey && result) {
            const aiText = app.myName + ' бросает ' + notation + ' = ' + result.total + ' [' + result.rolls.join(',') + ']';
            if (result.total === 20) showToast('🎉 NATURAL 20! Критический успех!', 'dice', 4000);
            else if (result.total === 1) showToast('💀 NATURAL 1! Критический провал!', 'error', 4000);
            if (app.isHost) handleAIRequest(aiText, app.myName);
            else try { app.network.publish('request-ai', { text: aiText, playerName: app.myName }); } catch (e) { }
        }
        return;
    }

    // Commands
    if (text.toLowerCase() === '/help') { addSystemMessage('/roll 1d20+5 — кубик, /start — кампания, /tutorial — обучение, /hp — здоровье, /inv — инвентарь'); return; }
    if (text.toLowerCase() === '/start') { startCampaign(); return; }
    if (text.toLowerCase() === '/tutorial') { showTutorial(); return; }
    if (text.toLowerCase() === '/hp') { showToast('❤️ HP: ' + app.hp + '/' + app.maxHp + ' | 🛡️ AC: ' + app.ac, 'info', 3000); return; }
    if (text.toLowerCase() === '/inv') { toggleInventory(); return; }

    // Regular message
    addChatMessage(app.myName, text, app.myColor);
    try { app.network.publish('chat', { name: app.myName, text, color: app.myColor }); } catch (e) { }

    // Send to AI
    if (app.ai.apiKey) {
        if (app.isHost) handleAIRequest(text, app.myName);
        else try { app.network.publish('request-ai', { text, playerName: app.myName }); } catch (e) { }
    }
}

// ===== AI =====
async function handleAIRequest(text, playerName) {
    if (app.aiBusy) { addSystemMessage('⏳ Подождите...'); return; }
    try {
        if (app.ai.updateMapContext && app.map.getMapDescription) {
            app.ai.updateMapContext(app.map.getMapDescription());
        }
        const response = await app.ai.generateResponse(text, playerName);
        if (response) processAIResponse(response, true);
    } catch (err) { addSystemMessage('❌ Ошибка ИИ: ' + err.message); }
}

async function startCampaign() {
    if (!app.ai.apiKey) { addSystemMessage('⚠️ API ключ не установлен!'); return; }
    if (app.aiBusy) { addSystemMessage('⏳ Подождите...'); return; }
    app.campaignStarted = true;

    const chars = Object.values(app.players).map(p => ({
        name: p.name,
        race: p.charData?.race || 'Человек',
        class: p.charData?.class || 'Воин',
        background: p.charData?.background || 'Странник',
        stats: p.charData?.stats || { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 }
    }));
    app.ai.setCharacters(chars);

    if (app.map && app.map.getMapDescription) {
        app.ai.updateMapContext(app.map.getMapDescription());
    }

    const camp = AI_DM.CAMPAIGNS[app.campaignTheme];
    addSystemMessage(camp ? '🧙 Мастер начинает кампанию: ' + camp.name : '🧙 Мастер начинает кампанию...');
    showToast('🧙 Кампания начинается!', 'info');

    try {
        const response = await app.ai.startCampaign(chars.map(c => c.name));
        if (response) processAIResponse(response, true);
    } catch (err) { addSystemMessage('❌ Ошибка: ' + err.message); }
}

function processAIResponse(text, shouldBroadcast) {
    if (!text) return;
    try {
        let processed = parseAIRoll(text);

        const choices = parseAIChoices(text);
        processed = processed.replace(/\[CHOICE:\s*[^\]]+\]/gi, '');

        const moves = parseAIMoves(text);
        processed = processed.replace(/\[MOVE:\s*\S+\s+\d+\s+\d+\]/gi, '');

        const aiMap = parseAIMap(text);
        processed = processed.replace(/\[MAP_START\][\s\S]*?(\[MAP_END\]|$)/gi, '');

        const aiNPCs = parseAINPCs(text);
        processed = processed.replace(/\[NPC:\s*\S+\s+(enemy|boss|ally|neutral)\s+\d+\s+\d+\]/gi, '');
        const aiNPCMoves = parseAINPCMoves(text);
        processed = processed.replace(/\[NPC_MOVE:\s*\S+\s+\d+\s+\d+\]/gi, '');
        const aiNPCDead = parseAINPCDead(text);
        processed = processed.replace(/\[NPC_DEAD:\s*\S+\]/gi, '');

        // Parse AI loot/items
        const aiItems = parseAIItems(text);
        processed = processed.replace(/\[ITEM:\s*[^\]]+\]/gi, '');
        // Parse AI HP changes
        const aiHP = parseAIHPChange(text);
        processed = processed.replace(/\[HP:\s*[+-]?\d+\]/gi, '');
        // Parse AI gold
        const aiGold = parseAIGold(text);
        processed = processed.replace(/\[GOLD:\s*[+-]?\d+\]/gi, '');

        // Apply moves
        for (const move of moves) {
            for (const [id, p] of Object.entries(app.players)) {
                if (p.name.toLowerCase().includes(move.name.toLowerCase())) {
                    app.map.setPlayerPosition(id, move.x, move.y);
                    try { app.network.publish('move', { playerId: id, x: move.x, y: move.y }); } catch (e) { }
                    break;
                }
            }
        }

        // Apply NPCs
        if (aiNPCs.length > 0) {
            const npcNames = aiNPCs.map(n => n.name + ' (' + n.type + ')').join(', ');
            addSystemMessage('👤 Появились: ' + npcNames);
            showToast('👤 Новые NPC: ' + npcNames, 'combat');
        }
        for (const npc of aiNPCs) {
            app.map.addNPC('npc_' + npc.name, npc.name, npc.x, npc.y, npc.type);
            try { app.network.publish('npc', { action: 'add', name: npc.name, type: npc.type, x: npc.x, y: npc.y }); } catch (e) { }
        }

        for (const move of aiNPCMoves) {
            const npcId = 'npc_' + move.name;
            app.map.setNPCPosition(npcId, move.x, move.y);
            try { app.network.publish('npc', { action: 'move', name: move.name, x: move.x, y: move.y }); } catch (e) { }
        }

        for (const name of aiNPCDead) {
            app.map.removeNPC('npc_' + name);
            try { app.network.publish('npc', { action: 'dead', name: name }); } catch (e) { }
            showToast('💀 ' + name + ' повержен!', 'combat');
        }

        // Apply AI map
        if (aiMap && isValidMap(aiMap) && !mapHasGoodContent()) {
            app.map.setMapFromAI(aiMap);
            try { app.network.publish('map', { map: app.map.map }); } catch (e) { }
            addSystemMessage('🗺️ Карта создана Мастером!');
        }

        // Apply items
        for (const item of aiItems) {
            addItem(item.name, item.icon || '📦', item.desc || '');
        }

        // Apply HP changes
        for (const hpChange of aiHP) {
            if (hpChange.name.toLowerCase() === app.myName.toLowerCase() || hpChange.name === '*') {
                modifyHP(hpChange.delta);
            }
        }

        // Apply gold
        if (aiGold !== 0) {
            app.gold += aiGold;
            if (aiGold > 0) showToast('💰 +' + aiGold + ' золота!', 'loot');
            else if (aiGold < 0) showToast('💰 ' + aiGold + ' золота', 'warning');
        }

        // Show message
        addDMMessage(processed);

        // Show choices
        if (choices.length > 0) {
            showChoices(choices);
        } else {
            const autoChoices = [];
            const regex = /(?:^|\n)\s*(\d+)[.)]\s*(.+)/gm;
            let m;
            while ((m = regex.exec(text)) !== null) {
                const c = m[2].trim();
                if (c.length > 3 && c.length < 100) autoChoices.push(c);
            }
            if (autoChoices.length >= 2) showChoices(autoChoices.slice(0, 4));
        }

        if (shouldBroadcast) {
            try { app.network.publish('ai', { text: processed }); } catch (e) { }
        }

        // Update panels if open
        if (!$('charSheet')?.classList.contains('hidden')) renderCharSheet();
        if (!$('inventoryPanel')?.classList.contains('hidden')) renderInventory();
        if (!$('combatPanel')?.classList.contains('hidden')) renderCombatTracker();
        updatePlayersList();
    } catch (e) {
        console.error('processAIResponse error:', e);
        addSystemMessage('⚠️ Ошибка обработки ответа ИИ');
    }
}

// Parse AI items: [ITEM: name | icon | desc]
function parseAIItems(text) {
    const items = [];
    const regex = /\[ITEM:\s*([^\]]+)\]/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const parts = match[1].split('|').map(s => s.trim());
        items.push({ name: parts[0] || 'Неизвестный предмет', icon: parts[1] || '📦', desc: parts[2] || '' });
    }
    return items;
}

// Parse AI HP changes: [HP: name +N] or [HP: name -N] or [HP: -N] (self)
function parseAIHPChange(text) {
    const changes = [];
    const regex = /\[HP:\s*(\S+)?\s*([+-]\d+)\]/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const name = match[1] || '*';
        const delta = parseInt(match[2]);
        if (!isNaN(delta)) changes.push({ name, delta });
    }
    return changes;
}

// Parse AI gold: [GOLD: +N] or [GOLD: -N]
function parseAIGold(text) {
    const match = text.match(/\[GOLD:\s*([+-]?\d+)\]/i);
    return match ? parseInt(match[1]) : 0;
}

// Check if AI-generated map is valid
function isValidMap(mapData) {
    if (!mapData || mapData.length < 5) return false;
    let nonZero = 0;
    for (const row of mapData) for (const cell of row) if (cell > 0) nonZero++;
    return nonZero > mapData.length * 2;
}

function mapHasGoodContent() {
    if (!app.map || !app.map.map) return false;
    let floorCount = 0;
    for (const row of app.map.map) for (const cell of row) if (cell === 1 || cell === 2 || cell === 6) floorCount++;
    return floorCount > 100;
}

function showChoices(choices) {
    const panel = $('choicesPanel');
    const list = $('choicesList');
    if (!panel || !list) return;
    list.innerHTML = '';
    panel.classList.add('visible');

    choices.forEach((choice, i) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = (i + 1) + '. ' + choice;
        btn.addEventListener('click', () => {
            panel.classList.remove('visible');
            addChatMessage(app.myName, choice, app.myColor);
            try { app.network.publish('chat', { name: app.myName, text: choice, color: app.myColor }); } catch (e) { }
            if (app.ai.apiKey) {
                addSystemMessage('🧙 Мастер реагирует...');
                if (app.isHost) handleAIRequest(choice, app.myName);
                else try { app.network.publish('request-ai', { text: choice, playerName: app.myName }); } catch (e) { }
            }
        });
        list.appendChild(btn);
    });
}

// ===== VOICE =====
async function toggleVoice() {
    try {
        const panel = $('voicePanel');
        const btn = $('toggleVoice');
        if (app.voiceEnabled) {
            app.voiceEnabled = false;
            if (panel) panel.classList.remove('visible');
            if (btn) btn.classList.remove('active');
            if (app.voiceStream) { app.voiceStream.getTracks().forEach(t => t.stop()); app.voiceStream = null; }
            addSystemMessage('🎤 Голос выключен');
        } else {
            addSystemMessage('🎤 Запрос доступа к микрофону...');
            app.voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            app.voiceEnabled = true;
            if (panel) panel.classList.add('visible');
            if (btn) btn.classList.add('active');
            addSystemMessage('🎤 Голос включён!');
            app.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = app.audioContext.createMediaStreamSource(app.voiceStream);
            app.analyser = app.audioContext.createAnalyser();
            app.analyser.fftSize = 256;
            source.connect(app.analyser);
            detectSpeaking();
            updateVoiceUsers();
            try { app.network.publish('voice-signal', { type: 'voice-on', playerId: app.myId, name: app.myName }); } catch (e) { }
        }
    } catch (e) { addSystemMessage('❌ Микрофон недоступен: ' + e.message); }
}

function toggleMic() {
    app.micEnabled = !app.micEnabled;
    const btn = $('toggleMic');
    if (btn) btn.classList.toggle('active', app.micEnabled);
    if (app.voiceStream) app.voiceStream.getAudioTracks().forEach(t => t.enabled = app.micEnabled);
    addSystemMessage(app.micEnabled ? '🎙️ Микрофон вкл' : '🔇 Микрофон выкл');
}

function detectSpeaking() {
    if (!app.voiceEnabled || !app.analyser) return;
    const data = new Uint8Array(app.analyser.frequencyBinCount);
    app.analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const el = document.querySelector('[data-voice-id="' + app.myId + '"]');
    if (el) el.classList.toggle('speaking', avg > 15 && app.micEnabled);
    requestAnimationFrame(detectSpeaking);
}

function updateVoiceUsers() {
    const c = $('voiceUsers');
    if (!c) return;
    c.innerHTML = '';
    for (const [id, p] of Object.entries(app.players)) {
        const d = document.createElement('div');
        d.className = 'voice-user';
        d.dataset.voiceId = id;
        d.innerHTML = '<span class="player-dot" style="background:' + p.color + '"></span>' + p.name;
        c.appendChild(d);
    }
}

// ===== CHAT UI =====
function addChatMessage(name, text, color) {
    const c = $('chatMessages');
    if (!c) return;
    const d = document.createElement('div');
    d.className = 'chat-msg player';
    d.innerHTML = '<span class="msg-author" style="color:' + color + '">' + name + ':</span>' + escapeHTML(text);
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

function addDMMessage(text) {
    const c = $('chatMessages');
    if (!c) return;
    const d = document.createElement('div');
    d.className = 'chat-msg dm';
    d.innerHTML = '<span class="dm-label">🧙 Мастер:</span> ' + text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

function addSystemMessage(text) {
    const c = $('chatMessages');
    if (!c) return;
    const d = document.createElement('div');
    d.className = 'chat-msg system';
    d.textContent = text;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

function addDiceMessage(text) {
    const c = $('chatMessages');
    if (!c) return;
    const d = document.createElement('div');
    d.className = 'chat-msg dice';
    d.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

function escapeHTML(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}
