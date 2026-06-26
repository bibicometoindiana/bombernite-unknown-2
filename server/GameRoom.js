// ============================================================
// GameRoom.js - Room Management
// ============================================================

const { GameEngine } = require('./GameEngine');

class GameRoom {
  constructor(id, name, maxPlayers) {
    this.id = id;
    this.name = name || `Room ${id}`;
    this.maxPlayers = maxPlayers || 4;
    this.clients = new Map(); // ws -> { id, name }
    this.clientIds = new Map(); // id -> ws
    this.game = new GameEngine(this.maxPlayers);
    this.state = 'lobby'; // 'lobby' | 'playing' | 'finished'
    this.broadcastInterval = null;
    this.tps = 10; // state broadcast rate
  }

  addClient(ws, name) {
    if (this.clients.size >= this.maxPlayers) return null;

    const id = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this.clients.set(ws, { id, name: name || `Player ${this.clients.size + 1}` });
    this.clientIds.set(id, ws);

    ws._playerId = id;

    // Add player to game engine
    this.game.addPlayer(id, name);

    return id;
  }

  removeClient(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    this.clients.delete(ws);
    this.clientIds.delete(client.id);
    this.game.removePlayer(client.id);

    // If game is running and no players left, stop broadcasting
    if (this.clients.size === 0 && this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
  }

  startGame() {
    if (this.clients.size < 2) return false;
    this.state = 'playing';
    this.game.start();

    // Start broadcasting game state
    if (this.broadcastInterval) clearInterval(this.broadcastInterval);
    this.broadcastInterval = setInterval(() => {
      this.broadcastState();
      this.checkGameOver();
    }, 1000 / this.tps);

    return true;
  }

  broadcastState() {
    const state = this.game.getState();
    const msg = JSON.stringify({ type: 'game_state', ...state });
    this.clients.forEach((client, ws) => {
      try {
        ws.send(msg);
      } catch (e) {
        // Client disconnected
      }
    });
  }

  broadcastTo(ws, data) {
    try {
      ws.send(JSON.stringify(data));
    } catch (e) {}
  }

  handleMessage(ws, message) {
    try {
      const data = JSON.parse(message);
      const client = this.clients.get(ws);
      if (!client) return;

      switch (data.type) {
        case 'input':
          this.game.queueInput(client.id, data);
          // Also check powerup collection
          setTimeout(() => this.game.collectPowerUp(client.id), 0);
          break;

        case 'place_bomb':
          this.game.placeBomb(client.id);
          break;

        case 'ready':
          // Mark player as ready (for future use)
          break;

        case 'start_game':
          // Only the host can start
          if (Array.from(this.clients.values())[0]?.id === client.id) {
            this.startGame();
          }
          break;

        case 'restart':
          if (this.game.state === 'finished' && this.clients.size >= 2) {
            this.game.restart();
            this.state = 'playing';
            this.game.start();
          }
          break;

        case 'ping':
          this.broadcastTo(ws, { type: 'pong' });
          break;
      }
    } catch (e) {
      console.error('Message error:', e);
    }
  }

  checkGameOver() {
    if (this.game.state === 'finished' && this.state !== 'finished') {
      this.state = 'finished';
      // Broadcast final state one more time
      this.broadcastState();

      // Broadcast game_over
      const state = this.game.getState();
      const alive = Object.values(state.players).filter(p => p.alive);
      const winner = alive.length === 1 ? alive[0] : null;

      const msg = JSON.stringify({
        type: 'game_over',
        winner: winner ? { id: winner.id, name: winner.name, wins: winner.wins } : null,
        finishOrder: this.game.finishedPlayers.map(pid => {
          const p = state.players[pid];
          return p ? { id: p.id, name: p.name } : { id: pid, name: 'Unknown' };
        }),
        playerCount: Object.keys(state.players).length
      });

      this.clients.forEach((client, ws) => {
        try { ws.send(msg); } catch (e) {}
      });
    }
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      players: Array.from(this.clients.values()).map(c => ({
        id: c.id,
        name: c.name
      })),
      maxPlayers: this.maxPlayers,
      state: this.state
    };
  }

  destroy() {
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }
    this.game.stop();
    this.clients.clear();
    this.clientIds.clear();
  }
}

module.exports = { GameRoom };
