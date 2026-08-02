// ===== game.js — Main game controller =====
// Key fix: player ID comes from network.myId (ONE source of truth)
// No more duplicate players, proper movement sync

const app = {
    network: null, map: null, ai: null,
    myId: '',          // = network.myId, set once
    myName: '',
    myColor: '#e74c3c',
    isHost: false,
    isSolo: false,
    roomCode: '',
    players: {},       // id -> {name, color, isHost, charData}
    playerOrder: [],
    charData: null,
    campaignTheme: '',
    voiceEnabled: false,
    micEnabled: true,
    voiceStream: null,
    audioContext: null,
    analyser: null,
    tutorialStep: 0,
    aiBusy: false,
    campaignStarted: false
};

const TUTORIAL = [
    { title: '⚔️ Добро пожаловать!', text: 'Это D&D Online — игра с ИИ Мастером Подземелий. Давайте быстро разберёмся!', icon: '🎮' },
    { title: '🗺️ Карта', text: 'Слева — карта. ЛКМ — переместить персонажа. Колёсико — зум. Ctrl+ЛКМ — двигать камеру.', icon: '🗺️' },
    { title: '💬 Чат и действия', text: 'Пишите действия в чат: "Осматриваю комнату", "Атакую гоблина". ИИ Ведущий ответит!', icon: '💬' },
    { title: '⚔️ Выборы', text: 'ИИ предложит варианты действий — кликните на вариант!', icon: '⚔️' },
    { title: '🎲 Кубики', text: '/roll 1d20+5 — бросить кубик. ИИ тоже бросает автоматически.', icon: '🎲' },
    { title: '✅ Готово!', text: 'Пишите в чат — и приключение начнётся! /help — помощь. Удачи! 🎲', icon: '🎉' }
];

// ===== GLOBAL ERROR HANDLER =====
window.onerror = function (msg, url, line, col, err) {
    console.error('JS Error:', msg, line, col);
    addSystemMessage('⚠️ Ошибка: ' + msg);
};

document.addEventListener('DOMContentLoaded', () => {
    try { init(); }
    catch (e) {
        console.error('Init error:', e);
        document.body.innerHTML = `<div style="color:white;padding:40px;font-size:18px;"><h2>⚠️ Ошибка загрузки</h2><p>${e.message}</p><a href="lobby.html" style="color:#c9a84c">← Назад</a></div>`;
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

    // Init modules
    app.map = new GameMap(document.getElementById('mapCanvas'));
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
            // Update AI context
            if (app.ai.updateMapContext && app.map.getMapDescription) {
                app.ai.updateMapContext(app.map.getMapDescription());
            }
        } catch (e) { }
    };

    // AI typing indicator
    app.ai.onTyping = (isTyping) => {
        app.aiBusy = isTyping;
        try {
            const el = document.getElementById('typingIndicator');
            if (el) el.classList.toggle('visible', isTyping);

            const input = document.getElementById('chatInput');
            const btn = document.getElementById('chatSend');
            if (isTyping) {
                input.placeholder = '🧙 Мастер думает...';
                input.disabled = true;
                btn.disabled = true;
            } else {
                input.placeholder = 'Действие или /roll 1d20...';
                input.disabled = false;
                btn.disabled = false;
                input.focus();
            }
        } catch (e) { }
    };

    // ===== UI SETUP =====
    setupMapTools();
    setupTopBar();
    setupChat();
    setupTutorial();

    // ===== NETWORK =====
    app.network = new Network();

    app.network.onConnect = () => {
        // KEY FIX: Use network.myId as the single source of truth
        app.myId = app.network.myId;
        app.isHost = app.network.isHost;

        console.log('[GAME] Connected. myId:', app.myId, 'isHost:', app.isHost, 'isSolo:', app.isSolo);

        // Add self to player list (only once!)
        addPlayer(app.myId, app.myName, app.myColor, app.isHost, app.charData);

        // Set map player IDs
        app.map.myPlayerId = app.myId;
        app.map.isHost = app.isHost;

        // Update UI
        document.getElementById('roomDisplay').textContent = app.roomCode.toUpperCase();
        document.getElementById('modeLabel').textContent = app.isSolo ? '⚔️ Одиночка' : '👥 Онлайн';
        updateConnectionCount();

        // Auto-generate map
        const camp = AI_DM.CAMPAIGNS[app.campaignTheme];
        if (camp && camp.mapType) {
            app.map.generate(camp.mapType);
            addSystemMessage('🗺️ Карта: ' + camp.name);
        }

        // Show tutorial
        showTutorial();
    };

    app.network.onError = (err) => addSystemMessage('❌ ' + err);

    app.network.onMessage = (msg) => handleNetMessage(msg);

    // ===== CONNECT =====
    if (app.isSolo) {
        app.network.connectSolo();
    } else {
        app.network.connect(app.roomCode, app.myName, app.myColor);
        // After a delay, check if we're alone → become host
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

// ===== SETUP FUNCTIONS =====
function setupMapTools() {
    // Toggle map tools
    const toggleMapToolsBtn = document.getElementById('toggleMapTools');
    if (toggleMapToolsBtn) toggleMapToolsBtn.addEventListener('click', () => {
        document.getElementById('mapTools')?.classList.toggle('hidden');
        toggleMapToolsBtn.classList.toggle('active');
    });

    // Tool buttons
    document.querySelectorAll('.map-tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.map-tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            app.map.selectedTool = TILE[btn.dataset.tool.toUpperCase()];
        });
    });

    // Fog toggle
    const toggleFogBtn = document.getElementById('toggleFog');
    if (toggleFogBtn) toggleFogBtn.addEventListener('click', () => {
        app.map.fogEnabled = !app.map.fogEnabled;
        toggleFogBtn.classList.toggle('active', app.map.fogEnabled);
        if (!app.map.fogEnabled) {
            for (let y = 0; y < app.map.gridH; y++)
                for (let x = 0; x < app.map.gridW; x++) app.map.fogMap[y][x] = false;
        }
        app.map.render();
    });

    // Map generation
    const genMapBtn = document.getElementById('generateMap');
    if (genMapBtn) genMapBtn.addEventListener('click', () => {
        document.getElementById('genModal')?.classList.remove('hidden');
    });
    const closeGenBtn = document.getElementById('closeGenModal');
    if (closeGenBtn) closeGenBtn.addEventListener('click', () => {
        document.getElementById('genModal')?.classList.add('hidden');
    });
    document.querySelectorAll('.gen-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            app.map.generate(btn.dataset.gen);
            try { app.network.publish('map', { map: app.map.map }); } catch (e) { }
            document.getElementById('genModal')?.classList.add('hidden');
            addSystemMessage('🗺️ Карта: ' + btn.textContent);
        });
    });
}

function setupTopBar() {
    // Copy room code
    const roomEl = document.getElementById('roomDisplay');
    if (roomEl) roomEl.addEventListener('click', () => {
        const code = roomEl.textContent;
        navigator.clipboard.writeText(code).then(() => addSystemMessage('📋 Скопировано: ' + code));
    });

    // Voice
    document.getElementById('toggleVoice')?.addEventListener('click', toggleVoice);
    document.getElementById('toggleMic')?.addEventListener('click', toggleMic);
}

function setupChat() {
    document.getElementById('chatSend')?.addEventListener('click', sendChat);
    const chatInput = document.getElementById('chatInput');
    if (chatInput) chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
}

function setupTutorial() {
    document.getElementById('tutorialPrev')?.addEventListener('click', () => { app.tutorialStep--; updateTutorialStep(); });
    document.getElementById('tutorialNext')?.addEventListener('click', () => {
        app.tutorialStep++;
        if (app.tutorialStep >= TUTORIAL.length) hideTutorial();
        else updateTutorialStep();
    });
    document.getElementById('tutorialSkip')?.addEventListener('click', hideTutorial);
}

// ===== TUTORIAL =====
function showTutorial() {
    try {
        const overlay = document.getElementById('tutorialOverlay');
        if (!overlay) return;
        app.tutorialStep = 0;
        overlay.classList.remove('hidden');
        updateTutorialStep();
    } catch (e) { console.error(e); }
}

function updateTutorialStep() {
    try {
        const step = TUTORIAL[app.tutorialStep];
        if (!step) { hideTutorial(); return; }
        const icon = document.getElementById('tutorialIcon');
        const title = document.getElementById('tutorialTitle');
        const text = document.getElementById('tutorialText');
        const progress = document.getElementById('tutorialProgress');
        const prev = document.getElementById('tutorialPrev');
        const next = document.getElementById('tutorialNext');
        if (icon) icon.textContent = step.icon;
        if (title) title.textContent = step.title;
        if (text) text.textContent = step.text;
        if (progress) progress.textContent = `${app.tutorialStep + 1}/${TUTORIAL.length}`;
        if (prev) prev.style.visibility = app.tutorialStep === 0 ? 'hidden' : 'visible';
        if (next) next.textContent = app.tutorialStep === TUTORIAL.length - 1 ? '🎮 Начать!' : 'Далее →';
    } catch (e) { console.error(e); }
}

function hideTutorial() {
    try {
        document.getElementById('tutorialOverlay').classList.add('hidden');
        // Auto-start campaign if host and has API key
        if (app.ai.apiKey && app.isHost && !app.campaignStarted) {
            addSystemMessage('🧙 Мастер начинает кампанию...');
            setTimeout(startCampaign, 800);
        }
    } catch (e) { console.error(e); }
}

// ===== NETWORK MESSAGE HANDLING =====
function handleNetMessage(msg) {
    if (!msg || !msg.type) return;

    // CRITICAL: Filter out own messages (except 'state' which we handle specially)
    if (msg.from === app.myId && msg.type !== 'state') return;

    try {
        switch (msg.type) {
            case 'join':
                // Another player joined
                if (msg.playerId && msg.playerId !== app.myId) {
                    addPlayer(msg.playerId, msg.name, msg.color, false, null);
                    addSystemMessage(`👋 ${msg.name} присоединился!`);
                    updateConnectionCount();
                    // If host, send them the current state
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
                    addSystemMessage(`👋 ${name} покинул игру.`);
                    updateConnectionCount();
                }
                break;

            case 'state':
                // Sync state from host
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
                // Another player moved
                if (msg.playerId && msg.playerId !== app.myId) {
                    app.map.setPlayerPosition(msg.playerId, msg.x, msg.y);
                }
                break;

            case 'map':
                // Map update from host
                if (!app.isHost && msg.map) {
                    app.map.setMapData(msg.map);
                }
                break;

            case 'chat':
                // Chat message from another player
                if (msg.name && msg.text) {
                    addChatMessage(msg.name, msg.text, msg.color || '#e0d5c0');
                }
                break;

            case 'ai':
                // AI response from host
                if (msg.text) {
                    processAIResponse(msg.text, false);
                }
                break;

            case 'dice':
                if (msg.text) addDiceMessage(msg.text);
                break;

            case 'request-ai':
                // Non-host player asks host to query AI
                if (app.isHost && msg.text) {
                    handleAIRequest(msg.text, msg.playerName || 'Игрок');
                }
                break;

            case 'voice-signal':
                handleVoiceSignal(msg);
                break;
        }
    } catch (e) {
        console.error('Net msg error:', e);
    }
}

// ===== PLAYERS =====
function addPlayer(id, name, color, isHost, charData) {
    // Prevent duplicates!
    if (app.players[id]) {
        console.log('[GAME] Player already exists:', id, name);
        return;
    }
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
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    for (const [id, p] of Object.entries(app.players)) {
        const div = document.createElement('div');
        div.className = 'player-item';
        const ci = p.charData ? `<span class="player-class">${p.charData.race} ${p.charData.class}</span>` : '';
        const hb = p.isHost ? '<span class="player-host">👑</span>' : '';
        div.innerHTML = `<span class="player-dot" style="background:${p.color}"></span><span>${p.name}</span>${ci}${hb}`;
        list.appendChild(div);
    }
}

function updateConnectionCount() {
    document.getElementById('connectionCount').textContent = app.isSolo ? '1' : `${Object.keys(app.players).length}/4`;
}

// ===== CHAT =====
function sendChat() {
    if (app.aiBusy) return;
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    // Dice roll
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
        if (app.isHost) {
            handleAIRequest(text, app.myName);
        } else {
            try { app.network.publish('request-ai', { text, playerName: app.myName }); } catch (e) { }
        }
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
    } catch (err) {
        addSystemMessage('❌ Ошибка ИИ: ' + err.message);
    }
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
    } catch (err) {
        addSystemMessage('❌ Ошибка: ' + err.message);
    }
}

function processAIResponse(text, shouldBroadcast) {
    if (!text) return;
    try {
        // Parse dice
        let processed = parseAIRoll(text);

        // Parse choices
        const choices = parseAIChoices(text);
        processed = processed.replace(/\[CHOICE:\s*[^\]]+\]/gi, '');

        // Parse moves
        const moves = parseAIMoves(text);
        processed = processed.replace(/\[MOVE:\s*\S+\s+\d+\s+\d+\]/gi, '');

        // Parse map
        const aiMap = parseAIMap(text);
        processed = processed.replace(/\[MAP_START\][\s\S]*?\[MAP_END\]/gi, '');

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

        // Apply map
        if (aiMap) {
            app.map.setMapFromAI(aiMap);
            try { app.network.publish('map', { map: app.map.map }); } catch (e) { }
            addSystemMessage('🗺️ Карта создана Мастером!');
        }

        // Show message
        addDMMessage(processed);

        // Show choices
        if (choices.length > 0) {
            showChoices(choices);
        } else {
            // Auto-detect numbered lists as choices
            const autoChoices = [];
            const regex = /(?:^|\n)\s*(\d+)[.)]\s*(.+)/gm;
            let m;
            while ((m = regex.exec(text)) !== null) {
                const c = m[2].trim();
                if (c.length > 3 && c.length < 100) autoChoices.push(c);
            }
            if (autoChoices.length >= 2) showChoices(autoChoices.slice(0, 4));
        }

        // Broadcast to other players
        if (shouldBroadcast) {
            try { app.network.publish('ai', { text: processed }); } catch (e) { }
        }
    } catch (e) {
        console.error('processAIResponse error:', e);
        addSystemMessage('⚠️ Ошибка обработки ответа ИИ');
    }
}

function showChoices(choices) {
    try {
        const panel = document.getElementById('choicesPanel');
        const list = document.getElementById('choicesList');
        list.innerHTML = '';
        panel.classList.add('visible');

        choices.forEach((choice, i) => {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = `${i + 1}. ${choice}`;
            btn.addEventListener('click', () => {
                // Hide choices
                panel.classList.remove('visible');
                // Show in chat
                addChatMessage(app.myName, choice, app.myColor);
                try { app.network.publish('chat', { name: app.myName, text: choice, color: app.myColor }); } catch (e) { }
                // Send to AI
                if (app.ai.apiKey) {
                    addSystemMessage('🧙 Мастер реагирует...');
                    if (app.isHost) handleAIRequest(choice, app.myName);
                    else try { app.network.publish('request-ai', { text: choice, playerName: app.myName }); } catch (e) { }
                }
            });
            list.appendChild(btn);
        });
    } catch (e) { console.error(e); }
}

// ===== VOICE =====
async function toggleVoice() {
    try {
        const panel = document.getElementById('voicePanel');
        const btn = document.getElementById('toggleVoice');
        if (app.voiceEnabled) {
            app.voiceEnabled = false;
            panel.classList.remove('visible');
            btn.classList.remove('active');
            if (app.voiceStream) { app.voiceStream.getTracks().forEach(t => t.stop()); app.voiceStream = null; }
            addSystemMessage('🎤 Голос выключен');
        } else {
            app.voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            app.voiceEnabled = true;
            panel.classList.add('visible');
            btn.classList.add('active');
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
    const btn = document.getElementById('toggleMic');
    btn.classList.toggle('active', app.micEnabled);
    if (app.voiceStream) app.voiceStream.getAudioTracks().forEach(t => t.enabled = app.micEnabled);
    addSystemMessage(app.micEnabled ? '🎙️ Микрофон вкл' : '🔇 Микрофон выкл');
}

function detectSpeaking() {
    if (!app.voiceEnabled || !app.analyser) return;
    const data = new Uint8Array(app.analyser.frequencyBinCount);
    app.analyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const el = document.querySelector(`[data-voice-id="${app.myId}"]`);
    if (el) el.classList.toggle('speaking', avg > 15 && app.micEnabled);
    requestAnimationFrame(detectSpeaking);
}

function updateVoiceUsers() {
    const c = document.getElementById('voiceUsers');
    c.innerHTML = '';
    for (const [id, p] of Object.entries(app.players)) {
        const d = document.createElement('div');
        d.className = 'voice-user';
        d.dataset.voiceId = id;
        d.innerHTML = `<span class="player-dot" style="background:${p.color}"></span>${p.name}`;
        c.appendChild(d);
    }
}

function handleVoiceSignal(msg) {
    if (msg.type === 'voice-on') {
        addSystemMessage('🎤 ' + msg.name + ' включил голос');
        updateVoiceUsers();
    }
}

// ===== CHAT UI =====
function addChatMessage(name, text, color) {
    const c = document.getElementById('chatMessages');
    const d = document.createElement('div');
    d.className = 'chat-msg player';
    d.innerHTML = `<span class="msg-author" style="color:${color}">${name}:</span>${escapeHTML(text)}`;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

function addDMMessage(text) {
    const c = document.getElementById('chatMessages');
    const d = document.createElement('div');
    d.className = 'chat-msg dm';
    d.innerHTML = `<span class="dm-label">🧙 Мастер:</span> ${text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}`;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

function addSystemMessage(text) {
    const c = document.getElementById('chatMessages');
    const d = document.createElement('div');
    d.className = 'chat-msg system';
    d.textContent = text;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
}

function addDiceMessage(text) {
    const c = document.getElementById('chatMessages');
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
