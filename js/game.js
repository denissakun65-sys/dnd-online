// ===== game.js — Main game controller (bulletproof) =====
// All DOM access is null-safe. Player ID = network.myId (single source of truth).

const app = {
    network: null, map: null, ai: null,
    myId: '', myName: '', myColor: '#e74c3c',
    isHost: false, isSolo: false, roomCode: '',
    players: {}, playerOrder: [],
    charData: null, campaignTheme: '',
    voiceEnabled: false, micEnabled: true,
    voiceStream: null, audioContext: null, analyser: null,
    tutorialStep: 0, aiBusy: false, campaignStarted: false
};

const TUTORIAL = [
    { title: '⚔️ Добро пожаловать!', text: 'Это D&D Online — игра с ИИ Мастером Подземелий. Давайте быстро разберёмся!', icon: '🎮' },
    { title: '🗺️ Карта', text: 'Слева — карта. ЛКМ — переместить персонажа. Колёсико — зум. Ctrl+ЛКМ — двигать камеру.', icon: '🗺️' },
    { title: '💬 Чат и действия', text: 'Пишите действия в чат: "Осматриваю комнату", "Атакую гоблина". ИИ Ведущий ответит!', icon: '💬' },
    { title: '⚔️ Выборы', text: 'ИИ предложит варианты действий — кликните на вариант!', icon: '⚔️' },
    { title: '🎲 Кубики', text: '/roll 1d20+5 — бросить кубик. ИИ тоже бросает автоматически.', icon: '🎲' },
    { title: '✅ Готово!', text: 'Пишите в чат — и приключение начнётся! /help — помощь. Удачи! 🎲', icon: '🎉' }
];

// Safe DOM helper
function $(id) { return document.getElementById(id); }

// ===== ERROR HANDLER =====
window.onerror = function(msg, url, line) {
    console.error('JS Error:', msg, line);
};

document.addEventListener('DOMContentLoaded', () => {
    try { init(); }
    catch (e) {
        console.error('Init error:', e);
        document.body.innerHTML = '<div style="color:white;padding:40px;font-size:18px;">' +
            '<h2>⚠️ Ошибка загрузки</h2>' +
            '<p>' + e.message + '</p>' +
            '<p style="color:#888;font-size:14px;">Строка: ' + (e.lineNumber || '?') + '</p>' +
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

    // Init map
    const canvas = $('mapCanvas');
    if (!canvas) throw new Error('Элемент mapCanvas не найден');
    app.map = new GameMap(canvas);

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

    // AI typing indicator (null-safe)
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

    // Init network
    app.network = new Network();

    app.network.onConnect = () => {
        app.myId = app.network.myId;
        app.isHost = app.network.isHost;

        // Add self (only once!)
        addPlayer(app.myId, app.myName, app.myColor, app.isHost, app.charData);

        app.map.myPlayerId = app.myId;
        app.map.isHost = app.isHost;

        // Update UI
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
        app.network.connect(app.roomCode, app.myName, app.myColor);
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
        app.map.render();
    });

    const genBtn = $('generateMap');
    if (genBtn) genBtn.addEventListener('click', () => {
        const m = $('genModal');
        if (m) m.classList.remove('hidden');
    });

    const closeBtn = $('closeGenModal');
    if (closeBtn) closeBtn.addEventListener('click', () => {
        const m = $('genModal');
        if (m) m.classList.add('hidden');
    });

    document.querySelectorAll('.gen-btn').forEach(b => {
        b.addEventListener('click', () => {
            app.map.generate(b.dataset.gen);
            try { app.network.publish('map', { map: app.map.map }); } catch (e) { }
            const m = $('genModal');
            if (m) m.classList.add('hidden');
            addSystemMessage('🗺️ Карта: ' + b.textContent);
        });
    });
}

function setupTopBar() {
    const roomEl = $('roomDisplay');
    if (roomEl) roomEl.addEventListener('click', () => {
        navigator.clipboard.writeText(roomEl.textContent).then(() => addSystemMessage('📋 Скопировано'));
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
                    addPlayer(msg.playerId, msg.name, msg.color, false, null);
                    addSystemMessage('👋 ' + msg.name + ' присоединился!');
                    updateConnectionCount();
                    if (app.isHost) {
                        setTimeout(() => {
                            app.network.publish('state', {
                                map: app.map.map,
                                players: app.map.players,
                                targetPlayer: msg.playerId
                            });
                        }, 500);
                    }
                }
                break;
            case 'leave':
                if (msg.playerId && app.players[msg.playerId]) {
                    const name = app.players[msg.playerId].name;
                    removePlayer(msg.playerId);
                    addSystemMessage('👋 ' + name + ' покинул игру.');
                    updateConnectionCount();
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
                        app.map.render();
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
        }
    } catch (e) { console.error('Net msg error:', e); }
}

// ===== PLAYERS =====
function addPlayer(id, name, color, isHost, charData) {
    if (app.players[id]) return; // No duplicates!
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
        const ci = p.charData ? '<span class="player-class">' + p.charData.race + ' ' + p.charData.class + '</span>' : '';
        const hb = p.isHost ? '<span class="player-host">👑</span>' : '';
        div.innerHTML = '<span class="player-dot" style="background:' + p.color + '"></span><span>' + p.name + '</span>' + ci + hb;
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
        try { app.network.publish('dice', { text: msg }); } catch (e) { }
        return;
    }

    // Commands
    if (text.toLowerCase() === '/help') { addSystemMessage('/roll 1d20+5 — кубик, /start — кампания, /tutorial — обучение'); return; }
    if (text.toLowerCase() === '/start') { startCampaign(); return; }
    if (text.toLowerCase() === '/tutorial') { showTutorial(); return; }

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
    addSystemMessage('🧙 Мастер начинает кампанию...');

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
        processed = processed.replace(/\[MAP_START\][\s\S]*?\[MAP_END\]/gi, '');

        for (const move of moves) {
            for (const [id, p] of Object.entries(app.players)) {
                if (p.name.toLowerCase().includes(move.name.toLowerCase())) {
                    app.map.setPlayerPosition(id, move.x, move.y);
                    try { app.network.publish('move', { playerId: id, x: move.x, y: move.y }); } catch (e) { }
                    break;
                }
            }
        }

        if (aiMap) {
            app.map.setMapFromAI(aiMap);
            try { app.network.publish('map', { map: app.map.map }); } catch (e) { }
            addSystemMessage('🗺️ Карта создана Мастером!');
        }

        addDMMessage(processed);

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
    } catch (e) {
        console.error('processAIResponse error:', e);
        addSystemMessage('⚠️ Ошибка обработки ответа ИИ');
    }
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
    } catch (e) { addSystemMessage('❌ Микрофон: ' + e.message); }
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
