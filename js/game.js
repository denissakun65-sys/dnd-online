// ===== game.js — Main game controller =====

const app = {
    network: null,
    map: null,
    ai: null,
    myName: '',
    myColor: '#e74c3c',
    myPlayerId: '',
    isHost: false,
    isSolo: false,
    roomCode: '',
    players: {},
    playerOrder: [],
    firstInRoom: true
};

document.addEventListener('DOMContentLoaded', () => {
    // Load session data
    const mode = sessionStorage.getItem('dnd-mode');
    if (!mode) {
        window.location.href = 'lobby.html';
        return;
    }

    app.myName = sessionStorage.getItem('dnd-name') || 'Герой';
    app.myColor = sessionStorage.getItem('dnd-color') || '#e74c3c';
    app.roomCode = sessionStorage.getItem('dnd-room') || 'solo';
    app.isSolo = mode === 'solo';

    // Init modules
    app.map = new GameMap(document.getElementById('mapCanvas'));
    app.ai = new AI_DM();
    app.ai.setProvider(sessionStorage.getItem('dnd-provider') || 'groq');
    app.ai.setApiKey(sessionStorage.getItem('dnd-apikey') || '');

    // Map callbacks
    app.map.onMapChange = () => {
        app.network.publish('map', { map: app.map.map });
    };
    app.map.onPlayerMove = (playerId, x, y) => {
        app.map.revealFog(playerId);
        app.network.publish('move', { playerId, x, y });
        app.ai.updateMapContext(app.map.getMapDescription());
    };

    // AI typing callback
    app.ai.onTyping = (isTyping) => {
        let el = document.querySelector('.typing-indicator');
        if (el) {
            el.classList.toggle('visible', isTyping);
        } else if (isTyping) {
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
        if (!app.map.fogEnabled) {
            for (let y = 0; y < app.map.gridSize; y++)
                for (let x = 0; x < app.map.gridSize; x++)
                    app.map.fogMap[y][x] = false;
        }
        app.map.render();
    });

    document.getElementById('clearMap').addEventListener('click', () => {
        app.map.clearMap();
        app.network.publish('map', { map: app.map.map });
    });

    document.getElementById('fillFloor').addEventListener('click', () => {
        app.map.fillFloor();
        app.network.publish('map', { map: app.map.map });
    });

    document.getElementById('copyCode').addEventListener('click', () => {
        const code = document.getElementById('roomDisplay').textContent;
        navigator.clipboard.writeText(code).then(() => addSystemMessage('Код скопирован: ' + code));
    });

    // Chat
    document.getElementById('chatSend').addEventListener('click', () => sendChat());
    document.getElementById('chatInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendChat();
    });

    // Connect network
    app.network = new MqttNetwork();

    app.network.onConnect = () => {
        addSystemMessage('✅ Подключено к комнате: ' + app.roomCode.toUpperCase());
        addSystemMessage('ЛКМ — рисовать карту, ПКМ — двигать токен. Колёсико — зум.');

        // Add myself
        addPlayer(app.myPlayerId, app.myName, app.myColor, app.isHost);
        app.map.myPlayerId = app.myPlayerId;
        app.map.isHost = app.isHost;

        document.getElementById('roomDisplay').textContent = app.roomCode.toUpperCase();

        if (app.isSolo) {
            document.getElementById('modeLabel').textContent = '⚔️ Одиночка';
            document.getElementById('modeLabel').style.display = 'inline-block';
        } else {
            document.getElementById('modeLabel').textContent = '👥 Онлайн';
            document.getElementById('modeLabel').style.display = 'inline-block';
        }

        updateConnectionCount();

        // Start AI campaign
        if (app.ai.apiKey && app.isHost) {
            addSystemMessage('🧙 Мастер начинает кампанию...');
            setTimeout(() => startCampaign(), 1000);
        } else if (!app.ai.apiKey) {
            addSystemMessage('⚠️ API ключ не введён — ИИ Ведущий недоступен.');
        }
    };

    app.network.onError = (err) => {
        addSystemMessage('❌ ' + err);
    };

    app.network.onMessage = (msg) => {
        handleNetMessage(msg);
    };

    // Start connection
    if (app.isSolo) {
        app.network.connectSolo();
        app.myPlayerId = app.network.myId;
        app.isHost = true;
        app.network.onConnect(); // Solo connects immediately
    } else {
        app.myPlayerId = app.network.generateId();
        // Determine host: first player in room
        // We'll use a simple approach: if no one responds to a "ping" within 2 seconds, we're host
        app.isHost = false;
        app.network.connect(app.roomCode, app.myName, app.myColor);

        // Host detection: wait 2 seconds for others, if no one else is here → we're host
        setTimeout(() => {
            if (Object.keys(app.players).length <= 1) {
                app.isHost = true;
                app.map.isHost = true;
                updatePlayersList();
                if (app.ai.apiKey) {
                    addSystemMessage('👑 Вы — хост комнаты!');
                    addSystemMessage('🧙 Мастер начинает кампанию...');
                    setTimeout(() => startCampaign(), 1000);
                }
            }
        }, 2500);
    }
});

// ===== NETWORK MESSAGE HANDLING =====
function handleNetMessage(msg) {
    if (msg.from === app.myPlayerId) return; // Ignore own messages

    switch (msg.type) {
        case 'join':
            addPlayer(msg.playerId, msg.name, msg.color, false);
            addSystemMessage(msg.name + ' присоединился!');
            updateConnectionCount();

            // If host, send current state
            if (app.isHost) {
                setTimeout(() => {
                    app.network.publish('state', {
                        map: app.map.map,
                        players: app.map.players,
                        targetPlayer: msg.playerId
                    });
                }, 500);
            }
            break;

        case 'leave':
            if (app.players[msg.playerId]) {
                const name = app.players[msg.playerId].name;
                removePlayer(msg.playerId);
                addSystemMessage(name + ' покинул игру.');
                updateConnectionCount();
            }
            break;

        case 'state':
            // Full state sync (for new players)
            if (!app.isHost && msg.targetPlayer === app.myPlayerId) {
                if (msg.map) app.map.setMapData(msg.map);
                if (msg.players) {
                    for (const [id, p] of Object.entries(msg.players)) {
                        if (!app.players[id]) {
                            app.map.players[id] = p;
                            app.players[id] = { name: p.name, color: p.color };
                        }
                    }
                    app.map.render();
                }
                addSystemMessage('📥 Данные комнаты загружены!');
            }
            break;

        case 'move':
            app.map.setPlayerPosition(msg.playerId, msg.x, msg.y);
            break;

        case 'map':
            if (!app.isHost) {
                app.map.setMapData(msg.map);
            }
            break;

        case 'chat':
            addChatMessage(msg.name, msg.text, msg.color);
            break;

        case 'ai':
            addDMMessage(msg.text);
            break;

        case 'dice':
            addDiceMessage(msg.text);
            break;

        case 'request-ai':
            if (app.isHost) {
                handleAIRequest(msg.text, msg.playerName);
            }
            break;
    }
}

// ===== PLAYER MANAGEMENT =====
function addPlayer(id, name, color, isHost) {
    app.players[id] = { name, color, isHost };
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
        div.innerHTML = `<span class="player-dot" style="background:${p.color}"></span><span>${p.name}</span>${p.isHost ? '<span class="player-host">👑 Хост</span>' : ''}`;
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

    // Dice
    if (text.toLowerCase().startsWith('/roll ') || text.toLowerCase().startsWith('/r ')) {
        const notation = text.replace(/^\/(roll|r)\s+/i, '');
        const result = rollDice(notation);
        const msgText = formatDiceResult(result, app.myName);
        addDiceMessage(msgText);
        app.network.publish('dice', { text: msgText, name: app.myName });
        return;
    }

    if (text.toLowerCase() === '/help') {
        addSystemMessage('/roll 1d20+5 — бросить кубик, /start — начать кампанию');
        return;
    }
    if (text.toLowerCase() === '/start') { startCampaign(); return; }

    // Chat message
    addChatMessage(app.myName, text, app.myColor);
    app.network.publish('chat', { name: app.myName, text, color: app.myColor });

    // AI
    if (app.ai.apiKey) {
        if (app.isHost) {
            handleAIRequest(text, app.myName);
        } else {
            app.network.publish('request-ai', { text, playerName: app.myName });
        }
    }
}

async function handleAIRequest(text, playerName) {
    app.ai.updateMapContext(app.map.getMapDescription());
    const response = await app.ai.generateResponse(text, playerName);
    const parsed = parseAIRoll(response);
    addDMMessage(parsed.text);
    app.network.publish('ai', { text: parsed.text });
}

async function startCampaign() {
    if (!app.ai.apiKey) { addSystemMessage('⚠️ API ключ не установлен!'); return; }
    const names = Object.values(app.players).map(p => p.name);
    addSystemMessage('🧙 Мастер начинает кампанию...');
    const response = await app.ai.startCampaign(names);
    const parsed = parseAIRoll(response);
    addDMMessage(parsed.text);
    app.network.publish('ai', { text: parsed.text });
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
