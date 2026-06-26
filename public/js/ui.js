// ============================================================
// ui.js - UI Management (Menus, HUD, Game Over)
// ============================================================

class UIManager {
  constructor() {
    this.currentScreen = 'menu';
    this.rooms = [];
    this.roomInfo = null;
    this.gameState = null;
  }

  // --- Screen transitions ---
  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.add('active');
    this.currentScreen = screenId;
  }

  showMenu() {
    this.showScreen('menu-screen');
    document.getElementById('room-list-section').classList.add('hidden');
  }

  showLobby(roomInfo) {
    this.roomInfo = roomInfo;
    this.showScreen('lobby-screen');
    this.updateLobby(roomInfo);
  }

  showGame() {
    this.showScreen('game-screen');
  }

  showGameOver(data) {
    const overlay = document.getElementById('game-over-overlay');
    overlay.classList.remove('hidden');

    const title = document.getElementById('game-over-title');
    const winnerDisplay = document.getElementById('winner-display');
    const finishOrder = document.getElementById('finish-order');

    if (data.winner) {
      const colors = ['🔴', '🔵', '🟢', '🟡'];
      const colorIdx = data.winner.id ? parseInt(data.winner.id.slice(-1)) % 4 : 0;
      title.textContent = '🏆 SIEGER! 🏆';
      winnerDisplay.innerHTML = `
        <div style="font-size: 24px; margin-bottom: 10px;">${colors[colorIdx]}</div>
        <div style="font-size: 16px;">${data.winner.name}</div>
        <div style="font-size: 10px; color: #888; margin-top: 5px;">Siege: ${data.winner.wins || 1}</div>
      `;
    } else {
      title.textContent = '💥 GAME OVER 💥';
      winnerDisplay.innerHTML = '<div style="font-size: 14px; color: #888;">Unentschieden!</div>';
    }

    // Finish order
    if (data.finishOrder && data.finishOrder.length > 0) {
      let orderHtml = '<div style="font-size: 10px; color: #666; margin-bottom: 5px;">REIHENFOLGE</div>';
      data.finishOrder.forEach((p, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        orderHtml += `<div>${medal} ${p.name}</div>`;
      });
      finishOrder.innerHTML = orderHtml;
    }
  }

  hideGameOver() {
    document.getElementById('game-over-overlay').classList.add('hidden');
  }

  // --- Lobby ---
  updateLobby(roomInfo) {
    if (!roomInfo) return;
    document.getElementById('room-name').textContent = roomInfo.name || 'Unknown';

    const playerList = document.getElementById('player-list');
    playerList.innerHTML = '';

    roomInfo.players.forEach((p, i) => {
      const slot = document.createElement('div');
      slot.className = 'player-slot';
      slot.dataset.color = i;
      const colors = ['🔴', '🔵', '🟢', '🟡'];
      slot.innerHTML = `
        <span class="slot-icon">${colors[i] || '◻'}</span>
        <span class="slot-name">${p.name}</span>
      `;
      playerList.appendChild(slot);
    });

    // Fill empty slots
    for (let i = roomInfo.players.length; i < (roomInfo.maxPlayers || 4); i++) {
      const slot = document.createElement('div');
      slot.className = 'player-slot empty';
      slot.innerHTML = `
        <span class="slot-icon">◻</span>
        <span class="slot-name">Offener Platz...</span>
      `;
      playerList.appendChild(slot);
    }

    // Enable/disable start button
    const startBtn = document.getElementById('btn-start-game');
    if (roomInfo.players.length >= 2) {
      startBtn.disabled = false;
      startBtn.classList.remove('disabled');
    } else {
      startBtn.disabled = true;
      startBtn.classList.add('disabled');
    }
  }

  // --- Room list ---
  updateRoomList(rooms) {
    this.rooms = rooms;
    const container = document.getElementById('room-list');
    const section = document.getElementById('room-list-section');

    if (!rooms || rooms.length === 0) {
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');
    container.innerHTML = '';

    rooms.forEach(room => {
      if (room.state === 'playing' || room.state === 'finished') return; // Don't show in-progress rooms

      const item = document.createElement('div');
      item.className = 'room-item';

      const statusText = room.state === 'lobby' ? 'LOBBY' : room.state.toUpperCase();
      const statusClass = room.state === 'lobby' ? 'lobby' : 'playing';

      item.innerHTML = `
        <span class="room-name">${room.name}</span>
        <span class="room-players">${room.players.length}/${room.maxPlayers}</span>
        <span class="room-status ${statusClass}">${statusText}</span>
      `;

      item.addEventListener('click', () => {
        const name = document.getElementById('player-name').value.trim() || 'Bomber';
        net.joinRoom(room.id, name);
      });

      container.appendChild(item);
    });
  }

  // --- HUD ---
  updateHUD(state) {
    // Can add powerup indicators, bomb count, etc.
  }

  // --- Connection status ---
  setConnectionStatus(connected) {
    const status = document.getElementById('connection-status');
    const dot = status.querySelector('.status-dot');
    const text = document.getElementById('status-text');

    status.classList.remove('hidden');
    dot.className = 'status-dot';

    if (connected) {
      dot.classList.add('connected');
      text.textContent = 'Verbunden';
      setTimeout(() => status.classList.add('hidden'), 3000);
    } else {
      dot.classList.add('disconnected');
      text.textContent = 'Getrennt';
    }
  }

  // --- Countdown ---
  showCountdown(num) {
    const overlay = document.getElementById('countdown-overlay');
    overlay.classList.remove('hidden');
    overlay.textContent = num > 0 ? num : 'GO!';

    if (num > 0) {
      audio.countdownBeep(false);
    } else {
      audio.countdownBeep(true);
    }

    setTimeout(() => {
      overlay.classList.add('hidden');
    }, 1000);
  }
}

window.ui = new UIManager();
