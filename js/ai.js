// ===== ai.js — AI Dungeon Master =====

class AI_DM {
    constructor() {
        this.provider = 'groq';
        this.apiKey = '';
        this.history = [];
        this.maxHistory = 40;
        this.isGenerating = false;
        this.onTyping = null;   // callback(isTyping)
        this.onResponse = null; // callback(text)
        this.systemPrompt = `Ты — Мастер Подземелий (Dungeon Master) в игре Dungeons & Dragons 5e. Ты ведёшь игру для группы приключенцев.

ПРАВИЛА:
- Отвечай НА РУССКОМ языке
- Веди увлекательную историю в стиле фэнтези
- Описывай окружение, NPC, и события ярко и атмосферно
- Когда игроки делают проверки, указывай сложность (DC) и результат
- Используй правила D&D 5e для боёв, проверок и заклинаний
- Когда нужен бросок кубика, пиши в формате: [DICE: NdN+M] (например: [DICE: 1d20+5])
- Будь справедливым, но создавай интересные вызовы
- Не убивай персонажей без причины, но и не делай игру слишком лёгкой
- Если игрок описывает действие, определи, нужна ли проверка
- В бою: управляй монстрами, отслеживай инициативу и HP
- Давай игрокам выбор и реагируй на их действия
- Длина ответа: 2-4 абзаца для описаний, 1-2 для быстрых реакций`;

        this.campaignContext = '';
    }

    setProvider(provider) {
        this.provider = provider;
    }

    setApiKey(key) {
        this.apiKey = key;
    }

    // Set the current map context
    updateMapContext(mapDescription) {
        this.campaignContext = mapDescription;
    }

    // Build messages array for the API
    _buildMessages(userMessage) {
        const messages = [
            { role: 'system', content: this.systemPrompt }
        ];

        if (this.campaignContext) {
            messages.push({
                role: 'system',
                content: `Текущая ситуация на карте: ${this.campaignContext}`
            });
        }

        // Add conversation history
        for (const msg of this.history) {
            messages.push(msg);
        }

        // Add the new user message
        messages.push({ role: 'user', content: userMessage });

        return messages;
    }

    // Generate DM response
    async generateResponse(userMessage, playerName = 'Игрок') {
        if (!this.apiKey) {
            return '⚠️ API ключ не установлен. Получите бесплатный ключ на console.groq.com или aistudio.google.com';
        }

        if (this.isGenerating) {
            return '⏳ Подождите, я уже думаю...';
        }

        this.isGenerating = true;
        if (this.onTyping) this.onTyping(true);

        const fullMessage = `${playerName}: ${userMessage}`;
        const messages = this._buildMessages(fullMessage);

        try {
            let response;
            if (this.provider === 'groq') {
                response = await this._callGroq(messages);
            } else if (this.provider === 'gemini') {
                response = await this._callGemini(messages);
            } else {
                response = 'Неизвестный провайдер ИИ';
            }

            // Save to history
            this.history.push({ role: 'user', content: fullMessage });
            this.history.push({ role: 'assistant', content: response });

            // Trim history if too long
            while (this.history.length > this.maxHistory) {
                this.history.shift();
            }

            return response;
        } catch (err) {
            console.error('[AI] Error:', err);
            return `❌ Ошибка ИИ: ${err.message}. Проверьте API ключ.`;
        } finally {
            this.isGenerating = false;
            if (this.onTyping) this.onTyping(false);
        }
    }

    // Groq API call (free, fast)
    async _callGroq(messages) {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: messages,
                max_tokens: 1000,
                temperature: 0.85,
                top_p: 0.9
            })
        });

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Groq API ${res.status}: ${err}`);
        }

        const data = await res.json();
        return data.choices[0].message.content;
    }

    // Google Gemini API call (free tier)
    async _callGemini(messages) {
        // Convert OpenAI format to Gemini format
        const contents = [];
        for (const msg of messages) {
            if (msg.role === 'system') {
                contents.push({
                    role: 'user',
                    parts: [{ text: `[System]: ${msg.content}` }]
                });
                contents.push({
                    role: 'model',
                    parts: [{ text: 'Понял, я буду следовать этим инструкциям.' }]
                });
            } else if (msg.role === 'user') {
                contents.push({
                    role: 'user',
                    parts: [{ text: msg.content }]
                });
            } else {
                contents.push({
                    role: 'model',
                    parts: [{ text: msg.content }]
                });
            }
        }

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: contents,
                    generationConfig: {
                        maxOutputTokens: 1000,
                        temperature: 0.85
                    }
                })
            }
        );

        if (!res.ok) {
            const err = await res.text();
            throw new Error(`Gemini API ${res.status}: ${err}`);
        }

        const data = await res.json();
        return data.candidates[0].content.parts[0].text;
    }

    // Start a new campaign
    async startCampaign(playerNames) {
        this.history = [];
        const names = playerNames.join(', ');
        const prompt = `Начни новое приключение для группы: ${names}. Опиши начальную локацию и предложи, что они могут сделать. Не делай вступление слишком длинным.`;
        return await this.generateResponse(prompt, 'Система');
    }
}

// ===== Dice Roller =====
function rollDice(notation) {
    // Parse notation like 2d6+3, 1d20, 3d8-2
    const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) return null;

    const count = parseInt(match[1]);
    const sides = parseInt(match[2]);
    const modifier = match[3] ? parseInt(match[3]) : 0;

    if (count < 1 || count > 100 || sides < 2 || sides > 100) return null;

    const rolls = [];
    for (let i = 0; i < count; i++) {
        rolls.push(Math.floor(Math.random() * sides) + 1);
    }

    const sum = rolls.reduce((a, b) => a + b, 0) + modifier;

    return {
        notation: notation,
        rolls: rolls,
        modifier: modifier,
        total: sum
    };
}

// Format dice result for chat
function formatDiceResult(result, playerName) {
    if (!result) return `🎲 Неверная запись. Используйте формат: /roll NdN+M (например: /roll 1d20+5)`;
    
    let text = `🎲 ${playerName} бросает ${result.notation}: [${result.rolls.join(', ')}]`;
    if (result.modifier !== 0) {
        text += ` ${result.modifier > 0 ? '+' : ''}${result.modifier}`;
    }
    text += ` = **${result.total}**`;
    return text;
}

// Parse [DICE: NdN+M] from AI response and auto-roll
function parseAIRoll(text) {
    const diceRegex = /\[DICE:\s*([^\]]+)\]/gi;
    let result = text;
    const rolls = [];
    
    let match;
    while ((match = diceRegex.exec(text)) !== null) {
        const notation = match[1].trim();
        const roll = rollDice(notation);
        if (roll) {
            rolls.push(roll);
            result = result.replace(match[0], `🎲 ${roll.total} (${roll.rolls.join(', ')}${roll.modifier ? (roll.modifier > 0 ? '+' : '') + roll.modifier : ''})`);
        }
    }
    
    return { text: result, rolls };
}
