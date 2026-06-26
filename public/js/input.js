// ============================================================
// input.js - Keyboard Input Handler
// ============================================================

class InputHandler {
  constructor() {
    this.keys = {
      up: false, down: false, left: false, right: false,
      bomb: false, pause: false
    };
    this.prevKeys = {};
    this.bombPressed = false;
    this.pausePressed = false;
    this.keyMap = {
      'ArrowUp': 'up', 'ArrowDown': 'down',
      'ArrowLeft': 'left', 'ArrowRight': 'right',
      'w': 'up', 's': 'down', 'a': 'left', 'd': 'right',
      ' ': 'bomb',
      'Escape': 'pause'
    };
    this.onAnyKey = null;
    this.onPause = null;

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }

  _onKeyDown(e) {
    const action = this.keyMap[e.key];
    if (action) {
      e.preventDefault();
      if (!this.keys[action]) {
        this.keys[action] = true;
        if (action === 'bomb') this.bombPressed = true;
        if (action === 'pause') this.pausePressed = true;
      }
    }
    if (this.onAnyKey) this.onAnyKey(e);
  }

  _onKeyUp(e) {
    const action = this.keyMap[e.key];
    if (action) {
      e.preventDefault();
      this.keys[action] = false;
      if (action === 'bomb') setTimeout(() => { this.bombPressed = false; }, 50);
    }
  }

  getInputPacket() {
    return {
      up: this.keys.up,
      down: this.keys.down,
      left: this.keys.left,
      right: this.keys.right
    };
  }

  consumeBombPress() {
    if (this.bombPressed) {
      this.bombPressed = false;
      return true;
    }
    return false;
  }

  consumePausePress() {
    if (this.pausePressed) {
      this.pausePressed = false;
      return true;
    }
    return false;
  }

  // Send input at fixed rate
  startSending(sendFn, rate) {
    this.sendInterval = setInterval(() => {
      sendFn(this.getInputPacket());
    }, 1000 / (rate || 30));
  }

  stopSending() {
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }
  }

  destroy() {
    this.stopSending();
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);
  }
}

window.input = new InputHandler();
