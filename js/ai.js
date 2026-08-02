// ===== ai.js — AI Dungeon Master (campaign-synced) =====

class AI_DM {
    constructor() {
        this.provider = 'groq';
        this.apiKey = '';
        this.history = [];
        this.maxHistory = 50;
        this.isGenerating = false;
        this.onTyping = null;
        this.campaignTheme = '';
        this.characters = [];
        this.mapContext = '';
    }

    setProvider(p) { this.provider = p; }
    setApiKey(k) { this.apiKey = k; }
    setCampaign(theme) { this.campaignTheme = theme; }
    setCharacters(chars) { this.characters = chars; }

    updateMapContext(desc) {
        this.mapContext = desc || '';
    }

    static CAMPAIGNS = {
        dark_castle: {
            name: '🏰 Проклятие Тёмного Замка',
            desc: 'Столетия назад лорд Крелл заключил сделку с тёмными силами. Его замок стал проклят, а все жители исчезли. Теперь зловещий свет горит в окнах башни, и пропадают путники. Вы — группа смельчаков, нанятая деревней, чтобы проникнуть в замок и снять проклятие.',
            backstory: 'Каждый из вас потерял кого-то из-за проклятия замка — кого-то утащила тень, кто-то пропал на дороге. Вы объединились, чтобы покончить с этим злом раз и навсегда.',
            mapType: 'castle',
            mapDesc: 'Тёмный замок с залами, тронным залом, подземельем и башней. Стены, двери, трон, сундуки, ловушки.',
            atmosphere: 'готический замок, проклятие, тени, тёмная магия',
            npcs: 'Призраки, скелеты, зомби, тени, культисты, вампиры, рыцари смерти, лорд Крелл (босс-нежить). Используй [NPC: Призрак_1 enemy X Y], [NPC: Лорд_Крелл boss X Y], [NPC: Культист neutral X Y]',
            encounters: 'Тени скользят по стенам. Двери открываются сами. Шёпот из пустых комнат. Ловушки активируются прикосновением. Культисты проводят ритуалы в подвале.'
        },
        dragon_lair: {
            name: '🐉 Хранилище Дракона',
            desc: 'Красный дракон Вермитракс обосновался в вулканической горе и собирает несметные сокровища. Король обещал полцарства тому, кто вернёт Артефакт Вечного Пламени.',
            backstory: 'Артефакт Вечного Пламени — единственное, что может спасти ваш город от ледяного проклятия. Без него всё замёрзнет в течение месяца.',
            mapType: 'cave',
            mapDesc: 'Вулканическая пещера с лавовыми озёрами, тоннелями, мостами и залом дракона. Много лавы, сундуков.',
            atmosphere: 'вулканическая пещера, лава, жар, дракон, сокровища',
            npcs: 'Кобольды-прислужники, огненные элементали, саламандры, адские гончие, Вермитракс (босс-дракон). Используй [NPC: Кобольд_1 enemy X Y], [NPC: Вермитракс boss X Y], [NPC: Огненный_элементаль enemy X Y]',
            encounters: 'Жар от лавовых озёр. Кобольды устраивают засады. Мосты через пропасти. Сокровища охраняются ловушками. Дракон спит на горе золота.'
        },
        lost_temple: {
            name: '🏛️ Тайна Забытого Храма',
            desc: 'Древний храм богини Селунэ скрыт в джунглях. Говорят, там хранится источник вечной молодости. Но храм охраняют проклятые стражи и загадки.',
            backstory: 'Ваша наставница умерла при загадочных обстоятельствах. Перед смертью она передала вам карту: "Не дайте им первыми добраться до источника..."',
            mapType: 'temple',
            mapDesc: 'Древний храм в форме креста с колоннами, алтарём, ловушками, секретными комнатами. Лава в ритуальных зонах.',
            atmosphere: 'древний храм, джунгли, загадки, стражи, магия',
            npcs: 'Каменные големы-стражи, мумии, культисты Селунэ, жрицы, проклятые авантюристы, Архижрица (босс). Используй [NPC: Голем_страж enemy X Y], [NPC: Мумия enemy X Y], [NPC: Архижрица boss X Y], [NPC: Жрица ally X Y]',
            encounters: 'Загадки на стенах. Ловушки нажимные плиты. Двери открываются только загадками. Мумии в саркофагах. Священный источник в центре.'
        },
        tavern: {
            name: '🍺 Таверна на Перекрёстке',
            desc: 'Таверна "Последний Приют" стоит на перекрёстке всех дорог. Но этой ночью разразилась буря, и в таверне произошло убийство. Убийца среди вас.',
            backstory: 'Вы заперты вместе с убийцей. Нужно найти его до рассвета — или следующей жертвой станете вы.',
            mapType: 'tavern',
            mapDesc: 'Таверна с главным залом, барной стойкой, кухней, комнатами, подвалом. Столы, кровати, сундуки, камин.',
            atmosphere: 'таверна, детектив, убийство, буря, подозрения',
            npcs: 'Трактирщик, подозрительные гости, бард, стражник, торговец, убийца (скрытый). Используй [NPC: Трактирщик neutral X Y], [NPC: Бард ally X Y], [NPC: Подозрительный_гость enemy X Y]',
            encounters: 'Гости подозревают друг друга. Улики скрыты в комнатах. Буря отрезала пути к бегству. Кто-то лжёт. Каждый что-то скрывает.'
        },
        mad_mage: {
            name: '🧙 Подземелья Безумного Мага',
            desc: 'Архимаг Терион сошёл с ума и превратил свою башню в лабиринт ловушек, монстров и извращённых экспериментов.',
            backstory: 'Терион когда-то был вашим учителем. Вы — его бывшие ученики, единственные, кто знает его магию. Но готовы ли вы убить наставника?',
            mapType: 'dungeon',
            mapDesc: 'Лабиринт подземелий с комнатами-ловушками, лабораториями, библиотекой, темницей. Много ловушек, двери, сундуки.',
            atmosphere: 'безумный маг, лабиринт, ловушки, эксперименты, хаос',
            npcs: 'Големы-стражи, мутировавшие твари, заколдованные слуги, иллюзии, АрхиТерион (босс-маг). Используй [NPC: Голем_1 enemy X Y], [NPC: Мутант enemy X Y], [NPC: Архимаг_Терион boss X Y], [NPC: Заколдованный_слуга neutral X Y]',
            encounters: 'Ловушки на каждом шагу. Комнаты-головоломки. Мутанты в лабораториях. Иллюзии обманывают. Книги прокляты.'
        },
        haunted_forest: {
            name: '🌲 Проклятый Лес',
            desc: 'Чёрный Лес Шэдоукуст живёт своей жизнью. Деревья шепчутся, тени движутся, а те кто заходит слишком глубоко — никогда не возвращаются.',
            backstory: 'Ваш город отравлен. Чума убивает по сотне человек в день. Противоядие — Цветок Лунного Света, который растёт только в сердце Проклятого Леса.',
            mapType: 'forest',
            mapDesc: 'Густой тёмный лес с тропами, полянами, озером, хижиной. Много деревьев, вода, мосты, ловушки.',
            atmosphere: 'проклятый лес, тени, шёпот деревьев, чума, отчаяние',
            npcs: 'Волки, тени, феи-обманщицы, проклятые друиды, Вендиго, Хозяин Леса (босс-туман). Используй [NPC: Волк_1 enemy X Y], [NPC: Тень enemy X Y], [NPC: Фея neutral X Y], [NPC: Хозяин_Леса boss X Y], [NPC: Друид ally X Y]',
            encounters: 'Деревья двигаются. Тропы меняются. Тени нападают из-за деревьев. Феи заманивают в ловушки. Озеро скрывает чудовище.'
        },
        pirate_island: {
            name: '🏴‍☠️ Остров Пиратов',
            desc: 'Легендарный пират Капитан Кость закопал сокровища на Острове Черепа. Но остров проклят — каждый закат мёртвые восстанут из песка.',
            backstory: 'Вы — наследники Капитана Кости, и у вас есть единственная подлинная часть карты. Но другие пираты тоже ищут клад.',
            mapType: 'island',
            mapDesc: 'Тропический остров с пляжем, пальмами, вулканом, джунглями. Песок, вода, деревья, мосты, сундук.',
            atmosphere: 'пиратский остров, проклятие, мертвецы, сокровища',
            npcs: 'Пираты-конкуренты, скелеты-пираты, крабы-монстры, Капитан_Кость (босс-нежить), попугай-фамильяр. Используй [NPC: Пират enemy X Y], [NPC: Скелет_пират enemy X Y], [NPC: Капитан_Кость boss X Y], [NPC: Попугай neutral X Y]',
            encounters: 'Пираты устраивают засады. Мертвецы встают из песка на закате. Крабы атакуют на пляже. Вулкан дымится. Сундук зарыт в пещере.'
        },
        custom: {
            name: '✨ Своя история',
            desc: 'ИИ Ведущий придумает уникальную историю специально для вашей группы.',
            backstory: '',
            mapType: 'dungeon',
            mapDesc: 'Уникальная карта, придуманная ИИ Мастером.',
            atmosphere: 'уникальная история, придуманная ИИ',
            npcs: 'Подбирай NPC подходящих к своей истории. Используй формат [NPC: имя тип X Y]',
            encounters: 'Придумай интересные встречи и события.'
        }
    };

    _buildSystemPrompt() {
        const camp = AI_DM.CAMPAIGNS[this.campaignTheme] || AI_DM.CAMPAIGNS.custom;
        return `Ты — Мастер Подземелий (Dungeon Master) в игре Dungeons & Dragons 5e. Ты ведёшь игру для группы приключенцев.

КАМПАНИЯ: ${camp.name}
АТМОСФЕРА: ${camp.atmosphere}

ПРАВИЛА:
- Отвечай НА РУССКОМ языке
- Веди увлекательную историю в стиле фэнтези, придерживаясь атмосферы "${camp.atmosphere}"
- Описывай окружение, NPC, и события ярко и атмосферно
- Когда игроки делают проверки, указывай сложность (DC) и результат
- Используй правила D&D 5e для боёв, проверок и заклинаний
- Когда нужен бросок кубика, пиши: [DICE: NdN+M] (например: [DICE: 1d20+5])
- Будь справедливым, но создавай интересные вызовы
- В бою: управляй монстрами, отслеживай инициативу и HP
- Давай игрокам выбор и реагируй на их действия
- НЕ повторяй имя персонажа дважды подряд в одном предложении
- Длина ответа: 2-4 абзаца для описаний, 1-2 для быстрых реакций
- АТМОСФЕРА "${camp.atmosphere}" должна быть в КАЖДОМ твоём ответе — используй слова, образы и детали, соответствующие кампании

ПРЕДМЕТЫ И НАГРАДЫ:
- Когда игрок находит предмет, пиши: [ITEM: Название | 📦 | Описание] (иконка: ⚔️ оружие, 🛡️ броня, 🧪 зелье, 💎 магический предмет, 📜 свиток, 🗝️ ключ, 📦 прочее)
- Когда игрок получает золото: [GOLD: +N] (например: [GOLD: +25])
- Когда игрок теряет золото: [GOLD: -N]

УРОН И ЛЕЧЕНИЕ:
- Когда игрок получает урон: [HP: имя -N] (например: [HP: Артур -8])
- Когда игрок лечится: [HP: имя +N] (например: [HP: Артур +5])
- Для урона/лечения всех: [HP: * -N] или [HP: * +N]

ВЫБОР:
После каждого описания, давай 2-4 варианта действий:
[CHOICE: Описание варианта 1]
[CHOICE: Описание варианта 2]

ПЕРЕМЕЩЕНИЕ:
Когда описываешь, куда идут игроки: [MOVE: имя X Y] (X,Y = координаты 0-59)

NPC И МОНСТРЫ — ВАЖНО! Подбирай NPC СТРОГО по кампании:
${camp.npcs}

Когда появляются NPC или монстры, ОБЯЗАТЕЛЬНО используй формат:
[NPC: имя тип X Y] — типы: enemy (враг), boss (босс), ally (союзник), neutral (нейтральный)
Когда NPC двигается: [NPC_MOVE: имя X Y]
Когда NPC умирает: [NPC_DEAD: имя]

КАРТА:
НЕ создавай карту! Карта уже сгенерирована и соответствует кампании "${camp.name}".
Тип карты: ${camp.mapDesc}
Просто описывай, что видят игроки на карте, и размещай NPC на ней с помощью [NPC:] тегов.

ТИПИЧНЫЕ ВСТРЕЧИ для этой кампании:
${camp.encounters}`;
    }

    _buildMessages(userMessage) {
        const messages = [{ role: 'system', content: this._buildSystemPrompt() }];
        const camp = AI_DM.CAMPAIGNS[this.campaignTheme] || AI_DM.CAMPAIGNS.custom;
        if (camp.desc) {
            messages.push({ role: 'system', content: `Кампания: ${camp.name}. ${camp.desc}. Предыстория: ${camp.backstory}` });
        }
        if (this.mapContext) {
            messages.push({ role: 'system', content: `Текущая карта: ${this.mapContext}` });
        }
        if (this.characters.length > 0) {
            const charInfo = this.characters.map(c =>
                `${c.name} — ${c.race} ${c.class} (${c.background}), СИЛ:${c.stats.STR} ЛОВ:${c.stats.DEX} ТЕЛ:${c.stats.CON} ИНТ:${c.stats.INT} МДР:${c.stats.WIS} ХАР:${c.stats.CHA}`
            ).join('; ');
            messages.push({ role: 'system', content: `Персонажи: ${charInfo}` });
        }
        for (const msg of this.history) messages.push(msg);
        messages.push({ role: 'user', content: userMessage });
        return messages;
    }

    async generateResponse(userMessage, playerName) {
        if (!this.apiKey) return '⚠️ API ключ не установлен. Получите бесплатно на console.groq.com/keys';
        if (this.isGenerating) return '⏳ Подождите, я уже думаю...';

        this.isGenerating = true;
        if (this.onTyping) this.onTyping(true);

        const fullMsg = playerName ? `${playerName}: ${userMessage}` : userMessage;
        const messages = this._buildMessages(fullMsg);

        const maxRetries = 4;
        let lastError = null;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                let response = this.provider === 'groq'
                    ? await this._callGroq(messages)
                    : await this._callGemini(messages);

                this.history.push({ role: 'user', content: fullMsg });
                this.history.push({ role: 'assistant', content: response });
                while (this.history.length > this.maxHistory) this.history.shift();

                this.isGenerating = false;
                if (this.onTyping) this.onTyping(false);
                return response;
            } catch (err) {
                lastError = err;
                const is429 = err.is429 || (err.message && err.message.includes('429'));
                const isRateLimit = err.message && (err.message.includes('rate_limit') || err.message.includes('Rate limit'));
                if ((is429 || isRateLimit) && attempt < maxRetries - 1) {
                    // Exponential backoff: 2s, 4s, 8s
                    const delay = Math.pow(2, attempt + 1) * 1000;
                    if (this.onTyping) this.onTyping(false);
                    if (typeof showToast === 'function') showToast('⏳ Лимит API, повтор через ' + (delay / 1000) + 'с... (попытка ' + (attempt + 2) + '/' + maxRetries + ')', 'warning', delay);
                    await new Promise(r => setTimeout(r, delay));
                    if (this.onTyping) this.onTyping(true);
                    continue;
                }
                this.isGenerating = false;
                if (this.onTyping) this.onTyping(false);
                return `❌ Ошибка ИИ: ${err.message}`;
            }
        }
        this.isGenerating = false;
        if (this.onTyping) this.onTyping(false);
        return '❌ Не удалось получить ответ ИИ после ' + maxRetries + ' попыток.' + (lastError ? ' (' + lastError.message + ')' : '');
    }

    async _callGroq(messages) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 1500, temperature: 0.9 })
        });
        if (!res.ok) {
            const e = await res.text();
            const err = new Error(`Groq ${res.status}: ${e}`);
            err.is429 = res.status === 429;
            throw err;
        }
        const data = await res.json();
        return data.choices[0].message.content;
    }

    async _callGemini(messages) {
        const contents = [];
        for (const msg of messages) {
            if (msg.role === 'system') {
                contents.push({ role: 'user', parts: [{ text: `[System]: ${msg.content}` }] });
                contents.push({ role: 'model', parts: [{ text: 'Понял.' }] });
            } else if (msg.role === 'user') {
                contents.push({ role: 'user', parts: [{ text: msg.content }] });
            } else {
                contents.push({ role: 'model', parts: [{ text: msg.content }] });
            }
        }
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 1500, temperature: 0.9 } })
        });
        if (!res.ok) {
            const e = await res.text();
            const err = new Error(`Gemini ${res.status}: ${e}`);
            err.is429 = res.status === 429;
            throw err;
        }
        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
    }

    async startCampaign(playerNames) {
        this.history = [];
        const camp = AI_DM.CAMPAIGNS[this.campaignTheme] || AI_DM.CAMPAIGNS.custom;
        const prompt = `Начни приключение "${camp.name}" для группы: ${playerNames.join(', ')}.

ОПИСАНИЕ: ${camp.desc}
ПРЕДИСТОРИЯ: ${camp.backstory}
АТМОСФЕРА: ${camp.atmosphere}
ТИП КАРТЫ: ${camp.mapDesc}
ПОДХОДЯЩИЕ NPC: ${camp.npcs}
ТИПИЧНЫЕ ВСТРЕЧИ: ${camp.encounters}

Важно:
1. Опиши начальную сцену, погружая в атмосферу "${camp.atmosphere}"
2. Расскажи, КАК и ПОЧЕМУ герои оказались в этом месте
3. Опиши, что они видят вокруг себя на карте
4. ОБЯЗАТЕЛЬНО размести 1-3 NPC на карте с помощью [NPC: имя тип X Y] — NPC должны подходить к кампании!
5. Перемести персонажей на стартовую позицию с помощью [MOVE: имя X Y]
6. Предложи 3-4 варианта действий
7. НЕ генерируй карту — она уже есть!`;
        return await this.generateResponse(prompt, null);
    }
}

// ===== Dice =====
function rollDice(notation) {
    const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) return null;
    const count = parseInt(match[1]), sides = parseInt(match[2]), modifier = match[3] ? parseInt(match[3]) : 0;
    if (count < 1 || count > 100 || sides < 2 || sides > 100) return null;
    const rolls = [];
    for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * sides) + 1);
    return { notation, rolls, modifier, total: rolls.reduce((a, b) => a + b, 0) + modifier };
}

function formatDiceResult(result, playerName) {
    if (!result) return `🎲 Неверная запись. Используйте: /roll 1d20+5`;
    let text = `🎲 ${playerName} бросает ${result.notation}: [${result.rolls.join(', ')}]`;
    if (result.modifier) text += ` ${result.modifier > 0 ? '+' : ''}${result.modifier}`;
    text += ` = **${result.total}**`;
    return text;
}

function parseAIRoll(text) {
    const diceRegex = /\[DICE:\s*([^\]]+)\]/gi;
    let result = text, match;
    while ((match = diceRegex.exec(text)) !== null) {
        const roll = rollDice(match[1].trim());
        if (roll) result = result.replace(match[0], `🎲 ${roll.total} (${roll.rolls.join(',')}${roll.modifier ? (roll.modifier > 0 ? '+' : '') + roll.modifier : ''})`);
    }
    return result;
}

function parseAIChoices(text) {
    const choices = [], regex = /\[CHOICE:\s*([^\]]+)\]/gi;
    let match;
    while ((match = regex.exec(text)) !== null) choices.push(match[1].trim());
    return choices;
}

function parseAIMoves(text) {
    const moves = [], regex = /\[MOVE:\s*(\S+)\s+(\d+)\s+(\d+)\]/gi;
    let match;
    while ((match = regex.exec(text)) !== null) moves.push({ name: match[1], x: parseInt(match[2]), y: parseInt(match[3]) });
    return moves;
}

function parseAIMap(text) {
    const match = text.match(/\[MAP_START\]\s*([\s\S]*?)\s*\[MAP_END\]/i);
    if (!match) return null;
    const rows = match[1].trim().split('\n');
    const map = [];
    for (const row of rows) {
        const cells = row.trim().split(/[\s,]+/).map(Number);
        if (cells.length > 0 && !isNaN(cells[0]) && cells.length >= 5) map.push(cells);
    }
    return map.length > 0 ? map : null;
}

function parseAINPCs(text) {
    const npcs = [];
    const regex = /\[NPC:\s*(\S+)\s+(enemy|boss|ally|neutral)\s+(\d+)\s+(\d+)\]/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        npcs.push({ name: match[1], type: match[2], x: parseInt(match[3]), y: parseInt(match[4]) });
    }
    return npcs;
}

function parseAINPCMoves(text) {
    const moves = [];
    const regex = /\[NPC_MOVE:\s*(\S+)\s+(\d+)\s+(\d+)\]/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        moves.push({ name: match[1], x: parseInt(match[2]), y: parseInt(match[3]) });
    }
    return moves;
}

function parseAINPCDead(text) {
    const dead = [];
    const regex = /\[NPC_DEAD:\s*(\S+)\]/gi;
    let match;
    while ((match = regex.exec(text)) !== null) {
        dead.push(match[1]);
    }
    return dead;
}
