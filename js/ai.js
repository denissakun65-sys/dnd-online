// ===== ai.js — AI Dungeon Master with campaign-specific maps =====

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
    }

    setProvider(p) { this.provider = p; }
    setApiKey(k) { this.apiKey = k; }
    setCampaign(theme) { this.campaignTheme = theme; }
    setCharacters(chars) { this.characters = chars; }

    // Campaign data with MAP TYPE for each
    static CAMPAIGNS = {
        dark_castle: {
            name: '🏰 Проклятие Тёмного Замка',
            desc: 'Столетия назад лорд Крелл заключил сделку с тёмными силами. Его замок стал проклят, а все жители исчезли. Теперь зловещий свет горит в окнах башни, и пропадают путники. Вы — группа смельчаков, нанятая деревней, чтобы проникнуть в замок и снять проклятие.',
            backstory: 'Каждый из вас потерял кого-то из-за проклятия замка — кого-то утащила тень, кто-то пропал на дороге. Вы объединились, чтобы покончить с этим злом раз и навсегда.',
            mapType: 'castle',
            mapDesc: 'Тёмный замок с залами, тронным залом, подземельем и башней. Стены, двери, трон, сундуки с сокровищами, ловушки. Лава в ритуальной комнате.',
            atmosphere: 'готический замок, проклятие, тени, тёмная магия, зловещие залы'
        },
        dragon_lair: {
            name: '🐉 Хранилище Дракона',
            desc: 'Красный дракон Вермитракс обосновался в вулканической горе и собирает несметные сокровища. Король обещал полцарства тому, кто вернёт украденный Артефакт Вечного Пламени из его логова.',
            backstory: 'Вы — не просто наёмники. Артефакт Вечного Пламени — единственное, что может спасти ваш город от надвигающегося ледяного проклятия. Без него всё замёрзнет в течение месяца.',
            mapType: 'cave',
            mapDesc: 'Вулканическая пещера с лавовыми озёрами, узкими тоннелями, каменными мостами и огромным залом где спит дракон. Много лавы, воды, сундуков с золотом.',
            atmosphere: 'вулканическая пещера, лава, жар, дракон, сокровища, опасность'
        },
        lost_temple: {
            name: '🏛️ Тайна Забытого Храма',
            desc: 'Древний храм богини Селунэ скрыт в джунглях. Говорят, там хранится источник вечной молодости. Но храм охраняют проклятые стражи и загадки, которые не решали тысячелетия.',
            backstory: 'Ваша старая наставница — единственный человек, который знает путь к храму — умерла при загадочных обстоятельствах. Перед смертью она передала вам карту и шепнула: "Не дайте им первыми добраться до источника..."',
            mapType: 'temple',
            mapDesc: 'Древний храм в форме креста с колоннами, алтарём, ловушками, секретными комнатами. Лава в ритуальных зонах, сундуки с артефактами, двери-загадки.',
            atmosphere: 'древний храм, джунгли, загадки, стражи, магия, тайны'
        },
        tavern: {
            name: '🍺 Таверна на Перекрёстке',
            desc: 'Таверна "Последний Приют" стоит на перекрёстке всех дорог. Путники, торговцы, авантюристы — все здесь. Но этой ночью разразилась буря, и в таверне произошло убийство. Дверь заперта, убийца среди вас.',
            backstory: 'Вы все оказались в таверне по разным причинам, но теперь вы заперты вместе с убийцей. Нужно найти его до рассвета — или следующей жертвой станете вы.',
            mapType: 'tavern',
            mapDesc: 'Таверна с главным залом, барной стойкой, кухней, комнатами на втором этаже, подвалом. Столы, кровати, сундуки, камин. Всё в одном здании.',
            atmosphere: 'таверна, детектив, убийство, буря, подозрения, тайны'
        },
        mad_mage: {
            name: '🧙 Подземелья Безумного Мага',
            desc: 'Архимаг Терион сошёл с ума и превратил свою башню в лабиринт ловушек, монстров и извращённых экспериментов. Его заклинания угрожают всей реальности.',
            backstory: 'Терион когда-то был вашим учителем. Вы — его бывшие ученики, единственные, кто знает его магию достаточно хорошо, чтобы противостоять ей. Но готовы ли вы убить своего наставника?',
            mapType: 'dungeon',
            mapDesc: 'Лабиринт подземелий безумного мага с комнатами-ловушками, лабораториями, библиотекой, темницей, залом призываний. Много ловушек, двери, сундуки, столы, кровати.',
            atmosphere: 'безумный маг, лабиринт, ловушки, эксперименты, хаос, магия'
        },
        haunted_forest: {
            name: '🌲 Проклятый Лес',
            desc: 'Чёрный Лес Шэдоукуст живёт своей жизнью. Деревья шепчутся, тени движутся, а те кто заходит слишком глубоко — никогда не возвращаются. Но именно там растёт единственный ингредиент для противоядия.',
            backstory: 'Ваш город отравлен. Чума, насланная культом из леса, убивает по сотне человек в день. Противоядие — Цветок Лунного Света, который растёт только в сердце Проклятого Леса.',
            mapType: 'forest',
            mapDesc: 'Густой тёмный лес с тропами, полянами, озером, заброшенной хижиной, пещерой. Много деревьев, вода, мосты, ловушки. Сундук в хижине.',
            atmosphere: 'проклятый лес, тени, шёпот деревьев, чума, отчаяние, надежда'
        },
        pirate_island: {
            name: '🏴‍☠️ Остров Пиратов',
            desc: 'Легендарный пират Капитан Кость закопал сокровища на Острове Черепа. Но остров проклят — каждый закат мёртвые восстанут из песка. У вас одна ночь, чтобы найти клад и выбраться живым.',
            backstory: 'Вы — наследники Капитана Кости, и у вас есть единственная подлинная часть карты. Но другие пираты тоже ищут клад, и они не собираются делиться.',
            mapType: 'island',
            mapDesc: 'Тропический остров с пляжем, пальмами, вулканом, джунглями, пиратским лагерем. Песок, вода, деревья, мосты, сундук с сокровищем в центре.',
            atmosphere: 'пиратский остров, проклятие, мертвецы, сокровища, приключение'
        },
        custom: {
            name: '✨ Своя история',
            desc: 'ИИ Ведущий придумает уникальную историю специально для вашей группы, учитывая ваши персонажей и предпочтения.',
            backstory: '',
            mapType: 'dungeon',
            mapDesc: 'Уникальная карта, придуманная ИИ Мастером на основе истории.',
            atmosphere: 'уникальная история, придуманная ИИ'
        }
    };

    _buildSystemPrompt() {
        const camp = AI_DM.CAMPAIGNS[this.campaignTheme] || AI_DM.CAMPAIGNS.custom;

        return `Ты — Мастер Подземелий (Dungeon Master) в игре Dungeons & Dragons 5e. Ты ведёшь игру для группы приключенцев.

ТЕКУЩАЯ КАМПАНИЯ: ${camp.name}
АТМОСФЕРА: ${camp.atmosphere}

ПРАВИЛА:
- Отвечай НА РУССКОМ языке
- Веди увлекательную историю в стиле фэнтези, придерживаясь атмосферы "${camp.atmosphere}"
- Описывай окружение, NPC, и события ярко и атмосферно
- Когда игроки делают проверки, указывай сложность (DC) и результат
- Используй правила D&D 5e для боёв, проверок и заклинаний
- Когда нужен бросок кубика, пиши в формате: [DICE: NdN+M] (например: [DICE: 1d20+5])
- Будь справедливым, но создавай интересные вызовы
- В бою: управляй монстрами, отслеживай инициативу и HP
- Давай игрокам выбор и реагируй на их действия
- Длина ответа: 2-4 абзаца для описаний, 1-2 для быстрых реакций

ПРЕДЛОЖЕНИЯ ВЫБОРА:
После каждого описания ситуации, давай 2-4 варианта действий в формате:
[CHOICE: Описание варианта 1]
[CHOICE: Описание варианта 2]
[CHOICE: Описание варианта 3]

ПЕРЕМЕЩЕНИЕ ИГРОКОВ:
Когда описываешь, куда идут игроки или куда их ведёт сюжет, используй формат:
[MOVE: имя_игрока X Y] — где X и Y координаты на карте (0-59)

СОЗДАНИЕ КАРТЫ:
Когда начинаешь кампанию, ОБЯЗАТЕЛЬНО создай карту. Используй формат:
[MAP_START]
(каждая строка — ряд клеток, числа через пробел, 0=пусто 1=пол 2=стена 3=вода 4=лава 5=дерево 6=дверь 7=сундук 8=песок 9=дорога 10=мост 11=ловушка 12=лестница 13=трон 14=кровать 15=стол)
[MAP_END]

ВАЖНО: Карта должна соответствовать кампании "${camp.name}"!
Описание карты для этой кампании: ${camp.mapDesc}
Создай карту размером минимум 30x30 клеток, но не больше 60x60.
Карта должна быть РАЗНОЙ для каждой кампании!`;
    }

    _buildMessages(userMessage) {
        const messages = [{ role: 'system', content: this._buildSystemPrompt() }];

        // Campaign context
        const camp = AI_DM.CAMPAIGNS[this.campaignTheme] || AI_DM.CAMPAIGNS.custom;
        if (camp.desc) {
            messages.push({
                role: 'system',
                content: `Кампания: ${camp.name}. Описание: ${camp.desc}. Предыстория: ${camp.backstory}`
            });
        }

        // Character info
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

        try {
            let response = this.provider === 'groq'
                ? await this._callGroq(messages)
                : await this._callGemini(messages);

            this.history.push({ role: 'user', content: fullMsg });
            this.history.push({ role: 'assistant', content: response });
            while (this.history.length > this.maxHistory) this.history.shift();

            return response;
        } catch (err) {
            return `❌ Ошибка ИИ: ${err.message}`;
        } finally {
            this.isGenerating = false;
            if (this.onTyping) this.onTyping(false);
        }
    }

    async _callGroq(messages) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.apiKey}` },
            body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 2000, temperature: 0.9 })
        });
        if (!res.ok) { const e = await res.text(); throw new Error(`Groq ${res.status}: ${e}`); }
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
            body: JSON.stringify({ contents, generationConfig: { maxOutputTokens: 2000, temperature: 0.9 } })
        });
        if (!res.ok) { const e = await res.text(); throw new Error(`Gemini ${res.status}: ${e}`); }
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

Важно:
1. Опиши начальную сцену, погружая в атмосферу "${camp.atmosphere}"
2. Расскажи, КАК и ПОЧЕМУ герои оказались в этом месте — используй предысторию
3. Опиши, что они видят вокруг себя
4. Представь 1-2 NPC если это уместно
5. Предложи 3-4 варианта действий
6. ОБЯЗАТЕЛЬНО создай карту начальной локации в формате [MAP_START]...[MAP_END]
   Карта должна быть: ${camp.mapDesc}
   Минимум 30 клеток в ширину и высоту!`;

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
    let result = text;
    while ((match = diceRegex.exec(text)) !== null) {
        const roll = rollDice(match[1].trim());
        if (roll) result = result.replace(match[0], `🎲 ${roll.total} (${roll.rolls.join(',')}${roll.modifier ? (roll.modifier > 0 ? '+' : '') + roll.modifier : ''})`);
    }
    return result;
}

function parseAIChoices(text) {
    const choices = [];
    const regex = /\[CHOICE:\s*([^\]]+)\]/gi;
    let match;
    while ((match = regex.exec(text)) !== null) choices.push(match[1].trim());
    return choices;
}

function parseAIMoves(text) {
    const moves = [];
    const regex = /\[MOVE:\s*(\S+)\s+(\d+)\s+(\d+)\]/gi;
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
