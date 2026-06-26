// ============================================================
// renderer.js - Three.js 3D Rendering Engine
// Bomberman Saturn Fight!! Style
// ============================================================

class Renderer {
  constructor(container) {
    this.container = container;
    this.cols = 15;
    this.rows = 13;
    this.tileSize = 48; // Server pixel coords → divide by this
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

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost');
    });

    // --- Lighting (bright & colorful like Saturn) ---
    const ambient = new THREE.AmbientLight(0x6666aa, 0.7);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x88aaff, 0x443366, 0.6);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffeedd, 2.0);
    sun.position.set(8, 20, 6);
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

    const rim = new THREE.DirectionalLight(0x8888ff, 0.3);
    rim.position.set(-5, 8, -8);
    this.scene.add(rim);

    // --- Fog ---
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

    // --- Materials ---
    this.materials = {
      floorLight: new THREE.MeshStandardMaterial({ color: 0x2a2a4e, roughness: 0.7, metalness: 0.1 }),
      floorDark: new THREE.MeshStandardMaterial({ color: 0x1a1a3a, roughness: 0.8, metalness: 0.0 }),
      wall: new THREE.MeshStandardMaterial({ color: 0x5555aa, roughness: 0.4, metalness: 0.2 }),
      wallCap: new THREE.MeshStandardMaterial({ color: 0x6666cc, roughness: 0.3, metalness: 0.3 }),
      soft: new THREE.MeshStandardMaterial({ color: 0xcc8844, roughness: 0.7, metalness: 0.0 }),
      softCap: new THREE.MeshStandardMaterial({ color: 0xdd9955, roughness: 0.6, metalness: 0.0 }),
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

    // --- Resize ---
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
    this.explosionMeshes = [];
    this.playerMeshes = {};
    this.nameLabels = {};
  }

  // --- Convert server pixel coords to tile coords ---
  _toTile(px) { return px / this.tileSize; }

  // --- Build floor ---
  _buildFloor() {
    this.clearGroup(this.floorGroup);
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const mat = (x + y) % 2 === 0 ? this.materials.floorLight : this.materials.floorDark;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(x + 0.5, -0.02, y + 0.5);
        mesh.receiveShadow = true;
        this.floorGroup.add(mesh);
      }
    }
    // Border glow ring
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x4444aa, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const border = new THREE.Mesh(new THREE.RingGeometry(7.5, 8, 32), borderMat);
    border.rotation.x = -Math.PI / 2;
    border.position.set(this.cols / 2, -0.01, this.rows / 2);
    this.floorGroup.add(border);
  }

  // --- Build map ---
  _buildMap(map) {
    this.clearGroup(this.wallGroup);
    this.clearGroup(this.softBlockGroup);
    this.softBlockMeshes = {};
    if (!map) return;

    const wallBody = new THREE.BoxGeometry(1, 0.7, 1);
    wallBody.translate(0, 0.35, 0);
    const wallCap = new THREE.BoxGeometry(0.9, 0.1, 0.9);
    wallCap.translate(0, 0.75, 0);

    const softBody = new THREE.BoxGeometry(0.9, 0.5, 0.9);
    softBody.translate(0, 0.25, 0);
    const softCap = new THREE.BoxGeometry(0.8, 0.1, 0.8);
    softCap.translate(0, 0.55, 0);

    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        const cell = map[y][x];
        const px = x + 0.5;
        const pz = y + 0.5;

        if (cell === 'wall') {
          const body = new THREE.Mesh(wallBody, this.materials.wall);
          body.position.set(px, 0, pz);
          body.castShadow = true;
          body.receiveShadow = true;
          this.wallGroup.add(body);
          const cap = new THREE.Mesh(wallCap, this.materials.wallCap);
          cap.position.set(px, 0, pz);
          cap.castShadow = true;
          this.wallGroup.add(cap);
        } else if (cell === 'soft') {
          const body = new THREE.Mesh(softBody, this.materials.soft);
          body.position.set(px, 0, pz);
          body.castShadow = true;
          body.receiveShadow = true;
          this.softBlockGroup.add(body);
          const cap = new THREE.Mesh(softCap, this.materials.softCap);
          cap.position.set(px, 0, pz);
          cap.castShadow = true;
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
    const softBody = new THREE.BoxGeometry(0.9, 0.5, 0.9);
    softBody.translate(0, 0.25, 0);
    const softCap = new THREE.BoxGeometry(0.8, 0.1, 0.8);
    softCap.translate(0, 0.55, 0);
    for (let y = 0; y < map.length; y++) {
      for (let x = 0; x < map[y].length; x++) {
        if (map[y][x] === 'soft') {
          const px = x + 0.5;
          const pz = y + 0.5;
          const body = new THREE.Mesh(softBody, this.materials.soft);
          body.position.set(px, 0, pz);
          body.castShadow = true;
          body.receiveShadow = true;
          this.softBlockGroup.add(body);
          const cap = new THREE.Mesh(softCap, this.materials.softCap);
          cap.position.set(px, 0, pz);
          cap.castShadow = true;
          this.softBlockGroup.add(cap);
          this.softBlockMeshes[`${x},${y}`] = body;
        }
      }
    }
  }

  // --- Powerups ---
  _updatePowerups(powerups) {
    this.clearGroup(this.powerupGroup);
    this.powerupMeshes = {};
    if (!powerups) return;

    const iconColors = {
      'fire': 0xff6600, 'bomb': 0x44aaff, 'speed': 0x33ff77,
      'fullfire': 0xffaa00, 'kick': 0xaa44ff, 'skip': 0xff55ff
    };
    const iconSymbols = {
      'fire': 'F', 'bomb': 'B', 'speed': 'S',
      'fullfire': '★', 'kick': 'K', 'skip': '✈'
    };

    for (const key in powerups) {
      const pu = powerups[key];
      const color = iconColors[pu.type] || 0xffffff;
      const group = new THREE.Group();

      // Floating platform
      const plat = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.25, 0.05, 6),
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 })
      );
      plat.position.y = 0.35;
      group.add(plat);

      // Icon sphere
      const icon = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      icon.position.y = 0.42;
      group.add(icon);

      group.position.set(pu.x + 0.5, 0, pu.y + 0.5);
      group.userData = { floatOffset: Math.random() * Math.PI * 2 };
      this.powerupGroup.add(group);
      this.powerupMeshes[key] = group;
    }
  }

  // --- Bombs (positions in PIXEL coords → divide by tileSize) ---
  _updateBombs(bombs) {
    this.clearGroup(this.bombGroup);
    this.bombMeshes = {};
    if (!bombs) return;

    for (const bid in bombs) {
      const bomb = bombs[bid];
      const tx = this._toTile(bomb.x);
      const tz = this._toTile(bomb.y);
      const group = new THREE.Group();

      // Main sphere
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        this.materials.bomb
      );
      mesh.position.y = 0.15;
      mesh.castShadow = true;
      group.add(mesh);

      // Glow
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 5, 5),
        this.materials.bombGlow
      );
      glow.position.y = 0.15;
      group.add(glow);

      // Fuse spark
      const spark = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 4, 4),
        this.materials.bombSpark
      );
      spark.position.set(0, 0.28, 0);
      group.add(spark);

      group.position.set(tx, 0, tz);
      group.userData = { bomb };
      this.bombGroup.add(group);
      this.bombMeshes[bid] = group;
    }
  }

  // --- Explosions ---
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
        const cx = cell.x + 0.5;
        const cz = cell.y + 0.5;
        const isCenter = cell.x === exp.cells[0].x && cell.y === exp.cells[0].y;
        const radius = isCenter ? 0.55 : 0.4;

        // Core
        const core = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, 0.3 + progress * 0.15, 8),
          this.materials.explosionCore.clone()
        );
        core.material.opacity = (1 - progress) * 0.95;
        core.position.set(cx, 0.15 + progress * 0.1, cz);

        // Mid
        const mid = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 1.3, radius * 1.3, 0.2, 8),
          this.materials.explosionInner.clone()
        );
        mid.material.opacity = (1 - progress) * 0.7;
        mid.position.set(cx, 0.08, cz);

        // Outer
        const outer = new THREE.Mesh(
          new THREE.CylinderGeometry(radius * 1.6, radius * 1.6, 0.08, 8),
          this.materials.explosionOuter.clone()
        );
        outer.material.opacity = (1 - progress) * 0.5;
        outer.position.set(cx, 0.04, cz);

        this.explosionGroup.add(core);
        this.explosionGroup.add(mid);
        this.explosionGroup.add(outer);
      }
    }
  }

  // --- Players (positions in PIXEL coords → divide by tileSize) ---
  _updatePlayers(players) {
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
      const p = players[pid];
      const cIdx = p.color !== undefined ? p.color % this.playerColors.length : 0;
      const pc = this.playerColors[cIdx];

      // Convert pixel → tile coordinates
      const tx = this._toTile(p.x);
      const tz = this._toTile(p.y);

      if (!this.playerMeshes[pid]) {
        const group = new THREE.Group();

        // --- Chibi body (big head, small body like Saturn Bomberman) ---
        // Feet/body cylinder
        const bodyMat = new THREE.MeshStandardMaterial({
          color: pc.body, roughness: 0.4, metalness: 0.1,
          emissive: pc.body, emissiveIntensity: 0.05
        });
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.35, 6), bodyMat);
        body.position.y = 0.17;
        body.castShadow = true;
        group.add(body);

        // Big head (chibi style)
        const headMat = new THREE.MeshStandardMaterial({
          color: 0xffddaa, roughness: 0.3, metalness: 0.0
        });
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 6), headMat);
        head.position.y = 0.5;
        head.castShadow = true;
        group.add(head);

        // Headband
        const bandMat = new THREE.MeshStandardMaterial({
          color: pc.body, roughness: 0.2, metalness: 0.1,
          emissive: pc.body, emissiveIntensity: 0.15
        });
        const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.055, 4, 8), bandMat);
        band.position.y = 0.42;
        band.rotation.x = Math.PI / 2;
        group.add(band);

        // Eyes (two small white spheres)
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const eyeGeo = new THREE.SphereGeometry(0.04, 6, 6);
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(0.08, 0.5, 0.2);
        group.add(leftEye);
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(-0.08, 0.5, 0.2);
        group.add(rightEye);

        // Pupils
        const pupilMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
        const pupilGeo = new THREE.SphereGeometry(0.025, 4, 4);
        const lPupil = new THREE.Mesh(pupilGeo, pupilMat);
        lPupil.position.set(0.08, 0.5, 0.24);
        group.add(lPupil);
        const rPupil = new THREE.Mesh(pupilGeo, pupilMat);
        rPupil.position.set(-0.08, 0.5, 0.24);
        group.add(rPupil);

        this.playerMeshes[pid] = { group, body, head };
        this.playerGroup.add(group);

        // Name label
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
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })
        );
        sprite.scale.set(1.2, 0.25, 1);
        this.nameLabels[pid] = sprite;
        this.nameLabelGroup.add(sprite);
      }

      const mesh = this.playerMeshes[pid];
      // Set in TILE coordinates (p.x/p.y are pixels, divide by tileSize)
      mesh.group.position.set(tx, 0, tz);

      // Direction (0=down, 1=left, 2=right, 3=up)
      const dirIdx = p.dir !== undefined ? p.dir : 0;
      mesh.group.rotation.y = this._dirRotations[dirIdx] || 0;

      if (!p.alive) {
        mesh.group.visible = false;
        if (this.nameLabels[pid]) this.nameLabels[pid].visible = false;
        continue;
      }
      mesh.group.visible = true;
      if (this.nameLabels[pid]) this.nameLabels[pid].visible = true;

      // Invincibility flash
      if (p.invincibleUntil > Date.now()) {
        const flash = Math.sin(this.time * 20) > 0;
        mesh.group.visible = flash;
      }

      // Name label
      if (this.nameLabels[pid]) {
        this.nameLabels[pid].position.set(tx, 0.95, tz);
      }
    }
  }

  // --- Main render ---
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
      if (c.geometry) c.geometry.dispose();
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
