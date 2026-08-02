// ===== map.js — Ultimate Dark Fantasy Canvas Map =====

const TILE = {
    EMPTY: 0, FLOOR: 1, WALL: 2, WATER: 3, LAVA: 4, TREE: 5,
    DOOR: 6, CHEST: 7, SAND: 8, PATH: 9, BRIDGE: 10, TRAP: 11,
    STAIRS: 12, THRONE: 13, BED: 14, TABLE: 15
};

// Tile color palettes for variation
const PALETTES = {
    floor: ['#2c2c48', '#2e2e4a', '#30304c', '#2a2a46', '#282844'],
    wall: ['#3d2b1f', '#42301f', '#382818', '#453322', '#3a2c1c'],
    water: ['#0c3a5c', '#0e3f62', '#0a3558', '#0d3c5e', '#0b3856'],
    lava: ['#6b1a0a', '#721e0c', '#601608', '#6e1c0b', '#581206'],
    sand: ['#b8a870', '#bca474', '#b0a068', '#c0ac78', '#a89860'],
    path: ['#383858', '#3a3a5a', '#363656', '#3c3c5c', '#343452'],
    treeTrunk: ['#3a2510', '#402810', '#352008', '#3d2610', '#2e1c08'],
    treeLeaf: ['#1a5a2a', '#1c6030', '#185428', '#1e6432', '#164e24'],
    treeLeafLight: ['#1e6e3e', '#207242', '#1c6838', '#227646', '#1a6034'],
    door: ['#3a2a15', '#3e2c17', '#362813', '#422e19', '#322410'],
    doorDetail: ['#6b5020', '#705522', '#654a1e', '#755a24', '#5e451a'],
    chest: ['#5a4010', '#5e4212', '#563e0e', '#624414', '#503a0c'],
    chestGold: ['#d4a017', '#d8a419', '#c89c15', '#dca81b', '#c49813'],
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
        this.players = {};
        this.npcs = {};
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
        this._animTime = 0;
        this._animFrame = null;

        this._initMap();
        this._setupEvents();
        this._resize();
        window.addEventListener('resize', () => this._resize());
        this._startAnim();
    }

    _startAnim() {
        const tick = () => {
            this._animTime = Date.now();
            this.render();
            this._animFrame = requestAnimationFrame(tick);
        };
        // Don't animate continuously — only on changes
        // We'll call render() manually when needed
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
        if (e.button === 1 || e.ctrlKey) {
            this.isPanning = true;
            this.panStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY };
            return;
        }
        if (e.button === 2 || !this.isHost) {
            this._movePlayer(this.myPlayerId, gx, gy);
            return;
        }
        if (this.isHost && this.selectedTool !== null) {
            this.isDrawing = true;
            this._paint(gx, gy);
            return;
        }
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
        if (this.players[id]) return;
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

    // ===== RENDERING — Ultimate Dark Fantasy =====
    render() {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height, cs = this.cellSize * this.zoom;
        ctx.clearRect(0, 0, w, h);

        // Background void
        const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
        bgGrad.addColorStop(0, '#060612');
        bgGrad.addColorStop(1, '#020208');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        const startX = Math.max(0, Math.floor(-this.offsetX / cs));
        const startY = Math.max(0, Math.floor(-this.offsetY / cs));
        const endX = Math.min(this.gridW, Math.ceil((w - this.offsetX) / cs) + 1);
        const endY = Math.min(this.gridH, Math.ceil((h - this.offsetY) / cs) + 1);

        ctx.save();
        ctx.translate(this.offsetX, this.offsetY);

        // Draw tiles
        for (let y = startY; y < endY; y++)
            for (let x = startX; x < endX; x++) {
                const px = x * cs, py = y * cs;
                if (this.fogEnabled && this.fogMap[y] && this.fogMap[y][x]) {
                    this._drawFog(ctx, px, py, cs);
                    continue;
                }
                this._drawTile(ctx, this.map[y][x], px, py, cs, x, y);
            }

        // Draw grid lines (subtle)
        if (cs > 16) {
            ctx.strokeStyle = 'rgba(0,0,0,0.15)';
            ctx.lineWidth = 0.5;
            for (let y = startY; y <= endY; y++) {
                ctx.beginPath();
                ctx.moveTo(startX * cs, y * cs);
                ctx.lineTo(endX * cs, y * cs);
                ctx.stroke();
            }
            for (let x = startX; x <= endX; x++) {
                ctx.beginPath();
                ctx.moveTo(x * cs, startY * cs);
                ctx.lineTo(x * cs, endY * cs);
                ctx.stroke();
            }
        }

        // NPCs
        for (const [id, npc] of Object.entries(this.npcs)) {
            if (this.fogEnabled && this.fogMap[npc.y] && this.fogMap[npc.y][npc.x]) continue;
            this._drawNPC(ctx, npc, cs);
        }

        // Players
        for (const [id, p] of Object.entries(this.players)) {
            if (this.fogEnabled && this.fogMap[p.y] && this.fogMap[p.y][p.x]) continue;
            this._drawPlayer(ctx, id, p, cs);
        }

        ctx.restore();
    }

    _drawFog(ctx, px, py, cs) {
        ctx.fillStyle = '#020208';
        ctx.fillRect(px, py, cs, cs);
        // Subtle mist particles
        if (cs > 10) {
            ctx.fillStyle = 'rgba(20,20,40,0.3)';
            ctx.beginPath();
            ctx.arc(px + cs * 0.3, py + cs * 0.4, cs * 0.15, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    _drawPlayer(ctx, id, p, cs) {
        const px = p.x * cs, py = p.y * cs, isMe = id === this.myPlayerId;
        const r = cs * 0.36, cx = px + cs / 2, cy = py + cs / 2;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.ellipse(cx, py + cs * 0.88, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glow ring for self
        if (isMe) {
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 25;
            ctx.beginPath();
            ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        // Body gradient
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
        grad.addColorStop(0, this._lighten(p.color, 70));
        grad.addColorStop(0.4, p.color);
        grad.addColorStop(1, this._darken(p.color, 40));
        ctx.fillStyle = grad;
        ctx.fill();

        // Border
        ctx.strokeStyle = isMe ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.3)';
        ctx.lineWidth = isMe ? 2.5 : 1.2;
        ctx.stroke();

        // Highlight
        ctx.beginPath();
        ctx.arc(cx - r * 0.2, cy - r * 0.25, r * 0.3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fill();

        // Nameplate
        if (cs > 14) {
            const fs = Math.max(8, cs * 0.26);
            ctx.font = 'bold ' + fs + 'px Cinzel, serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const tw = ctx.measureText(p.name).width;

            // Nameplate background with gradient
            const npx = cx - tw / 2 - 4, npy = py + cs + 3;
            const npw = tw + 8, nph = fs + 4;
            const npGrad = ctx.createLinearGradient(npx, npy, npx, npy + nph);
            npGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
            npGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
            ctx.fillStyle = npGrad;
            ctx.fillRect(npx, npy, npw, nph);

            // Nameplate border
            ctx.strokeStyle = isMe ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(npx, npy, npw, nph);

            // Name text
            ctx.fillStyle = isMe ? '#fff' : p.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.strokeText(p.name, cx, npy + 1);
            ctx.fillText(p.name, cx, npy + 1);
        }
    }

    _drawNPC(ctx, npc, cs) {
        const px = npc.x * cs, py = npc.y * cs, cx = px + cs / 2, cy = py + cs / 2, r = cs * 0.34;
        let color, borderColor, symbol;
        if (npc.type === 'enemy') { color = '#e74c3c'; borderColor = '#ff6b5b'; symbol = '⚔'; }
        else if (npc.type === 'boss') { color = '#9b59b6'; borderColor = '#c77dff'; symbol = '💀'; }
        else if (npc.type === 'ally') { color = '#27ae60'; borderColor = '#5dde8e'; symbol = '🛡'; }
        else { color = '#2980b9'; borderColor = '#5da8e0'; symbol = '💬'; }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.ellipse(cx, py + cs * 0.88, r * 0.9, r * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();

        // Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;

        // Shape
        ctx.beginPath();
        if (npc.type === 'enemy' || npc.type === 'boss') {
            // Diamond shape
            const s = r * 1.1;
            ctx.moveTo(cx, cy - s);
            ctx.lineTo(cx + s * 0.8, cy);
            ctx.lineTo(cx, cy + s * 0.8);
            ctx.lineTo(cx - s * 0.8, cy);
            ctx.closePath();
        } else {
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
        }

        const grad = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.1, cx, cy, r);
        grad.addColorStop(0, this._lighten(color, 60));
        grad.addColorStop(0.5, color);
        grad.addColorStop(1, this._darken(color, 30));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Highlight
        ctx.beginPath();
        ctx.arc(cx - r * 0.15, cy - r * 0.2, r * 0.25, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fill();

        // Nameplate
        if (cs > 14) {
            const fs = Math.max(7, cs * 0.22);
            ctx.font = 'bold ' + fs + 'px Cinzel, serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            const tw = ctx.measureText(npc.name).width;

            const npx = cx - tw / 2 - 4, npy = py + cs + 3;
            const npw = tw + 8, nph = fs + 4;
            const npGrad = ctx.createLinearGradient(npx, npy, npx, npy + nph);
            npGrad.addColorStop(0, 'rgba(0,0,0,0.85)');
            npGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
            ctx.fillStyle = npGrad;
            ctx.fillRect(npx, npy, npw, nph);
            ctx.strokeStyle = color + '40';
            ctx.lineWidth = 0.5;
            ctx.strokeRect(npx, npy, npw, nph);

            ctx.fillStyle = color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2.5;
            ctx.strokeText(npc.name, cx, npy + 1);
            ctx.fillText(npc.name, cx, npy + 1);
        }
    }

    _drawTile(ctx, tile, px, py, cs, gx, gy) {
        const hash = (gx * 7 + gy * 13) % 5; // 0-4 variation
        const hash2 = (gx * 11 + gy * 3) % 7;
        const hash3 = (gx * 17 + gy * 23) % 13;

        switch (tile) {
            case TILE.EMPTY:
                ctx.fillStyle = '#020208';
                ctx.fillRect(px, py, cs, cs);
                // Subtle star field
                if (hash3 < 3 && cs > 8) {
                    ctx.fillStyle = 'rgba(150,150,200,0.08)';
                    ctx.fillRect(px + cs * 0.3 + hash2, py + cs * 0.4 + hash, 1, 1);
                }
                break;

            case TILE.FLOOR: {
                // Base stone floor with subtle variation
                const base = PALETTES.floor[hash];
                ctx.fillStyle = base;
                ctx.fillRect(px, py, cs, cs);

                // Stone tile grid
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 0.8;
                ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);

                // Inner stone detail
                if (cs > 12) {
                    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
                    ctx.lineWidth = 0.5;
                    // Diagonal crack
                    if (hash3 < 3) {
                        ctx.beginPath();
                        ctx.moveTo(px + cs * 0.2, py + cs * 0.3);
                        ctx.lineTo(px + cs * 0.5, py + cs * 0.6);
                        ctx.lineTo(px + cs * 0.8, py + cs * 0.5);
                        ctx.stroke();
                    }
                    // Subtle highlight
                    ctx.fillStyle = 'rgba(255,255,255,0.02)';
                    ctx.fillRect(px + 1, py + 1, cs / 2, cs / 2);
                    // Moss
                    if (hash2 === 0) {
                        ctx.fillStyle = 'rgba(40,80,40,0.15)';
                        ctx.beginPath();
                        ctx.arc(px + cs * 0.7, py + cs * 0.8, cs * 0.12, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                break;
            }

            case TILE.WALL: {
                // Stone brick wall
                const base = PALETTES.wall[hash];
                ctx.fillStyle = base;
                ctx.fillRect(px, py, cs, cs);

                if (cs > 8) {
                    const m = cs * 0.04;
                    // Brick pattern
                    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
                    ctx.lineWidth = 1;

                    // Top row - 2 bricks
                    ctx.strokeRect(px + m, py + m, cs * 0.45, cs * 0.4 - m);
                    ctx.strokeRect(px + cs * 0.5, py + m, cs * 0.5 - m, cs * 0.4 - m);

                    // Bottom row - offset bricks
                    ctx.strokeRect(px + m, py + cs * 0.45, cs * 0.25, cs * 0.5 - m);
                    ctx.strokeRect(px + cs * 0.28, py + cs * 0.45, cs * 0.45, cs * 0.5 - m);
                    ctx.strokeRect(px + cs * 0.75, py + cs * 0.45, cs * 0.22, cs * 0.5 - m);

                    // Top edge highlight
                    ctx.fillStyle = 'rgba(180,150,100,0.08)';
                    ctx.fillRect(px, py, cs, 2);

                    // Bottom shadow
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(px, py + cs - 2, cs, 2);

                    // Mortar line highlight
                    ctx.fillStyle = 'rgba(0,0,0,0.15)';
                    ctx.fillRect(px, py + cs * 0.4, cs, 1.5);
                }
                break;
            }

            case TILE.WATER: {
                // Deep water with animated waves
                const base = PALETTES.water[hash];
                const wGrad = ctx.createLinearGradient(px, py, px + cs, py + cs);
                wGrad.addColorStop(0, base);
                wGrad.addColorStop(1, '#145a8a');
                ctx.fillStyle = wGrad;
                ctx.fillRect(px, py, cs, cs);

                if (cs > 8) {
                    // Wave lines
                    ctx.strokeStyle = 'rgba(100,180,255,0.15)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(px, py + cs * 0.3);
                    ctx.quadraticCurveTo(px + cs * 0.5, py + cs * 0.2, px + cs, py + cs * 0.3);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(px, py + cs * 0.6);
                    ctx.quadraticCurveTo(px + cs * 0.5, py + cs * 0.7, px + cs, py + cs * 0.6);
                    ctx.stroke();

                    // Sparkle
                    ctx.fillStyle = 'rgba(150,220,255,0.12)';
                    ctx.fillRect(px + cs * 0.15 + hash2, py + cs * 0.08, cs * 0.2, cs * 0.06);

                    // Depth gradient
                    ctx.fillStyle = 'rgba(0,0,0,0.1)';
                    ctx.fillRect(px, py + cs * 0.7, cs, cs * 0.3);
                }
                break;
            }

            case TILE.LAVA: {
                // Molten lava with glow
                ctx.fillStyle = '#3a0800';
                ctx.fillRect(px, py, cs, cs);

                // Core glow
                const lGrad = ctx.createRadialGradient(px + cs / 2, py + cs / 2, 0, px + cs / 2, py + cs / 2, cs * 0.55);
                lGrad.addColorStop(0, 'rgba(255,220,50,0.6)');
                lGrad.addColorStop(0.3, 'rgba(255,120,0,0.4)');
                lGrad.addColorStop(0.7, 'rgba(200,50,0,0.2)');
                lGrad.addColorStop(1, 'rgba(80,10,0,0)');
                ctx.fillStyle = lGrad;
                ctx.fillRect(px, py, cs, cs);

                if (cs > 8) {
                    // Cracks
                    ctx.strokeStyle = 'rgba(255,200,0,0.5)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(px + cs * 0.15, py + cs * 0.25);
                    ctx.lineTo(px + cs * 0.5, py + cs * 0.5);
                    ctx.lineTo(px + cs * 0.85, py + cs * 0.35);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(px + cs * 0.3, py + cs * 0.7);
                    ctx.lineTo(px + cs * 0.6, py + cs * 0.55);
                    ctx.stroke();

                    // Outer glow
                    ctx.shadowColor = '#ff6600';
                    ctx.shadowBlur = 10;
                    ctx.fillStyle = 'rgba(255,150,0,0.08)';
                    ctx.fillRect(px, py, cs, cs);
                    ctx.shadowBlur = 0;
                }
                break;
            }

            case TILE.TREE: {
                // Forest floor base
                ctx.fillStyle = '#1a3a1a';
                ctx.fillRect(px, py, cs, cs);

                if (cs > 8) {
                    // Trunk
                    ctx.fillStyle = PALETTES.treeTrunk[hash];
                    ctx.fillRect(px + cs * 0.38, py + cs * 0.5, cs * 0.24, cs * 0.45);

                    // Trunk texture
                    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(px + cs * 0.42, py + cs * 0.55);
                    ctx.lineTo(px + cs * 0.42, py + cs * 0.9);
                    ctx.stroke();

                    // Canopy shadow
                    ctx.fillStyle = 'rgba(0,0,0,0.15)';
                    ctx.beginPath();
                    ctx.ellipse(px + cs / 2, py + cs * 0.42, cs * 0.4, cs * 0.32, 0, 0, Math.PI * 2);
                    ctx.fill();

                    // Main canopy
                    ctx.fillStyle = PALETTES.treeLeaf[hash];
                    ctx.beginPath();
                    ctx.arc(px + cs / 2, py + cs * 0.35, cs * 0.38, 0, Math.PI * 2);
                    ctx.fill();

                    // Light patch
                    ctx.fillStyle = PALETTES.treeLeafLight[hash];
                    ctx.beginPath();
                    ctx.arc(px + cs * 0.42, py + cs * 0.28, cs * 0.26, 0, Math.PI * 2);
                    ctx.fill();

                    // Leaf highlight
                    ctx.fillStyle = 'rgba(100,255,100,0.06)';
                    ctx.beginPath();
                    ctx.arc(px + cs * 0.38, py + cs * 0.25, cs * 0.14, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            }

            case TILE.DOOR: {
                // Floor base
                ctx.fillStyle = PALETTES.floor[hash];
                ctx.fillRect(px, py, cs, cs);

                // Door frame
                ctx.fillStyle = PALETTES.door[hash];
                ctx.fillRect(px + cs * 0.08, py + cs * 0.06, cs * 0.84, cs * 0.88);

                // Door panel
                ctx.fillStyle = PALETTES.doorDetail[hash];
                ctx.fillRect(px + cs * 0.14, py + cs * 0.1, cs * 0.72, cs * 0.8);

                if (cs > 10) {
                    // Panels
                    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px + cs * 0.2, py + cs * 0.15, cs * 0.6, cs * 0.32);
                    ctx.strokeRect(px + cs * 0.2, py + cs * 0.53, cs * 0.6, cs * 0.3);

                    // Handle
                    ctx.fillStyle = '#d4a843';
                    ctx.beginPath();
                    ctx.arc(px + cs * 0.72, py + cs * 0.5, cs * 0.06, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.2)';
                    ctx.beginPath();
                    ctx.arc(px + cs * 0.71, py + cs * 0.48, cs * 0.025, 0, Math.PI * 2);
                    ctx.fill();

                    // Top highlight
                    ctx.fillStyle = 'rgba(255,200,100,0.06)';
                    ctx.fillRect(px + cs * 0.14, py + cs * 0.1, cs * 0.72, 2);
                }
                break;
            }

            case TILE.CHEST: {
                // Floor base
                ctx.fillStyle = PALETTES.floor[hash];
                ctx.fillRect(px, py, cs, cs);

                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(px + cs * 0.12, py + cs * 0.55, cs * 0.76, cs * 0.15);

                // Chest body
                ctx.fillStyle = PALETTES.chest[hash];
                ctx.fillRect(px + cs * 0.12, py + cs * 0.35, cs * 0.76, cs * 0.45);

                // Chest lid
                ctx.fillStyle = PALETTES.chestGold[hash];
                ctx.fillRect(px + cs * 0.1, py + cs * 0.22, cs * 0.8, cs * 0.18);

                if (cs > 10) {
                    // Gold bands
                    ctx.fillStyle = PALETTES.chestGold[hash];
                    ctx.fillRect(px + cs * 0.1, py + cs * 0.38, cs * 0.8, cs * 0.04);
                    ctx.fillRect(px + cs * 0.1, py + cs * 0.65, cs * 0.8, cs * 0.04);

                    // Lock
                    ctx.fillStyle = PALETTES.chestGold[hash];
                    ctx.fillRect(px + cs * 0.42, py + cs * 0.42, cs * 0.16, cs * 0.14);

                    // Highlight
                    ctx.fillStyle = 'rgba(255,220,100,0.1)';
                    ctx.fillRect(px + cs * 0.15, py + cs * 0.25, cs * 0.3, cs * 0.1);

                    // Glow
                    ctx.shadowColor = '#d4a843';
                    ctx.shadowBlur = 6;
                    ctx.fillStyle = 'rgba(212,168,67,0.05)';
                    ctx.fillRect(px, py, cs, cs);
                    ctx.shadowBlur = 0;
                }
                break;
            }

            case TILE.SAND: {
                ctx.fillStyle = PALETTES.sand[hash];
                ctx.fillRect(px, py, cs, cs);
                if (cs > 8) {
                    // Grain texture
                    ctx.fillStyle = 'rgba(200,180,120,0.2)';
                    ctx.fillRect(px + cs * 0.2 + hash2, py + cs * 0.3, cs * 0.12, cs * 0.06);
                    ctx.fillStyle = 'rgba(0,0,0,0.05)';
                    ctx.fillRect(px, py + cs * 0.7, cs, cs * 0.3);
                }
                break;
            }

            case TILE.PATH: {
                ctx.fillStyle = PALETTES.path[hash];
                ctx.fillRect(px, py, cs, cs);
                ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                ctx.lineWidth = 0.5;
                ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
                if (cs > 10 && hash3 < 4) {
                    ctx.fillStyle = 'rgba(80,60,40,0.08)';
                    ctx.fillRect(px + cs * 0.2, py + cs * 0.3, cs * 0.15, cs * 0.08);
                }
                break;
            }

            case TILE.BRIDGE: {
                // Water underneath
                ctx.fillStyle = PALETTES.water[hash];
                ctx.fillRect(px, py, cs, cs);

                // Wooden planks
                ctx.fillStyle = '#6b5020';
                ctx.fillRect(px + cs * 0.05, py + cs * 0.05, cs * 0.9, cs * 0.9);

                if (cs > 8) {
                    // Plank lines
                    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                    ctx.lineWidth = 1;
                    for (let i = 0; i < 4; i++) {
                        ctx.beginPath();
                        ctx.moveTo(px + cs * 0.05, py + cs * (0.15 + i * 0.22));
                        ctx.lineTo(px + cs * 0.95, py + cs * (0.15 + i * 0.22));
                        ctx.stroke();
                    }

                    // Rails
                    ctx.fillStyle = '#4a3520';
                    ctx.fillRect(px + cs * 0.05, py + cs * 0.05, cs * 0.9, cs * 0.06);
                    ctx.fillRect(px + cs * 0.05, py + cs * 0.89, cs * 0.9, cs * 0.06);

                    // Nail
                    ctx.fillStyle = 'rgba(100,100,100,0.3)';
                    ctx.beginPath();
                    ctx.arc(px + cs * 0.5, py + cs * 0.5, cs * 0.03, 0, Math.PI * 2);
                    ctx.fill();
                }
                break;
            }

            case TILE.TRAP: {
                // Floor base (hidden trap)
                ctx.fillStyle = PALETTES.floor[hash];
                ctx.fillRect(px, py, cs, cs);

                if (cs > 8) {
                    // Subtle danger marks
                    ctx.strokeStyle = 'rgba(200,50,50,0.25)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(px + cs * 0.2, py + cs * 0.2);
                    ctx.lineTo(px + cs * 0.8, py + cs * 0.8);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(px + cs * 0.8, py + cs * 0.2);
                    ctx.lineTo(px + cs * 0.2, py + cs * 0.8);
                    ctx.stroke();

                    // Center dot
                    ctx.fillStyle = 'rgba(200,50,50,0.15)';
                    ctx.fillRect(px + cs * 0.38, py + cs * 0.38, cs * 0.24, cs * 0.24);

                    // Crack
                    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.moveTo(px + cs * 0.3, py + cs * 0.5);
                    ctx.lineTo(px + cs * 0.5, py + cs * 0.4);
                    ctx.lineTo(px + cs * 0.7, py + cs * 0.5);
                    ctx.stroke();
                }
                break;
            }

            case TILE.STAIRS: {
                // Floor base
                ctx.fillStyle = PALETTES.floor[hash];
                ctx.fillRect(px, py, cs, cs);

                if (cs > 8) {
                    // Stair steps
                    for (let i = 0; i < 5; i++) {
                        const sw = cs * 0.7 - i * cs * 0.1;
                        const sx = px + (cs - sw) / 2;
                        const sy = py + cs * (0.08 + i * 0.17);

                        // Step face
                        ctx.fillStyle = i % 2 === 0 ? '#3a3a5c' : '#353558';
                        ctx.fillRect(sx, sy, sw, cs * 0.13);

                        // Step highlight
                        ctx.fillStyle = 'rgba(255,255,255,0.04)';
                        ctx.fillRect(sx, sy, sw, 1.5);

                        // Step shadow
                        ctx.fillStyle = 'rgba(0,0,0,0.15)';
                        ctx.fillRect(sx, sy + cs * 0.13 - 1, sw, 1);
                    }
                }
                break;
            }

            case TILE.THRONE: {
                // Floor base
                ctx.fillStyle = PALETTES.floor[hash];
                ctx.fillRect(px, py, cs, cs);

                if (cs > 8) {
                    // Throne back
                    ctx.fillStyle = '#6b5020';
                    ctx.fillRect(px + cs * 0.15, py + cs * 0.08, cs * 0.7, cs * 0.8);

                    // Seat cushion
                    ctx.fillStyle = '#8b2020';
                    ctx.fillRect(px + cs * 0.2, py + cs * 0.5, cs * 0.6, cs * 0.25);

                    // Crown
                    ctx.fillStyle = '#d4a843';
                    ctx.beginPath();
                    ctx.moveTo(px + cs * 0.25, py + cs * 0.25);
                    ctx.lineTo(px + cs * 0.35, py + cs * 0.08);
                    ctx.lineTo(px + cs * 0.5, py + cs * 0.2);
                    ctx.lineTo(px + cs * 0.65, py + cs * 0.08);
                    ctx.lineTo(px + cs * 0.75, py + cs * 0.25);
                    ctx.closePath();
                    ctx.fill();

                    // Armrests
                    ctx.fillStyle = '#6b5020';
                    ctx.fillRect(px + cs * 0.1, py + cs * 0.45, cs * 0.1, cs * 0.35);
                    ctx.fillRect(px + cs * 0.8, py + cs * 0.45, cs * 0.1, cs * 0.35);

                    // Jewel
                    ctx.fillStyle = '#ff3333';
                    ctx.beginPath();
                    ctx.arc(px + cs * 0.5, py + cs * 0.62, cs * 0.04, 0, Math.PI * 2);
                    ctx.fill();

                    // Glow
                    ctx.shadowColor = '#d4a843';
                    ctx.shadowBlur = 8;
                    ctx.fillStyle = 'rgba(212,168,67,0.04)';
                    ctx.fillRect(px, py, cs, cs);
                    ctx.shadowBlur = 0;
                }
                break;
            }

            case TILE.BED: {
                // Floor base
                ctx.fillStyle = PALETTES.floor[hash];
                ctx.fillRect(px, py, cs, cs);

                if (cs > 8) {
                    // Bed frame
                    ctx.fillStyle = '#4a3520';
                    ctx.fillRect(px + cs * 0.08, py + cs * 0.15, cs * 0.84, cs * 0.72);

                    // Pillow
                    ctx.fillStyle = '#ddd8cc';
                    ctx.fillRect(px + cs * 0.12, py + cs * 0.2, cs * 0.3, cs * 0.2);

                    // Blanket
                    ctx.fillStyle = '#2a4a7a';
                    ctx.fillRect(px + cs * 0.12, py + cs * 0.45, cs * 0.76, cs * 0.35);

                    // Blanket fold
                    ctx.fillStyle = 'rgba(255,255,255,0.04)';
                    ctx.fillRect(px + cs * 0.12, py + cs * 0.45, cs * 0.76, 2);

                    // Headboard
                    ctx.fillStyle = '#3a2810';
                    ctx.fillRect(px + cs * 0.08, py + cs * 0.1, cs * 0.84, cs * 0.06);
                }
                break;
            }

            case TILE.TABLE: {
                // Floor base
                ctx.fillStyle = PALETTES.floor[hash];
                ctx.fillRect(px, py, cs, cs);

                if (cs > 8) {
                    // Table top
                    ctx.fillStyle = '#5d4037';
                    ctx.fillRect(px + cs * 0.08, py + cs * 0.28, cs * 0.84, cs * 0.18);

                    // Table top highlight
                    ctx.fillStyle = 'rgba(255,255,255,0.04)';
                    ctx.fillRect(px + cs * 0.08, py + cs * 0.28, cs * 0.84, 2);

                    // Legs
                    ctx.fillStyle = '#4a3520';
                    ctx.fillRect(px + cs * 0.12, py + cs * 0.46, cs * 0.06, cs * 0.38);
                    ctx.fillRect(px + cs * 0.82, py + cs * 0.46, cs * 0.06, cs * 0.38);

                    // Item on table
                    if (hash2 < 3) {
                        ctx.fillStyle = 'rgba(200,180,100,0.15)';
                        ctx.fillRect(px + cs * 0.35, py + cs * 0.32, cs * 0.15, cs * 0.1);
                    }
                }
                break;
            }

            default:
                ctx.fillStyle = '#020208';
                ctx.fillRect(px, py, cs, cs);
        }
    }

    _lighten(hex, amount) {
        if (!hex || hex.length < 7) return '#ffffff';
        let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        r = Math.min(255, r + amount); g = Math.min(255, g + amount); b = Math.min(255, b + amount);
        return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    }

    _darken(hex, amount) {
        if (!hex || hex.length < 7) return '#000000';
        let r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
        r = Math.max(0, r - amount); g = Math.max(0, g - amount); b = Math.max(0, b - amount);
        return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
    }
}
