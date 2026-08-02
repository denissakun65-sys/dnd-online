// ===== game.js — Main game controller with working choices =====

const app = {
    network: null, map: null, ai: null,
    myName: '', myColor: '#e74c3c', myPlayerId: '',
    isHost: false, isSolo: false, roomCode: '',
    players: {}, playerOrder: [],
    charData: null, campaignTheme: '',
    voiceEnabled: false, micEnabled: true,
    voiceStream: null, audioContext: null, analyser: null,
    tutorialStep: 0, aiBusy: false
};

const TUTORIAL = [
    { title: '⚔️ Добро пожаловать в D&D Online!', text: 'Это игра в Dungeons & Dragons с ИИ Мастером Подземелий. Я расскажу, как всё работает!', icon: '🎮' },
    { title: '🗺️ Карта', text: 'Слева — карта мира. Ваш токен — цветной кружок с подсветкой. ЛКМ — переместить персонажа. Колёсико — зум. Ctrl+ЛКМ — камера.', icon: '🗺️' },
    { title: '🧙 ИИ Ведущий', text: 'Мастер описывает мир и управляет NPC. Он видит карту и знает, где вы. Мастер может перемещать ваш токен.', icon: '🧙' },
    { title: '💬 Чат', text: 'Пишите действия: "Осматриваю комнату", "Атакую гоблина", "Пробую открыть дверь". ИИ ответит и бросит кубики если нужно.', icon: '💬' },
    { title: '⚔️ Выборы', text: 'ИИ предложит варианты действий — кликните на вариант. Или напишите свой вариант в чат!', icon: '⚔️' },
    { title: '🎲 Кубики', text: '/roll 1d20+5 — бросить кубик. ИИ тоже бросает автоматически когда нужно!', icon: '🎲' },
    { title: '🗺️ Редактирование карты', text: 'Кнопка "🗺️ Карта" — инструменты рисования. "🎲 Генерация" — случайная карта.', icon: '🗺️' },
    { title: '🎤 Голосовой чат', text: 'Кнопка "🎤 Голос" — голосовой чат с друзьями. 🎙️ — вкл/выкл микрофон.', icon: '🎤' },
    { title: '🌫️ Туман войны', text: 'Кнопка "🌫️ Туман" — скрывает неисследованные области. Открывается по мере движения.', icon: '🌫️' },
    { title: '✅ Готово!', text: 'Пишите действия в чат, и приключение начнётся! /help — помощь, /tutorial — обучение. Удачи! 🎲', icon: '🎉' }
];

document.addEventListener('DOMContentLoaded', () => {
    const mode = sessionStorage.getItem('dnd-mode');
    if (!mode) { window.location.href = 'lobby.html'; return; }

    const charJson = sessionStorage.getItem('dnd-char');
    app.charData = charJson ? JSON.parse(charJson) : null;
    app.myName = app.charData ? app.charData.name : 'Герой';
    app.myColor = app.charData ? app.charData.color : '#e74c3c';
    app.roomCode = sessionStorage.getItem('dnd-room') || 'solo';
    app.isSolo = mode === 'solo';
    app.campaignTheme = sessionStorage.getItem('dnd-campaign') || 'custom';

    app.map = new GameMap(document.getElementById('mapCanvas'));
    app.ai = new AI_DM();
    app.ai.setProvider(sessionStorage.getItem('dnd-provider') || 'groq');
    app.ai.setApiKey(sessionStorage.getItem('dnd-apikey') || '');
    app.ai.setCampaign(app.campaignTheme);

    app.map.onMapChange = () => app.network.publish('map', { map: app.map.map });
    app.map.onPlayerMove = (playerId, x, y) => {
        app.map.revealFog(playerId);
        app.network.publish('move', { playerId, x, y });
        app.ai.updateMapContext(app.map.getMapDescription());
    };

    app.ai.onTyping = (isTyping) => {
        app.aiBusy = isTyping;
        let el = document.querySelector('.typing-indicator');
        if (el) el.classList.toggle('visible', isTyping);
        else if (isTyping) {
            el = document.createElement('div');
            el.className = 'typing-indicator visible';
            el.textContent = '🧙 Мастер думает...';
            document.querySelector('.chat-panel').insertBefore(el, document.querySelector('.chat-input-area'));
        }
        // Disable input while AI is thinking
        const input = document.getElementById('chatInput');
        const sendBtn = document.getElementById('chatSend');
        if (isTyping) {
            input.placeholder = '🧙 Мастер думает... подождите...';
            input.disabled = true;
            sendBtn.disabled = true;
        } else {
            input.placeholder = 'Действие или /roll 1d20... (/help — помощь)';
            input.disabled = false;
            sendBtn.disabled = false;
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
        if (!app.map.fogEnabled) { for (let y=0;y<app.map.gridH;y++) for (let x=0;x<app.map.gridW;x++) app.map.fogMap[y][x]=false; }
        app.map.render();
    });

    document.getElementById('clearMap').addEventListener('click', () => { app.map.clearMap(); app.network.publish('map', { map: app.map.map }); });
    document.getElementById('fillFloor').addEventListener('click', () => { app.map.fillFloor(); app.network.publish('map', { map: app.map.map }); });
    document.getElementById('copyCode').addEventListener('click', () => { const c=document.getElementById('roomDisplay').textContent; navigator.clipboard.writeText(c).then(()=>addSystemMessage('Код скопирован: '+c)); });

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

    document.getElementById('toggleVoice').addEventListener('click', toggleVoice);
    document.getElementById('toggleMic').addEventListener('click', toggleMic);

    document.getElementById('chatSend').addEventListener('click', () => sendChat());
    document.getElementById('chatInput').addEventListener('keydown', e => { if (e.key==='Enter') sendChat(); });

    // Tutorial buttons
    document.getElementById('tutorialPrev').addEventListener('click', () => { app.tutorialStep--; updateTutorialStep(); });
    document.getElementById('tutorialNext').addEventListener('click', () => { app.tutorialStep++; if (app.tutorialStep >= TUTORIAL.length) hideTutorial(); else updateTutorialStep(); });
    document.getElementById('tutorialSkip').addEventListener('click', hideTutorial);

    // Network
    app.network = new MqttNetwork();

    app.network.onConnect = () => {
        addSystemMessage('✅ Подключено к комнате: ' + app.roomCode.toUpperCase());
        addPlayer(app.myPlayerId, app.myName, app.myColor, app.isHost, app.charData);
        app.map.myPlayerId = app.myPlayerId;
        app.map.isHost = app.isHost;

        document.getElementById('roomDisplay').textContent = app.roomCode.toUpperCase();
        document.getElementById('modeLabel').textContent = app.isSolo ? '⚔️ Одиночка' : '👥 Онлайн';
        document.getElementById('modeLabel').style.display = 'inline-block';
        updateConnectionCount();

        const mapStyle = sessionStorage.getItem('dnd-mapstyle') || 'auto';
        if (mapStyle === 'random') {
            const types = ['dungeon','cave','forest','tavern','castle','temple','village','island'];
            app.map.generate(types[Math.floor(Math.random()*types.length)]);
            addSystemMessage('🎲 Случайная карта сгенерирована');
        } else if (mapStyle === 'auto') {
            const camp = AI_DM.CAMPAIGNS[app.campaignTheme];
            if (camp && camp.mapType) {
                app.map.generate(camp.mapType);
                addSystemMessage(`🗺️ Карта "${camp.name}" создана`);
            }
        }

        showTutorial();
    };

    app.network.onError = (err) => addSystemMessage('❌ ' + err);
    app.network.onMessage = (msg) => handleNetMessage(msg);

    if (app.isSolo) {
        app.network.connectSolo();
        app.myPlayerId = app.network.myId;
        app.isHost = true;
        app.network.onConnect();
    } else {
        app.myPlayerId = app.network.generateId();
        app.isHost = false;
        app.network.connect(app.roomCode, app.myName, app.myColor);
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

// ===== TUTORIAL =====
function showTutorial() {
    const overlay = document.getElementById('tutorialOverlay');
    if (!overlay) return;
    app.tutorialStep = 0;
    overlay.classList.remove('hidden');
    updateTutorialStep();
}

function updateTutorialStep() {
    const step = TUTORIAL[app.tutorialStep];
    if (!step) { hideTutorial(); return; }
    document.getElementById('tutorialIcon').textContent = step.icon;
    document.getElementById('tutorialTitle').textContent = step.title;
    document.getElementById('tutorialText').textContent = step.text;
    document.getElementById('tutorialProgress').textContent = `${app.tutorialStep + 1}/${TUTORIAL.length}`;
    document.getElementById('tutorialPrev').style.visibility = app.tutorialStep === 0 ? 'hidden' : 'visible';
    document.getElementById('tutorialNext').textContent = app.tutorialStep === TUTORIAL.length - 1 ? '🎮 Начать!' : 'Далее →';
}

function hideTutorial() {
    document.getElementById('tutorialOverlay').classList.add('hidden');
    if (app.ai.apiKey && app.isHost) {
        addSystemMessage('🧙 Мастер начинает кампанию...');
        setTimeout(() => startCampaign(), 800);
    }
}

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
        const avatarUrl = p.charData?.avatarUrl || '';
        div.innerHTML = avatarUrl
            ? `<img src="${avatarUrl}" alt="" onerror="this.style.display='none'"> <span>${p.name}</span>${charInfo}${hostBadge}`
            : `<span class="player-dot" style="background:${p.color}"></span><span>${p.name}</span>${charInfo}${hostBadge}`;
        list.appendChild(div);
    }
}

function updateConnectionCount() {
    const count = Object.keys(app.players).length;
    document.getElementById('connectionCount').textContent = app.isSolo ? '1' : `${count}/4`;
}

// ===== CHAT & AI =====
function sendChat() {
    if (app.aiBusy) return; // Don't send while AI is thinking
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
    if (text.toLowerCase() === '/help') {
        addSystemMessage('📖 Команды: /roll 1d20+5 — бросить кубик, /start — начать кампанию, /tutorial — обучение');
        addSystemMessage('💡 Просто пишите действия в чат — ИИ Ведущий ответит!');
        return;
    }
    if (text.toLowerCase() === '/start') { startCampaign(); return; }
    if (text.toLowerCase() === '/tutorial') { showTutorial(); return; }

    // Send action to AI
    addChatMessage(app.myName, text, app.myColor);
    app.network.publish('chat', { name: app.myName, text, color: app.myColor });

    if (app.ai.apiKey) {
        if (app.isHost) {
            handleAIRequest(text, app.myName);
        } else {
            app.network.publish('request-ai', { text, playerName: app.myName });
        }
    }
}

async function handleAIRequest(text, playerName) {
    if (app.aiBusy) {
        addSystemMessage('⏳ Мастер ещё думает, подождите...');
        return;
    }

    app.ai.updateMapContext(app.map.getMapDescription());

    try {
        const response = await app.ai.generateResponse(text, playerName);
        processAIResponse(response, true);
    } catch (err) {
        addSystemMessage('❌ Ошибка ИИ: ' + err.message);
    }
}

async function startCampaign() {
    if (!app.ai.apiKey) { addSystemMessage('⚠️ API ключ не установлен!'); return; }
    if (app.aiBusy) { addSystemMessage('⏳ Мастер ещё думает...'); return; }

    const chars = Object.values(app.players).map(p => ({
        name: p.name,
        race: p.charData?.race || 'Человек',
        class: p.charData?.class || 'Воин',
        background: p.charData?.background || 'Странник',
        stats: p.charData?.stats || { STR:10, DEX:10, CON:10, INT:10, WIS:10, CHA:10 }
    }));
    app.ai.setCharacters(chars);

    addSystemMessage('🧙 Мастер начинает кампанию...');

    try {
        const response = await app.ai.startCampaign(chars.map(c => c.name));
        processAIResponse(response, true);
    } catch (err) {
        addSystemMessage('❌ Ошибка ИИ: ' + err.message);
    }
}

function processAIResponse(text, shouldBroadcast) {
    if (!text) return;

    // Parse dice rolls
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

    // Show DM message
    addDMMessage(processed);

    // Show choices AFTER the message
    if (choices.length > 0) {
        showChoices(choices);
    } else {
        // If no [CHOICE:] tags, try to extract choices from numbered lists
        const autoChoices = extractAutoChoices(text);
        if (autoChoices.length >= 2) {
            showChoices(autoChoices);
        }
    }

    // Broadcast to other players
    if (shouldBroadcast) {
        app.network.publish('ai', { text: processed });
    }
}

// Fallback: extract choices from numbered lists like "1. Атаковать" or "- Атаковать"
function extractAutoChoices(text) {
    const choices = [];
    // Match "1. текст" or "1) текст" patterns
    const regex = /(?:^|\n)\s*(\d+)[.)]\s*(.+)/gm;
    let match;
    while ((match = regex.exec(text)) !== null) {
        const choice = match[2].trim();
        if (choice.length > 3 && choice.length < 100) {
            choices.push(choice);
        }
    }
    return choices.slice(0, 4); // Max 4 choices
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
            // Hide choices immediately
            panel.classList.add('hidden');

            // Show the choice in chat
            addChatMessage(app.myName, choice, app.myColor);
            app.network.publish('chat', { name: app.myName, text: choice, color: app.myColor });

            // Send to AI
            if (app.ai.apiKey) {
                addSystemMessage('🧙 Мастер реагирует...');
                if (app.isHost) {
                    handleAIRequest(choice, app.myName);
                } else {
                    app.network.publish('request-ai', { text: choice, playerName: app.myName });
                }
            }
        });
        list.appendChild(btn);
    });
}

// ===== VOICE =====
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
            addSystemMessage('🎤 Голосовой чат включён! 🎙️ — вкл/выкл микрофон.');
            app.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = app.audioContext.createMediaStreamSource(app.voiceStream);
            app.analyser = app.audioContext.createAnalyser();
            app.analyser.fftSize = 256;
            source.connect(app.analyser);
            detectSpeaking();
            updateVoiceUsers();
            app.network.publish('voice-signal', { type: 'voice-on', playerId: app.myPlayerId, name: app.myName });
        } catch (e) { addSystemMessage('❌ Нет доступа к микрофону: ' + e.message); }
    }
}

function toggleMic() {
    app.micEnabled = !app.micEnabled;
    const btn = document.getElementById('toggleMic');
    btn.classList.toggle('mic-on', app.micEnabled);
    btn.classList.toggle('mic-off', !app.micEnabled);
    if (app.voiceStream) app.voiceStream.getAudioTracks().forEach(t => t.enabled = app.micEnabled);
    addSystemMessage(app.micEnabled ? '🎙️ Микрофон включён' : '🔇 Микрофон выключен');
}

function detectSpeaking() {
    if (!app.voiceEnabled || !app.analyser) return;
    const data = new Uint8Array(app.analyser.frequencyBinCount);
    app.analyser.getByteFrequencyData(data);
    const avg = data.reduce((a,b) => a+b, 0) / data.length;
    const isSpeaking = avg > 15;
    const myVoiceUser = document.querySelector(`[data-voice-id="${app.myPlayerId}"]`);
    if (myVoiceUser) myVoiceUser.classList.toggle('speaking', isSpeaking && app.micEnabled);
    if (Math.random() < 0.1) app.network.publish('voice-signal', { type: 'speaking', playerId: app.myPlayerId, speaking: isSpeaking && app.micEnabled });
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
    if (msg.type === 'voice-on') { addSystemMessage('🎤 ' + msg.name + ' включил голосовой чат'); updateVoiceUsers(); }
    else if (msg.type === 'speaking') { const el = document.querySelector(`[data-voice-id="${msg.playerId}"]`); if (el) el.classList.toggle('speaking', msg.speaking); }
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
