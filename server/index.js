// ============================================================
// index.js - Express + WebSocket Server Entry Point
// ============================================================

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const { GameRoom } = require('./GameRoom');

const PORT = process.env.PORT || 3000;

// --- Express App ---
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));

// Room management
const rooms = new Map();
let nextRoomId = 1;

function createRoom(name, maxPlayers) {
  const id = `room_${nextRoomId++}`;
  const room = new GameRoom(id, name, maxPlayers);
  rooms.set(id, room);
  return room;
}

// Create a default room
createRoom('Bombernite Arena', 4);

// API routes
app.get('/api/rooms', (req, res) => {
  const roomList = Array.from(rooms.values()).map(r => r.getInfo());
  res.json({ rooms: roomList });
});

app.get('/api/info', (req, res) => {
  res.json({
    name: 'Bombernite Unknown 2',
    version: '2.0.0',
    description: 'Ein Bomberman Saturn Klon mit Online-Multiplayer',
    maxPlayers: 4
  });
});

// --- HTTP Server ---
const server = http.createServer(app);

// --- WebSocket Server ---
const wss = new WebSocketServer({ server });

// --- WebSocket Connection Handler ---
wss.on('connection', (ws, req) => {
  console.log(`[+] New connection from ${req.socket.remoteAddress}`);

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString());

      switch (data.type) {
        case 'join':
          handleJoin(ws, data);
          break;

        case 'leave':
          handleLeave(ws);
          break;

        case 'create_room':
          handleCreateRoom(ws, data);
          break;

        case 'join_room':
          handleJoinRoom(ws, data);
          break;

        case 'list_rooms':
          handleListRooms(ws);
          break;

        default:
          if (ws._room) {
            ws._room.handleMessage(ws, raw.toString());
          }
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    console.log(`[-] Connection closed`);
    const room = ws._room;
    if (room) {
      room.removeClient(ws);
      broadcastRoomList();

      // Check if room is empty
      if (room.clients.size === 0) {
        room.destroy();
        rooms.delete(room.id);
        console.log(`[x] Room ${room.id} destroyed`);
      }
    }
  });

  ws.on('error', (e) => {
    console.error('WS error:', e);
  });

  // Send welcome message
  sendTo(ws, {
    type: 'welcome',
    message: 'Willkommen zu Bombernite Unknown 2!',
    rooms: Array.from(rooms.values()).map(r => r.getInfo())
  });
});

// --- Handlers ---
function handleJoin(ws, data) {
  const room = findAvailableRoom();
  if (!room) {
    sendTo(ws, { type: 'error', message: 'Keine verfügbaren Räume' });
    return;
  }

  const id = room.addClient(ws, data.name || 'Bomber');
  if (!id) {
    sendTo(ws, { type: 'error', message: 'Raum ist voll' });
    return;
  }

  ws._room = room;
  ws._playerId = id;

  sendTo(ws, {
    type: 'joined',
    playerId: id,
    room: room.getInfo(),
    initialState: room.game.getInitialState()
  });

  // Notify others
  roomBroadcast(room, ws, {
    type: 'player_joined',
    player: { id, name: data.name || 'Bomber' }
  });

  broadcastRoomList();
}

function handleLeave(ws) {
  const room = ws._room;
  if (room) {
    room.removeClient(ws);
    delete ws._room;
    delete ws._playerId;
    broadcastRoomList();

    // Clean up empty rooms
    if (room.clients.size === 0) {
      room.destroy();
      rooms.delete(room.id);
      console.log(`[x] Room ${room.id} destroyed (leave)`);
    }
  }
}

function handleCreateRoom(ws, data) {
  const room = createRoom(data.name || `Room ${nextRoomId}`, data.maxPlayers || 4);

  const id = room.addClient(ws, data.playerName || 'Bomber');
  if (!id) {
    rooms.delete(room.id);
    sendTo(ws, { type: 'error', message: 'Konnte Raum nicht beitreten' });
    return;
  }

  ws._room = room;
  ws._playerId = id;

  sendTo(ws, {
    type: 'joined',
    playerId: id,
    room: room.getInfo(),
    initialState: room.game.getInitialState()
  });

  broadcastRoomList();
}

function handleJoinRoom(ws, data) {
  const room = rooms.get(data.roomId);
  if (!room) {
    sendTo(ws, { type: 'error', message: 'Raum existiert nicht' });
    return;
  }

  const id = room.addClient(ws, data.name || 'Bomber');
  if (!id) {
    sendTo(ws, { type: 'error', message: 'Raum ist voll' });
    return;
  }

  ws._room = room;
  ws._playerId = id;

  sendTo(ws, {
    type: 'joined',
    playerId: id,
    room: room.getInfo(),
    initialState: room.game.getInitialState()
  });

  roomBroadcast(room, ws, {
    type: 'player_joined',
    player: { id, name: data.name || 'Bomber' }
  });

  broadcastRoomList();
}

function handleListRooms(ws) {
  sendTo(ws, {
    type: 'room_list',
    rooms: Array.from(rooms.values()).map(r => r.getInfo())
  });
}

// --- Helpers ---
function findAvailableRoom() {
  for (const room of rooms.values()) {
    if (room.clients.size < room.maxPlayers && room.state === 'lobby') {
      return room;
    }
  }
  return null;
}

function sendTo(ws, data) {
  try {
    ws.send(JSON.stringify(data));
  } catch (e) {}
}

function roomBroadcast(room, excludeWs, data) {
  const msg = JSON.stringify(data);
  room.clients.forEach((client, ws) => {
    if (ws !== excludeWs) {
      try { ws.send(msg); } catch (e) {}
    }
  });
}

function broadcastRoomList() {
  const list = Array.from(rooms.values()).map(r => r.getInfo());
  const msg = JSON.stringify({ type: 'room_list', rooms: list });

  wss.clients.forEach(ws => {
    try { ws.send(msg); } catch (e) {}
  });
}

// --- Start ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║    Bombernite Unknown 2 Server       ║
  ║    Running on http://0.0.0.0:${PORT}   ║
  ╚══════════════════════════════════════╝
  `);
});
