// ===== lobby.js — Character creation, campaign selection, start game =====

// Campaign data (duplicated from ai.js since lobby.html doesn't load it)
const CAMPAIGNS = {
    dark_castle: { name: '🏰 Проклятие Тёмного Замка', desc: 'Столетия назад лорд Крелл заключил сделку с тёмными силами. Его замок стал проклят, а все жители исчезли. Теперь зловещий свет горит в окнах башни, и пропадают путники.' },
    dragon_lair: { name: '🐉 Хранилище Дракона', desc: 'Красный дракон Вермитракс обосновался в вулканической горе и собирает несметные сокровища. Король обещал полцарства тому, кто вернёт Артефакт.' },
    lost_temple: { name: '🏛️ Тайна Забытого Храма', desc: 'Древний храм богини Селунэ скрыт в джунглях. Говорят, там хранится источник вечной молодости. Но храм охраняют проклятые стражи.' },
    tavern: { name: '🍺 Таверна на Перекрёстке', desc: 'Таверна "Последний Приют" стоит на перекрёстке всех дорог. Но этой ночью разразилась буря, и в таверне произошло убийство.' },
    mad_mage: { name: '🧙 Подземелья Безумного Мага', desc: 'Архимаг Терион сошёл с ума и превратил свою башню в лабиринт ловушек, монстров и извращённых экспериментов.' },
    haunted_forest: { name: '🌲 Проклятый Лес', desc: 'Чёрный Лес Шэдоукуст живёт своей жизнью. Деревья шепчутся, тени движутся, а те кто заходит слишком глубоко — никогда не возвращаются.' },
    pirate_island: { name: '🏴‍☠️ Остров Пиратов', desc: 'Легендарный пират Капитан Кость закопал сокровища на Острове Черепа. Но остров проклят — каждый закат мёртвые восстанут.' },
    custom: { name: '✨ Своя история', desc: 'ИИ Ведущий придумает уникальную историю специально для вашей группы.' }
};

const STAT_NAMES = ['СИЛ', 'ЛОВ', 'ТЕЛ', 'ИНТ', 'МДР', 'ХАР'];
const STAT_KEYS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63'];

let stats = { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 };
let selectedColor = PLAYER_COLORS[0];
let statMethod = 'pointbuy';
let selectedCampaign = 'dark_castle';

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    initColorPicker();
    initCampaignGrid();
    initStats();
    initStatMethods();
    initButtons();
    initRaceChange();
    loadSavedData();
});

function initColorPicker() {
    const picker = document.getElementById('colorPicker');
    PLAYER_COLORS.forEach((color, i) => {
        const dot = document.createElement('div');
        dot.className = 'color-dot' + (i === 0 ? ' active' : '');
        dot.style.background = color;
        dot.addEventListener('click', () => {
            document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
            dot.classList.add('active');
            selectedColor = color;
        });
        picker.appendChild(dot);
    });
}

function initCampaignGrid() {
    const grid = document.getElementById('campaignGrid');
    for (const [key, camp] of Object.entries(CAMPAIGNS)) {
        const card = document.createElement('div');
        card.className = 'campaign-card' + (key === selectedCampaign ? ' active' : '');
        card.dataset.campaign = key;
        card.innerHTML = `<h3>${camp.name}</h3><p>${camp.desc.substring(0, 80)}...</p>`;
        card.addEventListener('click', () => {
            document.querySelectorAll('.campaign-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedCampaign = key;
        });
        grid.appendChild(card);
    }
}

function initStats() {
    renderStats();
}

function initStatMethods() {
    document.querySelectorAll('.stat-method-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.stat-method-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            statMethod = tab.dataset.method;
            applyStatMethod();
            renderStats();
        });
    });
}

function applyStatMethod() {
    if (statMethod === 'pointbuy') {
        stats = { STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 };
    } else if (statMethod === '4d6') {
        for (const key of STAT_KEYS) {
            const rolls = [];
            for (let i = 0; i < 4; i++) rolls.push(Math.floor(Math.random() * 6) + 1);
            rolls.sort((a, b) => b - a);
            stats[key] = rolls[0] + rolls[1] + rolls[2];
        }
    } else if (statMethod === 'standard') {
        const shuffled = [...STANDARD_ARRAY].sort(() => Math.random() - 0.5);
        STAT_KEYS.forEach((key, i) => { stats[key] = shuffled[i]; });
    }
}

function renderStats() {
    const grid = document.getElementById('statsGrid');
    grid.innerHTML = '';

    const raceBonus = getRaceBonus();

    STAT_KEYS.forEach((key, i) => {
        const base = stats[key];
        const bonus = raceBonus[key] || 0;
        const total = base + bonus;
        const mod = Math.floor((total - 10) / 2);
        const modStr = mod >= 0 ? `+${mod}` : `${mod}`;

        const box = document.createElement('div');
        box.className = 'stat-box';
        box.innerHTML = `
            <div class="stat-name">${STAT_NAMES[i]}</div>
            <div class="stat-value">${total}</div>
            <div class="stat-mod">${modStr}</div>
            ${bonus ? `<div class="stat-bonus">+${bonus} раса</div>` : ''}
            ${statMethod === 'pointbuy' ? `
            <div class="stat-controls">
                <button class="stat-btn" data-stat="${key}" data-dir="-1" ${base <= 8 ? 'disabled' : ''}>−</button>
                <button class="stat-btn" data-stat="${key}" data-dir="1" ${base >= 15 ? 'disabled' : ''}>+</button>
            </div>` : ''}
        `;
        grid.appendChild(box);
    });

    // Points left for point buy
    const pointsDiv = document.getElementById('pointsLeft');
    if (statMethod === 'pointbuy') {
        const used = STAT_KEYS.reduce((sum, key) => sum + (POINT_COST[stats[key]] || 0), 0);
        const left = 27 - used;
        pointsDiv.style.display = 'block';
        pointsDiv.textContent = `Очков: ${left} / 27`;
        pointsDiv.style.color = left < 0 ? 'var(--accent-red)' : 'var(--accent-gold)';
    } else {
        pointsDiv.style.display = 'none';
    }

    // Wire up stat buttons
    grid.querySelectorAll('.stat-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const stat = btn.dataset.stat;
            const dir = parseInt(btn.dataset.dir);
            const newVal = stats[stat] + dir;
            if (newVal < 8 || newVal > 15) return;
            // Check point budget
            const currentCost = STAT_KEYS.reduce((sum, key) => sum + (POINT_COST[stats[key]] || 0), 0);
            const newCost = currentCost - (POINT_COST[stats[stat]] || 0) + (POINT_COST[newVal] || 0);
            if (newCost > 27) return;
            stats[stat] = newVal;
            renderStats();
        });
    });
}

function getRaceBonus() {
    const raceSelect = document.getElementById('charRace');
    const option = raceSelect.selectedOptions[0];
    if (!option) return {};
    const bonusStr = option.dataset.bonus || '';
    const bonus = {};
    bonusStr.split(',').forEach(part => {
        const match = part.trim().match(/(STR|DEX|CON|INT|WIS|CHA)\+(\d+)/);
        if (match) bonus[match[1]] = parseInt(match[2]);
    });
    return bonus;
}

function initRaceChange() {
    document.getElementById('charRace').addEventListener('change', renderStats);
}

function initButtons() {
    document.getElementById('generateAvatar').addEventListener('click', generateAvatar);
    document.getElementById('startSolo').addEventListener('click', () => startGame('solo'));
    document.getElementById('startOnline').addEventListener('click', () => startGame('online'));
}

function generateAvatar() {
    const name = document.getElementById('charName').value.trim() || 'Герой';
    const race = document.getElementById('charRace').value;
    const charClass = document.getElementById('charClass').value;
    const bg = document.getElementById('charBackground').value;
    // Include name in prompt to make each avatar unique
    const prompt = `D&D fantasy portrait of ${name}, ${race} ${charClass}, ${bg} background, dark fantasy, detailed face, epic lighting, digital art, character sheet style`;

    const preview = document.getElementById('avatarPreview');
    const promptEl = document.getElementById('avatarPrompt');
    const btn = document.getElementById('generateAvatar');

    btn.disabled = true;
    btn.textContent = '⏳ Генерация...';
    promptEl.textContent = prompt;

    // Use name + random for unique seed
    const seed = name.toLowerCase().replace(/\s+/g, '_') + '_' + Math.random().toString(36).substr(2, 8);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=256&height=256&seed=${seed}&nologo=true`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        preview.innerHTML = '';
        preview.appendChild(img);
        btn.disabled = false;
        btn.textContent = '✨ Сгенерировать';
        promptEl.textContent = 'Аватар готов! (' + name + ')';
    };
    img.onerror = () => {
        preview.textContent = '🧙';
        btn.disabled = false;
        btn.textContent = '✨ Сгенерировать';
        promptEl.textContent = 'Ошибка генерации. Попробуйте снова.';
    };
    img.src = url;
}

function startGame(mode) {
    const name = document.getElementById('charName').value.trim();
    if (!name) { alert('Введите имя персонажа!'); return; }

    const raceBonus = getRaceBonus();
    const finalStats = {};
    STAT_KEYS.forEach(key => {
        finalStats[key] = stats[key] + (raceBonus[key] || 0);
    });

    const charData = {
        name,
        race: document.getElementById('charRace').value,
        class: document.getElementById('charClass').value,
        background: document.getElementById('charBackground').value,
        stats: finalStats,
        color: selectedColor,
        avatarUrl: document.querySelector('#avatarPreview img')?.src || ''
    };

    // Validate point buy
    if (statMethod === 'pointbuy') {
        const used = STAT_KEYS.reduce((sum, key) => sum + (POINT_COST[stats[key]] || 0), 0);
        if (used > 27) { alert('Слишком много очков! Уменьшите характеристики.'); return; }
    }

    // Save to sessionStorage
    sessionStorage.setItem('dnd-mode', mode);
    sessionStorage.setItem('dnd-char', JSON.stringify(charData));
    sessionStorage.setItem('dnd-campaign', selectedCampaign);
    sessionStorage.setItem('dnd-provider', document.getElementById('aiProvider').value);
    sessionStorage.setItem('dnd-apikey', document.getElementById('apiKey').value.trim());

    const roomCode = document.getElementById('roomCode').value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    sessionStorage.setItem('dnd-room', roomCode || 'room' + Math.random().toString(36).substr(2, 6));

    window.location.href = 'game.html';
}

function loadSavedData() {
    // Restore previous session data
    const saved = sessionStorage.getItem('dnd-char');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            if (data.name) document.getElementById('charName').value = data.name;
            if (data.race) document.getElementById('charRace').value = data.race;
            if (data.class) {
                // Find the class option
                const classSelect = document.getElementById('charClass');
                for (const opt of classSelect.options) {
                    if (opt.value === data.class) { classSelect.value = data.class; break; }
                }
            }
            if (data.background) document.getElementById('charBackground').value = data.background;
            if (data.color) {
                selectedColor = data.color;
                document.querySelectorAll('.color-dot').forEach(d => {
                    d.classList.toggle('active', d.style.background === data.color);
                });
            }
            if (data.stats) {
                const raceBonus = getRaceBonus();
                STAT_KEYS.forEach(key => {
                    stats[key] = (data.stats[key] || 10) - (raceBonus[key] || 0);
                });
                renderStats();
            }
        } catch (e) { /* ignore */ }
    }

    const apiKey = sessionStorage.getItem('dnd-apikey');
    if (apiKey) document.getElementById('apiKey').value = apiKey;

    const provider = sessionStorage.getItem('dnd-provider');
    if (provider) document.getElementById('aiProvider').value = provider;

    const campaign = sessionStorage.getItem('dnd-campaign');
    if (campaign) {
        selectedCampaign = campaign;
        document.querySelectorAll('.campaign-card').forEach(c => {
            c.classList.toggle('active', c.dataset.campaign === campaign);
        });
    }

    // Random name if empty
    const nameInput = document.getElementById('charName');
    if (!nameInput.value) {
        const names = ['Арагорн', 'Гендальф', 'Леголас', 'Гимли', 'Фродо', 'Боромир', 'Элронд', 'Галадриэль', 'Дракула', 'Мерлин', 'Артур', 'Ланселот'];
        nameInput.value = names[Math.floor(Math.random() * names.length)];
    }
}
