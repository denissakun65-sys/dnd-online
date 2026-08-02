// ===== map.js — Unlimited realistic map with procedural generation =====

const TILE = { EMPTY:0, FLOOR:1, WALL:2, WATER:3, LAVA:4, TREE:5, DOOR:6, CHEST:7, SAND:8, PATH:9, BRIDGE:10, TRAP:11, STAIRS:12, THRONE:13, BED:14, TABLE:15 };
const TILE_COLORS = { 0:'#080808', 1:'#3a3a5c', 2:'#5c4033', 3:'#1a5276', 4:'#922b21', 5:'#1e6e3e', 6:'#7d6608', 7:'#b7950b', 8:'#c2b280', 9:'#4a4a6a', 10:'#8b6914', 11:'#c0392b', 12:'#2c3e50', 13:'#f1c40f', 14:'#6d4c41', 15:'#5d4037' };
const TILE_EMOJIS = { 2:'🧱', 3:'🌊', 4:'🔥', 5:'🌳', 6:'🚪', 7:'📦', 8:'', 9:'', 10:'🌉', 11:'⚠️', 12:'🪜', 13:'👑', 14:'🛏️', 15:'' };

class GameMap {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.gridW = 60; // wider
        this.gridH = 60; // taller
        this.cellSize = 28;
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
        for (let y = 0; y < this.gridH; y++) {
            this.map[y] = []; this.fogMap[y] = [];
            for (let x = 0; x < this.gridW; x++) {
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
        this.canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.max(0.3, Math.min(4, this.zoom + (e.deltaY > 0 ? -0.1 : 0.1))); this.render(); });
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
        if (gx < 0 || gx >= this.gridW || gy < 0 || gy >= this.gridH) return;
        this.map[gy][gx] = this.selectedTool; this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    _movePlayer(id, gx, gy) {
        if (gx < 0 || gx >= this.gridW || gy < 0 || gy >= this.gridH) return;
        const t = this.map[gy][gx];
        if (t === TILE.WALL || t === TILE.TREE || t === TILE.LAVA) return;
        this.players[id].x = gx; this.players[id].y = gy; this.render();
        if (this.onPlayerMove) this.onPlayerMove(id, gx, gy);
    }

    setMapData(data) {
        if (!data) return;
        this.map = data;
        this.gridH = data.length;
        this.gridW = data[0] ? data[0].length : this.gridH;
        this.render();
    }

    setPlayerPosition(id, x, y) { if (this.players[id]) { this.players[id].x = x; this.players[id].y = y; this.render(); } }
    addPlayer(id, name, color) { this.players[id] = { x: Math.floor(this.gridW/2), y: Math.floor(this.gridH/2), name, color }; this.render(); }
    removePlayer(id) { delete this.players[id]; this.render(); }
    fillFloor() { for (let y=0;y<this.gridH;y++) for (let x=0;x<this.gridW;x++) this.map[y][x]=TILE.FLOOR; this.render(); if (this.onMapChange) this.onMapChange(this.map); }
    clearMap() { this._initMap(); this.render(); if (this.onMapChange) this.onMapChange(this.map); }

    revealFog(id, radius=4) {
        if (!this.fogEnabled || !this.players[id]) return;
        const p = this.players[id];
        for (let dy=-radius;dy<=radius;dy++) for (let dx=-radius;dx<=radius;dx++) {
            const nx=p.x+dx, ny=p.y+dy;
            if (nx>=0&&nx<this.gridW&&ny>=0&&ny<this.gridH&&dx*dx+dy*dy<=radius*radius) this.fogMap[ny][nx]=false;
        }
        this.render();
    }

    _placePlayersAt(cx, cy) {
        let i = 0;
        for (const [id, p] of Object.entries(this.players)) {
            const ox = (i % 3) - 1, oy = Math.floor(i / 3);
            p.x = Math.max(0, Math.min(this.gridW-1, cx+ox));
            p.y = Math.max(0, Math.min(this.gridH-1, cy+oy));
            i++;
        }
    }

    _placePlayersNearCenter() {
        const cx = Math.floor(this.gridW/2), cy = Math.floor(this.gridH/2);
        for (let r=0;r<15;r++) for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++) {
            const nx=cx+dx, ny=cy+dy;
            if (nx>=0&&nx<this.gridW&&ny>=0&&ny<this.gridH&&this.map[ny][nx]===TILE.FLOOR) {
                this._placePlayersAt(nx, ny); return;
            }
        }
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

    // ===== DUNGEON =====
    _genDungeon() {
        const W = this.gridW, H = this.gridH;
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) this.map[y][x]=TILE.WALL;
        const rooms = [];
        for (let attempt=0; attempt<60; attempt++) {
            const rw = 4+Math.floor(Math.random()*7), rh = 3+Math.floor(Math.random()*6);
            const rx = 1+Math.floor(Math.random()*(W-rw-2)), ry = 1+Math.floor(Math.random()*(H-rh-2));
            let ok = true;
            for (const r of rooms) { if (rx<r.x+r.w+2 && rx+rw>r.x-2 && ry<r.y+r.h+2 && ry+rh>r.y-2) { ok=false; break; } }
            if (ok) {
                rooms.push({x:rx,y:ry,w:rw,h:rh});
                for (let y=ry;y<ry+rh;y++) for (let x=rx;x<rx+rw;x++) this.map[y][x]=TILE.FLOOR;
                // Furniture
                if (Math.random()>0.5 && rw>4) this.map[ry+1][rx+rw-2]=TILE.BED;
                if (Math.random()>0.5) this.map[ry+1][rx+1]=TILE.TABLE;
                if (Math.random()>0.65) this.map[ry+Math.floor(rh/2)][rx+Math.floor(rw/2)]=TILE.CHEST;
                if (Math.random()>0.8) this.map[ry+1][rx+rw-2]=TILE.TRAP;
            }
        }
        // Connect rooms with corridors
        for (let i=1;i<rooms.length;i++) {
            const a=rooms[i-1], b=rooms[i];
            const ax=a.x+Math.floor(a.w/2), ay=a.y+Math.floor(a.h/2);
            const bx=b.x+Math.floor(b.w/2), by=b.y+Math.floor(b.h/2);
            // L-shaped corridor
            let cx=ax, cy=ay;
            while (cx!==bx) { if (cy>=0&&cy<H&&cx>=0&&cx<W&&this.map[cy][cx]===TILE.WALL) this.map[cy][cx]=TILE.FLOOR; cx+=cx<bx?1:-1; }
            while (cy!==by) { if (cy>=0&&cy<H&&cx>=0&&cx<W&&this.map[cy][cx]===TILE.WALL) this.map[cy][cx]=TILE.FLOOR; cy+=cy<by?1:-1; }
            // Doors at room entrances
            if (this.map[ay]&&this.map[ay][ax]===TILE.FLOOR) this.map[ay][ax]=TILE.DOOR;
            if (this.map[by]&&this.map[by][bx]===TILE.FLOOR) this.map[by][bx]=TILE.DOOR;
        }
        // Stairs
        if (rooms.length>2) { const last=rooms[rooms.length-1]; this.map[last.y+1][last.x+1]=TILE.STAIRS; }
        this._placePlayersAt(rooms[0].x+Math.floor(rooms[0].w/2), rooms[0].y+Math.floor(rooms[0].h/2));
    }

    // ===== CAVE =====
    _genCave() {
        const W=this.gridW, H=this.gridH;
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) this.map[y][x]=TILE.WALL;
        // Cellular automata
        let grid = [];
        for (let y=0;y<H;y++) { grid[y]=[]; for (let x=0;x<W;x++) grid[y][x]=Math.random()<0.45?1:0; }
        // 5 iterations
        for (let iter=0;iter<5;iter++) {
            const next=[];
            for (let y=0;y<H;y++) { next[y]=[]; for (let x=0;x<W;x++) {
                let walls=0;
                for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++) {
                    const ny=y+dy,nx=x+dx;
                    if (ny<0||ny>=H||nx<0||nx>=W) walls++;
                    else if (grid[ny][nx]===1) walls++;
                }
                next[y][x]=walls>=5?1:0;
            }}
            grid=next;
        }
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) this.map[y][x]=grid[y][x]?TILE.WALL:TILE.FLOOR;
        // Water pools
        for (let i=0;i<8;i++) {
            const px=3+Math.floor(Math.random()*(W-6)), py=3+Math.floor(Math.random()*(H-6));
            const r=1+Math.floor(Math.random()*3);
            for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++) {
                const ny=py+dy,nx=px+dx;
                if (ny>=0&&ny<H&&nx>=0&&nx<W&&this.map[ny][nx]===TILE.FLOOR&&dx*dx+dy*dy<=r*r) this.map[ny][nx]=TILE.WATER;
            }
        }
        // Stalagmites (walls)
        for (let i=0;i<15;i++) {
            const x=2+Math.floor(Math.random()*(W-4)), y=2+Math.floor(Math.random()*(H-4));
            if (this.map[y][x]===TILE.FLOOR) this.map[y][x]=TILE.WALL;
        }
        // Chests
        for (let i=0;i<5;i++) { let x,y,tries=0; do {x=Math.floor(Math.random()*W);y=Math.floor(Math.random()*H);tries++;}while(this.map[y][x]!==TILE.FLOOR&&tries<200); if(tries<200)this.map[y][x]=TILE.CHEST; }
        this._placePlayersNearCenter();
    }

    // ===== FOREST =====
    _genForest() {
        const W=this.gridW, H=this.gridH;
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) this.map[y][x]=TILE.FLOOR;
        // Dense trees
        for (let i=0;i<W*H*0.3;i++) {
            const x=Math.floor(Math.random()*W), y=Math.floor(Math.random()*H);
            this.map[y][x]=TILE.TREE;
        }
        // Clear paths (winding)
        for (let p=0;p<4;p++) {
            let px=Math.floor(Math.random()*W), py=0;
            while (py<H) {
                for (let dx=-1;dx<=1;dx++) { const nx=px+dx; if(nx>=0&&nx<W) this.map[py][nx]=TILE.PATH; }
                px+=Math.floor(Math.random()*3)-1; px=Math.max(0,Math.min(W-1,px));
                py++;
            }
        }
        // Pond
        const px=Math.floor(W/2), py=Math.floor(H/2), r=3+Math.floor(Math.random()*3);
        for (let dy=-r;dy<=r;dy++) for (let dx=-r;dx<=r;dx++) {
            const ny=py+dy,nx=px+dx;
            if (ny>=0&&ny<H&&nx>=0&&nx<W&&dx*dx+dy*dy<=r*r) this.map[ny][nx]=TILE.WATER;
        }
        // Bridge over pond
        for (let dx=-r;dx<=r;dx++) { const nx=px+dx; if(nx>=0&&nx<W) this.map[py][nx]=TILE.BRIDGE; }
        this._placePlayersNearCenter();
    }

    // ===== TAVERN =====
    _genTavern() {
        const W=this.gridW, H=this.gridH;
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) this.map[y][x]=TILE.EMPTY;
        // Main hall
        const hx=4,hy=4,hw=24,hh=20;
        for (let y=hy;y<hy+hh;y++) for (let x=hx;x<hx+hw;x++) this.map[y][x]=TILE.FLOOR;
        // Walls
        for (let x=hx;x<hx+hw;x++) { this.map[hy][x]=TILE.WALL; this.map[hy+hh-1][x]=TILE.WALL; }
        for (let y=hy;y<hy+hh;y++) { this.map[y][hx]=TILE.WALL; this.map[y][hx+hw-1]=TILE.WALL; }
        // Door
        this.map[hy+hh-1][hx+Math.floor(hw/2)]=TILE.DOOR;
        this.map[hy+hh-1][hx+Math.floor(hw/2)+1]=TILE.DOOR;
        // Bar counter
        for (let x=hx+3;x<hx+hw-3;x++) this.map[hy+5][x]=TILE.WALL;
        this.map[hy+5][hx+Math.floor(hw/2)]=TILE.DOOR; // gap in bar
        // Tables
        for (let i=0;i<6;i++) {
            const tx=hx+2+Math.floor(Math.random()*(hw-6)), ty=hy+8+Math.floor(Math.random()*8);
            if (this.map[ty][tx]===TILE.FLOOR) this.map[ty][tx]=TILE.TABLE;
        }
        // Back rooms
        for (let y=hy;y<hy+5;y++) for (let x=hx+hw-6;x<hx+hw-1;x++) this.map[y][x]=TILE.FLOOR;
        this.map[hy+4][hx+hw-6]=TILE.DOOR;
        this.map[hy+1][hx+hw-2]=TILE.BED;
        this.map[hy+2][hx+hw-2]=TILE.CHEST;
        // Kitchen
        for (let y=hy+hh-6;y<hy+hh-1;y++) for (let x=hx+hw-6;x<hx+hw-1;x++) this.map[y][x]=TILE.FLOOR;
        this.map[hy+hh-6][hx+hw-6]=TILE.DOOR;
        this.map[hy+hh-4][hx+hw-3]=TILE.TABLE;
        // Fireplace
        this.map[hy+1][hx+2]=TILE.LAVA;
        this._placePlayersAt(hx+Math.floor(hw/2), hy+hh-3);
    }

    // ===== CASTLE =====
    _genCastle() {
        const W=this.gridW, H=this.gridH;
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) this.map[y][x]=TILE.EMPTY;
        // Outer walls
        const ox=2,oy=2,ow=W-4,oh=H-4;
        for (let y=oy;y<oy+oh;y++) for (let x=ox;x<ox+ow;x++) {
            if (y===oy||y===oy+oh-1||x===ox||x===ox+ow-1) this.map[y][x]=TILE.WALL;
            else this.map[y][x]=TILE.FLOOR;
        }
        // Gate
        this.map[oy+oh-1][Math.floor(ow/2)]=TILE.DOOR;
        this.map[oy+oh-1][Math.floor(ow/2)+1]=TILE.DOOR;
        // Inner keep
        const kx=Math.floor(W/2)-8,ky=Math.floor(H/2)-6,kw=16,kh=12;
        for (let y=ky;y<ky+kh;y++) for (let x=kx;x<kx+kw;x++) {
            if (y===ky||y===ky+kh-1||x===kx||x===kx+kw-1) this.map[y][x]=TILE.WALL;
            else this.map[y][x]=TILE.FLOOR;
        }
        this.map[ky+kh-1][kx+Math.floor(kw/2)]=TILE.DOOR;
        // Throne room
        this.map[ky+2][kx+Math.floor(kw/2)]=TILE.THRONE;
        this.map[ky+1][kx+Math.floor(kw/2)-1]=TILE.CHEST;
        this.map[ky+1][kx+Math.floor(kw/2)+1]=TILE.CHEST;
        // Towers (corners)
        for (const [tx,ty] of [[ox,oy],[ox+ow-3,oy],[ox,oy+oh-3],[ox+ow-3,oy+oh-3]]) {
            for (let y=ty;y<ty+3;y++) for (let x=tx;x<tx+3;x++) {
                if (y===ty||y===ty+2||x===tx||x===tx+2) this.map[y][x]=TILE.WALL;
                else this.map[y][x]=TILE.FLOOR;
            }
            this.map[ty+1][tx+1]=TILE.CHEST;
        }
        // Courtyard features
        this.map[oy+oh-5][ox+4]=TILE.WATER;
        this.map[oy+oh-6][ox+4]=TILE.WATER;
        this.map[oy+oh-5][ox+5]=TILE.WATER;
        this.map[oy+oh-6][ox+5]=TILE.WATER;
        this._placePlayersAt(Math.floor(W/2), oy+oh-3);
    }

    // ===== TEMPLE =====
    _genTemple() {
        const W=this.gridW, H=this.gridH;
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) this.map[y][x]=TILE.EMPTY;
        // Cross shape
        const cx=Math.floor(W/2), cy=Math.floor(H/2);
        for (let y=cy-12;y<cy+12;y++) for (let x=cx-6;x<cx+6;x++) {
            if (y>=0&&y<H&&x>=0&&x<W) this.map[y][x]=TILE.FLOOR;
        }
        for (let y=cy-6;y<cy+6;y++) for (let x=cx-14;x<cx+14;x++) {
            if (y>=0&&y<H&&x>=0&&x<W) this.map[y][x]=TILE.FLOOR;
        }
        // Walls
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
            if (this.map[y][x]===TILE.FLOOR) {
                for (const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
                    const ny=y+dy,nx=x+dx;
                    if (ny>=0&&ny<H&&nx>=0&&nx<W&&this.map[ny][nx]===TILE.EMPTY) this.map[y][x]=TILE.WALL;
                }
            }
        }
        // Re-floored interior
        for (let y=1;y<H-1;y++) for (let x=1;x<W-1;x++) {
            if (this.map[y][x]===TILE.WALL) {
                let inner=true;
                for (const [dx,dy] of [[0,1],[0,-1],[1,0],[-1,0]]) {
                    const ny=y+dy,nx=x+dx;
                    if (ny>=0&&ny<H&&nx>=0&&nx<W&&this.map[ny][nx]===TILE.EMPTY) inner=false;
                }
                if (inner) this.map[y][x]=TILE.FLOOR;
            }
        }
        // Entrance
        this.map[cy+11][cx]=TILE.DOOR;
        // Altar
        this.map[cy-4][cx]=TILE.LAVA;
        this.map[cy-3][cx-1]=TILE.LAVA; this.map[cy-3][cx+1]=TILE.LAVA;
        this.map[cy-2][cx-2]=TILE.LAVA; this.map[cy-2][cx+2]=TILE.LAVA;
        // Chests
        this.map[cy-8][cx-4]=TILE.CHEST; this.map[cy-8][cx+4]=TILE.CHEST;
        // Pillars
        for (let y=cy-8;y<cy+8;y+=4) { this.map[y][cx-4]=TILE.WALL; this.map[y][cx+4]=TILE.WALL; }
        this._placePlayersAt(cx, cy+10);
    }

    // ===== VILLAGE =====
    _genVillage() {
        const W=this.gridW, H=this.gridH;
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) this.map[y][x]=TILE.FLOOR;
        // Main roads
        for (let y=0;y<H;y++) for (let x=Math.floor(W/2)-1;x<=Math.floor(W/2)+1;x++) this.map[y][x]=TILE.PATH;
        for (let x=0;x<W;x++) for (let y=Math.floor(H/2)-1;y<=Math.floor(H/2)+1;y++) this.map[y][x]=TILE.PATH;
        // Houses
        const houses = [];
        for (let i=0;i<12;i++) {
            const hw=4+Math.floor(Math.random()*4), hh=3+Math.floor(Math.random()*3);
            const hx=2+Math.floor(Math.random()*(W-hw-4)), hy=2+Math.floor(Math.random()*(H-hh-4));
            let ok=true;
            for (const h of houses) { if (hx<h.x+h.w+2&&hx+hw>h.x-2&&hy<h.y+h.h+2&&hy+hh>h.y-2) {ok=false;break;} }
            if (ok) {
                houses.push({x:hx,y:hy,w:hw,h:hh});
                for (let y=hy;y<hy+hh;y++) for (let x=hx;x<hx+hw;x++) {
                    if (y===hy||y===hy+hh-1||x===hx||x===hx+hw-1) this.map[y][x]=TILE.WALL;
                    else this.map[y][x]=TILE.FLOOR;
                }
                this.map[hy+hh-1][hx+Math.floor(hw/2)]=TILE.DOOR;
                this.map[hy+1][hx+1]=TILE.BED;
                if (Math.random()>0.5) this.map[hy+1][hx+hw-2]=TILE.CHEST;
            }
        }
        // Well at center
        this.map[Math.floor(H/2)-1][Math.floor(W/2)-1]=TILE.WATER;
        this.map[Math.floor(H/2)-1][Math.floor(W/2)+1]=TILE.WATER;
        this.map[Math.floor(H/2)+1][Math.floor(W/2)-1]=TILE.WATER;
        this.map[Math.floor(H/2)+1][Math.floor(W/2)+1]=TILE.WATER;
        this.map[Math.floor(H/2)][Math.floor(W/2)]=TILE.WATER;
        // Trees
        for (let i=0;i<50;i++) { const x=Math.floor(Math.random()*W),y=Math.floor(Math.random()*H); if(this.map[y][x]===TILE.FLOOR)this.map[y][x]=TILE.TREE; }
        this._placePlayersAt(Math.floor(W/2)+3, Math.floor(H/2)+3);
    }

    // ===== ISLAND =====
    _genIsland() {
        const W=this.gridW, H=this.gridH;
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) this.map[y][x]=TILE.WATER;
        // Island shape (noise-based)
        const cx=Math.floor(W/2), cy=Math.floor(H/2);
        const baseR = Math.min(W,H)*0.35;
        for (let y=0;y<H;y++) for (let x=0;x<W;x++) {
            const dist = Math.sqrt((x-cx)**2+(y-cy)**2);
            const noise = Math.sin(x*0.5)*Math.cos(y*0.5)*2 + Math.sin(x*0.3+y*0.2)*3;
            if (dist < baseR + noise - 2) this.map[y][x]=TILE.FLOOR;
            else if (dist < baseR + noise) this.map[y][x]=TILE.SAND;
        }
        // Palm trees
        for (let i=0;i<30;i++) { const x=Math.floor(Math.random()*W),y=Math.floor(Math.random()*H); if(this.map[y][x]===TILE.FLOOR)this.map[y][x]=TILE.TREE; }
        // Buried treasure
        this.map[cy][cx]=TILE.CHEST;
        // Volcano
        this.map[cy-5][cx-5]=TILE.LAVA;
        this.map[cy-6][cx-5]=TILE.LAVA;
        this.map[cy-5][cx-4]=TILE.LAVA;
        this._placePlayersAt(cx, cy+5);
    }

    setMapFromAI(aiMapData) {
        if (!aiMapData || !aiMapData.length) return;
        const h = aiMapData.length, w = aiMapData[0] ? aiMapData[0].length : 0;
        if (h > this.gridH || w > this.gridW) { this.gridH = Math.max(h, this.gridH); this.gridW = Math.max(w, this.gridW); }
        this._initMap();
        for (let y=0;y<Math.min(h,this.gridH);y++) for (let x=0;x<Math.min(w,this.gridW);x++) this.map[y][x]=Math.max(0,Math.min(15,aiMapData[y][x]||0));
        this._placePlayersNearCenter(); this.render();
        if (this.onMapChange) this.onMapChange(this.map);
    }

    getMapDescription() {
        const features=[], positions=[];
        for (let y=0;y<this.gridH;y++) for (let x=0;x<this.gridW;x++) {
            const t=this.map[y][x];
            if(t===TILE.DOOR)features.push(`дверь(${x},${y})`);
            else if(t===TILE.CHEST)features.push(`сундук(${x},${y})`);
            else if(t===TILE.TRAP)features.push(`ловушка(${x},${y})`);
            else if(t===TILE.STAIRS)features.push(`лестница(${x},${y})`);
            else if(t===TILE.THRONE)features.push(`трон(${x},${y})`);
        }
        for (const [id,p] of Object.entries(this.players)) positions.push(`${p.name}(${p.x},${p.y})`);
        return `Объекты: ${features.length>0?features.slice(0,30).join(', '):'пусто'}. Позиции: ${positions.join(', ')}. Размер: ${this.gridW}x${this.gridH}.`;
    }

    render() {
        const ctx=this.ctx, w=this.canvas.width, h=this.canvas.height, cs=this.cellSize*this.zoom;
        ctx.clearRect(0,0,w,h); ctx.fillStyle='#030303'; ctx.fillRect(0,0,w,h);
        // Only render visible area
        const startX=Math.max(0,Math.floor(-this.offsetX/cs));
        const startY=Math.max(0,Math.floor(-this.offsetY/cs));
        const endX=Math.min(this.gridW,Math.ceil((w-this.offsetX)/cs)+1);
        const endY=Math.min(this.gridH,Math.ceil((h-this.offsetY)/cs)+1);
        ctx.save(); ctx.translate(this.offsetX, this.offsetY);
        for (let y=startY;y<endY;y++) for (let x=startX;x<endX;x++) {
            const px=x*cs, py=y*cs;
            if (this.fogEnabled&&this.fogMap[y]&&this.fogMap[y][x]) { ctx.fillStyle='#0a0a0a'; ctx.fillRect(px,py,cs,cs); continue; }
            const tile=this.map[y][x];
            ctx.fillStyle=TILE_COLORS[tile]||TILE_COLORS[0]; ctx.fillRect(px,py,cs,cs);
            if (cs>8) { ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=0.5; ctx.strokeRect(px,py,cs,cs); }
            if (TILE_EMOJIS[tile]&&cs>14) { ctx.font=`${cs*0.55}px serif`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(TILE_EMOJIS[tile],px+cs/2,py+cs/2); }
        }
        // Players
        for (const [id,p] of Object.entries(this.players)) {
            if (this.fogEnabled&&this.fogMap[p.y]&&this.fogMap[p.y][p.x]) continue;
            const px=p.x*cs, py=p.y*cs, isMe=id===this.myPlayerId;
            ctx.beginPath(); ctx.arc(px+cs/2,py+cs/2,cs*0.38,0,Math.PI*2);
            ctx.fillStyle=p.color; ctx.fill();
            ctx.strokeStyle=isMe?'#fff':'rgba(255,255,255,0.5)'; ctx.lineWidth=isMe?3:1.5; ctx.stroke();
            if (isMe) { ctx.shadowColor=p.color; ctx.shadowBlur=15; ctx.beginPath(); ctx.arc(px+cs/2,py+cs/2,cs*0.38,0,Math.PI*2); ctx.stroke(); ctx.shadowBlur=0; }
            if (cs>16) { ctx.font=`bold ${Math.max(8,cs*0.28)}px ${getComputedStyle(document.body).fontFamily}`; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillStyle='white'; ctx.strokeStyle='black'; ctx.lineWidth=2.5; ctx.strokeText(p.name,px+cs/2,py+cs+1); ctx.fillText(p.name,px+cs/2,py+cs+1); }
        }
        ctx.restore();
    }
}
