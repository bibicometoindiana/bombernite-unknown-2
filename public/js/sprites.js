// ============================================================
// sprites.js - Bomberman Saturn Style Pixel-Art-Rendering
// ============================================================
// All sprites drawn procedurally with Canvas API - no external assets

const SPRITE_SIZE = 48;

// --- Color palettes for players (Bomberman Saturn style) ---
const PLAYER_COLORS = [
  { body: '#ffffff', bandana: '#ff3355', shoes: '#cc2222', skin: '#ffcc99', outline: '#222222' },  // P1 Red
  { body: '#ffffff', bandana: '#33aaff', shoes: '#2266cc', skin: '#ffcc99', outline: '#222222' },  // P2 Blue
  { body: '#ffffff', bandana: '#33ff77', shoes: '#22aa44', skin: '#ffcc99', outline: '#222222' },  // P3 Green
  { body: '#ffffff', bandana: '#ffcc00', shoes: '#cc8800', skin: '#ffcc99', outline: '#222222' }   // P4 Yellow
];

// --- Draw Bomberman Sprite ---
function drawBomberman(ctx, x, y, dir, frame, colorIndex, scale) {
  const s = scale || 1;
  const S = SPRITE_SIZE * s;
  const cx = x;
  const cy = y;
  const hw = S / 2;
  const hh = S / 2;

  const colors = PLAYER_COLORS[colorIndex % PLAYER_COLORS.length];
  const walkCycle = Math.floor(frame) % 4;
  const isWalking = walkCycle > 0;

  ctx.save();
  ctx.translate(cx, cy);

  // === BODY ===
  // Main body (round-ish)
  const bodyW = 28 * s;
  const bodyH = 30 * s;
  const bodyX = -bodyW / 2;
  const bodyY = -4 * s;

  // Body shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(2 * s, bodyY + bodyH - 2 * s, bodyW / 2 + 1, bodyH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  ctx.fillStyle = colors.body;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  ctx.ellipse(0, bodyY + bodyH / 2, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // === BANDANA/HEADBAND ===
  const bandY = bodyY + 4 * s;
  ctx.fillStyle = colors.bandana;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2 * s;

  // Headband wrap
  ctx.beginPath();
  ctx.ellipse(0, bandY, bodyW / 2 - 2, 8 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Bandana knot (tail fluttering based on direction)
  ctx.fillStyle = colors.bandana;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1.5 * s;

  const tailOff = isWalking ? Math.sin(frame * 0.5) * 2 * s : 0;
  ctx.beginPath();
  ctx.moveTo(bodyW / 2 - 2, bandY - 2 * s);
  ctx.quadraticCurveTo(bodyW / 2 + 6 * s + tailOff, bandY - 6 * s, bodyW / 2 + 4 * s, bandY + 2 * s);
  ctx.quadraticCurveTo(bodyW / 2 + 2 * s + tailOff, bandY + 2 * s, bodyW / 2 - 1, bandY + 1 * s);
  ctx.fill();
  ctx.stroke();

  // === EYES ===
  const eyeY = bodyY + 7 * s;
  const eyeSpacing = 7 * s;

  // Eye whites
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 1.5 * s;

  ctx.beginPath();
  ctx.ellipse(-eyeSpacing / 2, eyeY, 5 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(eyeSpacing / 2, eyeY, 5 * s, 5 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Pupils (look in movement direction)
  const pupilDx = dir === 1 ? -2 * s : dir === 2 ? 2 * s : 0;
  const pupilDy = dir === 3 ? -2 * s : dir === 0 ? 2 * s : 0;

  ctx.fillStyle = '#222222';
  ctx.beginPath();
  ctx.ellipse(-eyeSpacing / 2 + pupilDx, eyeY + pupilDy, 3 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(eyeSpacing / 2 + pupilDx, eyeY + pupilDy, 3 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  // === MOUTH (smile!) ===
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1.5 * s;
  ctx.beginPath();
  ctx.arc(0, bodyY + 12 * s, 5 * s, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // === FEET ===
  const footY = bodyY + bodyH - 4 * s;
  ctx.fillStyle = colors.shoes;

  if (isWalking) {
    // Walking animation - alternating feet
    const legOffset = Math.sin(frame * 1.5) * 4 * s;

    // Left foot
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 2 * s;
    ctx.fillStyle = colors.shoes;
    ctx.beginPath();
    ctx.roundRect(-10 * s + legOffset, footY, 9 * s, 5 * s, 2);
    ctx.fill();
    ctx.stroke();

    // Right foot
    ctx.fillStyle = colors.shoes;
    ctx.beginPath();
    ctx.roundRect(1 * s - legOffset, footY, 9 * s, 5 * s, 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // Standing feet
    ctx.strokeStyle = colors.outline;
    ctx.lineWidth = 2 * s;
    ctx.fillStyle = colors.shoes;
    ctx.beginPath();
    ctx.roundRect(-10 * s, footY, 9 * s, 5 * s, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = colors.shoes;
    ctx.beginPath();
    ctx.roundRect(1 * s, footY, 9 * s, 5 * s, 2);
    ctx.fill();
    ctx.stroke();
  }

  // === ARMS ===
  const armY = bodyY + bodyH / 2;
  ctx.fillStyle = colors.skin;
  ctx.strokeStyle = colors.outline;
  ctx.lineWidth = 2 * s;

  // Left arm
  ctx.beginPath();
  ctx.roundRect(-bodyW / 2 - 4 * s, armY - 6 * s, 5 * s, 12 * s, 2);
  ctx.fill();
  ctx.stroke();

  // Right arm
  ctx.beginPath();
  ctx.roundRect(bodyW / 2 - 1 * s, armY - 6 * s, 5 * s, 12 * s, 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// --- Draw wall tile (indestructible) ---
function drawWallTile(ctx, x, y, size) {
  const s = size;
  const brickH = s / 4;
  const brickW = s / 3;

  // Base
  ctx.fillStyle = '#444466';
  ctx.fillRect(x, y, s, s);

  // Brick pattern
  ctx.fillStyle = '#555577';
  for (let row = 0; row < 4; row++) {
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let col = -1; col < 4; col++) {
      const bx = x + col * brickW + offset;
      const by = y + row * brickH;
      ctx.fillStyle = row % 2 === 0 ? '#555577' : '#4a4a6a';
      ctx.fillRect(bx, by, brickW - 1, brickH - 1);
    }
  }

  // Border
  ctx.strokeStyle = '#333355';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, s, s);

  // Small highlight
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x + 1, y + 1, s - 2, 2);
}

// --- Draw soft block (destructible) ---
function drawSoftTile(ctx, x, y, size) {
  const s = size;

  // Base
  ctx.fillStyle = '#886644';
  ctx.fillRect(x, y, s, s);

  // Brick pattern
  ctx.fillStyle = '#996644';
  ctx.fillRect(x + 2, y + 2, s / 2 - 3, s / 2 - 3);
  ctx.fillRect(x + s / 2 + 1, y + 2, s / 2 - 3, s / 2 - 3);
  ctx.fillStyle = '#aa7744';
  ctx.fillRect(x + 2, y + s / 2 + 1, s / 2 - 3, s / 2 - 3);
  ctx.fillRect(x + s / 2 + 1, y + s / 2 + 1, s / 2 - 3, s / 2 - 3);

  // Border
  ctx.strokeStyle = '#664422';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, s, s);

  // Cross pattern
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y);
  ctx.lineTo(x, y + s);
  ctx.stroke();
}

// --- Draw floor tile (checkerboard) ---
function drawFloorTile(ctx, x, y, size, dark) {
  const s = size;
  ctx.fillStyle = dark ? '#335533' : '#446644';
  ctx.fillRect(x, y, s, s);
}

// --- Draw bomb ---
function drawBomb(ctx, x, y, size, fuseProgress, scale) {
  const s = size * (scale || 1);
  const cx = x;
  const cy = y;
  const r = s * 0.4;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, cy + s * 0.25, r, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bomb body (round)
  const gradient = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
  gradient.addColorStop(0, '#555555');
  gradient.addColorStop(0.7, '#333333');
  gradient.addColorStop(1, '#111111');
  ctx.fillStyle = gradient;
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.25, cy - r * 0.25, r * 0.3, r * 0.2, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Fuse
  const fuseLen = 6 * (scale || 1);
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + fuseLen, cy - r - fuseLen, cx + fuseLen * 0.5, cy - r - fuseLen * 1.5);
  ctx.stroke();

  // Spark (pulsing based on fuse progress)
  const sparkSize = 3 + Math.sin(fuseProgress * Math.PI * 8) * 2;
  ctx.fillStyle = '#ff6600';
  ctx.beginPath();
  ctx.arc(cx + fuseLen * 0.5, cy - r - fuseLen * 1.5, sparkSize * (scale || 1), 0, Math.PI * 2);
  ctx.fill();

  // Inner spark glow
  ctx.fillStyle = '#ffff00';
  ctx.beginPath();
  ctx.arc(cx + fuseLen * 0.5, cy - r - fuseLen * 1.5, sparkSize * 0.5 * (scale || 1), 0, Math.PI * 2);
  ctx.fill();
}

// --- Draw explosion ---
function drawExplosion(ctx, x, y, size, progress, isCenter) {
  const s = size;
  const cx = x + s / 2;
  const cy = y + s / 2;

  // Explosion fades out as progress approaches 1
  const alpha = Math.max(0, 1 - progress * progress);

  // Outer glow
  const glowRadius = s * (0.4 + progress * 0.15);
  ctx.save();
  ctx.globalAlpha = alpha * 0.6;

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowRadius);
  gradient.addColorStop(0, isCenter ? '#ffffff' : '#ffff00');
  gradient.addColorStop(0.3, isCenter ? '#ffcc00' : '#ff8800');
  gradient.addColorStop(0.7, '#ff4400');
  gradient.addColorStop(1, 'rgba(255,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Center fire
  ctx.globalAlpha = alpha;
  const fireRadius = s * 0.35 * (1 - progress * 0.3);
  ctx.fillStyle = isCenter ? '#ffffff' : '#ffdd00';
  ctx.beginPath();
  ctx.arc(cx, cy, fireRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff8800';
  ctx.beginPath();
  ctx.arc(cx, cy, fireRadius * 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ff4400';
  ctx.beginPath();
  ctx.arc(cx, cy, fireRadius * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// --- Draw Powerups ---
function drawPowerUp(ctx, x, y, size, type, time) {
  const s = size;
  const cx = x + s / 2;
  const cy = y + s / 2;
  const floatOff = Math.sin(time * 3) * 2;

  ctx.save();
  ctx.translate(cx, cy + floatOff);

  // Background glow
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Box
  ctx.fillStyle = '#333355';
  ctx.strokeStyle = '#6666aa';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-s * 0.3, -s * 0.3, s * 0.6, s * 0.6, 3);
  ctx.fill();
  ctx.stroke();

  // Icon colors
  const iconSize = s * 0.35;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;

  switch (type) {
    case 'fire': // Fire Up - flame icon
      ctx.fillStyle = '#ff4400';
      ctx.beginPath();
      ctx.moveTo(0, -iconSize * 0.6);
      ctx.quadraticCurveTo(iconSize * 0.3, -iconSize * 0.2, iconSize * 0.15, iconSize * 0.2);
      ctx.quadraticCurveTo(0, 0, -iconSize * 0.15, iconSize * 0.2);
      ctx.quadraticCurveTo(-iconSize * 0.3, -iconSize * 0.2, 0, -iconSize * 0.6);
      ctx.fill();
      ctx.stroke();
      break;

    case 'bomb': // Bomb Up - bomb icon
      ctx.fillStyle = '#333333';
      ctx.beginPath();
      ctx.arc(0, 0, iconSize * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      ctx.arc(0, -iconSize * 0.5, iconSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;

    case 'speed': // Speed Up - shoe icon
      ctx.fillStyle = '#44aaff';
      ctx.beginPath();
      ctx.moveTo(-iconSize * 0.5, -iconSize * 0.2);
      ctx.lineTo(iconSize * 0.5, -iconSize * 0.2);
      ctx.lineTo(iconSize * 0.5, iconSize * 0.1);
      ctx.quadraticCurveTo(iconSize * 0.3, iconSize * 0.4, 0, iconSize * 0.4);
      ctx.quadraticCurveTo(-iconSize * 0.3, iconSize * 0.4, -iconSize * 0.5, iconSize * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'fullfire': // Full Fire - skull/star icon
      ctx.fillStyle = '#ffcc00';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (i * 4 * Math.PI / 5) - Math.PI / 2;
        const r2 = i % 2 === 0 ? iconSize * 0.5 : iconSize * 0.2;
        if (i === 0) ctx.moveTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
        else ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;

    case 'kick': // Kick - boot icon
      ctx.fillStyle = '#aa8844';
      ctx.beginPath();
      ctx.roundRect(-iconSize * 0.35, -iconSize * 0.3, iconSize * 0.7, iconSize * 0.5, 2);
      ctx.fill();
      ctx.stroke();
      break;

    case 'skip': // Skip (through bombs) - ghost icon
      ctx.fillStyle = '#aa88ff';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, iconSize * 0.4, Math.PI, 0);
      ctx.lineTo(iconSize * 0.4, iconSize * 0.4);
      ctx.lineTo(iconSize * 0.2, iconSize * 0.2);
      ctx.lineTo(0, iconSize * 0.4);
      ctx.lineTo(-iconSize * 0.2, iconSize * 0.2);
      ctx.lineTo(-iconSize * 0.4, iconSize * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.globalAlpha = 1;
      break;
  }

  ctx.restore();
}

// --- Draw bomb indicator (on HUD) ---
function drawBombIcon(ctx, x, y, size) {
  const s = size;
  ctx.fillStyle = '#333333';
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Fuse
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.4);
  ctx.quadraticCurveTo(x + 4, y - s * 0.6, x + 2, y - s * 0.7);
  ctx.stroke();
}

// --- Draw direction indicator for dead players ---
function drawSkull(ctx, x, y, size) {
  const s = size;
  const cx = x;
  const cy = y;

  ctx.save();
  ctx.fillStyle = '#666666';
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 2;

  // Skull
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes
  ctx.fillStyle = '#222222';
  ctx.beginPath();
  ctx.arc(cx - s * 0.12, cy - s * 0.05, s * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + s * 0.12, cy - s * 0.05, s * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Mouth
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    const mx = cx - s * 0.12 + i * s * 0.08;
    ctx.moveTo(mx, cy + s * 0.12);
    ctx.lineTo(mx, cy + s * 0.2);
    ctx.stroke();
  }

  ctx.restore();
}

// --- Helper: roundRect polyfill for canvas ---
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
    if (typeof r === 'number') r = { tl: r, tr: r, br: r, bl: r };
    else r = { tl: r || 0, tr: r || 0, br: r || 0, bl: r || 0 };

    this.moveTo(x + r.tl, y);
    this.lineTo(x + w - r.tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r.tr);
    this.lineTo(x + w, y + h - r.br);
    this.quadraticCurveTo(x + w, y + h, x + w - r.br, y + h);
    this.lineTo(x + r.bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r.bl);
    this.lineTo(x, y + r.tl);
    this.quadraticCurveTo(x, y, x + r.tl, y);
    this.closePath();
    return this;
  };
}
