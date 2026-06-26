// ============================================================
// renderer.js - Canvas Rendering Engine
// ============================================================

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 2; // Pixel scale factor
    this.tileSize = 48;
    this.cols = 15;
    this.rows = 13;
    this.time = 0;
    this.interpolation = 0; // 0-1 for smooth movement
    this.prevState = null;
    this.currentState = null;
    this.animating = false;
  }

  resize(cols, rows, tileSize) {
    this.cols = cols || 15;
    this.rows = rows || 13;
    this.tileSize = tileSize || 48;

    // Render at 2x internal resolution for crisp pixel art
    const internalScale = 2;
    const displayW = this.cols * this.tileSize * internalScale;
    const displayH = this.rows * this.tileSize * internalScale;

    // Set canvas internal resolution
    this.canvas.width = displayW;
    this.canvas.height = displayH;

    // Scale canvas to fit window while maintaining aspect ratio
    const container = this.canvas.parentElement;
    const maxW = container.clientWidth || window.innerWidth;
    const maxH = container.clientHeight || window.innerHeight;

    const scaleX = maxW / displayW;
    const scaleY = maxH / displayH;
    this.displayScale = Math.min(scaleX, scaleY, 1.5);

    this.canvas.style.width = Math.floor(displayW * this.displayScale) + 'px';
    this.canvas.style.height = Math.floor(displayH * this.displayScale) + 'px';

    // Scale the context for rendering
    this.ctx.setTransform(internalScale, 0, 0, internalScale, 0, 0);

    // Disable image smoothing for crisp pixel look
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.msImageSmoothingEnabled = false;
  }

  // --- Main render call ---
  render(state, dt) {
    if (!state) return;

    this.time += dt;
    const ctx = this.ctx;

    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw map
    this.drawMap(state);

    // Draw powerups
    if (state.powerups) {
      for (const key in state.powerups) {
        const pu = state.powerups[key];
        drawPowerUp(ctx, pu.x * this.tileSize, pu.y * this.tileSize, this.tileSize, pu.type, this.time);
      }
    }

    // Draw bombs
    if (state.bombs) {
      for (const bid in state.bombs) {
        const bomb = state.bombs[bid];
        const bx = bomb.x - this.tileSize / 2;
        const by = bomb.y - this.tileSize / 2;
        ctx.save();
        // Pulsing bomb size
        const pulse = 1 + Math.sin(this.time * 4) * 0.03;
        ctx.translate(bomb.x, bomb.y);
        ctx.scale(pulse, pulse);
        ctx.translate(-bomb.x, -bomb.y);
        drawBomb(ctx, bomb.x, bomb.y, this.tileSize, bomb.fuseProgress);
        ctx.restore();
      }
    }

    // Draw explosions
    if (state.explosions) {
      const now = Date.now();
      for (const exp of state.explosions) {
        const elapsed = now - exp.startTime;
        const progress = Math.min(1, elapsed / exp.duration);

        if (progress >= 1) continue;

        for (const cell of exp.cells) {
          const isCenter = cell.x === exp.cells[0].x && cell.y === exp.cells[0].y;
          drawExplosion(ctx,
            cell.x * this.tileSize,
            cell.y * this.tileSize,
            this.tileSize, progress, isCenter
          );
        }
      }
    }

    // Draw players
    if (state.players) {
      // Sort so alive players render above dead ones
      const sorted = Object.values(state.players).sort((a, b) => {
        if (a.alive && !b.alive) return 1;
        if (!a.alive && b.alive) return -1;
        return 0;
      });

      for (const player of sorted) {
        const px = player.x - this.tileSize / 2;
        const py = player.y - this.tileSize / 2;

        if (player.alive) {
          // Invincibility flash
          if (player.invincibleUntil > Date.now()) {
            ctx.save();
            ctx.globalAlpha = Math.sin(this.time * 12) > 0 ? 1 : 0.3;
            drawBomberman(ctx, player.x, player.y, player.dir, player.frame, player.color);
            ctx.restore();
          } else {
            drawBomberman(ctx, player.x, player.y, player.dir, player.frame, player.color);
          }

          // Draw player name above
          ctx.save();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.font = '10px "Press Start 2P", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(player.name, player.x, player.y - this.tileSize / 2 - 6);
          ctx.restore();
        } else {
          // Dead - show skull
          drawSkull(ctx, player.x, player.y, this.tileSize * 0.6);
        }
      }
    }
  }

  // --- Map rendering ---
  drawMap(state) {
    const map = state.map;
    if (!map) return;

    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        const cell = map[y][x];
        const cellX = x * this.tileSize;
        const cellY = y * this.tileSize;

        switch (cell) {
          case 'empty':
            // Checkerboard floor
            drawFloorTile(this.ctx, cellX, cellY, this.tileSize, (x + y) % 2 === 0);
            break;

          case 'wall':
            drawWallTile(this.ctx, cellX, cellY, this.tileSize);
            break;

          case 'soft':
            drawSoftTile(this.ctx, cellX, cellY, this.tileSize);
            break;
        }
      }
    }
  }

  // --- Utility ---
  worldToTile(wx, wy) {
    return {
      x: Math.floor(wx / this.tileSize),
      y: Math.floor(wy / this.tileSize)
    };
  }

  tileToWorld(tx, ty) {
    return {
      x: tx * this.tileSize + this.tileSize / 2,
      y: ty * this.tileSize + this.tileSize / 2
    };
  }
}
