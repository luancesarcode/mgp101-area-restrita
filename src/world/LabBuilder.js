import * as THREE from 'three';

// ==== LABBUILDER ============================================================
// Constrói o laboratório e preenche: colliders (Box3), blindagens,
// esconderijos e containers interativos (armários com porta, gavetas).
export class LabBuilder {
  constructor(scene, shielding) {
    this.scene = scene;
    this.shielding = shielding;
    this.colliders = [];
    this.hidingSpots = [];
    this.containers = [];
    // objetos soltos manipuláveis com F (caixas das estantes, teclados...)
    this.props = [];
    this._propIgnore = [];   // volumes cheios que a física dos soltos ignora
    this._propSurfaces = []; // superfícies reais (tábuas) onde podem pousar

    this.mats = {
      wall: new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.92 }),
      wallAccent: new THREE.MeshStandardMaterial({ color: 0x3f5f7a, roughness: 0.85 }),
      floor: new THREE.MeshStandardMaterial({ map: this._floorTexture(), roughness: 0.6, metalness: 0.05 }),
      ceiling: new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.95, emissive: 0x565c66 }),
      metal: new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.45, metalness: 0.6 }),
      tableTop: new THREE.MeshStandardMaterial({ color: 0xf1f3f5, roughness: 0.5 }),
      cabinet: new THREE.MeshStandardMaterial({ color: 0x5e7a94, roughness: 0.55, metalness: 0.3 }),
      cabinetDoor: new THREE.MeshStandardMaterial({ color: 0x69859e, roughness: 0.5, metalness: 0.3 }),
      cabinetIn: new THREE.MeshStandardMaterial({ color: 0x394654, roughness: 0.8 }),
      shelf: new THREE.MeshStandardMaterial({ color: 0xb7bec7, roughness: 0.6, metalness: 0.4 }),
      barrelY: new THREE.MeshStandardMaterial({ color: 0xd9b23a, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }),
      barrelB: new THREE.MeshStandardMaterial({ color: 0x33608a, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }),
      crate: new THREE.MeshStandardMaterial({ map: this._woodTexture(), color: 0xb08d5f, roughness: 0.85 }),
      crateEdge: new THREE.MeshStandardMaterial({ color: 0x7a5c38, roughness: 0.8 }),
      crateLid: new THREE.MeshStandardMaterial({ map: this._woodTexture(), color: 0x8a6844, roughness: 0.8 }),
      caseBody: new THREE.MeshStandardMaterial({ color: 0xb03a2e, roughness: 0.5, metalness: 0.2 }),
      caseLid: new THREE.MeshStandardMaterial({ color: 0x8f2e24, roughness: 0.5, metalness: 0.2 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6 }),
      screen: new THREE.MeshStandardMaterial({ color: 0x0c1522, emissive: 0x1c4a6e, emissiveIntensity: 1.4, roughness: 0.3 }),
      lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 1.1 }),
      labWhite: new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.42, metalness: 0.08 }),
      labBlue: new THREE.MeshStandardMaterial({ color: 0x2b78a6, roughness: 0.42, metalness: 0.12 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0x171b20, roughness: 0.9 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xc9eff7, roughness: 0.12, transmission: 0.45, transparent: true, opacity: 0.62, thickness: 0.025 }),
      liquidBlue: new THREE.MeshStandardMaterial({ color: 0x31a8c8, roughness: 0.24, transparent: true, opacity: 0.78 }),
      liquidAmber: new THREE.MeshStandardMaterial({ color: 0xc47a20, roughness: 0.3, transparent: true, opacity: 0.8 }),
      warning: new THREE.MeshStandardMaterial({ color: 0xe6bd35, roughness: 0.55 }),
    };
    this._boxGeo = new THREE.BoxGeometry(1, 1, 1);
  }

  _floorTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#b9bfc7'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#a3aab3'; g.lineWidth = 3;
    g.strokeRect(1, 1, 254, 254);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(11, 8);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Madeira lowpoly: tábuas verticais em tons chapados, emendas escuras,
  // veios retos discretos e pregos nas pontas — sem ruído fotográfico.
  // O canvas é em escala de cinza; o `color` do material dá o tom, então a
  // mesma textura serve para a caixa e para a tampa com tintas diferentes.
  _woodTexture() {
    if (this._woodTex) return this._woodTex;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const planks = 4, w = 256 / planks;
    const tones = [238, 255, 224, 246]; // brilho de cada tábua (flat shading)
    for (let i = 0; i < planks; i++) {
      const t = tones[i];
      g.fillStyle = `rgb(${t},${t},${t})`;
      g.fillRect(i * w, 0, w, 256);
      // veios: linhas retas verticais, quase imperceptíveis
      g.fillStyle = 'rgba(0,0,0,0.06)';
      g.fillRect(i * w + 14, 0, 3, 256);
      g.fillRect(i * w + 34, 0, 2, 256);
      g.fillRect(i * w + 50, 0, 3, 256);
      // emenda entre tábuas
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(i * w, 0, 3, 256);
      // pregos no topo e na base de cada tábua
      g.fillStyle = 'rgba(0,0,0,0.45)';
      for (const ny of [14, 242]) {
        g.beginPath();
        g.arc(i * w + w / 2 + 1, ny, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    // dois nós chapados (elipses), um claro e um escuro, fora do centro
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(102, 168, 9, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath(); g.ellipse(214, 74, 7, 10, 0, 0, Math.PI * 2); g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this._woodTex = tex;
    return tex;
  }

  // Box com sombra; opcionalmente collider e entrada de blindagem
  _box(w, h, d, x, y, z, mat, { collide = true, shadow = true, shield = 0 } = {}) {
    const mesh = new THREE.Mesh(this._boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    const box = new THREE.Box3(
      new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
      new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2)
    );
    if (collide) this.colliders.push(box);
    if (shield > 0) this.shielding.add(box, shield);
    return mesh;
  }

  // mesh local (sem collider) para compor grupos
  _part(parent, w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(this._boxGeo, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  _spot(name, x, y, z, container = null) {
    this.hidingSpots.push({ name, position: new THREE.Vector3(x, y, z), container });
  }

  build() {
    const W = 22, D = 16, H = 3.1;

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), this.mats.ceiling);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H;
    this.scene.add(ceil);
    // teto com física: laje colisora logo acima do plano visível — objetos
    // arremessados/empurrados para cima quicam de volta e nunca sobem além
    // de 3.1 m (o que também impede pousarem no topo das paredes)
    const ceilBox = new THREE.Box3(
      new THREE.Vector3(-W / 2, H, -D / 2),
      new THREE.Vector3(W / 2, H + 0.3, D / 2)
    );
    ceilBox.hideOnMap = true; // cobriria o minimapa inteiro
    this.colliders.push(ceilBox);
    for (const [px, pz] of [[-6, -3], [6, -3], [-6, 3], [6, 3], [0, 0]]) {
      this._box(2.4, 0.06, 1.2, px, H - 0.04, pz, this.mats.lightPanel, { collide: false, shadow: false });
    }

    // paredes blindam quase tudo
    this._box(W, H, 0.3, 0, H / 2, -D / 2, this.mats.wall, { shield: 0.05 });
    // A parede sul é segmentada ao redor da porta. Nas fases normais o colisor
    // próprio da folha mantém exatamente o bloqueio anterior; na evacuação ele
    // é desativado conforme a porta abre, criando uma passagem real.
    const doorX = 0.5, doorW = 1.1, doorH = 2.2;
    const leftW = doorX - doorW / 2 + W / 2;
    const rightW = W / 2 - (doorX + doorW / 2);
    this._box(leftW, H, 0.3, -W / 2 + leftW / 2, H / 2, D / 2, this.mats.wall, { shield: 0.05 });
    this._box(rightW, H, 0.3, doorX + doorW / 2 + rightW / 2, H / 2, D / 2, this.mats.wall, { shield: 0.05 });
    this._box(doorW, H - doorH, 0.3, doorX, doorH + (H - doorH) / 2, D / 2, this.mats.wall, { shield: 0.05 });
    this._box(0.3, H, D, -W / 2, H / 2, 0, this.mats.wall, { shield: 0.05 });
    this._box(0.3, H, D, W / 2, H / 2, 0, this.mats.wall, { shield: 0.05 });
    for (const [x, z, w, d] of [[0, -D / 2 + 0.18, W, 0.06], [-W / 2 + 0.18, 0, 0.06, D], [W / 2 - 0.18, 0, 0.06, D]]) {
      this._box(w, 0.9, d, x, 0.45, z, this.mats.wallAccent, { collide: false });
    }
    this._box(leftW, 0.9, 0.06, -W / 2 + leftW / 2, 0.45, D / 2 - 0.18, this.mats.wallAccent, { collide: false });
    this._box(rightW, 0.9, 0.06, doorX + doorW / 2 + rightW / 2, 0.45, D / 2 - 0.18, this.mats.wallAccent, { collide: false });

    // divisória parcial: blindagem importante no meio da sala
    this._box(0.25, H, 6.5, 1.5, H / 2, -D / 2 + 3.25, this.mats.wall, { shield: 0.05 });

    this._buildBenches();
    this._buildScientificEquipment();
    this._buildCabinets();
    this._buildShelves();
    this._buildBarrels();
    this._buildCrates();
    this._buildBucket();
    this._buildDoor();

    return {
      colliders: this.colliders,
      hidingSpots: this.hidingSpots,
      containers: this.containers,
      props: this.props,
      propIgnore: this._propIgnore,
      propSurfaces: this._propSurfaces,
      bucket: this.bucket,
      exitDoor: this.exitDoor,
      mats: this.mats,
    };
  }

  _buildBenches() {
    const benches = [
      { name: 'bancada noroeste', x: -8.5, z: -6.6, w: 5, d: 1.4, dir: 1 },
      { name: 'bancada nordeste', x: 8.2, z: -6.6, w: 4.4, d: 1.4, dir: 1 },
      { name: 'bancada oeste', x: -9.9, z: 2.0, w: 1.4, d: 5, dir: 0, legsOnly: true }, // vertical, sem gavetas
      { name: 'bancada sul', x: 6.5, z: 6.9, w: 6, d: 1.4, dir: -1 },
    ];
    for (const b of benches) {
      // tampo + collider do vão inteiro (simplificado)
      this._box(b.w, 0.08, b.d, b.x, 0.84, b.z, this.mats.tableTop, { collide: false, shield: 0.85 });
      this.colliders.push(new THREE.Box3(
        new THREE.Vector3(b.x - b.w / 2, 0, b.z - b.d / 2),
        new THREE.Vector3(b.x + b.w / 2, 0.88, b.z + b.d / 2)
      ));
      if (b.legsOnly) {
        // mesa simples: tampo + pernas, sem gabinete nem gavetas. Cantos +
        // pernas no meio do(s) lado(s) longo(s) para não deixar vão sem apoio.
        const insx = b.w / 2 - 0.12, insz = b.d / 2 - 0.12;
        const legs = [[-insx, -insz], [insx, -insz], [-insx, insz], [insx, insz]];
        if (b.w > 2.6) legs.push([0, -insz], [0, insz]); // lado longo no eixo X
        if (b.d > 2.6) legs.push([-insx, 0], [insx, 0]);  // lado longo no eixo Z
        for (const [ox, oz] of legs) {
          this._box(0.08, 0.8, 0.08, b.x + ox, 0.4, b.z + oz, this.mats.metal, { collide: false });
        }
      } else if (b.dir !== 0) {
        // gabinete com 4 gavetas na metade esquerda + pernas na direita
        const cx = b.x - b.w * 0.25, cw = b.w * 0.46, cd = b.d - 0.3;
        this._box(cw, 0.76, cd, cx, 0.4, b.z, this.mats.metal, { collide: false, shield: 0.55 });
        const frontZ = b.z + b.dir * (cd / 2);
        // Grade 2×2 com respiro largo e moldura escura: as quatro frentes
        // continuam grandes, mas agora cada gaveta é lida como peça separada.
        for (const [rowName, y] of [['superior', 0.61], ['inferior', 0.25]]) {
          for (const [colName, side] of [['esquerda', -1], ['direita', 1]]) {
            this._buildDrawer(`gaveta ${rowName} ${colName} da ${b.name}`,
              cx + b.dir * side * 0.34, y, frontZ - b.dir * 0.03, b.dir);
          }
        }
        for (const [lx, lz] of [
          [b.x + b.w / 2 - 0.12, b.z - b.d / 2 + 0.12], [b.x + b.w / 2 - 0.12, b.z + b.d / 2 - 0.12],
          [b.x + 0.1, b.z - b.d / 2 + 0.12], [b.x + 0.1, b.z + b.d / 2 - 0.12],
        ]) this._box(0.08, 0.8, 0.08, lx, 0.4, lz, this.mats.metal, { collide: false });
      } else {
        // bancada vertical: gabinete na metade sul + pernas ao norte
        const cz = b.z - b.d * 0.25;
        this._box(b.w - 0.3, 0.76, b.d * 0.46, b.x, 0.4, cz, this.mats.metal, { collide: false, shield: 0.55 });
        for (const [lx, lz] of [
          [b.x - b.w / 2 + 0.12, b.z + b.d / 2 - 0.12], [b.x + b.w / 2 - 0.12, b.z + b.d / 2 - 0.12],
          [b.x - b.w / 2 + 0.12, b.z + 0.1], [b.x + b.w / 2 - 0.12, b.z + 0.1],
        ]) this._box(0.08, 0.8, 0.08, lx, 0.4, lz, this.mats.metal, { collide: false });
      }
    }

    // monitores completos (a bancada oeste recebe instrumentação científica)
    this._buildMonitor(-7.4, 0.88, -6.7, 0);
    this._buildMonitor(9.1, 0.88, -6.7, 0);
    this._buildMonitor(7.6, 0.88, 7.0, Math.PI);

    // maletas de amostras (abrem com F)
    this._buildCase('maleta da bancada oeste', -9.9, 0.88, 3.3, Math.PI / 2);
    this._buildCase('maleta da bancada nordeste', 7.0, 0.88, -6.9, 0);

    this._spot('atrás do monitor da bancada sul', 7.6, 1.05, 7.3);
  }

  _buildMonitor(x, y, z, rotY) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    this.scene.add(g);
    this._part(g, 0.26, 0.02, 0.18, 0, 0.01, -0.02, this.mats.dark);     // base
    this._part(g, 0.05, 0.16, 0.05, 0, 0.1, -0.04, this.mats.dark);      // haste
    this._part(g, 0.54, 0.34, 0.04, 0, 0.34, 0, this.mats.dark);         // moldura
    this._part(g, 0.48, 0.28, 0.012, 0, 0.34, 0.022, this.mats.screen);  // tela
    // teclado e mouse são soltos: saem do grupo (mantendo a pose no mundo)
    // e viram objetos manipuláveis com F
    const kb = this._part(g, 0.38, 0.025, 0.14, 0, 0.013, 0.24, this.mats.dark);
    const mouse = this._part(g, 0.05, 0.018, 0.08, 0.28, 0.01, 0.24, this.mats.dark);
    g.updateMatrixWorld(true);
    this.scene.attach(kb);
    this.scene.attach(mouse);
    this.props.push(kb, mouse);
  }

  // Peça primitiva com sombras, usada pelos equipamentos compostos abaixo.
  _equipMesh(parent, geometry, material, x, y, z, rx = 0, ry = 0, rz = 0) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  // Um equipamento visual pode ter dezenas de peças, mas a física usa uma
  // caixa orientada simples e estável. Massa e dimensões seguem junto do Group
  // para o InteractionSystem aplicar gravidade, atrito, impacto e empilhamento.
  _physicsEquipment(group, label, size, mass, x, y, z, rotY = 0) {
    group.name = label;
    group.position.set(x, y, z);
    group.rotation.y = rotY;
    group.userData.physicsSize = size.clone();
    group.userData.physicsMass = mass;
    group.userData.grabLabel = `pegar ${label}`;
    this.scene.add(group);
    this.props.push(group);
    return group;
  }

  _buildScientificEquipment() {
    this._buildMicroscope(-9.15, 1.155, -6.62, 0.12);
    this._buildMagneticStirrer(-9.9, 1.13, 1.85, Math.PI / 2);
    this._buildCentrifuge(8.05, 1.04, -6.62, 0);
    this._buildAnalyticalBalance(-9.9, 1.11, 0.62, Math.PI / 2);
    this._buildOscilloscope(5.45, 1.07, 6.86, Math.PI);
  }

  _buildMicroscope(x, y, z, rotY) {
    const g = new THREE.Group();
    this._part(g, 0.4, 0.06, 0.32, 0, -0.245, 0, this.mats.rubber);
    this._part(g, 0.32, 0.025, 0.25, 0.015, -0.045, 0.01, this.mats.dark); // platina
    const column = this._part(g, 0.075, 0.4, 0.085, -0.13, -0.035, 0.06, this.mats.labWhite);
    column.rotation.z = -0.18;
    const arm = this._part(g, 0.085, 0.28, 0.09, -0.055, 0.12, 0.015, this.mats.labWhite);
    arm.rotation.z = -0.5;
    const head = this._equipMesh(g, new THREE.CylinderGeometry(0.07, 0.075, 0.14, 12), this.mats.dark, 0.015, 0.205, -0.015, 0, 0, 0.48);
    const ocular = this._equipMesh(g, new THREE.CylinderGeometry(0.035, 0.028, 0.15, 10), this.mats.rubber, -0.035, 0.29, -0.035, 0, 0, 0.62);
    const turret = this._equipMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 0.035, 12), this.mats.metal, 0.06, 0.115, -0.005);
    for (const [dx, dz] of [[-0.035, 0], [0.02, -0.03], [0.03, 0.025]]) {
      this._equipMesh(g, new THREE.CylinderGeometry(0.014, 0.02, 0.09, 8), this.mats.dark, 0.06 + dx, 0.055, -0.005 + dz);
    }
    for (const side of [-1, 1]) this._equipMesh(g, new THREE.CylinderGeometry(0.035, 0.035, 0.025, 10), this.mats.labBlue, -0.11 + side * 0.035, 0.075, 0.07, Math.PI / 2, 0, 0);
    return this._physicsEquipment(g, 'microscópio óptico', new THREE.Vector3(0.42, 0.55, 0.38), 4.5, x, y, z, rotY);
  }

  _buildMagneticStirrer(x, y, z, rotY) {
    const g = new THREE.Group();
    this._part(g, 0.36, 0.12, 0.3, 0, -0.19, 0, this.mats.labWhite);
    this._part(g, 0.31, 0.018, 0.25, 0, -0.12, -0.01, this.mats.dark); // placa aquecida
    this._equipMesh(g, new THREE.CylinderGeometry(0.018, 0.018, 0.025, 12), this.mats.labBlue, -0.105, -0.205, 0.155, Math.PI / 2);
    this._equipMesh(g, new THREE.CylinderGeometry(0.018, 0.018, 0.025, 12), this.mats.warning, 0.105, -0.205, 0.155, Math.PI / 2);
    this._equipMesh(g, new THREE.CylinderGeometry(0.055, 0.13, 0.23, 14, 1, true), this.mats.glass, 0, 0.015, -0.01);
    this._equipMesh(g, new THREE.CylinderGeometry(0.048, 0.118, 0.075, 14), this.mats.liquidBlue, 0, -0.045, -0.01);
    this._equipMesh(g, new THREE.CylinderGeometry(0.036, 0.043, 0.13, 12, 1, true), this.mats.glass, 0, 0.19, -0.01);
    return this._physicsEquipment(g, 'agitador magnético com Erlenmeyer', new THREE.Vector3(0.38, 0.5, 0.32), 2.6, x, y, z, rotY);
  }

  _buildCentrifuge(x, y, z, rotY) {
    const g = new THREE.Group();
    this._part(g, 0.48, 0.08, 0.42, 0, -0.12, 0, this.mats.rubber);
    this._equipMesh(g, new THREE.CylinderGeometry(0.205, 0.22, 0.22, 18), this.mats.labWhite, 0, 0, -0.015);
    this._equipMesh(g, new THREE.CylinderGeometry(0.19, 0.205, 0.035, 18), this.mats.labBlue, 0, 0.125, -0.015);
    this._part(g, 0.3, 0.085, 0.035, 0, -0.055, 0.215, this.mats.dark);
    this._part(g, 0.12, 0.045, 0.008, -0.06, -0.05, 0.236, this.mats.screen);
    for (const px of [0.055, 0.105]) this._equipMesh(g, new THREE.CylinderGeometry(0.015, 0.015, 0.012, 10), this.mats.warning, px, -0.05, 0.24, Math.PI / 2);
    return this._physicsEquipment(g, 'centrífuga de bancada', new THREE.Vector3(0.5, 0.32, 0.44), 7.5, x, y, z, rotY);
  }

  // Substitui o computador da bancada oeste. A capela transparente, o
  // prato metálico e o visor frontal deixam a função da balança reconhecível.
  _buildAnalyticalBalance(x, y, z, rotY) {
    const g = new THREE.Group();
    this._part(g, 0.52, 0.09, 0.42, 0, -0.185, 0, this.mats.labWhite);
    this._part(g, 0.5, 0.025, 0.4, 0, 0.215, 0, this.mats.metal);
    this._part(g, 0.48, 0.3, 0.014, 0, 0.025, -0.19, this.mats.glass);
    this._part(g, 0.014, 0.3, 0.38, -0.235, 0.025, 0, this.mats.glass);
    this._part(g, 0.014, 0.3, 0.38, 0.235, 0.025, 0, this.mats.glass);
    this._part(g, 0.225, 0.29, 0.012, -0.12, 0.025, 0.195, this.mats.glass);
    this._part(g, 0.225, 0.29, 0.012, 0.12, 0.025, 0.195, this.mats.glass);
    for (const px of [-0.245, 0, 0.245]) this._part(g, 0.018, 0.32, 0.02, px, 0.025, 0.205, this.mats.metal);
    this._equipMesh(g, new THREE.CylinderGeometry(0.1, 0.1, 0.018, 18), this.mats.metal, 0, -0.11, 0);
    this._part(g, 0.34, 0.075, 0.035, 0, -0.145, 0.215, this.mats.dark);
    this._part(g, 0.18, 0.042, 0.008, -0.045, -0.145, 0.237, this.mats.screen);
    for (const px of [0.075, 0.125]) this._equipMesh(g, new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10), this.mats.labBlue, px, -0.145, 0.24, Math.PI / 2);
    return this._physicsEquipment(g, 'balança analítica de precisão', new THREE.Vector3(0.54, 0.46, 0.46), 6.2, x, y, z, rotY);
  }

  _buildOscilloscope(x, y, z, rotY) {
    const g = new THREE.Group();
    this._part(g, 0.54, 0.34, 0.3, 0, 0, 0, this.mats.dark);
    this._part(g, 0.5, 0.3, 0.018, 0, 0, 0.159, this.mats.labWhite);
    this._part(g, 0.29, 0.2, 0.012, -0.08, 0.02, 0.172, this.mats.screen);
    for (const [px, py, mat] of [[0.13, 0.08, this.mats.labBlue], [0.2, 0.08, this.mats.warning], [0.13, -0.02, this.mats.labBlue], [0.2, -0.02, this.mats.labBlue]]) {
      this._equipMesh(g, new THREE.CylinderGeometry(0.025, 0.025, 0.025, 12), mat, px, py, 0.182, Math.PI / 2);
    }
    this._part(g, 0.16, 0.018, 0.018, 0.165, -0.115, 0.18, this.mats.metal);
    this._part(g, 0.42, 0.025, 0.04, 0, 0.205, 0, this.mats.metal);
    for (const px of [-0.19, 0.19]) this._part(g, 0.025, 0.08, 0.04, px, 0.17, 0, this.mats.metal);
    return this._physicsEquipment(g, 'osciloscópio digital', new THREE.Vector3(0.56, 0.38, 0.32), 3.8, x, y, z, rotY);
  }

  // Maleta de amostras com tampa articulada (abre com F)
  _buildCase(name, x, y, z, rotY) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    this.scene.add(g);
    // corpo oco: fundo + 4 paredes (a pastilha repousa no fundo, visível aberta)
    this._part(g, 0.36, 0.05, 0.24, 0, 0.025, 0, this.mats.caseBody);
    this._part(g, 0.36, 0.08, 0.02, 0, 0.09, 0.11, this.mats.caseBody);
    this._part(g, 0.36, 0.08, 0.02, 0, 0.09, -0.11, this.mats.caseBody);
    this._part(g, 0.02, 0.08, 0.2, 0.17, 0.09, 0, this.mats.caseBody);
    this._part(g, 0.02, 0.08, 0.2, -0.17, 0.09, 0, this.mats.caseBody);
    this._part(g, 0.1, 0.03, 0.03, 0, 0.11, 0.125, this.mats.metal); // fecho
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.13, -0.12);
    g.add(hinge);
    this._part(hinge, 0.36, 0.03, 0.24, 0, 0.015, 0.12, this.mats.caseLid);
    g.updateMatrixWorld(true);

    const container = {
      name, open: false, progress: 0,
      focus: g.localToWorld(new THREE.Vector3(0, 0.12, 0.22)),
      apply: (p) => { hinge.rotation.x = -1.9 * p; },
      pelletMount: g,
      pelletLocal: new THREE.Vector3(0, 0.08, 0),
    };
    this.containers.push(container);
    const w = g.localToWorld(new THREE.Vector3(0, 0.09, 0.02));
    this._spot(`na ${name}`, w.x, w.y, w.z, container);
  }

  // Gaveta: painel frontal + bandeja que deslizam juntos; a pastilha pode
  // estar na bandeja (sai da blindagem da bancada quando aberta).
  _buildDrawer(name, x, y, z, dirZ) {
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    this.scene.add(grp);
    this._part(grp, 0.54, 0.19, 0.025, 0, 0, 0.082 * dirZ, this.mats.dark);           // sombra/moldura
    this._part(grp, 0.48, 0.14, 0.045, 0, 0, 0.098 * dirZ, this.mats.cabinetDoor);   // painel frontal
    this._part(grp, 0.2, 0.035, 0.035, 0, 0.01, 0.13 * dirZ, this.mats.dark);        // puxador
    this._part(grp, 0.5, 0.035, 0.42, 0, -0.06, -0.15 * dirZ, this.mats.cabinetIn);  // bandeja
    const baseZ = z;
    const container = {
      name, open: false, progress: 0,
      focus: new THREE.Vector3(x, y, z + 0.14 * dirZ), // no painel frontal

      apply: (p) => { grp.position.z = baseZ + dirZ * 0.38 * p; },
      shieldEntry: null, // a blindagem da bancada deixa de cobrir a pastilha ao abrir
      pelletMount: grp,
      pelletLocal: new THREE.Vector3(0.06, -0.03, -0.15 * dirZ),
    };
    this.containers.push(container);
    this._spot(`na ${name}`, x + 0.06, y - 0.03, z - 0.15 * dirZ, container);
  }

  // Armário com porta articulada; interior oco com prateleira.
  _buildCabinet(name, x, z, rotY) {
    const w = 1.1, h = 2.0, d = 0.65, t = 0.05;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.scene.add(g);

    this._part(g, w, h, t, 0, h / 2, -d / 2 + t / 2, this.mats.cabinet);          // fundo
    this._part(g, t, h, d, -w / 2 + t / 2, h / 2, 0, this.mats.cabinet);          // lateral esq.
    this._part(g, t, h, d, w / 2 - t / 2, h / 2, 0, this.mats.cabinet);           // lateral dir.
    this._part(g, w, t, d, 0, h - t / 2, 0, this.mats.cabinet);                   // topo
    this._part(g, w, t, d, 0, t / 2, 0, this.mats.cabinet);                       // base
    this._part(g, w - 2 * t, t, d - 2 * t, 0, 0.95, 0, this.mats.cabinetIn);      // prateleira

    // porta no batente esquerdo, abre para fora
    const hinge = new THREE.Group();
    hinge.position.set(-w / 2 + 0.02, 0, d / 2);
    g.add(hinge);
    this._part(hinge, w - 0.05, h - 0.06, 0.04, (w - 0.05) / 2, h / 2, 0, this.mats.cabinetDoor);
    this._part(hinge, 0.05, 0.3, 0.05, w - 0.16, 1.15, 0.045, this.mats.metal);   // puxador

    g.updateMatrixWorld(true);

    // collider/blindagem AABB (rotações são múltiplos de 90°)
    const quarter = Math.abs(Math.round(rotY / (Math.PI / 2))) % 2 === 1;
    const hw = quarter ? d / 2 : w / 2, hd = quarter ? w / 2 : d / 2;
    const box = new THREE.Box3(
      new THREE.Vector3(x - hw, 0, z - hd),
      new THREE.Vector3(x + hw, h, z + hd)
    );
    this.colliders.push(box);
    const shieldEntry = this.shielding.add(box, 0.45);

    const focus = g.localToWorld(new THREE.Vector3(0, 1.05, d / 2 + 0.12));
    const insideWorld = g.localToWorld(new THREE.Vector3(0.12, 1.0, 0));
    const container = {
      name, open: false, progress: 0, focus,
      apply: (p) => { hinge.rotation.y = -1.95 * p; },
      shieldEntry, closedTransmission: 0.45, openTransmission: 0.8,
      pelletMount: g,
      pelletLocal: new THREE.Vector3(0.12, 1.0, 0),
    };
    this.containers.push(container);
    this._spot(`dentro do ${name}`, insideWorld.x, insideWorld.y, insideWorld.z, container);
  }

  _buildCabinets() {
    this._buildCabinet('armário oeste', -10.5, -2.5, Math.PI / 2);
    this._buildCabinet('armário norte', 3.2, -7.4, 0);
    this._buildCabinet('armário leste', 10.5, 1.5, -Math.PI / 2);
  }

  _buildShelves() {
    const shelves = [
      { x: -3.5, z: -7.5, w: 3, d: 0.6 },
      { x: 10.5, z: 5.5, w: 0.6, d: 3.4 },
    ];
    for (const s of shelves) {
      for (let i = 0; i < 4; i++) {
        const y = 0.35 + i * 0.6;
        this._box(s.w, 0.05, s.d, s.x, y, s.z, this.mats.shelf, { collide: false });
        // tábua como superfície real: os objetos soltos pousam nela
        this._propSurfaces.push(new THREE.Box3(
          new THREE.Vector3(s.x - s.w / 2, y - 0.025, s.z - s.d / 2),
          new THREE.Vector3(s.x + s.w / 2, y + 0.025, s.z + s.d / 2)
        ));
      }
      // 4 montantes de canto (postes finos, não painéis), recuados 2 cm da
      // borda das prateleiras para as faces não ficarem coplanares (z-fighting)
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this._box(0.06, 2.2, 0.06,
          s.x + px * (s.w / 2 - 0.05), 1.1, s.z + pz * (s.d / 2 - 0.05),
          this.mats.metal, { collide: false });
      }
      // o volume cheio bloqueia o jogador, mas é ignorado pela física dos
      // objetos soltos (senão eles seriam expulsos das prateleiras)
      const bulk = new THREE.Box3(
        new THREE.Vector3(s.x - s.w / 2, 0, s.z - s.d / 2),
        new THREE.Vector3(s.x + s.w / 2, 2.2, s.z + s.d / 2)
      );
      this.colliders.push(bulk);
      this._propIgnore.push(bulk);
    }
    this._buildShelfEquipment();
    this._spot('na estante ao norte', -3.5, 1.0, -7.1);
  }

  // Em vez de cubos aleatórios, as estantes guardam consumíveis e aparelhos
  // que fazem sentido num laboratório de metrologia/radiação. Todos são
  // Groups físicos: podem ser pegos, derrubados, girados e empilhados.
  _buildShelfEquipment() {
    // Estante norte: amostras e vidraria de uso frequente.
    this._buildVialRack(-4.15, 0.505, -7.48, 0);
    this._buildSampleCanister('recipiente blindado de amostra', -3.42, 0.51, -7.48, 0);
    this._buildPipetteCase(-2.78, 0.45, -7.48, 0);
    this._buildReagentBottle('frasco de reagente azul', -4.22, 1.145, -7.48, this.mats.liquidBlue);
    this._buildReagentBottle('frasco de reagente âmbar', -3.72, 1.145, -7.48, this.mats.liquidAmber);
    this._buildReagentBottle('frasco de solução padrão', -3.22, 1.145, -7.48, this.mats.labBlue);
    this._buildGraduatedCylinder(-2.75, 1.78, -7.48, 0);
    this._buildPipetteCase(-3.9, 1.65, -7.48, 0);
    this._buildSampleCanister('fonte de calibração selada', -3.0, 1.71, -7.48, 0);
    this._buildReagentBottle('frasco de descontaminação', -4.1, 2.345, -7.48, this.mats.liquidBlue);
    this._buildGraduatedCylinder(-3.42, 2.38, -7.48, 0);
    this._buildSampleCanister('padrão de referência', -2.75, 2.31, -7.48, 0);

    // Estante leste: peças de reposição e conjuntos já preparados.
    this._buildVialRack(10.5, 0.505, 4.75, Math.PI / 2);
    this._buildSampleCanister('recipiente blindado reserva', 10.5, 0.51, 5.65, 0);
    this._buildPipetteCase(10.5, 0.45, 6.45, Math.PI / 2);
    this._buildReagentBottle('frasco tampão', 10.5, 1.145, 4.65, this.mats.liquidBlue);
    this._buildReagentBottle('frasco de lavagem', 10.5, 1.145, 5.35, this.mats.labBlue);
    this._buildReagentBottle('frasco de referência', 10.5, 1.145, 6.05, this.mats.liquidAmber);
    this._buildSampleCanister('câmara de ionização reserva', 10.5, 1.71, 4.75, 0);
    this._buildVialRack(10.5, 1.705, 5.75, Math.PI / 2);
    this._buildGraduatedCylinder(10.5, 2.38, 4.7, 0);
    this._buildReagentBottle('solução de limpeza', 10.5, 2.345, 5.45, this.mats.liquidBlue);
    this._buildSampleCanister('amostra lacrada', 10.5, 2.31, 6.25, 0);
  }

  _buildReagentBottle(label, x, y, z, liquidMat) {
    const g = new THREE.Group();
    this._equipMesh(g, new THREE.CylinderGeometry(0.065, 0.07, 0.21, 12, 1, true), this.mats.glass, 0, -0.025, 0);
    this._equipMesh(g, new THREE.CylinderGeometry(0.058, 0.063, 0.14, 12), liquidMat, 0, -0.055, 0);
    this._equipMesh(g, new THREE.CylinderGeometry(0.034, 0.05, 0.055, 12, 1, true), this.mats.glass, 0, 0.107, 0);
    this._equipMesh(g, new THREE.CylinderGeometry(0.039, 0.039, 0.045, 12), this.mats.rubber, 0, 0.155, 0);
    return this._physicsEquipment(g, label, new THREE.Vector3(0.16, 0.34, 0.16), 0.65, x, y, z);
  }

  _buildVialRack(x, y, z, rotY) {
    const g = new THREE.Group();
    this._part(g, 0.56, 0.055, 0.26, 0, -0.11, 0, this.mats.labBlue);
    this._part(g, 0.56, 0.035, 0.22, 0, 0.035, 0, this.mats.labWhite);
    for (const px of [-0.2, -0.1, 0, 0.1, 0.2]) {
      const tube = this._equipMesh(g, new THREE.CylinderGeometry(0.025, 0.025, 0.2, 10, 1, true), this.mats.glass, px, 0.025, 0);
      this._equipMesh(g, new THREE.CylinderGeometry(0.021, 0.021, 0.08, 10), px < 0 ? this.mats.liquidAmber : this.mats.liquidBlue, px, -0.03, 0);
      this._equipMesh(g, new THREE.CylinderGeometry(0.028, 0.028, 0.025, 10), this.mats.rubber, px, 0.13, 0);
    }
    return this._physicsEquipment(g, 'suporte com tubos de ensaio', new THREE.Vector3(0.58, 0.28, 0.28), 1.15, x, y, z, rotY);
  }

  _buildPipetteCase(x, y, z, rotY) {
    const g = new THREE.Group();
    this._part(g, 0.48, 0.07, 0.24, 0, -0.035, 0, this.mats.dark);
    this._part(g, 0.44, 0.025, 0.2, 0, 0.018, 0, this.mats.labWhite);
    for (const dz of [-0.065, 0, 0.065]) {
      const pipette = this._equipMesh(g, new THREE.CylinderGeometry(0.012, 0.006, 0.37, 8), this.mats.labBlue, 0, 0.045, dz, 0, 0, Math.PI / 2);
      this._equipMesh(g, new THREE.CylinderGeometry(0.018, 0.018, 0.055, 8), this.mats.warning, -0.185, 0.045, dz, 0, 0, Math.PI / 2);
    }
    return this._physicsEquipment(g, 'estojo de micropipetas', new THREE.Vector3(0.5, 0.2, 0.26), 1.0, x, y, z, rotY);
  }

  _buildSampleCanister(label, x, y, z, rotY) {
    const g = new THREE.Group();
    this._equipMesh(g, new THREE.CylinderGeometry(0.105, 0.105, 0.25, 14), this.mats.metal, 0, 0, 0);
    this._equipMesh(g, new THREE.TorusGeometry(0.106, 0.012, 6, 14), this.mats.dark, 0, 0.11, 0, Math.PI / 2);
    this._equipMesh(g, new THREE.TorusGeometry(0.106, 0.012, 6, 14), this.mats.dark, 0, -0.11, 0, Math.PI / 2);
    return this._physicsEquipment(g, label, new THREE.Vector3(0.24, 0.32, 0.24), 3.2, x, y, z, rotY);
  }

  _buildGraduatedCylinder(x, y, z, rotY) {
    const g = new THREE.Group();
    this._equipMesh(g, new THREE.CylinderGeometry(0.042, 0.042, 0.34, 12, 1, true), this.mats.glass, 0, 0.02, 0);
    this._equipMesh(g, new THREE.CylinderGeometry(0.036, 0.036, 0.16, 12), this.mats.liquidBlue, 0, -0.065, 0);
    this._equipMesh(g, new THREE.CylinderGeometry(0.08, 0.08, 0.025, 12), this.mats.labWhite, 0, -0.165, 0);
    for (let i = 0; i < 6; i++) this._equipMesh(g, new THREE.TorusGeometry(0.044, 0.0025, 4, 12), this.mats.dark, 0, -0.1 + i * 0.045, 0, Math.PI / 2);
    return this._physicsEquipment(g, 'proveta graduada', new THREE.Vector3(0.18, 0.44, 0.18), 0.45, x, y, z, rotY);
  }

  // Selo de radiação: o trifólio do projeto (simb_radiação.svg) embutido como
  // data-URL, desenhado sobre um adesivo amarelo em canvas — vira uma textura
  // compartilhada por todos os decalques (nenhum arquivo externo, funciona
  // até abrindo o HTML direto do disco).
  _radiationDecalMat() {
    if (this._radMat) return this._radMat;
    const size = 256;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    // adesivo: disco amarelo com aro escuro (aparece já no primeiro frame;
    // o símbolo entra assim que o SVG decodifica)
    ctx.fillStyle = '#e6c832';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#17181a';
    ctx.stroke();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 1280">' +
      '<g transform="translate(0,1280) scale(0.1,-0.1)" fill="#17181a">' +
      '<path d="M3043 11841 c-686 -427 -1262 -952 -1747 -1591 -800 -1053 -1246 -2313 -1292 -3650 l-7 -200 2241 0 2242 0 0 45 c0 25 5 89 11 143 63 583 374 1097 855 1413 l94 62 -29 51 c-725 1263 -2204 3812 -2213 3813 -7 1 -77 -38 -155 -86z"/>' +
      '<path d="M9337 11488 c-404 -701 -1969 -3412 -1973 -3419 -2 -4 33 -30 77 -59 430 -280 739 -732 838 -1225 22 -110 41 -269 41 -340 l0 -45 2242 0 2241 0 -7 198 c-23 649 -134 1264 -337 1857 -452 1325 -1323 2461 -2494 3251 -171 115 -347 224 -362 224 -6 0 -125 -199 -266 -442z"/>' +
      '<path d="M6225 7665 c-675 -94 -1166 -714 -1096 -1382 32 -312 152 -565 370 -784 219 -218 472 -338 783 -370 360 -38 734 93 1001 350 469 452 527 1168 137 1690 -275 368 -738 560 -1195 496z"/>' +
      '<path d="M4932 3856 c-1800 -3117 -1726 -2987 -1711 -3001 24 -22 325 -179 494 -258 679 -315 1358 -497 2136 -574 249 -24 844 -24 1098 1 764 73 1449 256 2121 566 144 66 464 233 501 261 l22 17 -1078 1868 c-593 1028 -1096 1899 -1117 1935 l-38 66 -118 -58 c-204 -100 -422 -163 -654 -188 -339 -37 -716 32 -1032 188 l-116 57 -508 -880z"/>' +
      '</g></svg>';
    const img = new Image();
    img.onload = () => {
      const s = size * 0.62, o = (size - s) / 2; // símbolo centrado no adesivo
      ctx.drawImage(img, o, o, s, s);
      tex.needsUpdate = true;
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    this._radMat = new THREE.MeshStandardMaterial({
      map: tex, transparent: true, roughness: 0.55, metalness: 0.1,
    });
    return this._radMat;
  }

  _buildBarrels() {
    // corpo aberto em cima (oco por dentro, graças ao DoubleSide do material)
    const bodyGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.86, 16, 1, true);
    const rimGeo = new THREE.TorusGeometry(0.345, 0.018, 8, 20);
    const lidGeo = new THREE.CylinderGeometry(0.355, 0.355, 0.05, 16);
    const bottomGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.03, 16);
    const barrels = [
      { name: 'barril amarelo (norte)', x: -1.2, z: -7.2, m: this.mats.barrelY },
      { name: 'barril azul (norte)', x: -0.4, z: -7.4, m: this.mats.barrelB },
      { name: 'barril amarelo (canto norte)', x: -0.8, z: -6.5, m: this.mats.barrelY },
      { name: 'barril azul (leste)', x: 9.8, z: -3.5, m: this.mats.barrelB },
      { name: 'barril amarelo (sudoeste)', x: -10.2, z: 6.8, m: this.mats.barrelY },
    ];
    for (const b of barrels) {
      const body = new THREE.Mesh(bodyGeo, b.m);
      body.position.set(b.x, 0.43, b.z);
      body.castShadow = body.receiveShadow = true;
      this.scene.add(body);
      for (const ry of [0.16, 0.84]) { // aros metálicos (um deles veste a borda)
        const rim = new THREE.Mesh(rimGeo, this.mats.metal);
        rim.position.set(b.x, ry, b.z);
        rim.rotation.x = Math.PI / 2;
        this.scene.add(rim);
      }
      const bottom = new THREE.Mesh(bottomGeo, this.mats.dark); // fundo interno
      bottom.position.set(b.x, 0.06, b.z);
      this.scene.add(bottom);
      const lid = new THREE.Mesh(lidGeo, this.mats.metal);
      lid.position.set(b.x, 0.885, b.z);
      lid.castShadow = true;
      this.scene.add(lid);

      // selo de radiação dos dois lados do casco: casca de cilindro um fio
      // mais larga que o corpo (0.352 > 0.34), entre os aros — sem z-fighting.
      // O primeiro selo mira o centro da sala; o segundo fica no lado oposto.
      const decalMat = this._radiationDecalMat();
      const aCenter = Math.atan2(-b.x, -b.z);
      for (const flip of [0, Math.PI]) {
        const decGeo = new THREE.CylinderGeometry(
          0.352, 0.352, 0.3, 12, 1, true, aCenter + flip - 0.44, 0.88
        );
        const decal = new THREE.Mesh(decGeo, decalMat);
        decal.position.set(b.x, 0.5, b.z);
        decal.receiveShadow = true;
        this.scene.add(decal);
      }

      const box = new THREE.Box3(
        new THREE.Vector3(b.x - 0.34, 0, b.z - 0.34),
        new THREE.Vector3(b.x + 0.34, 0.9, b.z + 0.34)
      );
      box.hollow = true; // objetos soltos usam o casco real; o jogador, o volume cheio
      this.colliders.push(box);
      this.shielding.add(box, 0.5);

      // Casco físico do barril para os objetos soltos: quatro faixas laterais
      // e o fundo interno — qualquer objeto pode cair e descansar lá dentro.
      const wall = 0.07, outer = 0.36, inner = outer - wall;
      const lidColliders = [
        new THREE.Box3(new THREE.Vector3(b.x - outer, 0, b.z - inner), new THREE.Vector3(b.x - inner, 0.9, b.z + inner)),
        new THREE.Box3(new THREE.Vector3(b.x + inner, 0, b.z - inner), new THREE.Vector3(b.x + outer, 0.9, b.z + inner)),
        new THREE.Box3(new THREE.Vector3(b.x - inner, 0, b.z - outer), new THREE.Vector3(b.x + inner, 0.9, b.z - inner)),
        new THREE.Box3(new THREE.Vector3(b.x - inner, 0, b.z + inner), new THREE.Vector3(b.x + inner, 0.9, b.z + outer)),
        // fundo: o disco interno fica com o topo em y=0.075
        new THREE.Box3(new THREE.Vector3(b.x - inner, 0, b.z - inner), new THREE.Vector3(b.x + inner, 0.075, b.z + inner)),
      ];
      // Tampa fechada: impede objetos soltos de atravessarem a abertura. O
      // InteractionSystem só ativa este volume enquanto o recipiente está fechado.
      const closedLidCollider = new THREE.Box3(
        new THREE.Vector3(b.x - 0.36, 0.85, b.z - 0.36),
        new THREE.Vector3(b.x + 0.36, 0.915, b.z + 0.36)
      );

      // container "one-shot": F arranca a tampa; a pastilha repousa no fundo
      const mount = new THREE.Group();
      mount.position.set(b.x, 0, b.z);
      this.scene.add(mount);
      this.containers.push({
        name: b.name, open: false, progress: 0, oneShot: true, lid, lidColliders, closedLidCollider,
        lidMouth: { minX: b.x - inner, maxX: b.x + inner, minZ: b.z - inner, maxZ: b.z + inner, topY: 0.9 },
        focus: new THREE.Vector3(b.x, 0.95, b.z),
        pelletMount: mount,
        pelletLocal: new THREE.Vector3(0, 0.105, 0),
      });
    }
  }

  _buildCrates() {
    const crates = [
      { name: 'caixa grande da pilha', x: -5.5, z: 6.8, w: 0.9, h: 0.9 },
      { name: 'caixa pequena da pilha', x: -4.65, z: 6.8, w: 0.7, h: 0.7 },
      { name: 'caixa em frente à pilha', x: -6.0, z: 6.0, w: 0.6, h: 0.6 },
      { name: 'caixa perto da divisória', x: 2.5, z: -1.2, w: 1.1, h: 0.8 },
      { name: 'caixa central', x: 0, z: 3.5, w: 0.8, h: 0.8 },
    ];
    const t = 0.05; // espessura das tábuas
    for (const c of crates) {
      const y0 = c.y || 0;
      // collider + blindagem do volume inteiro (uma única caixa AABB)
      const box = new THREE.Box3(
        new THREE.Vector3(c.x - c.w / 2, y0, c.z - c.w / 2),
        new THREE.Vector3(c.x + c.w / 2, y0 + c.h, c.z + c.w / 2)
      );
      box.hollow = true; // objetos soltos usam o casco real; o jogador, o volume cheio
      this.colliders.push(box);
      this.shielding.add(box, 0.75);

      // Colisores do casco aberto: fundo e quatro paredes. Eles modelam o
      // caixote de verdade para a tampa, sem transformar seu interior vazio
      // em um bloco sólido.
      const lidColliders = [
        // fundo até o topo do forro escuro (y0+t+0.026): objetos pousam nele
        new THREE.Box3(new THREE.Vector3(c.x - c.w / 2, y0, c.z - c.w / 2), new THREE.Vector3(c.x + c.w / 2, y0 + t + 0.026, c.z + c.w / 2)),
        new THREE.Box3(new THREE.Vector3(c.x - c.w / 2, y0, c.z + c.w / 2 - t), new THREE.Vector3(c.x + c.w / 2, y0 + c.h, c.z + c.w / 2)),
        new THREE.Box3(new THREE.Vector3(c.x - c.w / 2, y0, c.z - c.w / 2), new THREE.Vector3(c.x + c.w / 2, y0 + c.h, c.z - c.w / 2 + t)),
        new THREE.Box3(new THREE.Vector3(c.x + c.w / 2 - t, y0, c.z - c.w / 2 + t), new THREE.Vector3(c.x + c.w / 2, y0 + c.h, c.z + c.w / 2 - t)),
        new THREE.Box3(new THREE.Vector3(c.x - c.w / 2, y0, c.z - c.w / 2 + t), new THREE.Vector3(c.x - c.w / 2 + t, y0 + c.h, c.z + c.w / 2 - t)),
      ];
      // O tampo deixa de ser somente visual: enquanto a caixa está fechada,
      // este colisor bloqueia qualquer objeto antes de ele alcançar o interior.
      const closedLidCollider = new THREE.Box3(
        new THREE.Vector3(c.x - c.w / 2 - 0.012, y0 + c.h - 0.06, c.z - c.w / 2 - 0.012),
        new THREE.Vector3(c.x + c.w / 2 + 0.012, y0 + c.h + 0.02, c.z + c.w / 2 + 0.012)
      );

      // casco OCO: fundo + 4 paredes, sem tampo
      this._box(c.w, t, c.w, c.x, y0 + t / 2, c.z, this.mats.crate, { collide: false });
      this._box(c.w, c.h - t, t, c.x, y0 + t + (c.h - t) / 2, c.z + c.w / 2 - t / 2, this.mats.crate, { collide: false });
      this._box(c.w, c.h - t, t, c.x, y0 + t + (c.h - t) / 2, c.z - c.w / 2 + t / 2, this.mats.crate, { collide: false });
      this._box(t, c.h - t, c.w - 2 * t, c.x + c.w / 2 - t / 2, y0 + t + (c.h - t) / 2, c.z, this.mats.crate, { collide: false });
      this._box(t, c.h - t, c.w - 2 * t, c.x - c.w / 2 + t / 2, y0 + t + (c.h - t) / 2, c.z, this.mats.crate, { collide: false });
      // forro escuro do fundo (contraste com a pastilha)
      this._box(c.w - 2 * t, 0.02, c.w - 2 * t, c.x, y0 + t + 0.016, c.z, this.mats.cabinetIn, { collide: false });
      // reforços de canto: saltados 12 mm para fora e mais baixos que a tampa
      // (nenhuma face coplanar com as tábuas → sem z-fighting)
      for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this._box(0.07, c.h - 0.06, 0.07,
          c.x + ox * (c.w / 2 - 0.023), y0 + (c.h - 0.06) / 2, c.z + oz * (c.w / 2 - 0.023),
          this.mats.crateEdge, { collide: false });
      }
      // tampa destacável (F arranca, com física)
      const lid = this._box(c.w + 0.02, 0.06, c.w + 0.02, c.x, y0 + c.h - 0.02, c.z, this.mats.crateLid, { collide: false });

      const mount = new THREE.Group();
      mount.position.set(c.x, 0, c.z);
      this.scene.add(mount);
      this.containers.push({
        name: c.name, open: false, progress: 0, oneShot: true, lid, lidColliders, closedLidCollider,
        lidMouth: {
          minX: c.x - c.w / 2 + t, maxX: c.x + c.w / 2 - t,
          minZ: c.z - c.w / 2 + t, maxZ: c.z + c.w / 2 - t,
          topY: y0 + c.h,
        },
        focus: new THREE.Vector3(c.x, y0 + c.h, c.z),
        pelletMount: mount,
        pelletLocal: new THREE.Vector3(0, y0 + t + 0.05, 0), // repousa no fundo
      });
    }
  }

  // Balde galvanizado lowpoly no canto sudeste (nicho entre a bancada sul e a
  // estante leste). O corpo é um tronco de cone e a alça vive num pivô
  // próprio — dobradiça no eixo X local. O ângulo do pivô é controlado pela
  // física de pêndulo no InteractionSystem, que recebe o balde via build().
  _buildBucket() {
    const zinc = new THREE.MeshStandardMaterial({
      color: 0xc7cdd2, roughness: 0.38, metalness: 0.85,
      flatShading: true, side: THREE.DoubleSide,
    });
    const zincDark = new THREE.MeshStandardMaterial({
      color: 0x878f96, roughness: 0.5, metalness: 0.8, flatShading: true,
    });
    const rTop = 0.16, rBot = 0.115, h = 0.26, hy = h / 2;
    const group = new THREE.Group();
    group.position.set(10.15, hy + 0.002, 7.45); // fundo apoiado no chão

    const body = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 12, 1, true), zinc);
    body.castShadow = body.receiveShadow = true;
    group.add(body);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(rBot - 0.004, rBot - 0.004, 0.014, 12), zincDark);
    bottom.position.y = -hy + 0.007;
    bottom.castShadow = true; // preenche o centro da sombra: sem isso o corpo aberto vira um anel ("sem fundo")
    group.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rTop + 0.004, 0.011, 6, 12), this.mats.metal);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = hy;
    rim.castShadow = true;
    group.add(rim);
    const foot = new THREE.Mesh(new THREE.TorusGeometry(rBot + 0.004, 0.008, 6, 12), this.mats.metal);
    foot.rotation.x = Math.PI / 2;
    foot.position.y = -hy + 0.01;
    group.add(foot);

    // suportes laterais rebitados, na altura do pivô da alça
    const pivotY = hy - 0.024;
    for (const side of [-1, 1]) {
      const mount = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), this.mats.metal);
      mount.scale.set(0.6, 1, 0.8);
      mount.position.set(side * (rTop - 0.002), pivotY, 0);
      group.add(mount);
    }

    // alça: arco de tubo + pinos sobre o eixo do pivô (ficam parados ao girar)
    const pivot = new THREE.Group();
    pivot.position.set(0, pivotY, 0);
    group.add(pivot);
    const arc = new THREE.Curve();
    arc.getPoint = (t, target = new THREE.Vector3()) => {
      const a = Math.PI * (1 - t);
      return target.set(Math.cos(a) * (rTop + 0.012), Math.sin(a) * 0.185, 0);
    };
    const wire = new THREE.Mesh(new THREE.TubeGeometry(arc, 16, 0.007, 6, false), this.mats.metal);
    wire.castShadow = true;
    pivot.add(wire);
    for (const side of [-1, 1]) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 6), this.mats.metal);
      pin.rotation.z = Math.PI / 2;
      pin.position.set(side * (rTop + 0.012), 0, 0);
      pivot.add(pin);
    }

    // repouso: alça tombada de lado, apoiada no corpo (como no modelo original)
    const restAngle = THREE.MathUtils.degToRad(112);
    pivot.rotation.x = restAngle;
    this.scene.add(group);
    this.bucket = { mesh: group, pivot, restAngle, rTop, rBot, halfH: hy, armLen: 0.185 };
  }

  // Porta de emergência na parede sul. O vão só se torna atravessável quando
  // a folha abre; nas fases 1–25 ela permanece trancada e funciona como antes.
  _buildDoor() {
    const x = 0.5, wallZ = 7.85; // face interna da parede sul
    // batente: duas ombreiras + verga, levemente salientes da parede
    for (const side of [-1, 1]) {
      this._box(0.1, 2.15, 0.14, x + side * 0.5, 1.075, wallZ - 0.07, this.mats.cabinet, { collide: false });
    }
    this._box(1.1, 0.1, 0.14, x, 2.2, wallZ - 0.07, this.mats.cabinet, { collide: false });
    const hinge = new THREE.Group();
    hinge.position.set(x + 0.46, 0, wallZ - 0.1); // dobradiça na ombreira leste
    this.scene.add(hinge);
    this._part(hinge, 0.92, 2.16, 0.06, -0.46, 1.08, 0, this.mats.cabinetDoor);
    // maçaneta com espelho na borda livre (lado oposto à dobradiça)
    this._part(hinge, 0.05, 0.14, 0.02, -0.82, 1.05, -0.04, this.mats.dark);
    this._part(hinge, 0.12, 0.035, 0.035, -0.85, 1.05, -0.06, this.mats.metal);

    const collider = new THREE.Box3(
      new THREE.Vector3(x - 0.46, 0, wallZ - 0.2),
      new THREE.Vector3(x + 0.46, 2.16, wallZ + 0.02)
    );
    this.colliders.push(collider);

    const door = {
      name: 'porta do laboratório', open: false, progress: 0,
      locked: true, baseLocked: true, isExitDoor: true, collider,
      focus: new THREE.Vector3(x - 0.3, 1.05, wallZ - 0.12), // mira na maçaneta
      thresholdZ: 22.1,
      apply: (p) => {
        hinge.rotation.y = Math.PI * 0.52 * p; // gira pela ombreira leste, abrindo para fora
        collider.disabled = p > 0.12;
      },
    };
    this.containers.push(door);
    this.exitDoor = door;
  }
}
