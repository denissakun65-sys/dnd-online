// ===== game.js — Main game controller with all features =====

const app = {
    network: null, map: null, ai: null,
    myName: '', myColor: '#e74c3c', myPlayerId: '',
    isHost: false, isSolo: false, roomCode: '',
    players: {}, playerOrder: [],
    charData: null, campaignTheme: '',
    voiceEnabled: false, micEnabled: true,
    voiceStream: null, voiceConnections: {},
    audioContext: null, analyser: null
};

document.addEventListener('DOMContentLoaded', () => {
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
    app.map.onMapChange = () => app.network.publish('map', { map: app.map.map });
    app.map.onPlayerMove = (playerId, x, y) => {
        app.map.revealFog(playerId);
        app.network.publish('move', { playerId, x, y });
        app.ai.updateMapContext(app.map.getMapDescription());
    };

    // AI typing
    app.ai.onTyping = (isTyping) => {
        let el = document.querySelector('.typing-indicator');
        if (el) el.classList.toggle('visible', isTyping);
        else if (isTyping) {
            el = document.createElement('div');
            el.className = 'typing-indicator visible';
            el.textContent = '🧙 Мастер думает...';
            document.querySelector('.chat-panel').insertBefore(el, document.querySelector('.chat-input-area'));
        }
    };

    // Map tools
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            app.map.selectedTool = TILE[btn.dataset.tool.toUpperCase()];
        });
    });

    document.getElementById('toggleMapTools').addEventListener('click', () => {
        document.getElementById('mapTools').classList.toggle('hidden');
        document.getElementById('toggleMapTools').classList.toggle('active');
    });

    document.getElementById('toggleFog').addEventListener('click', () => {
        app.map.fogEnabled = !app.map.fogEnabled;
        document.getElementById('toggleFog').classList.toggle('active', app.map.fogEnabled);
        if (!app.map.fogEnabled) { for (let y=0;y<app.map.gridSize;y++) for (let x=0;x<app.map.gridSize;x++) app.map.fogMap[y][x]=false; }
        app.map.render();
    });

    document.getElementById('clearMap').addEventListener('click', () => { app.map.clearMap(); app.network.publish('map', { map: app.map.map }); });
    document.getElementById('fillFloor').addEventListener('click', () => { app.map.fillFloor(); app.network.publish('map', { map: app.map.map }); });
    document.getElementById('copyCode').addEventListener('click', () => { const c=document.getElementById('roomDisplay').textContent; navigator.clipboard.writeText(c).then(()=>addSystemMessage('Код скопирован: '+c)); });

    // Map generation
    document.getElementById('generateMap').addEventListener('click', () => document.getElementById('genModal').classList.remove('hidden'));
    document.getElementById('closeGenModal').addEventListener('click', () => document.getElementById('genModal').classList.add('hidden'));
    document.querySelectorAll('.gen-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            app.map.generate(btn.dataset.gen);
            app.network.publish('map', { map: app.map.map });
            document.getElementById('genModal').classList.add('hidden');
            addSystemMessage('🎲 Карта сгенерирована: ' + btn.textContent);
        });
    });

    // Quick gen buttons in toolbar
    document.getElementById('genDungeon')?.addEventListener('click', () => { app.map.generate('dungeon'); app.network.publish('map', { map: app.map.map }); addSystemMessage('🏰 Подземелье сгенерировано'); });
    document.getElementById('genCave')?.addEventListener('click', () => { app.map.generate('cave'); app.network.publish('map', { map: app.map.map }); addSystemMessage('🕳️ Пещера сгенерирована'); });
    document.getElementById('genForest')?.addEventListener('click', () => { app.map.generate('forest'); app.network.publish('map', { map: app.map.map }); addSystemMessage('🌲 Лес сгенерирован'); });
    document.getElementById('genTavern')?.addEventListener('click', () => { app.map.generate('tavern'); app.network.publish('map', { map: app.map.map }); addSystemMessage('🍺 Таверна сгенерирована'); });

    // Voice chat
    document.getElementById('toggleVoice').addEventListener('click', toggleVoice);
    document.getElementById('toggleMic').addEventListener('click', toggleMic);

    // Chat
    document.getElementById('chatSend').addEventListener('click', () => sendChat());
    document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key==='Enter') sendChat(); });

    // Connect network
    app.network = new MqttNetwork();

    app.network.onConnect = () => {
        addSystemMessage('✅ Подключено к комнате: ' + app.roomCode.toUpperCase());
        addSystemMessage('ЛКМ — рисовать карту, ПКМ — двигать токен. Колёсико — зум.');

        // Add myself
        addPlayer(app.myPlayerId, app.myName, app.myColor, app.isHost, app.charData);
        app.map.myPlayerId = app.myPlayerId;
        app.map.isHost = app.isHost;

        document.getElementById('roomDisplay').textContent = app.roomCode.toUpperCase();
        if (app.isSolo) { document.getElementById('modeLabel').textContent='⚔️ Одиночка'; }
        else { document.getElementById('modeLabel').textContent='👥 Онлайн'; }
        document.getElementById('modeLabel').style.display='inline-block';
        updateConnectionCount();

        // Generate map based on style
        const mapStyle = sessionStorage.getItem('dnd-mapstyle') || 'auto';
        if (mapStyle === 'random') {
            const types = ['dungeon','cave','forest','tavern','castle','temple'];
            const type = types[Math.floor(Math.random()*types.length)];
            app.map.generate(type);
            addSystemMessage('🎲 Случайная карта сгенерирована');
        } else if (mapStyle === 'empty') {
            addSystemMessage('⬜ Пустая карта — рисуйте сами!');
        }
        // 'auto' = AI will generate map via campaign start

        // Start campaign
        if (app.ai.apiKey && app.isHost) {
            addSystemMessage('🧙 Мастер начинает кампанию...');
            setTimeout(() => startCampaign(), 1000);
        } else if (!app.ai.apiKey) {
            addSystemMessage('⚠️ API ключ не введён — ИИ Ведущий недоступен.');
        }
    };

    app.network.onError = (err) => addSystemMessage('❌ ' + err);
    app.network.onMessage = (msg) => handleNetMessage(msg);

    // Start connection
    if (app.isSolo) {
        app.network.connectSolo();
        app.myPlayerId = app.network.myId;
        app.isHost = true;
        app.network.onConnect();
    } else {
        app.myPlayerId = app.network.generateId();
        app.isHost = false;
        app.network.connect(app.roomCode, app.myName, app.myColor);
        // Host detection
        setTimeout(() => {
            if (Object.keys(app.players).length <= 1) {
                app.isHost = true;
                app.map.isHost = true;
                updatePlayersList();
                if (app.ai.apiKey) {
                    addSystemMessage('👑 Вы — хост!');
                    addSystemMessage('🧙 Мастер начинает кампанию...');
                    setTimeout(() => startCampaign(), 1000);
                }
            }
        }, 2500);
    }
});

// ===== NETWORK =====
function handleNetMessage(msg) {
    if (msg.from === app.myPlayerId) return;
    switch (msg.type) {
        case 'join':
            addPlayer(msg.playerId, msg.name, msg.color, false, msg.charData);
            addSystemMessage(msg.name + ' присоединился!');
            updateConnectionCount();
            if (app.isHost) setTimeout(() => app.network.publish('state', { map: app.map.map, players: app.map.players, targetPlayer: msg.playerId }), 500);
            break;
        case 'leave':
            if (app.players[msg.playerId]) { removePlayer(msg.playerId); addSystemMessage(msg.name + ' покинул игру.'); updateConnectionCount(); }
            break;
        case 'state':
            if (!app.isHost && msg.targetPlayer === app.myPlayerId) {
                if (msg.map) app.map.setMapData(msg.map);
                if (msg.players) { for (const [id,p] of Object.entries(msg.players)) { if (!app.players[id]) { app.map.players[id]=p; app.players[id]={name:p.name,color:p.color}; } } app.map.render(); }
                addSystemMessage('📥 Данные комнаты загружены!');
            }
            break;
        case 'move': app.map.setPlayerPosition(msg.playerId, msg.x, msg.y); break;
        case 'map': if (!app.isHost) app.map.setMapData(msg.map); break;
        case 'chat': addChatMessage(msg.name, msg.text, msg.color); break;
        case 'ai': processAIResponse(msg.text, false); break;
        case 'dice': addDiceMessage(msg.text); break;
        case 'request-ai': if (app.isHost) handleAIRequest(msg.text, msg.playerName); break;
        case 'voice-signal': handleVoiceSignal(msg); break;
    }
}

// ===== PLAYERS =====
function addPlayer(id, name, color, isHost, charData) {
    app.players[id] = { name, color, isHost, charData: charData || null };
    app.playerOrder.push(id);
    app.map.addPlayer(id, name, color);
    updatePlayersList();
}

function removePlayer(id) {
    delete app.players[id];
    app.playerOrder = app.playerOrder.filter(pid => pid !== id);
    app.map.removePlayer(id);
    updatePlayersList();
}

function updatePlayersList() {
    const list = document.getElementById('playersList');
    list.innerHTML = '';
    for (const [id, p] of Object.entries(app.players)) {
        const div = document.createElement('div');
        div.className = 'player-item';
        const charInfo = p.charData ? `<span class="player-class">${p.charData.race} ${p.charData.class}</span>` : '';
        const hostBadge = p.isHost ? '<span class="player-host">👑 Хост</span>' : '';
        const avatarUrl = p.charData?.avatarSeed
            ? `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(p.charData.avatarSeed)}&backgroundColor=1a1a2e`
            : '';
        div.innerHTML = avatarUrl
            ? `<img src="${avatarUrl}" alt=""> <span>${p.name}</span>${charInfo}${hostBadge}`
            : `<span class="player-dot" style="background:${p.color}"></span><span>${p.name}</span>${charInfo}${hostBadge}`;
        list.appendChild(div);
    }
}

function updateConnectionCount() {
    const count = Object.keys(app.players).length;
    document.getElementById('connectionCount').textContent = app.isSolo ? '1' : `${count}/4`;
}

// ===== CHAT =====
function sendChat() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    if (text.toLowerCase().startsWith('/roll ') || text.toLowerCase().startsWith('/r ')) {
        const notation = text.replace(/^\/(roll|r)\s+/i, '');
        const result = rollDice(notation);
        const msgText = formatDiceResult(result, app.myName);
        addDiceMessage(msgText);
        app.network.publish('dice', { text: msgText, name: app.myName });
        return;
    }
    if (text.toLowerCase() === '/help') { addSystemMessage('/roll 1d20+5 — бросить кубик, /start — начать кампанию'); return; }
    if (text.toLowerCase() === '/start') { startCampaign(); return; }

    addChatMessage(app.myName, text, app.myColor);
    app.network.publish('chat', { name: app.myName, text, color: app.myColor });

    if (app.ai.apiKey) {
        if (app.isHost) handleAIRequest(text, app.myName);
        else app.network.publish('request-ai', { text, playerName: app.myName });
    }
}

async function handleAIRequest(text, playerName) {
    app.ai.updateMapContext(app.map.getMapDescription());
    const response = await app.ai.generateResponse(text, playerName);
    processAIResponse(response, true);
}

async function startCampaign() {
    if (!app.ai.apiKey) { addSystemMessage('⚠️ API ключ не установлен!'); return; }

    // Set characters for AI context
    const chars = Object.values(app.players).map(p => ({
        name: p.name,
        race: p.charData?.race || 'Человек',
        class: p.charData?.class || 'Воин',
        background: p.charData?.background || 'Странник',
        stats: p.charData?.stats || { STR:10, DEX:10, CON:10, INT:10, WIS:10, CHA:10 }
    }));
    app.ai.setCharacters(chars);

    addSystemMessage('🧙 Мастер начинает кампанию...');
    const response = await app.ai.startCampaign(chars.map(c => c.name));
    processAIResponse(response, true);
}

function processAIResponse(text, shouldBroadcast) {
    // Parse dice rolls
    let processed = parseAIRoll(text);

    // Parse choices
    const choices = parseAIChoices(text);
    // Remove [CHOICE: ...] from display text
    processed = processed.replace(/\[CHOICE:\s*[^\]]+\]/gi, '');

    // Parse moves
    const moves = parseAIMoves(text);
    processed = processed.replace(/\[MOVE:\s*\S+\s+\d+\s+\d+\]/gi, '');

    // Parse map
    const aiMap = parseAIMap(text);
    processed = processed.replace(/\[MAP_START\][\s\S]*?\[MAP_END\]/gi, '');

    // Apply moves
    for (const move of moves) {
        // Find player by name
        for (const [id, p] of Object.entries(app.players)) {
            if (p.name.toLowerCase().includes(move.name.toLowerCase())) {
                app.map.setPlayerPosition(id, move.x, move.y);
                app.network.publish('move', { playerId: id, x: move.x, y: move.y });
                break;
            }
        }
    }

    // Apply map
    if (aiMap) {
        app.map.setMapFromAI(aiMap);
        app.network.publish('map', { map: app.map.map });
        addSystemMessage('🗺️ Карта создана Мастером!');
    }

    // Show choices
    if (choices.length > 0) {
        showChoices(choices);
    }

    // Display message
    addDMMessage(processed);

    // Broadcast
    if (shouldBroadcast) {
        app.network.publish('ai', { text: processed });
    }
}

function showChoices(choices) {
    const panel = document.getElementById('choicesPanel');
    const list = document.getElementById('choicesList');
    list.innerHTML = '';
    panel.classList.remove('hidden');

    choices.forEach((choice, i) => {
        const btn = document.createElement('button');
        btn.className = 'choice-btn';
        btn.textContent = `${i+1}. ${choice}`;
        btn.addEventListener('click', () => {
            // Send choice as chat message
            addChatMessage(app.myName, choice, app.myColor);
            app.network.publish('chat', { name: app.myName, text: choice, color: app.myColor });
            if (app.ai.apiKey) {
                if (app.isHost) handleAIRequest(choice, app.myName);
                else app.network.publish('request-ai', { text: choice, playerName: app.myName });
            }
            panel.classList.add('hidden');
        });
        list.appendChild(btn);
    });
}

// ===== VOICE CHAT =====
async function toggleVoice() {
    const panel = document.getElementById('voicePanel');
    const btn = document.getElementById('toggleVoice');

    if (app.voiceEnabled) {
        app.voiceEnabled = false;
        panel.classList.add('hidden');
        btn.classList.remove('active');
        if (app.voiceStream) { app.voiceStream.getTracks().forEach(t => t.stop()); app.voiceStream = null; }
        addSystemMessage('🎤 Голосовой чат выключен');
    } else {
        try {
            app.voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            app.voiceEnabled = true;
            panel.classList.remove('hidden');
            btn.classList.add('active');
            addSystemMessage('🎤 Голосовой чат включён! Нажмите 🎙️ чтобы выключить/включить микрофон.');

            // Setup audio analyser for speaking detection
            app.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = app.audioContext.createMediaStreamSource(app.voiceStream);
            app.analyser = app.audioContext.createAnalyser();
            app.analyser.fftSize = 256;
            source.connect(app.analyser);

            // Monitor speaking
            detectSpeaking();

            // Update voice users
            updateVoiceUsers();

            // Broadcast voice signal
            app.network.publish('voice-signal', { type: 'voice-on', playerId: app.myPlayerId, name: app.myName });
        } catch (e) {
            addSystemMessage('❌ Нет доступа к микрофону: ' + e.message);
        }
    }
}

function toggleMic() {
    app.micEnabled = !app.micEnabled;
    const btn = document.getElementById('toggleMic');
    btn.classList.toggle('mic-on', app.micEnabled);
    btn.classList.toggle('mic-off', !app.micEnabled);
    if (app.voiceStream) {
        app.voiceStream.getAudioTracks().forEach(t => t.enabled = app.micEnabled);
    }
    addSystemMessage(app.micEnabled ? '🎙️ Микрофон включён' : '🔇 Микрофон выключен');
}

function detectSpeaking() {
    if (!app.voiceEnabled || !app.analyser) return;
    const data = new Uint8Array(app.analyser.frequencyBinCount);
    app.analyser.getByteFrequencyData(data);
    const avg = data.reduce((a,b) => a+b, 0) / data.length;
    const isSpeaking = avg > 15;

    // Update my voice indicator
    const myVoiceUser = document.querySelector(`[data-voice-id="${app.myPlayerId}"]`);
    if (myVoiceUser) myVoiceUser.classList.toggle('speaking', isSpeaking && app.micEnabled);

    // Broadcast speaking state
    if (Math.random() < 0.1) { // Throttle broadcasts
        app.network.publish('voice-signal', { type: 'speaking', playerId: app.myPlayerId, speaking: isSpeaking && app.micEnabled });
    }

    requestAnimationFrame(detectSpeaking);
}

function updateVoiceUsers() {
    const container = document.getElementById('voiceUsers');
    container.innerHTML = '';
    for (const [id, p] of Object.entries(app.players)) {
        const div = document.createElement('div');
        div.className = 'voice-user';
        div.dataset.voiceId = id;
        div.innerHTML = `<span class="player-dot" style="background:${p.color}"></span>${p.name}`;
        container.appendChild(div);
    }
}

function handleVoiceSignal(msg) {
    if (msg.type === 'voice-on') {
        addSystemMessage('🎤 ' + msg.name + ' включил голосовой чат');
        updateVoiceUsers();
    } else if (msg.type === 'speaking') {
        const el = document.querySelector(`[data-voice-id="${msg.playerId}"]`);
        if (el) el.classList.toggle('speaking', msg.speaking);
    }
}

// ===== CHAT UI =====
function addChatMessage(name, text, color) {
    const c = document.getElementById('chatMessages');
    const d = document.createElement('div');
    d.className = 'chat-msg player';
    d.innerHTML = `<span class="msg-author" style="color:${color}">${name}:</span>${escapeHTML(text)}`;
    c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function addDMMessage(text) {
    const c = document.getElementById('chatMessages');
    const d = document.createElement('div');
    d.className = 'chat-msg dm';
    d.innerHTML = `<span class="dm-label">🧙 Мастер:</span> ${text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>').replace(/\n/g,'<br>')}`;
    c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function addSystemMessage(text) {
    const c = document.getElementById('chatMessages');
    const d = document.createElement('div');
    d.className = 'chat-msg system';
    d.textContent = text;
    c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function addDiceMessage(text) {
    const c = document.getElementById('chatMessages');
    const d = document.createElement('div');
    d.className = 'chat-msg dice';
    d.innerHTML = text.replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>');
    c.appendChild(d); c.scrollTop = c.scrollHeight;
}

function escapeHTML(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
