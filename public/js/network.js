// ============================================================
// network.js - WebSocket Client with Keepalive + Auto-Reconnect
// ============================================================

class NetworkClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.roomId = null;
    this.messageHandlers = {};
    this.reconnectAttempts = 0;
    this.maxReconnect = 5;
    this.serverUrl = null;
    this.onConnect = null;
    this.onDisconnect = null;
    this._pingInterval = null;
    this._shouldReconnect = true;
  }

  connect(serverUrl) {
    this.serverUrl = serverUrl || (() => {
      const loc = window.location;
      const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${loc.host}`;
    })();

    try {
      this.ws = new WebSocket(this.serverUrl);
    } catch (e) {
      console.error('WebSocket connection failed:', e);
      return;
    }

    this.ws.onopen = () => {
      console.log('[Net] Connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      if (this.onConnect) this.onConnect();

      // Start keepalive ping every 15 seconds
      if (this._pingInterval) clearInterval(this._pingInterval);
      this._pingInterval = setInterval(() => {
        if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.send({ type: 'ping' });
        }
      }, 15000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this._handleMessage(data);
      } catch (e) {
        console.warn('[Net] Invalid message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[Net] Disconnected');
      this.connected = false;
      if (this._pingInterval) {
        clearInterval(this._pingInterval);
        this._pingInterval = null;
      }
      if (this.onDisconnect) this.onDisconnect();
      this._tryReconnect();
    };

    this.ws.onerror = () => {
      console.error('[Net] Error');
    };
  }

  _tryReconnect() {
    if (!this._shouldReconnect) return;
    if (this.reconnectAttempts >= this.maxReconnect) {
      console.log('[Net] Max reconnects reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    console.log(`[Net] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnect})`);

    setTimeout(() => {
      if (this._shouldReconnect) {
        this.connect(this.serverUrl);
      }
    }, delay);
  }

  disconnect() {
    this._shouldReconnect = false;
    if (this._pingInterval) {
      clearInterval(this._pingInterval);
      this._pingInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  // Join a game
  join(name) {
    this.send({ type: 'join', name });
  }

  joinRoom(roomId, name) {
    this.send({ type: 'join_room', roomId, name });
  }

  createRoom(name, maxPlayers, playerName) {
    this.send({ type: 'create_room', name, maxPlayers, playerName });
  }

  leave() {
    this.send({ type: 'leave' });
  }

  // Send input
  sendInput(input) {
    this.send({ type: 'input', ...input });
  }

  // Place bomb
  placeBomb() {
    this.send({ type: 'place_bomb' });
  }

  // Start game (host only)
  startGame() {
    this.send({ type: 'start_game' });
  }

  // Restart round
  restart() {
    this.send({ type: 'restart' });
  }

  // List rooms
  listRooms() {
    this.send({ type: 'list_rooms' });
  }

  // Register handler for message types
  on(type, handler) {
    if (!this.messageHandlers[type]) {
      this.messageHandlers[type] = [];
    }
    this.messageHandlers[type].push(handler);
  }

  off(type, handler) {
    if (!this.messageHandlers[type]) return;
    this.messageHandlers[type] = this.messageHandlers[type].filter(h => h !== handler);
  }

  _handleMessage(data) {
    const handlers = this.messageHandlers[data.type] || [];
    handlers.forEach(h => h(data));

    // Also call wildcard handler
    if (this.messageHandlers['*']) {
      this.messageHandlers['*'].forEach(h => h(data));
    }
  }
}

window.net = new NetworkClient();
