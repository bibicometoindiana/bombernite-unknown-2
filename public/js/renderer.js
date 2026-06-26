// ============================================================
// renderer.js - Three.js 3D Rendering Engine
// ============================================================

class Renderer {
  constructor(container) {
    this.container = container;
    this.cols = 15;
    this.rows = 13;
    this.tileSize = 1; // 1 unit per tile in 3D space
    this.time = 0;

    // --- Setup Three.js ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);

    // Camera: isometric angle
    const aspect = container.clientWidth / container.clientHeight || 1.77;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 50);
    this.camera.position.set(12, 14, 12);
    this.camera.lookAt(7, 0, 6);

    // Renderer
    this.renderer = null;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      console.error('WebGL not available:', e);
      container.innerHTML = '<div style="color:#ff3355;padding:40px;text-align:center;font-family:monospace;font-size:16px">' +
        '⚠️ WebGL nicht verfügbar<br><small>Dein Browser unterstützt kein 3D-Rendering.</small></div>';
      return;
    }
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // Handle WebGL context loss
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost');
    });

    // --- Lighting ---
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x4466ff, 0x221133, 0.5);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffeedd, 1.8);
    sun.position.set(10, 18, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 40;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    this.scene.add(sun);
    this.sun = sun;

    const rim = new THREE.DirectionalLight(0x8888ff, 0.4);
    rim.position.set(-5, 10, -8);
    this.scene.add(rim);

    // --- Fog ---
    this.scene.fog = new THREE.Fog(0x0a0a1a, 18, 30);

    // --- Object groups (added once to scene) ---
    this.floorGroup = new THREE.Group();
    this.wallGroup = new THREE.Group();
    this.softBlockGroup = new THREE.Group();
    this.powerupGroup = new THREE.Group();
    this.bombGroup = new THREE.Group();
    this.explosionGroup = new THREE.Group();
    this.playerGroup = new THREE.Group();
    this.nameLabelGroup = new THREE.Group();

    this.scene.add(this.floorGroup);
    this.scene.add(this.wallGroup);
    this.scene.add(this.softBlockGroup);
    this.scene.add(this.powerupGroup);
    this.scene.add(this.bombGroup);
    this.scene.add(this.explosionGroup);
    this.scene.add(this.playerGroup);
    this.scene.add(this.nameLabelGroup);

    // --- Reusable materials ---
    this.materials = {
      floorLight: new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.7, metalness: 0.1 }),
      floorDark: new THREE.MeshStandardMaterial({ color: 0x12122a, roughness: 0.8, metalness: 0.0 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x444477, roughness: 0.5, metalness: 0.3 }),
      soft: new THREE.MeshStandardMaterial({ color: 0x885533, roughness: 0.8, metalness: 0.0 }),
      bomb: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.7 }),
      bombGlow: new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.3 }),
      explosionCore: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
      explosionInner: new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.7 }),
      explosionOuter: new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.4 })
    };

    this.playerColors = [0xff3355, 0x33aaff, 0x33ff77, 0xffcc00];

    // --- Resize handler ---
    this._onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);

    // --- State tracking ---
    this._mapBuilt = false;
    this._mapHash = '';
    this.softBlockMeshes = {};
    this.powerupMeshes = {};
    this.bombMeshes = {};
    this.explosionMeshes = [];
    this.playerMeshes = {};
    this.nameLabels = {};

    // Single shared geometries for walls (reused, not rebuilt)
    this._wallGeo = null;
    this._softGeo = null;
  }

  // --- Build floor grid (once) ---
  _buildFloor() {
    this.clearGroup(this.floorGroup);
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const mat = (x + y) % 2 === 0 ? this.materials.floorLight : this.materials.floorDark;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x + 0.5, -0.01, y + 0.5);
        mesh.receiveShadow = true;
        this.floorGroup.add(mesh);
      }
    }
  }

  // --- Build entire map (walls + soft blocks) from scratch ---
  _buildMap(map) {
    // Walls
    this.clearGroup(this.wallGroup);
    this.clearGroup(this.softBlockGroup);
    this.softBlockMeshes = {};

    if (!map) return;

    const wallGeo = new THREE.BoxGeometry(1, 0.8, 1);
    wallGeo.translate(0, 0.4, 0);
    const softGeo = new THREE.BoxGeometry(0.85, 0.6, 0.85);
    softGeo.translate(0, 0.3, 0);

    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        const cell = map[y][x];
        const px = x + 0.5;
        const py = y + 0.5;

        if (cell === 'wall') {
          const mesh = new THREE.Mesh(wallGeo, this.materials.wall);
          mesh.position.set(px, 0, py);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.wallGroup.add(mesh);
        } else if (cell === 'soft') {
          const key = `${x},${y}`;
          const mesh = new THREE.Mesh(softGeo, this.materials.soft);
          mesh.position.set(px, 0, py);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.softBlockGroup.add(mesh);
          this.softBlockMeshes[key] = mesh;
        }
      }
    }
  }

  // --- Rebuild only soft blocks (when map changes) ---
  _rebuildSoftBlocks(map) {
    this.clearGroup(this.softBlockGroup);
    this.softBlockMeshes = {};
    if (!map) return;
    const softGeo = new THREE.BoxGeometry(0.85, 0.6, 0.85);
    softGeo.translate(0, 0.3, 0);
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        if (map[y][x] === 'soft') {
          const key = `${x},${y}`;
          const mesh = new THREE.Mesh(softGeo, this.materials.soft);
          mesh.position.set(x + 0.5, 0, y + 0.5);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.softBlockGroup.add(mesh);
          this.softBlockMeshes[key] = mesh;
        }
      }
    }
  }

  // --- Update powerups ---
  _updatePowerups(powerups) {
    this.clearGroup(this.powerupGroup);
    this.powerupMeshes = {};
    if (!powerups) return;

    const colors = {
      'fire': 0xff6600, 'bomb': 0x44aaff, 'speed': 0x33ff77,
      'fullfire': 0xffaa00, 'kick': 0xaa44ff, 'skip': 0xff55ff
    };

    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    for (const key in powerups) {
      const pu = powerups[key];
      const color = colors[pu.type] || 0xffffff;
      const mat = new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0.3,
        roughness: 0.2, metalness: 0.4
      });
      const group = new THREE.Group();
      const box = new THREE.Mesh(geo, mat);
      box.position.y = 0.35;
      box.castShadow = false;
      const inner = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })
      );
      inner.position.y = 0.35;
      group.add(box);
      group.add(inner);
      group.position.set(pu.x + 0.5, 0, pu.y + 0.5);
      group.userData = { floatOffset: Math.random() * Math.PI * 2 };
      this.powerupGroup.add(group);
      this.powerupMeshes[key] = group;
    }
  }

  // --- Update bombs ---
  _updateBombs(bombs) {
    this.clearGroup(this.bombGroup);
    this.bombMeshes = {};
    if (!bombs) return;

    const bombGeo = new THREE.SphereGeometry(0.25, 12, 12);
    const glowGeo = new THREE.SphereGeometry(0.35, 8, 8);

    for (const bid in bombs) {
      const bomb = bombs[bid];
      const group = new THREE.Group();
      const mesh = new THREE.Mesh(bombGeo, this.materials.bomb);
      mesh.position.y = 0.15;
      mesh.castShadow = true;
      group.add(mesh);

      const glow = new THREE.Mesh(glowGeo, this.materials.bombGlow);
      glow.position.y = 0.15;
      group.add(glow);

      group.position.set(bomb.x, 0, bomb.y);
      group.userData = { bomb };
      this.bombGroup.add(group);
      this.bombMeshes[bid] = group;
    }
  }

  // --- Update explosions ---
  _updateExplosions(explosions) {
    this.clearGroup(this.explosionGroup);
    this.explosionMeshes = [];
    if (!explosions) return;

    const now = Date.now();
    for (const exp of explosions) {
      const elapsed = now - exp.startTime;
      const progress = Math.min(1, elapsed / exp.duration);
      if (progress >= 1) continue;

      for (const cell of exp.cells) {
        const isCenter = cell.x === exp.cells[0].x && cell.y === exp.cells[0].y;

        const coreMat = this.materials.explosionCore.clone();
        coreMat.opacity = (1 - progress) * 0.9;
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(isCenter ? 0.6 : 0.4, isCenter ? 0.6 : 0.4, 0.3, 8), coreMat
        );
        core.position.set(cell.x + 0.5, 0.2 + progress * 0.1, cell.y + 0.5);

        const innerMat = this.materials.explosionInner.clone();
        innerMat.opacity = (1 - progress) * 0.7;
        const inner = new THREE.Mesh(
          new THREE.CylinderGeometry(isCenter ? 0.8 : 0.55, isCenter ? 0.8 : 0.55, 0.2 + progress * 0.1, 8), innerMat
        );
        inner.position.set(cell.x + 0.5, 0.1, cell.y + 0.5);

        const outerMat = this.materials.explosionOuter.clone();
        outerMat.opacity = (1 - progress) * 0.5;
        const outer = new THREE.Mesh(
          new THREE.CylinderGeometry(isCenter ? 0.9 : 0.65, isCenter ? 0.9 : 0.65, 0.1, 8), outerMat
        );
        outer.position.set(cell.x + 0.5, 0.05, cell.y + 0.5);

        this.explosionGroup.add(core);
        this.explosionGroup.add(inner);
        this.explosionGroup.add(outer);
        this.explosionMeshes.push({ core, inner, outer, progress });
      }
    }
  }

  // --- Update players ---
  _updatePlayers(players) {
    // Remove players that disappeared
    for (const pid in this.playerMeshes) {
      if (!players || !players[pid]) {
        this.playerGroup.remove(this.playerMeshes[pid].group);
        this.nameLabelGroup.remove(this.nameLabels[pid]);
        delete this.playerMeshes[pid];
        delete this.nameLabels[pid];
      }
    }

    if (!players) return;

    for (const pid in players) {
      const player = players[pid];
      const colorIdx = player.color !== undefined ? player.color % this.playerColors.length : 0;
      const color = this.playerColors[colorIdx];

      if (!this.playerMeshes[pid]) {
        // Create new player
        const group = new THREE.Group();

        const bodyGeo = new THREE.CylinderGeometry(0.28, 0.35, 0.5, 10);
        const bodyMat = new THREE.MeshStandardMaterial({
          color, roughness: 0.4, metalness: 0.2,
          emissive: color, emissiveIntensity: 0.1
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.25;
        body.castShadow = true;
        group.add(body);

        const headMat = new THREE.MeshStandardMaterial({ color: 0xffddaa, roughness: 0.4, metalness: 0.0 });
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), headMat);
        head.position.y = 0.6;
        head.castShadow = true;
        group.add(head);

        const bandMat = new THREE.MeshStandardMaterial({
          color, roughness: 0.3, metalness: 0.1,
          emissive: color, emissiveIntensity: 0.2
        });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 10), bandMat);
        band.position.y = 0.5;
        band.rotation.x = Math.PI / 2;
        group.add(band);

        const dirMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 });
        const dirIndicator = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), dirMat);
        dirIndicator.position.set(0, 0.65, 0.25);
        group.add(dirIndicator);

        this.playerMeshes[pid] = { group, body, head, band, dirIndicator };
        this.playerGroup.add(group);

        // Name label sprite
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, 256, 48);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(player.name || 'Player', 128, 24);

        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.5, 0.3, 1);
        this.nameLabels[pid] = sprite;
        this.nameLabelGroup.add(sprite);
      }

      const mesh = this.playerMeshes[pid];
      mesh.group.position.set(player.x, 0, player.y);

      // Direction
      const rotMap = { right: 0, left: Math.PI, down: Math.PI / 2, up: -Math.PI / 2 };
      mesh.group.rotation.y = rotMap[player.dir] || 0;

      if (!player.alive) {
        mesh.group.visible = false;
        if (this.nameLabels[pid]) this.nameLabels[pid].visible = false;
        continue;
      }
      mesh.group.visible = true;
      if (this.nameLabels[pid]) this.nameLabels[pid].visible = true;

      // Invincibility flash
      if (player.invincibleUntil > Date.now()) {
        const flash = Math.sin(this.time * 20) > 0 ? 1 : 0.2;
        mesh.body.material.opacity = flash;
        mesh.head.material.opacity = flash;
        mesh.body.material.transparent = true;
        mesh.head.material.transparent = true;
      } else {
        mesh.body.material.opacity = 1;
        mesh.head.material.opacity = 1;
        mesh.body.material.transparent = false;
        mesh.head.material.transparent = false;
      }

      if (this.nameLabels[pid]) {
        this.nameLabels[pid].position.set(player.x, 0.9, player.y);
      }
    }
  }

  // --- Main render loop ---
  render(state, dt) {
    if (!this.renderer) return;
    if (!state) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.time += dt;

    // --- Build map ONCE (first time only) ---
    if (!this._mapBuilt && state.map) {
      this._buildFloor();
      this._buildMap(state.map);
      this._mapHash = JSON.stringify(state.map);
      this._mapBuilt = true;
    }

    // --- Check for map changes (soft blocks destroyed) ---
    if (state.map) {
      const newHash = JSON.stringify(state.map);
      if (newHash !== this._mapHash) {
        this._rebuildSoftBlocks(state.map);
        this._mapHash = newHash;
      }
    }

    // --- Powerups ---
    this._updatePowerups(state.powerups);
    for (const key in this.powerupMeshes) {
      const g = this.powerupMeshes[key];
      g.position.y = Math.sin(this.time * 1.5 + g.userData.floatOffset) * 0.1 + 0.1;
      g.rotation.y += dt * 0.5;
    }

    // --- Bombs ---
    this._updateBombs(state.bombs);
    for (const bid in this.bombMeshes) {
      const g = this.bombMeshes[bid];
      const pulse = 1 + Math.sin(this.time * 4) * 0.05;
      g.scale.set(pulse, pulse, pulse);
    }

    // --- Explosions ---
    this._updateExplosions(state.explosions);

    // --- Players ---
    this._updatePlayers(state.players);
    for (const pid in this.playerMeshes) {
      const mesh = this.playerMeshes[pid];
      if (mesh.group.visible) {
        mesh.group.position.y = Math.sin(this.time * 6) * 0.02;
      }
    }

    // --- Render ---
    this.renderer.render(this.scene, this.camera);
  }

  resize(cols, rows, tileSize) {
    this.cols = cols || 15;
    this.rows = rows || 13;

    const centerX = this.cols / 2;
    const centerZ = this.rows / 2;
    const maxDim = Math.max(this.cols, this.rows);
    const dist = maxDim * 0.9 + 4;

    this.camera.position.set(centerX + dist * 0.5, dist * 0.55, centerZ + dist * 0.5);
    this.camera.lookAt(centerX, 0, centerZ);
  }

  clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      group.remove(child);
    }
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
