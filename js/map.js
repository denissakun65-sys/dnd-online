// ===== map.js — Canvas-based map with realistic graphics =====

const TILE = {
    EMPTY: 0, FLOOR: 1, WALL: 2, WATER: 3, LAVA: 4, TREE: 5,
    DOOR: 6, CHEST: 7, SAND: 8, PATH: 9, BRIDGE: 10, TRAP: 11,
    STAIRS: 12, THRONE: 13, BED: 14, TABLE: 15
};

class GameMap {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridW = 60;
        this.gridH = 60;
        this.cellSize = 28;
        this.map = [];
        this.fogMap = [];
        this.fogEnabled = false;
        this.players = {};       // id -> {x, y, name, color}
        this.npcs = {};          // id -> {x, y, name, type, hp}  type: enemy/ally/neutral
        this.selectedTool = TILE.FLOOR;
        this.isDrawing = false;
        this.isHost = false;
        this.myPlayerId = '';
        this.offsetX = 0;
        this.offsetY = 0;
        this.zoom = 1;
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.onMapChange = null;
        this.onPlayerMove = null;

        this._initMap();
        this._setupEvents();
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _initMap() {
        this.map = [];
        this.fogMap = [];
        for (let y = 0; y < this.gridH; y++) {
            this.map[y] = [];
            this.fogMap[y] = [];
            for (let x = 0; x < this.gridW; x++) {
                this.map[y][x] = TILE.EMPTY;
                this.fogMap[y][x] = true;
            }
        }
    }

    _resize() {
        const r = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = r.width;
        this.canvas.height = r.height;
        this.render();
    }

    _setupEvents() {
        this.canvas.addEventListener('mousedown', e => this._onDown(e));
        this.canvas.addEventListener('mousemove', e => this._onMove(e));
        this.canvas.addEventListener('mouseup', () => { this.isDrawing = false; this.isPanning = false; });
        this.canvas.addEventListener('mouseleave', () => { this.isDrawing = false; this.isPanning = false; });
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            this.zoom = Math.max(0.3, Math.min(4, this.zoom + (e.deltaY > 0 ? -0.1 : 0.1)));
            this.render();
        });
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    _s2g(sx, sy) {
        const r = this.canvas.getBoundingClientRect();
        return {
            gx: Math.floor((sx - r.left - this.offsetX) / (this.cellSize * this.zoom)),
            gy: Math.floor((sy - r.top - this.offsetY) / (this.cellSize * this.zoom))
        };
    }

    _onDown(e) {
        const { gx, gy } = this._s2g(e.clientX, e.clientY);

        // Middle click or Ctrl+click = pan
        if (e.button === 1 || e.ctrlKey) {
            this.isPanning = true;
            this.panStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY };
            return;
        }

        // Right click or non-host = move player
        if (e.button === 2 || !this.isHost) {
            this._movePlayer(this.myPlayerId, gx, gy);
            return;
        }

        // Left click as host = draw
        if (this.isHost && this.selectedTool !== null) {
            this.isDrawing = true;
            this._paint(gx, gy);
            return;
        }

        // Fallback: move player
        this._movePlayer(this.myPlayerId, gx, gy);
    }

    _onMove(e) {
        if (this.isPanning) {
            this.offsetX = e.clientX - this.panStart.x;
            this.offsetY = e.clientY - this.panStart.y;
            this.render();
            return;
        }
        if (this.isDrawing && this.isHost) {
            const { gx, gy } = this._s2g(e.clientX, e.clientY);
            this._paint(gx, gy);
        }
    }

    _paint(gx, gy) {
        if (gx < 0 || gx >= this.gridW || gy < 0 || gy >= this.gridH) return;
        this.map[gy][gx] = this.selectedTool;
        this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    _movePlayer(id, gx, gy) {
        if (gx < 0 || gx >= this.gridW || gy < 0 || gy >= this.gridH) return;
        if (!this.players[id]) return;
        const t = this.map[gy][gx];
        if (t === TILE.WALL || t === TILE.TREE || t === TILE.LAVA) return;
        this.players[id].x = gx;
        this.players[id].y = gy;
        this.render();
        if (this.onPlayerMove) this.onPlayerMove(id, gx, gy);
    }

    setMapData(d) {
        if (!d) return;
        this.map = d;
        this.gridH = d.length;
        this.gridW = d[0] ? d[0].length : this.gridH;
        this.render();
    }

    setPlayerPosition(id, x, y) {
        if (this.players[id]) {
            this.players[id].x = x;
            this.players[id].y = y;
            this.render();
        }
    }

    addPlayer(id, name, color) {
        if (this.players[id]) return;  // Prevent duplicates!
        this.players[id] = {
            x: Math.floor(this.gridW / 2),
            y: Math.floor(this.gridH / 2),
            name, color
        };
        this.render();
    }

    removePlayer(id) {
        delete this.players[id];
        this.render();
    }

    // ===== NPC =====
    addNPC(id, name, x, y, type) {
        if (!type) type = 'enemy';
        this.npcs[id] = { x, y, name, type, hp: 0 };
        this.render();
    }

    removeNPC(id) {
        delete this.npcs[id];
        this.render();
    }

    setNPCPosition(id, x, y) {
        if (this.npcs[id]) {
            this.npcs[id].x = x;
            this.npcs[id].y = y;
            this.render();
        }
    }

    clearNPCs() {
        this.npcs = {};
        this.render();
    }

    fillFloor() {
        for (let y = 0; y < this.gridH; y++)
            for (let x = 0; x < this.gridW; x++) this.map[y][x] = TILE.FLOOR;
        this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    clearMap() {
        this._initMap();
        this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    revealFog(id, radius = 4) {
        if (!this.fogEnabled || !this.players[id]) return;
        const p = this.players[id];
        for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = p.x + dx, ny = p.y + dy;
                if (nx >= 0 && nx < this.gridW && ny >= 0 && ny < this.gridH && dx * dx + dy * dy <= radius * radius)
                    this.fogMap[ny][nx] = false;
            }
        this.render();
    }

    _placePlayersAt(cx, cy) {
        let i = 0;
        for (const [id, p] of Object.entries(this.players)) {
            p.x = Math.max(0, Math.min(this.gridW - 1, cx + (i % 3) - 1));
            p.y = Math.max(0, Math.min(this.gridH - 1, cy + Math.floor(i / 3)));
            i++;
        }
    }

    _placePlayersNearCenter() {
        const cx = Math.floor(this.gridW / 2), cy = Math.floor(this.gridH / 2);
        for (let r = 0; r < 15; r++)
            for (let dy = -r; dy <= r; dy++)
                for (let dx = -r; dx <= r; dx++) {
                    const nx = cx + dx, ny = cy + dy;
                    if (nx >= 0 && nx < this.gridW && ny >= 0 && ny < this.gridH && this.map[ny][nx] === TILE.FLOOR) {
                        this._placePlayersAt(nx, ny);
                        return;
                    }
                }
    }

    // ===== MAP GENERATION =====
    generate(type) {
        this._initMap();
        switch (type) {
            case 'dungeon': this._genDungeon(); break;
            case 'cave': this._genCave(); break;
            case 'forest': this._genForest(); break;
            case 'tavern': this._genTavern(); break;
            case 'castle': this._genCastle(); break;
            case 'temple': this._genTemple(); break;
            case 'village': this._genVillage(); break;
            case 'island': this._genIsland(); break;
            default: this._genDungeon();
        }
        this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    _genDungeon() {
        const W = this.gridW, H = this.gridH;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.map[y][x] = TILE.WALL;
        const rooms = [];
        for (let a = 0; a < 60; a++) {
            const rw = 4 + Math.floor(Math.random() * 7), rh = 3 + Math.floor(Math.random() * 6);
            const rx = 1 + Math.floor(Math.random() * (W - rw - 2)), ry = 1 + Math.floor(Math.random() * (H - rh - 2));
            let ok = true;
            for (const r of rooms) { if (rx < r.x + r.w + 2 && rx + rw > r.x - 2 && ry < r.y + r.h + 2 && ry + rh > r.y - 2) { ok = false; break; } }
            if (ok) {
                rooms.push({ x: rx, y: ry, w: rw, h: rh });
                for (let y = ry; y < ry + rh; y++) for (let x = rx; x < rx + rw; x++) this.map[y][x] = TILE.FLOOR;
                if (Math.random() > 0.5 && rw > 4) this.map[ry + 1][rx + rw - 2] = TILE.BED;
                if (Math.random() > 0.5) this.map[ry + 1][rx + 1] = TILE.TABLE;
                if (Math.random() > 0.65) this.map[ry + Math.floor(rh / 2)][rx + Math.floor(rw / 2)] = TILE.CHEST;
                if (Math.random() > 0.8) this.map[ry + 1][rx + rw - 2] = TILE.TRAP;
            }
        }
        for (let i = 1; i < rooms.length; i++) {
            const a = rooms[i - 1], b = rooms[i];
            const ax = a.x + Math.floor(a.w / 2), ay = a.y + Math.floor(a.h / 2);
            const bx = b.x + Math.floor(b.w / 2), by = b.y + Math.floor(b.h / 2);
            let cx = ax, cy = ay;
            while (cx !== bx) { if (cy >= 0 && cy < H && cx >= 0 && cx < W && this.map[cy][cx] === TILE.WALL) this.map[cy][cx] = TILE.FLOOR; cx += cx < bx ? 1 : -1; }
            while (cy !== by) { if (cy >= 0 && cy < H && cx >= 0 && cx < W && this.map[cy][cx] === TILE.WALL) this.map[cy][cx] = TILE.FLOOR; cy += cy < by ? 1 : -1; }
            if (this.map[ay] && this.map[ay][ax] === TILE.FLOOR) this.map[ay][ax] = TILE.DOOR;
            if (this.map[by] && this.map[by][bx] === TILE.FLOOR) this.map[by][bx] = TILE.DOOR;
        }
        if (rooms.length > 2) { const last = rooms[rooms.length - 1]; this.map[last.y + 1][last.x + 1] = TILE.STAIRS; }
        this._placePlayersAt(rooms[0].x + Math.floor(rooms[0].w / 2), rooms[0].y + Math.floor(rooms[0].h / 2));
    }

    _genCave() {
        const W = this.gridW, H = this.gridH;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.map[y][x] = TILE.WALL;
        let grid = [];
        for (let y = 0; y < H; y++) { grid[y] = []; for (let x = 0; x < W; x++) grid[y][x] = Math.random() < 0.45 ? 1 : 0; }
        for (let iter = 0; iter < 5; iter++) {
            const next = [];
            for (let y = 0; y < H; y++) { next[y] = []; for (let x = 0; x < W; x++) { let w = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const ny = y + dy, nx = x + dx; if (ny < 0 || ny >= H || nx < 0 || nx >= W) w++; else if (grid[ny][nx] === 1) w++; } next[y][x] = w >= 5 ? 1 : 0; } }
            grid = next;
        }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.map[y][x] = grid[y][x] ? TILE.WALL : TILE.FLOOR;
        for (let i = 0; i < 8; i++) { const px = 3 + Math.floor(Math.random() * (W - 6)), py = 3 + Math.floor(Math.random() * (H - 6)), r = 1 + Math.floor(Math.random() * 3); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const ny = py + dy, nx = px + dx; if (ny >= 0 && ny < H && nx >= 0 && nx < W && this.map[ny][nx] === TILE.FLOOR && dx * dx + dy * dy <= r * r) this.map[ny][nx] = TILE.WATER; } }
        for (let i = 0; i < 5; i++) { let x, y, t = 0; do { x = Math.floor(Math.random() * W); y = Math.floor(Math.random() * H); t++; } while (this.map[y][x] !== TILE.FLOOR && t < 200); if (t < 200) this.map[y][x] = TILE.CHEST; }
        this._placePlayersNearCenter();
    }

    _genForest() {
        const W = this.gridW, H = this.gridH;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.map[y][x] = TILE.FLOOR;
        for (let i = 0; i < W * H * 0.3; i++) { const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H); this.map[y][x] = TILE.TREE; }
        for (let p = 0; p < 4; p++) { let px = Math.floor(Math.random() * W), py = 0; while (py < H) { for (let dx = -1; dx <= 1; dx++) { const nx = px + dx; if (nx >= 0 && nx < W) this.map[py][nx] = TILE.PATH; } px += Math.floor(Math.random() * 3) - 1; px = Math.max(0, Math.min(W - 1, px)); py++; } }
        const px = Math.floor(W / 2), py = Math.floor(H / 2), r = 3 + Math.floor(Math.random() * 3);
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const ny = py + dy, nx = px + dx; if (ny >= 0 && ny < H && nx >= 0 && nx < W && dx * dx + dy * dy <= r * r) this.map[ny][nx] = TILE.WATER; }
        for (let dx = -r; dx <= r; dx++) { const nx = px + dx; if (nx >= 0 && nx < W) this.map[py][nx] = TILE.BRIDGE; }
        this._placePlayersNearCenter();
    }

    _genTavern() {
        const W = this.gridW, H = this.gridH;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.map[y][x] = TILE.EMPTY;
        const hx = 4, hy = 4, hw = 24, hh = 20;
        for (let y = hy; y < hy + hh; y++) for (let x = hx; x < hx + hw; x++) this.map[y][x] = TILE.FLOOR;
        for (let x = hx; x < hx + hw; x++) { this.map[hy][x] = TILE.WALL; this.map[hy + hh - 1][x] = TILE.WALL; }
        for (let y = hy; y < hy + hh; y++) { this.map[y][hx] = TILE.WALL; this.map[y][hx + hw - 1] = TILE.WALL; }
        this.map[hy + hh - 1][hx + Math.floor(hw / 2)] = TILE.DOOR;
        this.map[hy + hh - 1][hx + Math.floor(hw / 2) + 1] = TILE.DOOR;
        for (let x = hx + 3; x < hx + hw - 3; x++) this.map[hy + 5][x] = TILE.WALL;
        this.map[hy + 5][hx + Math.floor(hw / 2)] = TILE.DOOR;
        for (let i = 0; i < 6; i++) { const tx = hx + 2 + Math.floor(Math.random() * (hw - 6)), ty = hy + 8 + Math.floor(Math.random() * 8); if (this.map[ty][tx] === TILE.FLOOR) this.map[ty][tx] = TILE.TABLE; }
        for (let y = hy; y < hy + 5; y++) for (let x = hx + hw - 6; x < hx + hw - 1; x++) this.map[y][x] = TILE.FLOOR;
        this.map[hy + 4][hx + hw - 6] = TILE.DOOR;
        this.map[hy + 1][hx + hw - 2] = TILE.BED;
        this.map[hy + 2][hx + hw - 2] = TILE.CHEST;
        this.map[hy + 1][hx + 2] = TILE.LAVA;
        this._placePlayersAt(hx + Math.floor(hw / 2), hy + hh - 3);
    }

    _genCastle() {
        const W = this.gridW, H = this.gridH;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.map[y][x] = TILE.EMPTY;
        const ox = 2, oy = 2, ow = W - 4, oh = H - 4;
        for (let y = oy; y < oy + oh; y++) for (let x = ox; x < ox + ow; x++) { if (y === oy || y === oy + oh - 1 || x === ox || x === ox + ow - 1) this.map[y][x] = TILE.WALL; else this.map[y][x] = TILE.FLOOR; }
        this.map[oy + oh - 1][Math.floor(ow / 2)] = TILE.DOOR;
        this.map[oy + oh - 1][Math.floor(ow / 2) + 1] = TILE.DOOR;
        const kx = Math.floor(W / 2) - 8, ky = Math.floor(H / 2) - 6, kw = 16, kh = 12;
        for (let y = ky; y < ky + kh; y++) for (let x = kx; x < kx + kw; x++) { if (y === ky || y === ky + kh - 1 || x === kx || x === kx + kw - 1) this.map[y][x] = TILE.WALL; else this.map[y][x] = TILE.FLOOR; }
        this.map[ky + kh - 1][kx + Math.floor(kw / 2)] = TILE.DOOR;
        this.map[ky + 2][kx + Math.floor(kw / 2)] = TILE.THRONE;
        this.map[ky + 1][kx + Math.floor(kw / 2) - 1] = TILE.CHEST;
        this.map[ky + 1][kx + Math.floor(kw / 2) + 1] = TILE.CHEST;
        for (const [tx, ty] of [[ox, oy], [ox + ow - 3, oy], [ox, oy + oh - 3], [ox + ow - 3, oy + oh - 3]]) {
            for (let y = ty; y < ty + 3; y++) for (let x = tx; x < tx + 3; x++) { if (y === ty || y === ty + 2 || x === tx || x === tx + 2) this.map[y][x] = TILE.WALL; else this.map[y][x] = TILE.FLOOR; }
            this.map[ty + 1][tx + 1] = TILE.CHEST;
        }
        this._placePlayersAt(Math.floor(W / 2), oy + oh - 3);
    }

    _genTemple() {
        const W = this.gridW, H = this.gridH;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.map[y][x] = TILE.EMPTY;
        const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
        for (let y = cy - 12; y < cy + 12; y++) for (let x = cx - 6; x < cx + 6; x++) { if (y >= 0 && y < H && x >= 0 && x < W) this.map[y][x] = TILE.FLOOR; }
        for (let y = cy - 6; y < cy + 6; y++) for (let x = cx - 14; x < cx + 14; x++) { if (y >= 0 && y < H && x >= 0 && x < W) this.map[y][x] = TILE.FLOOR; }
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (this.map[y][x] === TILE.FLOOR) { for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && ny < H && nx >= 0 && nx < W && this.map[ny][nx] === TILE.EMPTY) this.map[y][x] = TILE.WALL; } } }
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { if (this.map[y][x] === TILE.WALL) { let inner = true; for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const ny = y + dy, nx = x + dx; if (ny >= 0 && ny < H && nx >= 0 && nx < W && this.map[ny][nx] === TILE.EMPTY) inner = false; } if (inner) this.map[y][x] = TILE.FLOOR; } }
        this.map[cy + 11][cx] = TILE.DOOR;
        this.map[cy - 4][cx] = TILE.LAVA;
        this.map[cy - 8][cx - 4] = TILE.CHEST;
        this.map[cy - 8][cx + 4] = TILE.CHEST;
        this._placePlayersAt(cx, cy + 10);
    }

    _genVillage() {
        const W = this.gridW, H = this.gridH;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.map[y][x] = TILE.FLOOR;
        for (let y = 0; y < H; y++) for (let x = Math.floor(W / 2) - 1; x <= Math.floor(W / 2) + 1; x++) this.map[y][x] = TILE.PATH;
        for (let x = 0; x < W; x++) for (let y = Math.floor(H / 2) - 1; y <= Math.floor(H / 2) + 1; y++) this.map[y][x] = TILE.PATH;
        const houses = [];
        for (let i = 0; i < 12; i++) {
            const hw = 4 + Math.floor(Math.random() * 4), hh = 3 + Math.floor(Math.random() * 3);
            const hx = 2 + Math.floor(Math.random() * (W - hw - 4)), hy = 2 + Math.floor(Math.random() * (H - hh - 4));
            let ok = true;
            for (const h of houses) { if (hx < h.x + h.w + 2 && hx + hw > h.x - 2 && hy < h.y + h.h + 2 && hy + hh > h.y - 2) { ok = false; break; } }
            if (ok) {
                houses.push({ x: hx, y: hy, w: hw, h: hh });
                for (let y = hy; y < hy + hh; y++) for (let x = hx; x < hx + hw; x++) { if (y === hy || y === hy + hh - 1 || x === hx || x === hx + hw - 1) this.map[y][x] = TILE.WALL; else this.map[y][x] = TILE.FLOOR; }
                this.map[hy + hh - 1][hx + Math.floor(hw / 2)] = TILE.DOOR;
                this.map[hy + 1][hx + 1] = TILE.BED;
                if (Math.random() > 0.5) this.map[hy + 1][hx + hw - 2] = TILE.CHEST;
            }
        }
        for (let i = 0; i < 50; i++) { const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H); if (this.map[y][x] === TILE.FLOOR) this.map[y][x] = TILE.TREE; }
        this._placePlayersAt(Math.floor(W / 2) + 3, Math.floor(H / 2) + 3);
    }

    _genIsland() {
        const W = this.gridW, H = this.gridH;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.map[y][x] = TILE.WATER;
        const cx = Math.floor(W / 2), cy = Math.floor(H / 2), baseR = Math.min(W, H) * 0.35;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            const noise = Math.sin(x * 0.5) * Math.cos(y * 0.5) * 2 + Math.sin(x * 0.3 + y * 0.2) * 3;
            if (dist < baseR + noise - 2) this.map[y][x] = TILE.FLOOR;
            else if (dist < baseR + noise) this.map[y][x] = TILE.SAND;
        }
        for (let i = 0; i < 30; i++) { const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H); if (this.map[y][x] === TILE.FLOOR) this.map[y][x] = TILE.TREE; }
        this.map[cy][cx] = TILE.CHEST;
        this.map[cy - 5][cx - 5] = TILE.LAVA;
        this._placePlayersAt(cx, cy + 5);
    }

    setMapFromAI(aiMapData) {
        if (!aiMapData || !aiMapData.length) return;
        const h = aiMapData.length, w = aiMapData[0] ? aiMapData[0].length : 0;
        if (h > this.gridH || w > this.gridW) { this.gridH = Math.max(h, this.gridH); this.gridW = Math.max(w, this.gridW); }
        this._initMap();
        for (let y = 0; y < Math.min(h, this.gridH); y++)
            for (let x = 0; x < Math.min(w, this.gridW); x++)
                this.map[y][x] = Math.max(0, Math.min(15, aiMapData[y][x] || 0));
        this._placePlayersNearCenter();
        this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    getMapDescription() {
        const features = [], positions = [], npcList = [];
        for (let y = 0; y < this.gridH; y++)
            for (let x = 0; x < this.gridW; x++) {
                const t = this.map[y][x];
                if (t === TILE.DOOR) features.push('дверь(' + x + ',' + y + ')');
                else if (t === TILE.CHEST) features.push('сундук(' + x + ',' + y + ')');
                else if (t === TILE.TRAP) features.push('ловушка(' + x + ',' + y + ')');
                else if (t === TILE.STAIRS) features.push('лестница(' + x + ',' + y + ')');
                else if (t === TILE.THRONE) features.push('трон(' + x + ',' + y + ')');
            }
        for (const [id, p] of Object.entries(this.players)) positions.push(p.name + '(' + p.x + ',' + p.y + ')');
        for (const [id, n] of Object.entries(this.npcs)) npcList.push(n.name + '(' + n.type + ',' + n.x + ',' + n.y + ')');
        let desc = 'Объекты: ' + (features.length > 0 ? features.slice(0, 30).join(', ') : 'пусто') + '. Позиции: ' + positions.join(', ') + '.';
        if (npcList.length > 0) desc += ' NPC: ' + npcList.join(', ') + '.';
        desc += ' Размер: ' + this.gridW + 'x' + this.gridH + '.';
        return desc;
    }

    // ===== RENDERING =====
    render() {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height, cs = this.cellSize * this.zoom;
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#040404';
        ctx.fillRect(0, 0, w, h);

        const startX = Math.max(0, Math.floor(-this.offsetX / cs));
        const startY = Math.max(0, Math.floor(-this.offsetY / cs));
        const endX = Math.min(this.gridW, Math.ceil((w - this.offsetX) / cs) + 1);
        const endY = Math.min(this.gridH, Math.ceil((h - this.offsetY) / cs) + 1);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);

        for (let y = startY; y < endY; y++)
            for (let x = startX; x < endX; x++) {
                const px = x * cs, py = y * cs;
                if (this.fogEnabled && this.fogMap[y] && this.fogMap[y][x]) { ctx.fillStyle = '#0a0a0a'; ctx.fillRect(px, py, cs, cs); continue; }
                this._drawTile(ctx, this.map[y][x], px, py, cs);
            }

        // Players
        for (const [id, p] of Object.entries(this.players)) {
            if (this.fogEnabled && this.fogMap[p.y] && this.fogMap[p.y][p.x]) continue;
            const px = p.x * cs, py = p.y * cs, isMe = id === this.myPlayerId;
            const r = cs * 0.38;

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(px + cs / 2, py + cs * 0.85, r * 0.8, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();

            // Body
            ctx.beginPath(); ctx.arc(px + cs / 2, py + cs / 2, r, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(px + cs / 2 - r * 0.3, py + cs / 2 - r * 0.3, 0, px + cs / 2, py + cs / 2, r);
            grad.addColorStop(0, this._lighten(p.color, 40));
            grad.addColorStop(1, p.color);
            ctx.fillStyle = grad;
            ctx.fill();

            // Border
            ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.5)';
            ctx.lineWidth = isMe ? 3 : 1.5;
            ctx.stroke();

            // Glow for self
            if (isMe) {
                ctx.shadowColor = p.color;
                ctx.shadowBlur = 15;
                ctx.beginPath(); ctx.arc(px + cs / 2, py + cs / 2, r, 0, Math.PI * 2); ctx.stroke();
                ctx.shadowBlur = 0;
            }

            // Name
            if (cs > 16) {
                ctx.font = `bold ${Math.max(8, cs * 0.28)}px ${getComputedStyle(document.body).fontFamily}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2.5;
                ctx.strokeText(p.name, px + cs / 2, py + cs + 1);
                ctx.fillText(p.name, px + cs / 2, py + cs + 1);
            }
        }

        // NPCs (enemies, allies, neutrals)
        for (const [id, npc] of Object.entries(this.npcs)) {
            if (this.fogEnabled && this.fogMap[npc.y] && this.fogMap[npc.y][npc.x]) continue;
            const px = npc.x * cs, py = npc.y * cs;
            const r = cs * 0.35;

            let color, symbol;
            if (npc.type === 'enemy') { color = '#c0392b'; symbol = '💀'; }
            else if (npc.type === 'ally') { color = '#27ae60'; symbol = '🛡'; }
            else if (npc.type === 'boss') { color = '#8e44ad'; symbol = '👹'; }
            else { color = '#2980b9'; symbol = '👤'; }

            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(px + cs / 2, py + cs * 0.85, r * 0.8, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();

            // Body - diamond shape for enemies, circle for others
            ctx.beginPath();
            if (npc.type === 'enemy' || npc.type === 'boss') {
                // Diamond shape
                ctx.moveTo(px + cs / 2, py + cs * 0.15);
                ctx.lineTo(px + cs * 0.85, py + cs / 2);
                ctx.lineTo(px + cs / 2, py + cs * 0.85);
                ctx.lineTo(px + cs * 0.15, py + cs / 2);
                ctx.closePath();
            } else {
                ctx.arc(px + cs / 2, py + cs / 2, r, 0, Math.PI * 2);
            }
            const grad = ctx.createRadialGradient(px + cs / 2 - r * 0.3, py + cs / 2 - r * 0.3, 0, px + cs / 2, py + cs / 2, r);
            grad.addColorStop(0, this._lighten(color, 40));
            grad.addColorStop(1, color);
            ctx.fillStyle = grad;
            ctx.fill();

            // Border
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Glow
            ctx.shadowColor = color;
            ctx.shadowBlur = 10;
            ctx.stroke();
            ctx.shadowBlur = 0;

            // Name
            if (cs > 16) {
                ctx.font = `bold ${Math.max(7, cs * 0.24)}px ${getComputedStyle(document.body).fontFamily}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillStyle = color;
                ctx.strokeStyle = 'black';
                ctx.lineWidth = 2.5;
                ctx.strokeText(npc.name, px + cs / 2, py + cs + 1);
                ctx.fillText(npc.name, px + cs / 2, py + cs + 1);
            }
        }
        ctx.restore();
    }

    _drawTile(ctx, tile, px, py, cs) {
        const m = cs * 0.1;
        switch (tile) {
            case TILE.EMPTY: ctx.fillStyle = '#080808'; ctx.fillRect(px, py, cs, cs); break;
            case TILE.FLOOR:
                ctx.fillStyle = '#3a3a5c'; ctx.fillRect(px, py, cs, cs);
                ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(px, py, cs, 1); ctx.fillRect(px, py, 1, cs);
                ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(px + cs - 1, py, 1, cs); ctx.fillRect(px, py + cs - 1, cs, 1);
                break;
            case TILE.WALL:
                ctx.fillStyle = '#5c4033'; ctx.fillRect(px, py, cs, cs);
                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
                ctx.strokeRect(px + m, py + m, cs - m * 2, cs / 2 - m);
                ctx.strokeRect(px + cs / 4, py + cs / 2, cs / 2, cs / 2 - m);
                ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px, py, cs, 2);
                break;
            case TILE.WATER:
                ctx.fillStyle = '#1a5276'; ctx.fillRect(px, py, cs, cs);
                ctx.strokeStyle = 'rgba(100,200,255,0.2)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(px, py + cs * 0.3); ctx.quadraticCurveTo(px + cs * 0.5, py + cs * 0.2, px + cs, py + cs * 0.3); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(px, py + cs * 0.6); ctx.quadraticCurveTo(px + cs * 0.5, py + cs * 0.7, px + cs, py + cs * 0.6); ctx.stroke();
                ctx.fillStyle = 'rgba(100,200,255,0.1)'; ctx.fillRect(px + cs * 0.2, py + cs * 0.1, cs * 0.3, cs * 0.15);
                break;
            case TILE.LAVA:
                ctx.fillStyle = '#922b21'; ctx.fillRect(px, py, cs, cs);
                ctx.fillStyle = 'rgba(255,100,0,0.3)'; ctx.fillRect(px + m, py + m, cs - m * 2, cs - m * 2);
                ctx.fillStyle = 'rgba(255,200,0,0.2)'; ctx.fillRect(px + cs * 0.3, py + cs * 0.3, cs * 0.4, cs * 0.4);
                ctx.strokeStyle = 'rgba(255,200,0,0.4)'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(px + cs * 0.2, py + cs * 0.3); ctx.lineTo(px + cs * 0.5, py + cs * 0.5); ctx.lineTo(px + cs * 0.8, py + cs * 0.4); ctx.stroke();
                break;
            case TILE.TREE:
                ctx.fillStyle = '#5d4037'; ctx.fillRect(px + cs * 0.4, py + cs * 0.5, cs * 0.2, cs * 0.5);
                ctx.fillStyle = '#1e6e3e'; ctx.beginPath(); ctx.arc(px + cs / 2, py + cs * 0.35, cs * 0.35, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = 'rgba(100,255,100,0.15)'; ctx.beginPath(); ctx.arc(px + cs * 0.4, py + cs * 0.3, cs * 0.15, 0, Math.PI * 2); ctx.fill();
                break;
            case TILE.DOOR:
                ctx.fillStyle = '#3a3a5c'; ctx.fillRect(px, py, cs, cs);
                ctx.fillStyle = '#7d6608'; ctx.fillRect(px + m, py + m, cs - m * 2, cs - m * 2);
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.arc(px + cs * 0.7, py + cs / 2, cs * 0.06, 0, Math.PI * 2); ctx.fill();
                break;
            case TILE.CHEST:
                ctx.fillStyle = '#3a3a5c'; ctx.fillRect(px, py, cs, cs);
                ctx.fillStyle = '#8b6914'; ctx.fillRect(px + cs * 0.15, py + cs * 0.35, cs * 0.7, cs * 0.5);
                ctx.fillStyle = '#b7950b'; ctx.fillRect(px + cs * 0.15, py + cs * 0.25, cs * 0.7, cs * 0.15);
                ctx.fillStyle = '#f1c40f'; ctx.fillRect(px + cs * 0.42, py + cs * 0.45, cs * 0.16, cs * 0.12);
                break;
            case TILE.SAND: ctx.fillStyle = '#c2b280'; ctx.fillRect(px, py, cs, cs); break;
            case TILE.PATH: ctx.fillStyle = '#4a4a6a'; ctx.fillRect(px, py, cs, cs); break;
            case TILE.BRIDGE:
                ctx.fillStyle = '#1a5276'; ctx.fillRect(px, py, cs, cs);
                ctx.fillStyle = '#8b6914'; ctx.fillRect(px + cs * 0.1, py + cs * 0.1, cs * 0.8, cs * 0.8);
                ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
                for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(px + cs * 0.1, py + cs * (0.2 + i * 0.25)); ctx.lineTo(px + cs * 0.9, py + cs * (0.2 + i * 0.25)); ctx.stroke(); }
                break;
            case TILE.TRAP:
                ctx.fillStyle = '#3a3a5c'; ctx.fillRect(px, py, cs, cs);
                ctx.strokeStyle = 'rgba(231,76,60,0.5)'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(px + cs * 0.2, py + cs * 0.2); ctx.lineTo(px + cs * 0.8, py + cs * 0.8); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(px + cs * 0.8, py + cs * 0.2); ctx.lineTo(px + cs * 0.2, py + cs * 0.8); ctx.stroke();
                break;
            case TILE.STAIRS:
                ctx.fillStyle = '#3a3a5c'; ctx.fillRect(px, py, cs, cs);
                ctx.fillStyle = '#2c3e50'; for (let i = 0; i < 4; i++) ctx.fillRect(px + cs * 0.2, py + cs * (0.2 + i * 0.18), cs * 0.6, cs * 0.12);
                break;
            case TILE.THRONE:
                ctx.fillStyle = '#3a3a5c'; ctx.fillRect(px, py, cs, cs);
                ctx.fillStyle = '#8b6914'; ctx.fillRect(px + cs * 0.2, py + cs * 0.15, cs * 0.6, cs * 0.7);
                ctx.fillStyle = '#f1c40f'; ctx.beginPath(); ctx.moveTo(px + cs * 0.3, py + cs * 0.3); ctx.lineTo(px + cs * 0.5, py + cs * 0.15); ctx.lineTo(px + cs * 0.7, py + cs * 0.3); ctx.fill();
                break;
            case TILE.BED:
                ctx.fillStyle = '#3a3a5c'; ctx.fillRect(px, py, cs, cs);
                ctx.fillStyle = '#6d4c41'; ctx.fillRect(px + cs * 0.1, py + cs * 0.2, cs * 0.8, cs * 0.65);
                ctx.fillStyle = '#ddd'; ctx.fillRect(px + cs * 0.15, py + cs * 0.25, cs * 0.3, cs * 0.2);
                ctx.fillStyle = '#3498db'; ctx.fillRect(px + cs * 0.15, py + cs * 0.5, cs * 0.7, cs * 0.3);
                break;
            case TILE.TABLE:
                ctx.fillStyle = '#3a3a5c'; ctx.fillRect(px, py, cs, cs);
                ctx.fillStyle = '#5d4037'; ctx.fillRect(px + cs * 0.1, py + cs * 0.3, cs * 0.8, cs * 0.15);
                ctx.fillRect(px + cs * 0.15, py + cs * 0.45, cs * 0.08, cs * 0.35);
                ctx.fillRect(px + cs * 0.77, py + cs * 0.45, cs * 0.08, cs * 0.35);
                break;
            default: ctx.fillStyle = '#080808'; ctx.fillRect(px, py, cs, cs);
        }
    }

    _lighten(hex, amount) {
        let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        r = Math.min(255, r + amount); g = Math.min(255, g + amount); b = Math.min(255, b + amount);
        return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    }
}
