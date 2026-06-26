// ============================================================
// GameEngine.js - Server-authoritative Bomberman Game Logic
// ============================================================

const { v4: uuidv4 } = require('uuid');

// --- Constants ---
const COLS = 15;
const ROWS = 13;
const TILE_SIZE = 48;
const BOMB_FUSE_TIME = 3000;      // ms before explosion
const BOMB_EXPLOSION_DURATION = 800; // ms explosion visible
const PLAYER_RESPAWN_TIME = 3000;
const ROUND_START_COUNTDOWN = 3000;
const DEFAULT_FIRE = 2;   // base explosion range (tiles)
const DEFAULT_BOMBS = 1;  // base bomb count
const DEFAULT_SPEED = 2.5; // tiles per second
const INVINCIBILITY_TIME = 2000; // ms invincibility after spawn

// Power-up types
const POWERUPS = {
  FIRE_UP: 'fire',
  BOMB_UP: 'bomb',
  SPEED_UP: 'speed',
  FULL_FIRE: 'fullfire',
  KICK: 'kick',
  SKIP: 'skip'
};

// Direction vectors
const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 }
};

// --- Utility ---
function cloneDeep(obj) { return JSON.parse(JSON.stringify(obj)); }

function isEven(n) { return n % 2 === 0; }

// --- GameEngine Class ---
class GameEngine {
  constructor(numPlayers) {
    this.id = uuidv4().slice(0, 8);
    this.players = {};        // { id: { ... } }
    this.bombs = {};          // { id: { ... } }
    this.explosions = [];     // { cells: [...], startTime: ... }
    this.powerups = {};       // key "x,y": { type, x, y }
    this.map = [];            // 2D array: 'wall' | 'soft' | 'empty'
    this.state = 'waiting';   // 'waiting' | 'countdown' | 'playing' | 'finished'
    this.tps = 30;            // ticks per second
    this.tickInterval = null;
    this.startTime = 0;
    this.elapsed = 0;
    this.nextPowerUpId = 0;
    this.numPlayers = numPlayers;
    this.playerOrder = [];
    this.finishedPlayers = []; // order of death
    this.generateMap();
  }

  // --- Map Generation ---
  generateMap() {
    // Initialize empty grid
    this.map = [];
    for (let y = 0; y < ROWS; y++) {
      this.map[y] = [];
      for (let x = 0; x < COLS; x++) {
        this.map[y][x] = 'empty';
      }
    }

    // Top/bottom walls
    for (let x = 0; x < COLS; x++) {
      this.map[0][x] = 'wall';
      this.map[ROWS - 1][x] = 'wall';
    }

    // Left/right walls
    for (let y = 0; y < ROWS; y++) {
      this.map[y][0] = 'wall';
      this.map[y][COLS - 1] = 'wall';
    }

    // Pillar walls at every even position
    for (let y = 2; y < ROWS - 1; y += 2) {
      for (let x = 2; x < COLS - 1; x += 2) {
        this.map[y][x] = 'wall';
      }
    }

    // Place soft blocks randomly (but keep start positions clear)
    const startPositions = [
      { x: 1, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 1 },              // P1 spawn area
      { x: COLS - 2, y: 1 }, { x: COLS - 3, y: 1 }, { x: COLS - 2, y: 2 }, // P2
      { x: 1, y: ROWS - 2 }, { x: 2, y: ROWS - 2 }, { x: 1, y: ROWS - 3 }, // P3
      { x: COLS - 2, y: ROWS - 2 }, { x: COLS - 3, y: ROWS - 2 }, { x: COLS - 2, y: ROWS - 3 }  // P4
    ];

    const clearZone = new Set();
    startPositions.forEach(p => clearZone.add(`${p.x},${p.y}`));

    // Also clear the tiles immediately adjacent to each spawn (2-tile radius)
    startPositions.forEach(sp => {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          clearZone.add(`${sp.x + dx},${sp.y + dy}`);
        }
      }
    });

    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (this.map[y][x] === 'empty' && !clearZone.has(`${x},${y}`)) {
          // ~60% chance of soft block
          if (Math.random() < 0.6) {
            this.map[y][x] = 'soft';
          }
        }
      }
    }
  }

  // --- Player Management ---
  addPlayer(id, name) {
    const spawns = this.getSpawnPoints();
    const playerIndex = this.playerOrder.length;
    if (playerIndex >= spawns.length) return false;

    const spawn = spawns[playerIndex];
    this.players[id] = {
      id,
      name: name || `Player ${playerIndex + 1}`,
      x: spawn.x * TILE_SIZE + TILE_SIZE / 2,
      y: spawn.y * TILE_SIZE + TILE_SIZE / 2,
      tileX: spawn.x,
      tileY: spawn.y,
      dir: 0, // 0=down, 1=left, 2=right, 3=up
      frame: 0,
      alive: true,
      bombCount: DEFAULT_BOMBS,
      activeBombs: 0,
      firePower: DEFAULT_FIRE,
      speed: DEFAULT_SPEED,
      canKick: false,
      canSkip: false,
      invincibleUntil: 0,
      score: 0,
      wins: 0,
      color: playerIndex,
      inputQueue: [],
      lastInputSeq: 0
    };

    this.playerOrder.push(id);

    return true;
  }

  getSpawnPoints() {
    return [
      { x: 1, y: 1 },
      { x: COLS - 2, y: 1 },
      { x: 1, y: ROWS - 2 },
      { x: COLS - 2, y: ROWS - 2 }
    ];
  }

  removePlayer(id) {
    delete this.players[id];
    this.playerOrder = this.playerOrder.filter(pid => pid !== id);
    // Remove their bombs too
    for (const bid in this.bombs) {
      if (this.bombs[bid].owner === id) {
        delete this.bombs[bid];
      }
    }
  }

  // --- Game State Machine ---
  start() {
    if (this.state !== 'waiting') return;
    this.state = 'countdown';
    this.startTime = Date.now() + ROUND_START_COUNTDOWN;
    // Tick immediately for sync
    setTimeout(() => {
      if (this.state === 'countdown') {
        this.state = 'playing';
        this.startTime = Date.now();
        this.tickInterval = setInterval(() => this.tick(), 1000 / this.tps);
      }
    }, ROUND_START_COUNTDOWN);
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.state = 'finished';
  }

  // --- Input Handling ---
  queueInput(playerId, input) {
    const player = this.players[playerId];
    if (!player) return;
    if (!player.alive) return;
    // Store last few inputs for processing in tick
    player.inputQueue.push(input);
    if (player.inputQueue.length > 10) {
      player.inputQueue.shift();
    }
  }

  placeBomb(playerId) {
    const player = this.players[playerId];
    if (!player || !player.alive) return;
    if (this.state !== 'playing') return;

    // Cooldown check
    if (player._bombCooldown && Date.now() < player._bombCooldown) return;
    player._bombCooldown = Date.now() + 200; // 200ms cooldown

    if (player.activeBombs >= player.bombCount) return;

    // Snap to nearest tile center
    const tx = Math.floor(player.x / TILE_SIZE);
    const ty = Math.floor(player.y / TILE_SIZE);
    const bx = tx * TILE_SIZE + TILE_SIZE / 2;
    const by = ty * TILE_SIZE + TILE_SIZE / 2;

    // Check if there's already a bomb at this tile
    for (const bid in this.bombs) {
      const b = this.bombs[bid];
      if (Math.round(b.x / TILE_SIZE) === tx && Math.round(b.y / TILE_SIZE) === ty) {
        return; // Already a bomb there
      }
    }

    // Check if tile is a wall
    if (this.map[ty] && (this.map[ty][tx] === 'wall' || this.map[ty][tx] === 'soft')) return;

    const bomb = {
      id: uuidv4().slice(0, 8),
      owner: playerId,
      x: bx,
      y: by,
      tileX: tx,
      tileY: ty,
      plantedAt: Date.now(),
      fuseTime: BOMB_FUSE_TIME,
      power: player.firePower
    };

    // Pin player position if they're on the bomb tile
    if (Math.floor(player.x / TILE_SIZE) === tx && Math.floor(player.y / TILE_SIZE) === ty) {
      player.x = bx;
      player.y = by;
    }

    this.bombs[bomb.id] = bomb;
    player.activeBombs++;
  }

  // --- Main Game Tick ---
  tick() {
    if (this.state !== 'playing') return;
    this.elapsed = Date.now() - this.startTime;

    // Process player inputs
    for (const pid in this.players) {
      this.processPlayerInput(pid);
    }

    // Process bomb fuses
    this.processBombs();

    // Check explosion endpoints
    this.processExplosions();

    // Check for game over
    this.checkWinCondition();
  }

  processPlayerInput(playerId) {
    const player = this.players[playerId];
    if (!player || !player.alive) return;

    const input = player.inputQueue.shift();
    if (!input) return;

    let dx = 0, dy = 0;

    if (input.left)  { dx -= 1; player.dir = 1; }
    if (input.right) { dx += 1; player.dir = 2; }
    if (input.up)    { dy -= 1; player.dir = 3; }
    if (input.down)  { dy += 1; player.dir = 0; }

    // Normalize diagonal (Bomberman is strictly 4-dir on grid, but for smoothness we can allow)
    // Actually, Bomberman Saturn was grid-based but smoothed. Let's move at the speed.
    if (dx !== 0 && dy !== 0) {
      // Choose one direction based on priority (last pressed wins) - simplest: keep both
      // Actually let's just pick horizontal if both pressed, like classic
      dy = 0; // Prioritize horizontal
    }

    if (dx === 0 && dy === 0) return;

    const dt = 1 / this.tps;
    const speed = player.speed * TILE_SIZE * dt;
    let newX = player.x + dx * speed;
    let newY = player.y + dy * speed;
    let moved = false;

    // --- Collision detection ---
    // Player bounding box (slightly smaller than tile for better feel)
    const halfSize = TILE_SIZE * 0.35;
    const pHalfSize = TILE_SIZE * 0.35;

    // Try X movement
    if (dx !== 0) {
      if (this.canMoveTo(newX, player.y, halfSize, player)) {
        player.x = newX;
        moved = true;
      } else {
        // Snap to tile boundary
        const snapX = Math.floor(player.x / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
        if (dx > 0) {
          player.x = Math.max(player.x, snapX - 1);
        } else {
          player.x = Math.min(player.x, snapX + 1);
        }
      }
    }

    // Try Y movement
    if (dy !== 0) {
      if (this.canMoveTo(player.x, newY, halfSize, player)) {
        player.y = newY;
        moved = true;
      } else {
        const snapY = Math.floor(player.y / TILE_SIZE) * TILE_SIZE + TILE_SIZE / 2;
        if (dy > 0) {
          player.y = Math.max(player.y, snapY - 1);
        } else {
          player.y = Math.min(player.y, snapY + 1);
        }
      }
    }

    // Update tile position
    player.tileX = Math.floor(player.x / TILE_SIZE);
    player.tileY = Math.floor(player.y / TILE_SIZE);

    // Animate frame
    if (moved) {
      player.frame += dt * 8;
    } else {
      player.frame = 0;
    }
  }

  canMoveTo(x, y, halfSize, player) {
    // Check map boundaries
    if (x - halfSize < 0 || x + halfSize > COLS * TILE_SIZE ||
        y - halfSize < 0 || y + halfSize > ROWS * TILE_SIZE) {
      return false;
    }

    // Check corners of bounding box against tiles
    const corners = [
      { x: x - halfSize, y: y - halfSize },
      { x: x + halfSize, y: y - halfSize },
      { x: x - halfSize, y: y + halfSize },
      { x: x + halfSize, y: y + halfSize }
    ];

    for (const corner of corners) {
      const tx = Math.floor(corner.x / TILE_SIZE);
      const ty = Math.floor(corner.y / TILE_SIZE);
      if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return false;

      const cell = this.map[ty][tx];
      if (cell === 'wall') return false;
      if (cell === 'soft') return false;
    }

    // Check collision with bombs (unless player has skip powerup or is on their own bomb tile)
    for (const bid in this.bombs) {
      const bomb = this.bombs[bid];
      const bombLeft = bomb.x - TILE_SIZE / 3;
      const bombRight = bomb.x + TILE_SIZE / 3;
      const bombTop = bomb.y - TILE_SIZE / 3;
      const bombBottom = bomb.y + TILE_SIZE / 3;

      if (x + halfSize > bombLeft && x - halfSize < bombRight &&
          y + halfSize > bombTop && y - halfSize < bombBottom) {
        // Allow walking through bombs if player has skip
        if (player.canSkip) continue;
        // Allow walking off your own placed bomb
        if (bomb.owner === player.id) continue;
        return false;
      }
    }

    return true;
  }

  processBombs() {
    const now = Date.now();
    for (const bid in this.bombs) {
      const bomb = this.bombs[bid];
      if (now - bomb.plantedAt >= bomb.fuseTime) {
        this.explodeBomb(bid);
      }
    }
  }

  explodeBomb(bombId) {
    const bomb = this.bombs[bombId];
    if (!bomb) return;
    const now = Date.now();

    const player = this.players[bomb.owner];
    if (player) {
      player.activeBombs--;
    }

    // Calculate explosion cells
    const cells = [{ x: bomb.tileX, y: bomb.tileY }];
    const directions = [
      { dx: 0, dy: -1 }, // up
      { dx: 0, dy: 1 },  // down
      { dx: -1, dy: 0 }, // left
      { dx: 1, dy: 0 }   // right
    ];

    // Check for chain reaction - which bombs are in the blast
    const bombsToChain = [];

    for (const dir of directions) {
      for (let i = 1; i <= bomb.power; i++) {
        const cx = bomb.tileX + dir.dx * i;
        const cy = bomb.tileY + dir.dy * i;

        if (cx < 0 || cx >= COLS || cy < 0 || cy >= ROWS) break;

        const cell = this.map[cy][cx];
        if (cell === 'wall') break;

        cells.push({ x: cx, y: cy });

        if (cell === 'soft') {
          this.map[cy][cx] = 'empty';
          // Random power-up drop (30% chance)
          if (Math.random() < 0.30) {
            this.spawnPowerUp(cx, cy);
          }
          break; // Explosion stops at soft block
        }

        // Check for chain reaction with bombs at this position
        for (const bid2 in this.bombs) {
          const b2 = this.bombs[bid2];
          if (b2.id !== bombId && b2.tileX === cx && b2.tileY === cy) {
            bombsToChain.push(b2.id);
          }
        }
      }
    }

    // Check players caught in blast
    for (const pid in this.players) {
      const p = this.players[pid];
      if (!p.alive) continue;

      // Check if player is invincible
      if (now < p.invincibleUntil) continue;

      const pTx = Math.floor(p.x / TILE_SIZE);
      const pTy = Math.floor(p.y / TILE_SIZE);

      for (const cell of cells) {
        // Check if player's position intersects explosion
        if (Math.abs(pTx - cell.x) <= 0 && Math.abs(pTy - cell.y) <= 0) {
          // More lenient: check if player's center tile matches
        }
        // Use actual bounding box check
        const cellLeft = cell.x * TILE_SIZE;
        const cellRight = (cell.x + 1) * TILE_SIZE;
        const cellTop = cell.y * TILE_SIZE;
        const cellBottom = (cell.y + 1) * TILE_SIZE;
        const pHalf = TILE_SIZE * 0.35;

        if (p.x + pHalf > cellLeft && p.x - pHalf < cellRight &&
            p.y + pHalf > cellTop && p.y - pHalf < cellBottom) {
          this.killPlayer(pid);
          break;
        }
      }
    }

    // Create explosion
    this.explosions.push({
      cells: cells,
      startTime: Date.now(),
      duration: BOMB_EXPLOSION_DURATION
    });

    // Remove the bomb
    delete this.bombs[bombId];

    // Chain other bombs
    for (const chainId of bombsToChain) {
      // Explode immediately
      const chainedBomb = this.bombs[chainId];
      if (chainedBomb) {
        chainedBomb.fuseTime = 0;
        this.explodeBomb(chainId);
      }
    }
  }

  killPlayer(playerId) {
    const player = this.players[playerId];
    if (!player || !player.alive) return;

    player.alive = false;

    if (!this.finishedPlayers.includes(playerId)) {
      this.finishedPlayers.push(playerId);
    }
  }

  processExplosions() {
    // Clean up expired explosions
    const now = Date.now();
    this.explosions = this.explosions.filter(e => (now - e.startTime) < e.duration);
  }

  spawnPowerUp(x, y) {
    const types = [POWERUPS.FIRE_UP, POWERUPS.BOMB_UP, POWERUPS.SPEED_UP, POWERUPS.FULL_FIRE, POWERUPS.KICK, POWERUPS.SKIP];
    const type = types[Math.floor(Math.random() * types.length)];
    const id = `pu_${this.nextPowerUpId++}`;
    this.powerups[`${x},${y}`] = {
      id,
      type,
      x,
      y
    };
  }

  collectPowerUp(playerId) {
    const p = this.players[playerId];
    if (!p || !p.alive) return;

    const key = `${p.tileX},${p.tileY}`;
    const pu = this.powerups[key];
    if (!pu) return;

    switch (pu.type) {
      case POWERUPS.FIRE_UP:
        p.firePower = Math.min(p.firePower + 1, 8);
        break;
      case POWERUPS.BOMB_UP:
        p.bombCount = Math.min(p.bombCount + 1, 8);
        break;
      case POWERUPS.SPEED_UP:
        p.speed = Math.min(p.speed + 0.3, 5.0);
        break;
      case POWERUPS.FULL_FIRE:
        p.firePower = 8;
        break;
      case POWERUPS.KICK:
        p.canKick = true;
        break;
      case POWERUPS.SKIP:
        p.canSkip = true;
        break;
    }

    delete this.powerups[key];
  }

  checkWinCondition() {
    const alivePlayers = Object.values(this.players).filter(p => p.alive);
    const totalPlayers = this.playerOrder.length;

    if (totalPlayers <= 1) return; // Waiting for more players

    if (alivePlayers.length === 0) {
      // Everyone died at the same time - draw
      this.state = 'finished';
      return;
    }

    if (alivePlayers.length <= 1 && this.finishedPlayers.length >= totalPlayers - 1) {
      this.state = 'finished';
      // Winner stays
      if (alivePlayers.length === 1) {
        alivePlayers[0].wins++;
      }
    }
  }

  // --- Serialization ---
  getState() {
    const players = {};
    for (const pid in this.players) {
      const p = this.players[pid];
      players[pid] = {
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        dir: p.dir,
        frame: p.frame,
        alive: p.alive,
        bombCount: p.bombCount,
        activeBombs: p.activeBombs,
        firePower: p.firePower,
        speed: p.speed,
        canKick: p.canKick,
        canSkip: p.canSkip,
        color: p.color,
        wins: p.wins,
        invincibleUntil: p.invincibleUntil
      };
    }

    const bombs = {};
    for (const bid in this.bombs) {
      const b = this.bombs[bid];
      bombs[bid] = {
        id: b.id,
        x: b.x,
        y: b.y,
        owner: b.owner,
        fuseProgress: (Date.now() - b.plantedAt) / b.fuseTime,
        power: b.power
      };
    }

    const powerups = {};
    for (const key in this.powerups) {
      const pu = this.powerups[key];
      powerups[key] = { ...pu };
    }

    return {
      engine: this.id,
      state: this.state,
      map: this.map,
      cols: COLS,
      rows: ROWS,
      tileSize: TILE_SIZE,
      players,
      bombs,
      explosions: this.explosions.map(e => ({
        cells: e.cells,
        startTime: e.startTime,
        duration: e.duration
      })),
      powerups,
      startTime: this.startTime,
      elapsed: this.elapsed,
      finishedPlayers: this.finishedPlayers
    };
  }

  getInitialState() {
    return {
      engine: this.id,
      cols: COLS,
      rows: ROWS,
      tileSize: TILE_SIZE,
      map: this.map
    };
  }

  restart() {
    // Keep players, reset the map and positions
    this.bombs = {};
    this.explosions = [];
    this.powerups = {};
    this.finishedPlayers = [];
    this.nextPowerUpId = 0;
    this.state = 'waiting';

    // Generate new map
    this.generateMap();

    // Reset players to spawn positions
    const spawns = this.getSpawnPoints();
    this.playerOrder.forEach((pid, i) => {
      const p = this.players[pid];
      const spawn = spawns[i] || spawns[0];
      p.x = spawn.x * TILE_SIZE + TILE_SIZE / 2;
      p.y = spawn.y * TILE_SIZE + TILE_SIZE / 2;
      p.tileX = spawn.x;
      p.tileY = spawn.y;
      p.alive = true;
      p.activeBombs = 0;
      p.bombCount = DEFAULT_BOMBS;
      p.firePower = DEFAULT_FIRE;
      p.speed = DEFAULT_SPEED;
      p.canKick = false;
      p.canSkip = false;
      p.invincibleUntil = Date.now() + INVINCIBILITY_TIME;
      p.inputQueue = [];
      p.frame = 0;
    });
  }
}

// --- Exports ---
module.exports = { GameEngine, COLS, ROWS, TILE_SIZE, DIR, POWERUPS };
