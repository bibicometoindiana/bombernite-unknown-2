// ============================================================
// client.js - Main Game Client / Entry Point
// ============================================================

(function() {
  'use strict';

  // --- State ---
  let gameState = null;
  let renderer = null;
  let animFrameId = null;
  let lastTime = 0;
  let isHost = false;
  let playerId = null;
  let inputTimer = null;
  let gameRunning = false;
  let lastExplosionCheck = 0;
  let lastPowerupCheck = 0;
  let previousBombCount = 0;

  // --- DOM refs ---
  const $ = id => document.getElementById(id);

  // --- Initialize ---
  function init() {
    const canvas = $('game-canvas');
    if (!canvas) {
      console.error('Canvas not found');
      return;
    }

    renderer = new Renderer(canvas);

    // Set up network handlers
    setupNetwork();

    // Set up UI handlers
    setupUI();

    // Set up input
    window.input.onPause = () => {
      if (gameRunning) {
        // Could implement pause menu here
      }
    };
  }

  // --- Network message handlers ---
  function setupNetwork() {
    net.on('welcome', (data) => {
      ui.setConnectionStatus(true);
      if (data.rooms) {
        ui.updateRoomList(data.rooms);
      }
      audio.init();
    });

    net.on('joined', (data) => {
      playerId = data.playerId;
      console.log('[Client] Joined as:', playerId);

      // Initialize renderer with map info
      if (data.initialState) {
        renderer.resize(
          data.initialState.cols || 15,
          data.initialState.rows || 13,
          data.initialState.tileSize || 48
        );
      }

      ui.showLobby(data.room);
      audio.menuSelect();
    });

    net.on('player_joined', (data) => {
      if (ui.roomInfo) {
        // Find and update the room info from network
        net.listRooms();
      }
      audio.menuSelect();
    });

    net.on('room_list', (data) => {
      if (ui.currentScreen === 'menu') {
        ui.updateRoomList(data.rooms);
      }
      if (ui.currentScreen === 'lobby-screen' || ui.currentScreen === 'game-screen') {
        // Update room info if we're in a room
        const myRoom = data.rooms.find(r => {
          return r.players.some(p => p.id === playerId);
        });
        if (myRoom) {
          ui.roomInfo = myRoom;
          if (ui.currentScreen === 'lobby-screen') {
            ui.updateLobby(myRoom);
          }
        }
      }
    });

    net.on('game_state', (data) => {
      if (ui.currentScreen !== 'game-screen') {
        ui.showGame();
        hideCursor();
      }

      gameState = data;

      // Check for new explosions (play sound)
      if (data.explosions && data.explosions.length > 0) {
        const now = Date.now();
        if (now - lastExplosionCheck > 200) {
          audio.explosion();
          lastExplosionCheck = now;
        }
      }

      // Check powerup collection
      if (data.powerups) {
        // Sound handled by state change detection
      }

      // Check if any player died (new death)
      if (data.players) {
        for (const pid in data.players) {
          const p = data.players[pid];
          if (!p.alive && pid === playerId && gameRunning) {
            audio.playerDeath();
          }
        }
      }

      // Countdown handling (based on state)
      if (data.state === 'countdown' && data.startTime) {
        const remaining = Math.ceil((data.startTime - Date.now()) / 1000);
        if (remaining >= 0 && remaining <= 3) {
          // UI shows the countdown
        }
      }

      if (data.state === 'playing') {
        gameRunning = true;
      }
    });

    net.on('game_over', (data) => {
      gameRunning = false;
      ui.showGameOver(data);

      if (data.winner && data.winner.id === playerId) {
        audio.victory();
      } else {
        audio.defeat();
      }
    });

    net.on('error', (data) => {
      console.error('[Server]', data.message);
    });

    net.on('player_left', (data) => {
      // Handled via room_list updates
    });

    net.on('pong', () => {
      // Could measure latency
    });

    // Wildcard handler for debugging
    net.on('*', (data) => {
      if (data.type === 'game_state') return; // Too frequent
    });
  }

  // --- UI Event Handlers ---
  function setupUI() {
    // Quick Join
    $('btn-quick-join').addEventListener('click', () => {
      const name = $('player-name').value.trim() || 'Bomber';
      net.join(name);
      audio.menuSelect();
    });

    // Create Room
    $('btn-create-room').addEventListener('click', () => {
      const name = $('player-name').value.trim() || 'Bomber';
      net.createRoom('Bombernite Arena', 4, name);
      audio.menuSelect();
    });

    // Player name - press Enter to quick join
    $('player-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        $('btn-quick-join').click();
      }
    });

    // Start Game
    $('btn-start-game').addEventListener('click', () => {
      net.startGame();
      audio.menuSelect();
    });

    // Leave Lobby
    $('btn-leave-lobby').addEventListener('click', () => {
      net.leave();
      ui.showMenu();
      net.listRooms();
      audio.menuSelect();
    });

    // Restart
    $('btn-restart').addEventListener('click', () => {
      ui.hideGameOver();
      net.restart();
      audio.menuSelect();
    });

    // Quit to menu
    $('btn-quit').addEventListener('click', () => {
      ui.hideGameOver();
      net.leave();
      ui.showMenu();
      net.listRooms();
      if (inputTimer) {
        clearInterval(inputTimer);
        inputTimer = null;
      }
      gameRunning = false;
      audio.menuSelect();
    });

    // Start sending input when game starts
    let lastBombTime = 0;
    document.addEventListener('keydown', (e) => {
      if (e.key === ' ' && gameRunning) {
        e.preventDefault();
        const now = Date.now();
        if (now - lastBombTime > 300) {
          lastBombTime = now;
          net.placeBomb();
          audio.bombPlace();
        }
      }
    });

    // Connect on load - MUST set handlers BEFORE connect
    net.onConnect = () => {
      ui.setConnectionStatus(true);
    };
    net.onDisconnect = () => {
      ui.setConnectionStatus(false);
    };
    net.connect();
  }

  // --- Game Loop ---
  function gameLoop(timestamp) {
    const dt = lastTime ? (timestamp - lastTime) / 1000 : 0.016;
    lastTime = timestamp;

    if (gameState) {
      renderer.render(gameState, dt);
    }

    // Continuously send input (throttled to 20/s)
    if (gameRunning && (!window._lastInputSend || Date.now() - window._lastInputSend > 50)) {
      window._lastInputSend = Date.now();
      const input = window.input.getInputPacket();
      net.sendInput(input);
    }

    animFrameId = requestAnimationFrame(gameLoop);
  }

  // Start the game loop
  function startGameLoop() {
    if (animFrameId) return;
    lastTime = 0;
    animFrameId = requestAnimationFrame(gameLoop);
  }

  // --- Helper ---
  function hideCursor() {
    document.body.style.cursor = 'none';
  }

  function showCursor() {
    document.body.style.cursor = 'default';
  }

  // --- Start ---
  document.addEventListener('DOMContentLoaded', () => {
    init();
    startGameLoop();
  });

  // Restore cursor when leaving game
  const origShowScreen = ui.showScreen;
  ui.showScreen = function(screenId) {
    origShowScreen.call(ui, screenId);
    if (screenId !== 'game-screen') {
      showCursor();
    }
  };

})();
