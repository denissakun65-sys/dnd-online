// ===== map.js — Grid Map with random generation =====

const TILE = { EMPTY:0, FLOOR:1, WALL:2, WATER:3, LAVA:4, TREE:5, DOOR:6, CHEST:7 };
const TILE_COLORS = { 0:'#0a0a0a', 1:'#3a3a5c', 2:'#5c4033', 3:'#1a5276', 4:'#922b21', 5:'#1e6e3e', 6:'#7d6608', 7:'#b7950b' };
const TILE_EMOJIS = { 2:'🧱', 3:'🌊', 4:'🔥', 5:'🌳', 6:'🚪', 7:'📦' };

class GameMap {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridSize = 30;
        this.cellSize = 32;
        this.map = [];
        this.fogMap = [];
        this.fogEnabled = false;
        this.players = {};
        this.selectedTool = TILE.FLOOR;
        this.isDrawing = false;
        this.isHost = false;
        this.myPlayerId = '';
        this.offsetX = 0; this.offsetY = 0;
        this.zoom = 1;
        this.isPanning = false;
        this.panStart = { x:0, y:0 };
        this.onMapChange = null;
        this.onPlayerMove = null;
        this._initMap();
        this._setupEvents();
        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _initMap() {
        this.map = []; this.fogMap = [];
        for (let y = 0; y < this.gridSize; y++) {
            this.map[y] = []; this.fogMap[y] = [];
            for (let x = 0; x < this.gridSize; x++) {
                this.map[y][x] = TILE.EMPTY; this.fogMap[y][x] = true;
            }
        }
    }

    _resize() {
        const r = this.canvas.parentElement.getBoundingClientRect();
        this.canvas.width = r.width; this.canvas.height = r.height;
        this.render();
    }

    _setupEvents() {
        this.canvas.addEventListener('mousedown', e => this._onDown(e));
        this.canvas.addEventListener('mousemove', e => this._onMove(e));
        this.canvas.addEventListener('mouseup', () => { this.isDrawing = false; this.isPanning = false; });
        this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.max(0.5, Math.min(3, this.zoom + (e.deltaY > 0 ? -0.1 : 0.1))); this.render(); });
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
        this.canvas.addEventListener('touchstart', e => { e.preventDefault(); this._onDown({ ...e.touches[0], button:0 }); });
        this.canvas.addEventListener('touchmove', e => { e.preventDefault(); this._onMove({ ...e.touches[0] }); });
        this.canvas.addEventListener('touchend', () => { this.isDrawing = false; });
    }

    _s2g(sx, sy) {
        const r = this.canvas.getBoundingClientRect();
        return { gx: Math.floor((sx - r.left - this.offsetX) / (this.cellSize * this.zoom)), gy: Math.floor((sy - r.top - this.offsetY) / (this.cellSize * this.zoom)) };
    }

    _onDown(e) {
        const { gx, gy } = this._s2g(e.clientX, e.clientY);
        if (e.button === 1 || e.ctrlKey) { this.isPanning = true; this.panStart = { x: e.clientX - this.offsetX, y: e.clientY - this.offsetY }; return; }
        if (e.button === 2 || (!this.isHost && this.players[this.myPlayerId])) { this._movePlayer(this.myPlayerId, gx, gy); return; }
        if (this.isHost && this.selectedTool !== null) { this.isDrawing = true; this._paint(gx, gy); }
        else if (this.players[this.myPlayerId]) { this._movePlayer(this.myPlayerId, gx, gy); }
    }

    _onMove(e) {
        if (this.isPanning) { this.offsetX = e.clientX - this.panStart.x; this.offsetY = e.clientY - this.panStart.y; this.render(); return; }
        if (this.isDrawing && this.isHost) { const { gx, gy } = this._s2g(e.clientX, e.clientY); this._paint(gx, gy); }
    }

    _paint(gx, gy) {
        if (gx < 0 || gx >= this.gridSize || gy < 0 || gy >= this.gridSize) return;
        this.map[gy][gx] = this.selectedTool; this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    _movePlayer(id, gx, gy) {
        if (gx < 0 || gx >= this.gridSize || gy < 0 || gy >= this.gridSize) return;
        if (this.map[gy][gx] === TILE.WALL || this.map[gy][gx] === TILE.TREE) return;
        this.players[id].x = gx; this.players[id].y = gy; this.render();
        if (this.onPlayerMove) this.onPlayerMove(id, gx, gy);
    }

    setMapData(data) { if (data) { this.map = data; this.gridSize = data.length; this.render(); } }
    setPlayerPosition(id, x, y) { if (this.players[id]) { this.players[id].x = x; this.players[id].y = y; this.render(); } }
    addPlayer(id, name, color) { this.players[id] = { x: Math.floor(this.gridSize/2), y: Math.floor(this.gridSize/2), name, color }; this.render(); }
    removePlayer(id) { delete this.players[id]; this.render(); }
    fillFloor() { for (let y=0;y<this.gridSize;y++) for (let x=0;x<this.gridSize;x++) this.map[y][x]=TILE.FLOOR; this.render(); if (this.onMapChange) this.onMapChange(this.map); }
    clearMap() { this._initMap(); this.render(); if (this.onMapChange) this.onMapChange(this.map); }

    revealFog(id, radius=3) {
        if (!this.fogEnabled || !this.players[id]) return;
        const p = this.players[id];
        for (let dy=-radius;dy<=radius;dy++) for (let dx=-radius;dx<=radius;dx++) {
            const nx=p.x+dx, ny=p.y+dy;
            if (nx>=0&&nx<this.gridSize&&ny>=0&&ny<this.gridSize&&dx*dx+dy*dy<=radius*radius) this.fogMap[ny][nx]=false;
        }
        this.render();
    }

    // ===== RANDOM MAP GENERATION =====
    generate(type) {
        this._initMap();
        switch(type) {
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
        const g = this.gridSize;
        // Fill with walls
        for (let y=0;y<g;y++) for (let x=0;x<g;x++) this.map[y][x]=TILE.WALL;
        // Carve rooms
        const rooms = [];
        for (let i=0;i<8;i++) {
            const rw = 3+Math.floor(Math.random()*5), rh = 3+Math.floor(Math.random()*4);
            const rx = 1+Math.floor(Math.random()*(g-rw-2)), ry = 1+Math.floor(Math.random()*(g-rh-2));
            let overlap = false;
            for (const r of rooms) { if (rx<r.x+r.w+1 && rx+rw>r.x-1 && ry<r.y+r.h+1 && ry+rh>r.y-1) { overlap=true; break; } }
            if (!overlap) {
                rooms.push({x:rx,y:ry,w:rw,h:rh});
                for (let y=ry;y<ry+rh;y++) for (let x=rx;x<rx+rw;x++) this.map[y][x]=TILE.FLOOR;
                // Add chest in some rooms
                if (Math.random()>0.6) this.map[ry+1][rx+1]=TILE.CHEST;
            }
        }
        // Connect rooms with corridors
        for (let i=1;i<rooms.length;i++) {
            const a = rooms[i-1], b = rooms[i];
            const ax = Math.floor(a.x+a.w/2), ay = Math.floor(a.y+a.h/2);
            const bx = Math.floor(b.x+b.w/2), by = Math.floor(b.y+b.h/2);
            for (let x=Math.min(ax,bx);x<=Math.max(ax,bx);x++) { this.map[ay][x]=TILE.FLOOR; }
            for (let y=Math.min(ay,by);y<=Math.max(ay,by);y++) { this.map[y][bx]=TILE.FLOOR; }
            // Add doors at intersections
            if (this.map[ay][ax]===TILE.FLOOR) this.map[ay][ax]=TILE.DOOR;
        }
        // Place players in first room
        this._placePlayersInRoom(rooms[0]);
    }

    _genCave() {
        const g = this.gridSize;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++) this.map[y][x]=TILE.WALL;
        // Random walk cave generation
        let cx=Math.floor(g/2), cy=Math.floor(g/2);
        for (let i=0;i<400;i++) {
            if (cx>=1&&cx<g-1&&cy>=1&&cy<g-1) this.map[cy][cx]=TILE.FLOOR;
            const dir = Math.floor(Math.random()*4);
            if (dir===0) cx++; else if (dir===1) cx--; else if (dir===2) cy++; else cy--;
            cx=Math.max(1,Math.min(g-2,cx)); cy=Math.max(1,Math.min(g-2,cy));
        }
        // Add some water pools
        for (let i=0;i<5;i++) {
            const px=2+Math.floor(Math.random()*(g-4)), py=2+Math.floor(Math.random()*(g-4));
            for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
                if (py+dy>=0&&py+dy<g&&px+dx>=0&&px+dx<g&&this.map[py+dy][px+dx]===TILE.FLOOR&&Math.random()>0.3)
                    this.map[py+dy][px+dx]=TILE.WATER;
            }
        }
        // Add chests
        for (let i=0;i<3;i++) {
            let px,py,tries=0;
            do { px=Math.floor(Math.random()*g); py=Math.floor(Math.random()*g); tries++; } while (this.map[py][px]!==TILE.FLOOR&&tries<100);
            if (tries<100) this.map[py][px]=TILE.CHEST;
        }
        this._placePlayersNearCenter();
    }

    _genForest() {
        const g = this.gridSize;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++) this.map[y][x]=TILE.FLOOR;
        // Add trees
        for (let i=0;i<120;i++) {
            const x=Math.floor(Math.random()*g), y=Math.floor(Math.random()*g);
            this.map[y][x]=TILE.TREE;
        }
        // Clear paths
        for (let i=0;i<3;i++) {
            const y=Math.floor(Math.random()*g);
            for (let x=0;x<g;x++) if (this.map[y][x]===TILE.TREE) this.map[y][x]=TILE.FLOOR;
        }
        // Add a small pond
        const px=Math.floor(g/2), py=Math.floor(g/2);
        for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++) {
            if (dx*dx+dy*dy<=4&&py+dy>=0&&py+dy<g&&px+dx>=0&&px+dx<g) this.map[py+dy][px+dx]=TILE.WATER;
        }
        this._placePlayersNearCenter();
    }

    _genTavern() {
        const g = this.gridSize;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++) this.map[y][x]=TILE.EMPTY;
        // Main hall
        for (let y=4;y<20;y++) for (let x=4;x<24;x++) this.map[y][x]=TILE.FLOOR;
        // Walls
        for (let x=4;x<24;x++) { this.map[4][x]=TILE.WALL; this.map[19][x]=TILE.WALL; }
        for (let y=4;y<20;y++) { this.map[y][4]=TILE.WALL; this.map[y][23]=TILE.WALL; }
        // Door
        this.map[19][13]=TILE.DOOR; this.map[19][14]=TILE.DOOR;
        // Bar counter (wall)
        for (let x=7;x<17;x++) this.map[8][x]=TILE.WALL;
        // Back rooms
        for (let y=4;y<10;y++) for (let x=20;x<23;x++) this.map[y][x]=TILE.FLOOR;
        this.map[9][20]=TILE.DOOR;
        for (let y=10;y<16;y++) for (let x=20;x<23;x++) this.map[y][x]=TILE.FLOOR;
        this.map[10][20]=TILE.DOOR;
        // Chests
        this.map[5][21]=TILE.CHEST; this.map[12][21]=TILE.CHEST;
        this._placePlayersAt(13, 16);
    }

    _genCastle() {
        const g = this.gridSize;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++) this.map[y][x]=TILE.EMPTY;
        // Outer walls
        for (let y=2;y<22;y++) for (let x=2;x<28;x++) {
            if (y===2||y===21||x===2||x===27) this.map[y][x]=TILE.WALL;
            else this.map[y][x]=TILE.FLOOR;
        }
        // Inner keep
        for (let y=8;y<16;y++) for (let x=10;x<20;x++) {
            if (y===8||y===15||x===10||x===19) this.map[y][x]=TILE.WALL;
            else this.map[y][x]=TILE.FLOOR;
        }
        // Gates
        this.map[21][14]=TILE.DOOR; this.map[21][15]=TILE.DOOR;
        this.map[15][14]=TILE.DOOR; this.map[15][15]=TILE.DOOR;
        // Throne room chest
        this.map[12][14]=TILE.CHEST;
        this._placePlayersAt(14, 20);
    }

    _genTemple() {
        const g = this.gridSize;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++) this.map[y][x]=TILE.EMPTY;
        // Temple shape
        for (let y=3;y<22;y++) for (let x=8;x<22;x++) {
            const cx=15, cy=12;
            const dist = Math.abs(x-cx)+Math.abs(y-cy);
            if (dist <= 12) this.map[y][x]=TILE.FLOOR;
        }
        // Walls
        for (let y=3;y<22;y++) for (let x=8;x<22;x++) {
            if (this.map[y][x]===TILE.FLOOR) {
                const neighbors = [[0,1],[0,-1],[1,0],[-1,0]];
                for (const [dx,dy] of neighbors) {
                    const ny=y+dy, nx=x+dx;
                    if (ny>=0&&ny<g&&nx>=0&&nx<g&&this.map[ny][nx]===TILE.EMPTY) this.map[y][x]=TILE.WALL;
                }
            }
        }
        // Lava altar
        this.map[12][15]=TILE.LAVA;
        this.map[11][14]=TILE.LAVA; this.map[11][16]=TILE.LAVA;
        this.map[13][14]=TILE.LAVA; this.map[13][16]=TILE.LAVA;
        // Door
        this.map[21][15]=TILE.DOOR;
        // Chests
        this.map[6][11]=TILE.CHEST; this.map[6][19]=TILE.CHEST;
        this._placePlayersAt(15, 20);
    }

    _genVillage() {
        const g = this.gridSize;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++) this.map[y][x]=TILE.FLOOR;
        // Roads
        for (let y=0;y<g;y++) this.map[y][15]=TILE.FLOOR;
        for (let x=0;x<g;x++) this.map[15][x]=TILE.FLOOR;
        // Houses
        const houses = [[3,3,5,4],[3,10,5,4],[3,20,6,4],[10,3,5,4],[10,20,6,4],[20,3,5,4],[20,10,5,4],[20,20,6,4]];
        for (const [hx,hy,hw,hh] of houses) {
            for (let y=hy;y<hy+hh;y++) for (let x=hx;x<hx+hw;x++) {
                if (y===hy||y===hy+hh-1||x===hx||x===hx+hw-1) this.map[y][x]=TILE.WALL;
                else this.map[y][x]=TILE.FLOOR;
            }
            this.map[hy+hh-1][hx+Math.floor(hw/2)]=TILE.DOOR;
            this.map[hy+1][hx+1]=TILE.CHEST;
        }
        // Trees
        for (let i=0;i<30;i++) {
            const x=Math.floor(Math.random()*g), y=Math.floor(Math.random()*g);
            if (this.map[y][x]===TILE.FLOOR) this.map[y][x]=TILE.TREE;
        }
        this._placePlayersAt(15, 16);
    }

    _genIsland() {
        const g = this.gridSize;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++) this.map[y][x]=TILE.WATER;
        // Island shape
        const cx=15, cy=15, r=10;
        for (let y=0;y<g;y++) for (let x=0;x<g;x++) {
            const dist = Math.sqrt((x-cx)**2+(y-cy)**2);
            if (dist < r-1) this.map[y][x]=TILE.FLOOR;
            else if (dist < r) this.map[y][x]=TILE.SAND||TILE.FLOOR;
        }
        // Trees
        for (let i=0;i<20;i++) {
            const x=Math.floor(Math.random()*g), y=Math.floor(Math.random()*g);
            if (this.map[y][x]===TILE.FLOOR) this.map[y][x]=TILE.TREE;
        }
        // Chest (buried treasure)
        this.map[cy][cx]=TILE.CHEST;
        this._placePlayersAt(cx, cy-3);
    }

    _placePlayersInRoom(room) {
        const cx = room.x + Math.floor(room.w/2), cy = room.y + Math.floor(room.h/2);
        this._placePlayersAt(cx, cy);
    }

    _placePlayersNearCenter() {
        const cx = Math.floor(this.gridSize/2), cy = Math.floor(this.gridSize/2);
        // Find nearest floor tile
        for (let r=0;r<10;r++) for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++) {
            const nx=cx+dx, ny=cy+dy;
            if (nx>=0&&nx<this.gridSize&&ny>=0&&ny<this.gridSize&&this.map[ny][nx]===TILE.FLOOR) {
                this._placePlayersAt(nx, ny); return;
            }
        }
    }

    _placePlayersAt(cx, cy) {
        let i = 0;
        for (const [id, p] of Object.entries(this.players)) {
            const ox = (i % 3) - 1, oy = Math.floor(i / 3);
            p.x = Math.max(0, Math.min(this.gridSize-1, cx+ox));
            p.y = Math.max(0, Math.min(this.gridSize-1, cy+oy));
            i++;
        }
    }

    // Set map from AI-generated data
    setMapFromAI(aiMapData) {
        if (!aiMapData || !aiMapData.length) return;
        const h = aiMapData.length, w = aiMapData[0].length;
        // Resize if needed
        if (h > this.gridSize || w > this.gridSize) this.gridSize = Math.max(h, w);
        this._initMap();
        for (let y=0;y<Math.min(h,this.gridSize);y++)
            for (let x=0;x<Math.min(w,this.gridSize);x++)
                this.map[y][x] = Math.max(0, Math.min(7, aiMapData[y][x]||0));
        this._placePlayersNearCenter();
        this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    getMapDescription() {
        const features = [], positions = [];
        for (let y=0;y<this.gridSize;y++) for (let x=0;x<this.gridSize;x++) {
            const t = this.map[y][x];
            if (t===TILE.WALL) features.push(`стена(${x},${y})`);
            else if (t===TILE.WATER) features.push(`вода(${x},${y})`);
            else if (t===TILE.LAVA) features.push(`лава(${x},${y})`);
            else if (t===TILE.DOOR) features.push(`дверь(${x},${y})`);
            else if (t===TILE.CHEST) features.push(`сундук(${x},${y})`);
            else if (t===TILE.TREE) features.push(`дерево(${x},${y})`);
        }
        for (const [id, p] of Object.entries(this.players)) positions.push(`${p.name}(${p.x},${p.y})`);
        return `Объекты: ${features.length>0?features.slice(0,20).join(', '):'пусто'}. Позиции: ${positions.join(', ')}.`;
    }

    render() {
        const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height, cs = this.cellSize * this.zoom;
        ctx.clearRect(0,0,w,h); ctx.fillStyle='#050505'; ctx.fillRect(0,0,w,h);
        ctx.save(); ctx.translate(this.offsetX, this.offsetY);
        for (let y=0;y<this.gridSize;y++) for (let x=0;x<this.gridSize;x++) {
            const px=x*cs, py=y*cs;
            if (this.fogEnabled&&this.fogMap[y][x]) { ctx.fillStyle='#111'; ctx.fillRect(px,py,cs,cs); continue; }
            const tile = this.map[y][x];
            ctx.fillStyle = TILE_COLORS[tile]||TILE_COLORS[0]; ctx.fillRect(px,py,cs,cs);
            ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=0.5; ctx.strokeRect(px,py,cs,cs);
            if (TILE_EMOJIS[tile]&&cs>16) { ctx.font=`${cs*0.6}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(TILE_EMOJIS[tile],px+cs/2,py+cs/2); }
        }
        for (const [id, p] of Object.entries(this.players)) {
            if (this.fogEnabled&&this.fogMap[p.y]&&this.fogMap[p.y][p.x]) continue;
            const px=p.x*cs, py=p.y*cs, isMe=id===this.myPlayerId;
            ctx.beginPath(); ctx.arc(px+cs/2,py+cs/2,cs*0.38,0,Math.PI*2);
            ctx.fillStyle=p.color; ctx.fill();
            ctx.strokeStyle=isMe?'#fff':'rgba(255,255,255,0.5)'; ctx.lineWidth=isMe?3:1.5; ctx.stroke();
            if (isMe) { ctx.shadowColor=p.color; ctx.shadowBlur=15; ctx.beginPath(); ctx.arc(px+cs/2,py+cs/2,cs*0.38,0,Math.PI*2); ctx.stroke(); ctx.shadowBlur=0; }
            if (cs>20) { ctx.font=`bold ${Math.max(9,cs*0.3)}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='white'; ctx.strokeStyle='black'; ctx.lineWidth=2.5; ctx.strokeText(p.name,px+cs/2,py+cs+2); ctx.fillText(p.name,px+cs/2,py+cs+2); }
        }
        ctx.restore();
    }
}
