// ============================================================
// renderer.js - Three.js 3D Rendering Engine (Optimized)
// Bomberman Saturn Fight!! Style
// ============================================================

class Renderer {
  constructor(container) {
    this.container = container;
    this.cols = 15;
    this.rows = 13;
    this.tileSize = 48;
    this.time = 0;

    // --- Setup Three.js ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);

    const aspect = container.clientWidth / container.clientHeight || 1.77;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 50);
    this.camera.position.set(12, 14, 12);
    this.camera.lookAt(7, 0, 6);

    this.renderer = null;
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost');
    });

    // --- Lighting ---
    const ambient = new THREE.AmbientLight(0x6666aa, 0.7);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight(0x88aaff, 0x443366, 0.6);
    this.scene.add(hemi);

    // Shadow light: 512x512 cascade, tighter frustum
    const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
    sun.position.set(8, 20, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 512;
    sun.shadow.mapSize.height = 512;
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 30;
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);
    this.sun = sun;

    const rim = new THREE.DirectionalLight(0x8888ff, 0.3);
    rim.position.set(-5, 8, -8);
    this.scene.add(rim);

    this.scene.fog = new THREE.Fog(0x0a0a1a, 18, 30);

    // --- Object groups ---
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

    // --- Materials (Lambert for static = 50% cheaper than Standard) ---
    this.materials = {
      wall: new THREE.MeshLambertMaterial({ color: 0x5555aa }),
      wallCap: new THREE.MeshLambertMaterial({ color: 0x6666cc }),
      soft: new THREE.MeshLambertMaterial({ color: 0xcc8844 }),
      softCap: new THREE.MeshLambertMaterial({ color: 0xdd9955 }),
      bomb: new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.6 }),
      bombGlow: new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.3 }),
      bombSpark: new THREE.MeshBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.6 }),
      explosionCore: new THREE.MeshBasicMaterial({ color: 0xffffee, transparent: true, opacity: 0.9 }),
      explosionInner: new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.7 }),
      explosionOuter: new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0.4 })
    };

    this.playerColors = [
      { body: 0xff3355, accent: 0xff6688, name: 'Rot' },
      { body: 0x33aaff, accent: 0x66ccff, name: 'Blau' },
      { body: 0x33ff77, accent: 0x66ff99, name: 'Grün' },
      { body: 0xffcc00, accent: 0xffdd44, name: 'Gelb' }
    ];

    // Direction rotation mapping (0=down, 1=left, 2=right, 3=up) - matches server
    this._dirRotations = [Math.PI / 2, Math.PI, 0, -Math.PI / 2];

    // --- Shared geometries (created once, reused) ---
    this._geo = {
      box1: new THREE.BoxGeometry(1, 1, 1),
      plane1: new THREE.PlaneGeometry(1, 1),
      sphere022: new THREE.SphereGeometry(0.22, 8, 8),
      sphere03: new THREE.SphereGeometry(0.3, 5, 5),
      sphere004: new THREE.SphereGeometry(0.04, 4, 4),
      sphere024: new THREE.SphereGeometry(0.24, 6, 6),
      cylinder03: new THREE.CylinderGeometry(0.3, 0.35, 0.35, 6),
      torus026: new THREE.TorusGeometry(0.26, 0.055, 4, 8),
      sphere004eye: new THREE.SphereGeometry(0.04, 6, 6),
      sphere0025: new THREE.SphereGeometry(0.025, 4, 4),
      cylinderPlatform: new THREE.CylinderGeometry(0.2, 0.25, 0.05, 6),
      sphere01: new THREE.SphereGeometry(0.1, 6, 6),
      ringGeo: new THREE.RingGeometry(7.5, 8, 32)
    };

    // Cache for explosion geometry sizes so we reuse cylinder geometries
    this._explosionGeoCache = {};

    // Canvas texture for checkerboard floor (single draw call!)
    this._floorTexture = this._createFloorTexture(15, 13);
    this._floorMat = new THREE.MeshLambertMaterial({ map: this._floorTexture });
    this._floorMesh = null;

    // --- Resize handler ---
    this._onResize = () => {
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };
    window.addEventListener('resize', this._onResize);

    // --- State ---
    this._mapBuilt = false;
    this._mapHash = '';
    this.softBlockMeshes = {};
    this.powerupMeshes = {};
    this.bombMeshes = {};
    this.playerMeshes = {};
    this.nameLabels = {};
    // Explosion mesh pool (reuse instead of GC)
    this._explosionMeshes = [];
  }

  // ==============================================================
  // Helper: create a single canvas texture for the checkerboard floor
  // ==============================================================
  _createFloorTexture(cols, rows) {
    const px = 8; // pixel size per checker tile
    const w = cols * px;
    const h = rows * px;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const light = '#2a2a4e';
    const dark = '#1a1a3a';
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? light : dark;
        ctx.fillRect(x * px, y * px, px, px);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    return tex;
  }

  _toTile(px) { return px / this.tileSize; }

  // ==============================================================
  // Build floor — single plane with canvas texture (1 draw call!)
  // ==============================================================
  _buildFloor() {
    this.clearGroup(this.floorGroup);
    const mesh = new THREE.Mesh(this._geo.plane1, this._floorMat);
    mesh.scale.set(this.cols, this.rows, 1);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(this.cols / 2, -0.02, this.rows / 2);
    this.floorGroup.add(mesh);

    // Border ring (once)
    const borderMat = new THREE.MeshBasicMaterial({
      color: 0x4444aa, transparent: true, opacity: 0.3, side: THREE.DoubleSide
    });
    const border = new THREE.Mesh(this._geo.ringGeo, borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.set(this.cols / 2, -0.01, this.rows / 2);
    this.floorGroup.add(border);
  }

  // ==============================================================
  // Build map — shared BoxGeometry with translated positions
  // ==============================================================
  _buildMap(map) {
    this.clearGroup(this.wallGroup);
    this.clearGroup(this.softBlockGroup);
    this.softBlockMeshes = {};
    if (!map) return;

    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        const cell = map[y][x];
        const px = x + 0.5;
        const pz = y + 0.5;

        if (cell === 'wall') {
          // Wall body (taller box, no shadow)
          const body = new THREE.Mesh(this._geo.box1, this.materials.wall);
          body.scale.set(1, 0.7, 1);
          body.position.set(px, 0.35, pz);
          this.wallGroup.add(body);
          // Wall cap
          const cap = new THREE.Mesh(this._geo.box1, this.materials.wallCap);
          cap.scale.set(0.9, 0.1, 0.9);
          cap.position.set(px, 0.75, pz);
          this.wallGroup.add(cap);
        } else if (cell === 'soft') {
          // Soft block body (no shadow)
          const body = new THREE.Mesh(this._geo.box1, this.materials.soft);
          body.scale.set(0.9, 0.5, 0.9);
          body.position.set(px, 0.25, pz);
          this.softBlockGroup.add(body);
          const cap = new THREE.Mesh(this._geo.box1, this.materials.softCap);
          cap.scale.set(0.8, 0.1, 0.8);
          cap.position.set(px, 0.55, pz);
          this.softBlockGroup.add(cap);
          this.softBlockMeshes[`${x},${y}`] = body;
        }
      }
    }
  }

  _rebuildSoftBlocks(map) {
    this.clearGroup(this.softBlockGroup);
    this.softBlockMeshes = {};
    if (!map) return;
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        if (map[y][x] === 'soft') {
          const px = x + 0.5;
          const pz = y + 0.5;
          const body = new THREE.Mesh(this._geo.box1, this.materials.soft);
          body.scale.set(0.9, 0.5, 0.9);
          body.position.set(px, 0.25, pz);
          this.softBlockGroup.add(body);
          const cap = new THREE.Mesh(this._geo.box1, this.materials.softCap);
          cap.scale.set(0.8, 0.1, 0.8);
          cap.position.set(px, 0.55, pz);
          this.softBlockGroup.add(cap);
          this.softBlockMeshes[`${x},${y}`] = body;
        }
      }
    }
  }

  // ==============================================================
  // Powerups
  // ==============================================================
  _updatePowerups(powerups) {
    this.clearGroup(this.powerupGroup);
    this.powerupMeshes = {};
    if (!powerups) return;

    for (const key in powerups) {
      const pu = powerups[key];
      const colorMap = { fire: 0xff6600, bomb: 0x44aaff, speed: 0x33ff77, fullfire: 0xffaa00, kick: 0xaa44ff, skip: 0xff55ff };
      const color = colorMap[pu.type] || 0xffffff;
      const group = new THREE.Group();

      const plat = new THREE.Mesh(this._geo.cylinderPlatform,
        new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
      plat.position.y = 0.35;
      group.add(plat);

      const icon = new THREE.Mesh(this._geo.sphere01,
        new THREE.MeshBasicMaterial({ color: 0xffffff }));
      icon.position.y = 0.42;
      group.add(icon);

      group.position.set(pu.x + 0.5, 0, pu.y + 0.5);
      group.userData = { floatOffset: Math.random() * Math.PI * 2 };
      this.powerupGroup.add(group);
      this.powerupMeshes[key] = group;
    }
  }

  // ==============================================================
  // Bombs
  // ==============================================================
  _updateBombs(bombs) {
    this.clearGroup(this.bombGroup);
    this.bombMeshes = {};
    if (!bombs) return;

    for (const bid in bombs) {
      const bomb = bombs[bid];
      const tx = this._toTile(bomb.x);
      const tz = this._toTile(bomb.y);
      const group = new THREE.Group();

      const mesh = new THREE.Mesh(this._geo.sphere022, this.materials.bomb);
      mesh.position.y = 0.15;
      group.add(mesh);

      const glow = new THREE.Mesh(this._geo.sphere03, this.materials.bombGlow);
      glow.position.y = 0.15;
      group.add(glow);

      const spark = new THREE.Mesh(this._geo.sphere004, this.materials.bombSpark);
      spark.position.set(0, 0.28, 0);
      group.add(spark);

      group.position.set(tx, 0, tz);
      group.userData = { bomb };
      this.bombGroup.add(group);
      this.bombMeshes[bid] = group;
    }
  }

  // ==============================================================
  // Explosions — reuse meshes from pool instead of allocate each frame
  // ==============================================================
  _updateExplosions(explosions) {
    // Return all meshes to pool
    for (let i = 0; i < this.explosionGroup.children.length; i++) {
      this._explosionMeshes.push(this.explosionGroup.children[i]);
    }
    this.explosionGroup.clear();
    if (!explosions) return;

    const now = Date.now();
    for (const exp of explosions) {
      const elapsed = now - exp.startTime;
      const progress = Math.min(1, elapsed / exp.duration);
      if (progress >= 1) continue;

      for (const cell of exp.cells) {
        const cx = cell.x + 0.5;
        const cz = cell.y + 0.5;
        const isCenter = cell.x === exp.cells[0].x && cell.y === exp.cells[0].y;
        const radius = isCenter ? 0.55 : 0.4;
        const opacity = 1 - progress;

        // Try to reuse from pool, else create new
        const core = this._pooledMesh(this._explosionMeshes, this._geo.box1,
          this.materials.explosionCore.clone());
        core.scale.set(radius * 2, 0.3 + progress * 0.15, radius * 2);
        core.material.opacity = opacity * 0.95;
        core.position.set(cx, 0.15 + progress * 0.1, cz);
        this.explosionGroup.add(core);

        const mid = this._pooledMesh(this._explosionMeshes, this._geo.box1,
          this.materials.explosionInner.clone());
        mid.scale.set(radius * 2.6, 0.2, radius * 2.6);
        mid.material.opacity = opacity * 0.7;
        mid.position.set(cx, 0.08, cz);
        this.explosionGroup.add(mid);

        const outer = this._pooledMesh(this._explosionMeshes, this._geo.box1,
          this.materials.explosionOuter.clone());
        outer.scale.set(radius * 3.2, 0.08, radius * 3.2);
        outer.material.opacity = opacity * 0.5;
        outer.position.set(cx, 0.04, cz);
        this.explosionGroup.add(outer);
      }
    }
  }

  _pooledMesh(pool, geo, mat) {
    if (pool.length > 0) {
      const m = pool.pop();
      m.material = mat;
      m.geometry = geo;
      m.visible = true;
      return m;
    }
    return new THREE.Mesh(geo, mat);
  }

  // ==============================================================
  // Players
  // ==============================================================
  _updatePlayers(players) {
    for (const pid in this.playerMeshes) {
      if (!players || !players[pid]) {
        this.playerGroup.remove(this.playerMeshes[pid].group);
        this.nameLabelGroup.remove(this.nameLabels[pid]);
        if (this.playerMeshes[pid].labelTex) this.playerMeshes[pid].labelTex.dispose();
        delete this.playerMeshes[pid];
        delete this.nameLabels[pid];
      }
    }
    if (!players) return;

    for (const pid in players) {
      const p = players[pid];
      const cIdx = p.color !== undefined ? p.color % this.playerColors.length : 0;
      const pc = this.playerColors[cIdx];
      const tx = this._toTile(p.x);
      const tz = this._toTile(p.y);

      if (!this.playerMeshes[pid]) {
        const group = new THREE.Group();

        const bodyMat = new THREE.MeshStandardMaterial({
          color: pc.body, roughness: 0.4, metalness: 0.1,
          emissive: pc.body, emissiveIntensity: 0.05
        });
        const body = new THREE.Mesh(this._geo.cylinder03, bodyMat);
        body.position.y = 0.17;
        body.castShadow = true;
        body.receiveShadow = true;
        group.add(body);

        const headMat = new THREE.MeshStandardMaterial({
          color: 0xffddaa, roughness: 0.3, metalness: 0.0
        });
        const head = new THREE.Mesh(this._geo.sphere024, headMat);
        head.position.y = 0.5;
        head.castShadow = true;
        group.add(head);

        const bandMat = new THREE.MeshStandardMaterial({
          color: pc.body, roughness: 0.2, metalness: 0.1,
          emissive: pc.body, emissiveIntensity: 0.15
        });
        const band = new THREE.Mesh(this._geo.torus026, bandMat);
        band.position.y = 0.42;
        band.rotation.x = Math.PI / 2;
        group.add(band);

        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const lEye = new THREE.Mesh(this._geo.sphere004eye, eyeMat);
        lEye.position.set(0.08, 0.5, 0.2);
        group.add(lEye);
        const rEye = new THREE.Mesh(this._geo.sphere004eye, eyeMat);
        rEye.position.set(-0.08, 0.5, 0.2);
        group.add(rEye);

        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const lPupil = new THREE.Mesh(this._geo.sphere0025, pupilMat);
        lPupil.position.set(0.08, 0.5, 0.24);
        group.add(lPupil);
        const rPupil = new THREE.Mesh(this._geo.sphere0025, pupilMat);
        rPupil.position.set(-0.08, 0.5, 0.24);
        group.add(rPupil);

        this.playerMeshes[pid] = { group, body, head };
        this.playerGroup.add(group);

        // Name label (canvas sprite)
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 48;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(0, 0, 256, 48);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.name || 'Player', 128, 26);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        this.playerMeshes[pid].labelTex = tex;
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
        );
        sprite.scale.set(1.2, 0.25, 1);
        this.nameLabels[pid] = sprite;
        this.nameLabelGroup.add(sprite);
      }

      const m = this.playerMeshes[pid];
      m.group.position.set(tx, 0, tz);

      const dirIdx = p.dir !== undefined ? p.dir : 0;
      m.group.rotation.y = this._dirRotations[dirIdx] || 0;

      if (!p.alive) {
        m.group.visible = false;
        if (this.nameLabels[pid]) this.nameLabels[pid].visible = false;
        continue;
      }
      m.group.visible = true;
      if (this.nameLabels[pid]) this.nameLabels[pid].visible = true;

      if (p.invincibleUntil > Date.now()) {
        m.group.visible = Math.sin(this.time * 20) > 0;
      }

      if (this.nameLabels[pid]) {
        this.nameLabels[pid].position.set(tx, 0.95, tz);
      }
    }
  }

  // ==============================================================
  // Main render
  // ==============================================================
  render(state, dt) {
    if (!this.renderer) return;
    if (!state) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    this.time += dt;

    // Build map ONCE
    if (!this._mapBuilt && state.map) {
      this._buildFloor();
      this._buildMap(state.map);
      this._mapHash = JSON.stringify(state.map);
      this._mapBuilt = true;
    }

    // Soft block changes
    if (state.map) {
      const hash = JSON.stringify(state.map);
      if (hash !== this._mapHash) {
        this._rebuildSoftBlocks(state.map);
        this._mapHash = hash;
      }
    }

    // Update dynamic objects
    this._updatePowerups(state.powerups);
    for (const key in this.powerupMeshes) {
      const g = this.powerupMeshes[key];
      g.position.y = Math.sin(this.time * 1.5 + g.userData.floatOffset) * 0.08 + 0.08;
      g.rotation.y += dt * 0.8;
    }

    this._updateBombs(state.bombs);
    for (const bid in this.bombMeshes) {
      const g = this.bombMeshes[bid];
      const pulse = 1 + Math.sin(this.time * 5) * 0.04;
      g.scale.set(pulse, pulse, pulse);
    }

    this._updateExplosions(state.explosions);

    this._updatePlayers(state.players);
    for (const pid in this.playerMeshes) {
      const m = this.playerMeshes[pid];
      if (m.group.visible) {
        m.group.position.y = Math.sin(this.time * 5) * 0.015;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  resize(cols, rows, tileSize) {
    this.cols = cols || 15;
    this.rows = rows || 13;
    this.tileSize = tileSize || 48;

    const cx = this.cols / 2;
    const cz = this.rows / 2;
    const maxDim = Math.max(this.cols, this.rows);
    const dist = maxDim * 0.9 + 4;

    this.camera.position.set(cx + dist * 0.5, dist * 0.55, cz + dist * 0.5);
    this.camera.lookAt(cx, 0, cz);
  }

  clearGroup(group) {
    while (group.children.length > 0) {
      const c = group.children[0];
      if (c.geometry && c.geometry !== this._geo.box1 && c.geometry !== this._geo.plane1) c.geometry.dispose();
      if (c.material) c.material.dispose();
      group.remove(c);
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
