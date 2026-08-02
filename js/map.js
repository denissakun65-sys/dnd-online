// ===== map.js — Grid Map & Token Rendering =====

const TILE = {
    EMPTY: 0,
    FLOOR: 1,
    WALL: 2,
    WATER: 3,
    LAVA: 4,
    TREE: 5,
    DOOR: 6,
    CHEST: 7
};

const TILE_COLORS = {
    [TILE.EMPTY]: '#0a0a0a',
    [TILE.FLOOR]: '#3a3a5c',
    [TILE.WALL]: '#5c4033',
    [TILE.WATER]: '#1a5276',
    [TILE.LAVA]: '#922b21',
    [TILE.TREE]: '#1e6e3e',
    [TILE.DOOR]: '#7d6608',
    [TILE.CHEST]: '#b7950b'
};

const TILE_EMOJIS = {
    [TILE.EMPTY]: '',
    [TILE.FLOOR]: '',
    [TILE.WALL]: '🧱',
    [TILE.WATER]: '🌊',
    [TILE.LAVA]: '🔥',
    [TILE.TREE]: '🌳',
    [TILE.DOOR]: '🚪',
    [TILE.CHEST]: '📦'
};

class GameMap {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridSize = 30; // cells
        this.cellSize = 32;
        this.map = []; // 2D array
        this.fogMap = []; // 2D boolean
        this.fogEnabled = false;
        this.players = {}; // id -> { x, y, name, color }
        this.selectedTool = TILE.FLOOR;
        this.isDrawing = false;
        this.isHost = false;
        this.onMapChange = null;   // callback(mapData)
        this.onPlayerMove = null;  // callback(playerId, x, y)
        this.myPlayerId = '';
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.zoom = 1;

        this._initMap();
        this._setupEvents();
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _initMap() {
        this.map = [];
        this.fogMap = [];
        for (let y = 0; y < this.gridSize; y++) {
            this.map[y] = [];
            this.fogMap[y] = [];
            for (let x = 0; x < this.gridSize; x++) {
                this.map[y][x] = TILE.EMPTY;
                this.fogMap[y][x] = true; // fogged
            }
        }
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.render();
    }

    _setupEvents() {
        // Mouse events for drawing / moving
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this._onMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Touch support
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this._onMouseDown({ ...touch, button: 0 });
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this._onMouseMove({ ...touch });
        });
        this.canvas.addEventListener('touchend', (e) => {
            this._onMouseUp({});
        });
    }

    _screenToGrid(sx, sy) {
        const rect = this.canvas.getBoundingClientRect();
        const cx = sx - rect.left;
        const cy = sy - rect.top;
        const gx = Math.floor((cx - this.offsetX) / (this.cellSize * this.zoom));
        const gy = Math.floor((cy - this.offsetY) / (this.cellSize * this.zoom));
        return { gx, gy };
    }

    _onMouseDown(e) {
        const { gx, gy } = this._screenToGrid(e.clientX, e.clientY);

        // Middle button or ctrl+click for panning
        if (e.button === 1 || e.ctrlKey) {
            this.isPanning = true;
            this.panStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY };
            return;
        }

        // Right click = move player token
        if (e.button === 2) {
            if (this.myPlayerId && this.players[this.myPlayerId]) {
                this._movePlayer(this.myPlayerId, gx, gy);
            }
            return;
        }

        // Left click on map tool
        if (this.isHost && this.selectedTool !== null) {
            this.isDrawing = true;
            this._paintCell(gx, gy);
        } else {
            // Non-host: left click to move
            if (this.myPlayerId && this.players[this.myPlayerId]) {
                this._movePlayer(this.myPlayerId, gx, gy);
            }
        }
    }

    _onMouseMove(e) {
        if (this.isPanning) {
            this.offsetX = e.clientX - this.panStart.x;
            this.offsetY = e.clientY - this.panStart.y;
            this.render();
            return;
        }

        if (this.isDrawing && this.isHost) {
            const { gx, gy } = this._screenToGrid(e.clientX, e.clientY);
            this._paintCell(gx, gy);
        }
    }

    _onMouseUp(e) {
        this.isDrawing = false;
        this.isPanning = false;
    }

    _onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        this.zoom = Math.max(0.5, Math.min(3, this.zoom + delta));
        this.render();
    }

    _paintCell(gx, gy) {
        if (gx < 0 || gx >= this.gridSize || gy < 0 || gy >= this.gridSize) return;
        this.map[gy][gx] = this.selectedTool;
        this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    _movePlayer(playerId, gx, gy) {
        if (gx < 0 || gx >= this.gridSize || gy < 0 || gy >= this.gridSize) return;
        // Can't move onto walls
        if (this.map[gy][gx] === TILE.WALL || this.map[gy][gx] === TILE.TREE) return;
        
        this.players[playerId].x = gx;
        this.players[playerId].y = gy;
        this.render();
        if (this.onPlayerMove) this.onPlayerMove(playerId, gx, gy);
    }

    // Set map from data
    setMapData(mapData) {
        if (!mapData) return;
        this.map = mapData;
        this.gridSize = mapData.length;
        this.render();
    }

    // Set player position
    setPlayerPosition(playerId, x, y) {
        if (this.players[playerId]) {
            this.players[playerId].x = x;
            this.players[playerId].y = y;
            this.render();
        }
    }

    // Add a player token
    addPlayer(id, name, color) {
        this.players[id] = {
            x: Math.floor(this.gridSize / 2),
            y: Math.floor(this.gridSize / 2),
            name: name,
            color: color
        };
        this.render();
    }

    // Remove a player token
    removePlayer(id) {
        delete this.players[id];
        this.render();
    }

    // Fill entire map with floor
    fillFloor() {
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                this.map[y][x] = TILE.FLOOR;
            }
        }
        this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    // Clear map
    clearMap() {
        this._initMap();
        this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    // Reveal fog around a player
    revealFog(playerId, radius = 3) {
        if (!this.fogEnabled || !this.players[playerId]) return;
        const p = this.players[playerId];
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = p.x + dx;
                const ny = p.y + dy;
                if (nx >= 0 && nx < this.gridSize && ny >= 0 && ny < this.gridSize) {
                    if (dx * dx + dy * dy <= radius * radius) {
                        this.fogMap[ny][nx] = false;
                    }
                }
            }
        }
        this.render();
    }

    // ===== RENDERING =====
    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const cs = this.cellSize * this.zoom;

        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#050505';
        ctx.fillRect(0, 0, w, h);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);

        // Draw tiles
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const px = x * cs;
                const py = y * cs;

                // Check fog
                if (this.fogEnabled && this.fogMap[y][x]) {
                    ctx.fillStyle = '#111';
                    ctx.fillRect(px, py, cs, cs);
                    continue;
                }

                const tile = this.map[y][x];
                ctx.fillStyle = TILE_COLORS[tile] || TILE_COLORS[TILE.EMPTY];
                ctx.fillRect(px, py, cs, cs);

                // Grid lines
                ctx.strokeStyle = 'rgba(255,255,255,0.06)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px, py, cs, cs);

                // Emoji for special tiles
                if (TILE_EMOJIS[tile] && cs > 16) {
                    ctx.font = `${cs * 0.6}px serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(TILE_EMOJIS[tile], px + cs / 2, py + cs / 2);
                }
            }
        }

        // Draw player tokens
        for (const [id, p] of Object.entries(this.players)) {
            if (this.fogEnabled && this.fogMap[p.y] && this.fogMap[p.y][p.x]) continue;

            const px = p.x * cs;
            const py = p.y * cs;
            const isMe = id === this.myPlayerId;

            // Token circle
            ctx.beginPath();
            ctx.arc(px + cs / 2, py + cs / 2, cs * 0.38, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();
            ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.5)';
            ctx.lineWidth = isMe ? 3 : 1.5;
            ctx.stroke();

            // Glow for current player
            if (isMe) {
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 15;
                ctx.beginPath();
                ctx.arc(px + cs / 2, py + cs / 2, cs * 0.38, 0, Math.PI * 2);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Name label
            if (cs > 20) {
                ctx.font = `bold ${Math.max(9, cs * 0.3)}px ${getComputedStyle(document.body).fontFamily}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2.5;
                ctx.strokeText(p.name, px + cs / 2, py + cs + 2);
                ctx.fillText(p.name, px + cs / 2, py + cs + 2);
            }
        }

        ctx.restore();
    }

    // Get map description for AI context
    getMapDescription() {
        const features = [];
        const playerPositions = [];
        
        for (let y = 0; y < this.gridSize; y++) {
            for (let x = 0; x < this.gridSize; x++) {
                const t = this.map[y][x];
                if (t === TILE.WALL) features.push(`стена в (${x},${y})`);
                else if (t === TILE.WATER) features.push(`вода в (${x},${y})`);
                else if (t === TILE.LAVA) features.push(`лава в (${x},${y})`);
                else if (t === TILE.DOOR) features.push(`дверь в (${x},${y})`);
                else if (t === TILE.CHEST) features.push(`сундук в (${x},${y})`);
                else if (t === TILE.TREE) features.push(`дерево в (${x},${y})`);
            }
        }

        for (const [id, p] of Object.entries(this.players)) {
            playerPositions.push(`${p.name} в (${p.x},${p.y})`);
        }

        return `Объекты на карте: ${features.length > 0 ? features.join(', ') : 'пусто'}. Позиции игроков: ${playerPositions.join(', ')}.`;
    }
}
