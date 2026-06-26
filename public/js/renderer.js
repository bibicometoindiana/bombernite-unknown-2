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
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    // --- Lighting ---
    // Ambient fill
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambient);

    // Hemisphere for sky/ground color variation
    const hemi = new THREE.HemisphereLight(0x4466ff, 0x221133, 0.5);
    this.scene.add(hemi);

    // Main directional light (sun)
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

    // Rim light
    const rim = new THREE.DirectionalLight(0x8888ff, 0.4);
    rim.position.set(-5, 10, -8);
    this.scene.add(rim);

    // --- Fog for depth ---
    this.scene.fog = new THREE.Fog(0x0a0a1a, 18, 30);

    // --- Object pools ---
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

    // --- Materials ---
    this.materials = {
      floorLight: new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.7,
        metalness: 0.1
      }),
      floorDark: new THREE.MeshStandardMaterial({
        color: 0x12122a,
        roughness: 0.8,
        metalness: 0.0
      }),
      wall: new THREE.MeshStandardMaterial({
        color: 0x444477,
        roughness: 0.5,
        metalness: 0.3
      }),
      soft: new THREE.MeshStandardMaterial({
        color: 0x885533,
        roughness: 0.8,
        metalness: 0.0
      }),
      bomb: new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.3,
        metalness: 0.7
      }),
      bombGlow: new THREE.MeshBasicMaterial({
        color: 0xff3300,
        transparent: true,
        opacity: 0.3
      }),
      explosionCore: new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9
      }),
      explosionInner: new THREE.MeshBasicMaterial({
        color: 0xff8800,
        transparent: true,
        opacity: 0.7
      }),
      explosionOuter: new THREE.MeshBasicMaterial({
        color: 0xff4400,
        transparent: true,
        opacity: 0.4
      })
    };

    // Player colors
    this.playerColors = [
      0xff3355, // Red
      0x33aaff, // Blue
      0x33ff77, // Green
      0xffcc00  // Yellow
    ];

    // --- Resize handler ---
    this._onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);

    // --- Build static floor & wall geometry ---
    this.floorMeshes = [];
    this.wallMeshes = [];
    this.softBlockMeshes = {};
    this.powerupMeshes = {};
    this.bombMeshes = {};
    this.explosionMeshes = [];
    this.playerMeshes = {};
    this.nameLabels = {};

    this._lastMap = null;
    this._lastPlayers = null;
    this._lastSoftBlocks = null;
    this._lastPowerups = null;
    this._lastBombs = null;
    this._lastExplosions = null;
  }

  // --- Build floor grid ---
  _buildFloor() {
    this.clearGroup(this.floorGroup);
    this.floorMeshes = [];

    const geo = new THREE.PlaneGeometry(1, 1);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const mat = (x + y) % 2 === 0 ? this.materials.floorLight : this.materials.floorDark;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x + 0.5, -0.01, y + 0.5);
        mesh.receiveShadow = true;
        this.floorGroup.add(mesh);
        this.floorMeshes.push(mesh);
      }
    }
  }

  // --- Build walls from map ---
  _buildWalls(map) {
    this.clearGroup(this.wallGroup);
    this.wallMeshes = [];

    if (!map) return;

    const wallGeo = new THREE.BoxGeometry(1, 0.8, 1);
    wallGeo.translate(0, 0.4, 0);

    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        if (map[y][x] === 'wall') {
          const mesh = new THREE.Mesh(wallGeo, this.materials.wall);
          mesh.position.set(x + 0.5, 0, y + 0.5);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          this.wallGroup.add(mesh);
          this.wallMeshes.push(mesh);
        }
      }
    }
  }

  // --- Build soft blocks ---
  _updateSoftBlocks(map) {
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
    // Remove old ones
    this.clearGroup(this.powerupGroup);
    this.powerupMeshes = {};

    if (!powerups) return;

    const colors = {
      'fire': 0xff6600,
      'bomb': 0x44aaff,
      'speed': 0x33ff77,
      'fullfire': 0xffaa00,
      'kick': 0xaa44ff,
      'skip': 0xff55ff
    };

    const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);

    for (const key in powerups) {
      const pu = powerups[key];
      const color = colors[pu.type] || 0xffffff;
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.3,
        roughness: 0.2,
        metalness: 0.4
      });

      // Inner core
      const innerMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6
      });

      const group = new THREE.Group();

      const box = new THREE.Mesh(geo, mat);
      box.position.y = 0.35;
      box.castShadow = false;

      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), innerMat);
      inner.position.y = 0.35;

      group.add(box);
      group.add(inner);
      group.position.set(pu.x + 0.5, 0, pu.y + 0.5);

      // Floating animation data
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

      // Main bomb sphere
      const mesh = new THREE.Mesh(bombGeo, this.materials.bomb);
      mesh.position.y = 0.15;
      mesh.castShadow = true;
      group.add(mesh);

      // Glow ring (pulse)
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

        // Core (white center)
        const coreMat = this.materials.explosionCore.clone();
        coreMat.opacity = (1 - progress) * 0.9;
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(isCenter ? 0.6 : 0.4, isCenter ? 0.6 : 0.4, 0.3, 8),
          coreMat
        );
        core.position.set(cell.x + 0.5, 0.2 + progress * 0.1, cell.y + 0.5);

        // Inner ring
        const innerMat = this.materials.explosionInner.clone();
        innerMat.opacity = (1 - progress) * 0.7;
        const inner = new THREE.Mesh(
          new THREE.CylinderGeometry(
            isCenter ? 0.8 : 0.55,
            isCenter ? 0.8 : 0.55,
            0.2 + progress * 0.1, 8
          ),
          innerMat
        );
        inner.position.set(cell.x + 0.5, 0.1, cell.y + 0.5);

        // Outer ring
        const outerMat = this.materials.explosionOuter.clone();
        outerMat.opacity = (1 - progress) * 0.5;
        const outerR = isCenter ? 0.9 : 0.65;
        const outer = new THREE.Mesh(
          new THREE.CylinderGeometry(outerR, outerR, 0.1, 8),
          outerMat
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
    // Remove old player meshes
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

        // Body (capsule-like: cylinder + sphere top)
        const bodyGeo = new THREE.CylinderGeometry(0.28, 0.35, 0.5, 10);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.4,
          metalness: 0.2,
          emissive: color,
          emissiveIntensity: 0.1
        });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.25;
        body.castShadow = true;
        group.add(body);

        // Head (sphere)
        const headMat = new THREE.MeshStandardMaterial({
          color: 0xffddaa,
          roughness: 0.4,
          metalness: 0.0
        });
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), headMat);
        head.position.y = 0.6;
        head.castShadow = true;
        group.add(head);

        // Hat/band (colored)
        const bandMat = new THREE.MeshStandardMaterial({
          color: color,
          roughness: 0.3,
          metalness: 0.1,
          emissive: color,
          emissiveIntensity: 0.2
        });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 10), bandMat);
        band.position.y = 0.5;
        band.rotation.x = Math.PI / 2;
        group.add(band);

        // Direction indicator (small cone)
        const dirMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xffffff,
          emissiveIntensity: 0.3
        });
        const dirIndicator = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), dirMat);
        dirIndicator.position.set(0, 0.65, 0.25);
        group.add(dirIndicator);

        this.playerMeshes[pid] = {
          group,
          body,
          head,
          band,
          dirIndicator
        };
        this.playerGroup.add(group);

        // Name label (CSS2D would be better but let's use sprite)
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
        const spriteMat = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false
        });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(1.5, 0.3, 1);
        this.nameLabels[pid] = sprite;
        this.nameLabelGroup.add(sprite);
      }

      // Update position
      const mesh = this.playerMeshes[pid];
      mesh.group.position.set(player.x, 0, player.y);

      // Direction - rotate body
      let rotY = 0;
      switch (player.dir) {
        case 'right': rotY = 0; break;
        case 'left': rotY = Math.PI; break;
        case 'down': rotY = Math.PI / 2; break;
        case 'up': rotY = -Math.PI / 2; break;
      }
      mesh.group.rotation.y = rotY;

      // Visibility & effects
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

      // Name label position
      if (this.nameLabels[pid]) {
        this.nameLabels[pid].position.set(player.x, 0.9, player.y);
      }
    }
  }

  // --- Render loop ---
  render(state, dt) {
    if (!state) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.time += dt;

    // --- Map changes? ---
    if (state.map !== this._lastMap) {
      if (!this._floorBuilt) {
        this._buildFloor();
        this._floorBuilt = true;
      }
      this._buildWalls(state.map);
      this._updateSoftBlocks(state.map);
      this._lastMap = state.map;
    }

    // --- Soft block changes (check for destroyed ones) ---
    if (JSON.stringify(state.map) !== JSON.stringify(this._lastSoftBlocks)) {
      this._updateSoftBlocks(state.map);
      this._lastSoftBlocks = JSON.parse(JSON.stringify(state.map));
    }

    // --- Powerups ---
    this._updatePowerups(state.powerups);

    // Animate powerups (floating)
    for (const key in this.powerupMeshes) {
      const g = this.powerupMeshes[key];
      g.position.y = Math.sin(this.time * 1.5 + g.userData.floatOffset) * 0.1 + 0.1;
      g.rotation.y += dt * 0.5;
    }

    // --- Bombs ---
    this._updateBombs(state.bombs);

    // Animate bombs (pulse)
    for (const bid in this.bombMeshes) {
      const g = this.bombMeshes[bid];
      const pulse = 1 + Math.sin(this.time * 4) * 0.05;
      g.scale.set(pulse, pulse, pulse);
    }

    // --- Explosions ---
    this._updateExplosions(state.explosions);

    // --- Players ---
    this._updatePlayers(state.players);

    // Animate alive players (bobbing)
    for (const pid in this.playerMeshes) {
      const mesh = this.playerMeshes[pid];
      if (mesh.group.visible) {
        mesh.group.position.y = Math.sin(this.time * 6) * 0.02;
      }
    }

    // --- Render ---
    this.renderer.render(this.scene, this.camera);
  }

  // --- Resize interface (called from client) ---
  resize(cols, rows, tileSize) {
    // Not needed - Three.js handles its own sizing
    this.cols = cols || 15;
    this.rows = rows || 13;

    // Adjust camera for different grid sizes
    const centerX = this.cols / 2;
    const centerZ = this.rows / 2;
    const maxDim = Math.max(this.cols, this.rows);
    const dist = maxDim * 0.9 + 4;

    this.camera.position.set(centerX + dist * 0.5, dist * 0.55, centerZ + dist * 0.5);
    this.camera.lookAt(centerX, 0, centerZ);
  }

  // --- Helpers ---
  clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
      group.remove(child);
    }
  }

  // --- Cleanup ---
  destroy() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
