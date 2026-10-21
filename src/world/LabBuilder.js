import * as THREE from 'three';
import { LabTextures, worldBoxGeometry } from './LabTextures.js';
import { LabDecor } from './LabDecor.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

    // Texturas procedurais PBR (cor + relevo + rugosidade). Os mapas em
    // escala de cinza são tingidos pelo `color` de cada material, então as
    // cores originais do laboratório continuam valendo.
    this.tex = new LabTextures();
    const T = this.tex;
    const n = (s) => new THREE.Vector2(s, s);
    const pbr = (set, normal, extra) => ({
      map: set.map, normalMap: set.normalMap, normalScale: n(normal), roughnessMap: set.roughnessMap, ...extra,
    });
    const floorT = T.floor(), wallT = T.wall(), ceilT = T.ceiling(), brushT = T.brushedMetal();
    const powderT = T.powderCoat(), topT = T.benchTop(), woodT = T.wood(), barrelT = T.barrel(), rubT = T.rubber();

    this.mats = {
      wall: new THREE.MeshStandardMaterial(pbr(wallT, 0.7, { color: 0xe4e8ec, roughness: 1 })),
      wallAccent: new THREE.MeshStandardMaterial(pbr(brushT, 0.5, { color: 0x46667f, roughness: 1.4, metalness: 0.35 })),
      floor: new THREE.MeshStandardMaterial(pbr(floorT, 0.9, { roughness: 1, metalness: 0.05 })),
      // emissiveMap = map: a grade do forro continua legível sob o emissivo
      ceiling: new THREE.MeshStandardMaterial(pbr(ceilT, 0.8, { color: 0xc9ced6, roughness: 1, emissive: 0x565c66, emissiveMap: ceilT.map })),
      metal: new THREE.MeshStandardMaterial(pbr(brushT, 0.45, { color: 0xa3acb6, roughness: 1, metalness: 0.65 })),
      tableTop: new THREE.MeshStandardMaterial(pbr(topT, 0.4, { color: 0xf3f5f7, roughness: 1.5 })),
      cabinet: new THREE.MeshStandardMaterial(pbr(powderT, 0.5, { color: 0x5e7a94, roughness: 1, metalness: 0.3 })),
      cabinetDoor: new THREE.MeshStandardMaterial(pbr(powderT, 0.5, { color: 0x6b88a1, roughness: 0.95, metalness: 0.3 })),
      benchBody: new THREE.MeshStandardMaterial(pbr(powderT, 0.45, { color: 0x939da8, roughness: 0.95, metalness: 0.45 })),
      cabinetIn: new THREE.MeshStandardMaterial(pbr(powderT, 0.4, { color: 0x394654, roughness: 1.4 })),
      shelf: new THREE.MeshStandardMaterial(pbr(brushT, 0.4, { color: 0xbfc6ce, roughness: 1.2, metalness: 0.45 })),
      barrelY: new THREE.MeshStandardMaterial(pbr(barrelT, 0.6, { color: 0xdcb53c, roughness: 1, metalness: 0.3, side: THREE.DoubleSide })),
      barrelB: new THREE.MeshStandardMaterial(pbr(barrelT, 0.6, { color: 0x35628c, roughness: 1, metalness: 0.3, side: THREE.DoubleSide })),
      crate: new THREE.MeshStandardMaterial(pbr(woodT, 0.9, { color: 0xb8956a, roughness: 1 })),
      crateEdge: new THREE.MeshStandardMaterial(pbr(woodT, 0.9, { color: 0x7d5e3a, roughness: 1 })),
      crateLid: new THREE.MeshStandardMaterial(pbr(woodT, 0.9, { color: 0x94714b, roughness: 1 })),
      caseBody: new THREE.MeshStandardMaterial(pbr(rubT, 0.5, { color: 0xb03a2e, roughness: 0.6, metalness: 0.2 })),
      caseLid: new THREE.MeshStandardMaterial(pbr(rubT, 0.5, { color: 0x922f25, roughness: 0.6, metalness: 0.2 })),
      dark: new THREE.MeshStandardMaterial(pbr(rubT, 0.3, { color: 0x2d3138, roughness: 0.7 })),
      screen: new THREE.MeshStandardMaterial({ color: 0x0c1522, emissive: 0x1c4a6e, emissiveIntensity: 1.4, roughness: 0.3 }),
      lightPanel: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 1.1 }),
      labWhite: new THREE.MeshStandardMaterial(pbr(powderT, 0.25, { color: 0xedf0f3, roughness: 0.55, metalness: 0.08 })),
      labBlue: new THREE.MeshStandardMaterial(pbr(powderT, 0.25, { color: 0x2b78a6, roughness: 0.55, metalness: 0.12 })),
      rubber: new THREE.MeshStandardMaterial(pbr(rubT, 0.8, { color: 0x1b1f24, roughness: 1 })),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xc9eff7, roughness: 0.12, transmission: 0.45, transparent: true, opacity: 0.62, thickness: 0.025 }),
      liquidBlue: new THREE.MeshStandardMaterial({ color: 0x31a8c8, roughness: 0.24, transparent: true, opacity: 0.78 }),
      liquidAmber: new THREE.MeshStandardMaterial({ color: 0xc47a20, roughness: 0.3, transparent: true, opacity: 0.8 }),
      warning: new THREE.MeshStandardMaterial(pbr(powderT, 0.3, { color: 0xe6bd35, roughness: 0.7 })),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd9dee3, roughness: 0.22, metalness: 0.95 }),
      led: new THREE.MeshStandardMaterial({ color: 0x0b2a10, emissive: 0x39ff6a, emissiveIntensity: 1.6 }),
    };
    this._boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this._uvGeos = new Map();
    this._mouseGeo = new THREE.SphereGeometry(0.5, 16, 10);
  }

  // Geometria de caixa em tamanho real com UV em metros (cacheada por medida):
  // as texturas tileáveis mantêm a escala física em paredes e painéis grandes.
  _uvGeo(w, h, d, tile) {
    const key = `${w.toFixed(4)}|${h.toFixed(4)}|${d.toFixed(4)}|${tile}`;
    let geo = this._uvGeos.get(key);
    if (!geo) {
      geo = worldBoxGeometry(w, h, d, tile);
      this._uvGeos.set(key, geo);
    }
    return geo;
  }

  // Box com sombra; opcionalmente collider e entrada de blindagem. Com `uv`
  // (metros por repetição) a malha usa geometria em tamanho real e escala 1 —
  // nunca usar em peças cuja física lê `mesh.scale` (tampas, objetos soltos).
  _box(w, h, d, x, y, z, mat, { collide = true, shadow = true, shield = 0, uv = 0 } = {}) {
    const mesh = new THREE.Mesh(uv ? this._uvGeo(w, h, d, uv) : this._boxGeo, mat);
    if (!uv) mesh.scale.set(w, h, d);
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

  // Igual a _part, mas com UV em metros (painéis grandes de armários/portas).
  _partUV(parent, w, h, d, x, y, z, mat, tile = 0.8) {
    const mesh = new THREE.Mesh(this._uvGeo(w, h, d, tile), mat);
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

    // piso e forro: UV em metros (texturas de 2×2 placas de 60 cm = 1,2 m)
    const planeUV = (geo, tile) => {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W / tile, uv.getY(i) * D / tile);
      return geo;
    };
    const floor = new THREE.Mesh(planeUV(new THREE.PlaneGeometry(W, D), 1.2), this.mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const ceil = new THREE.Mesh(planeUV(new THREE.PlaneGeometry(W, D), 1.2), this.mats.ceiling);
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
    // luminárias de embutir: caixa metálica, difusor recuado e duas aletas
    // parabólicas — o difusor mantém a mesma área emissiva de antes
    for (const [px, pz] of [[-6, -3], [6, -3], [-6, 3], [6, 3], [0, 0]]) {
      this._box(2.5, 0.05, 1.3, px, H - 0.025, pz, this.mats.metal, { collide: false, shadow: false });
      this._box(2.4, 0.03, 1.2, px, H - 0.055, pz, this.mats.lightPanel, { collide: false, shadow: false });
      for (const dz of [-0.4, 0.4]) {
        this._box(2.38, 0.035, 0.025, px, H - 0.085, pz + dz, this.mats.chrome, { collide: false, shadow: false });
      }
      this._box(0.025, 0.035, 1.18, px, H - 0.085, pz, this.mats.chrome, { collide: false, shadow: false });
    }

    // paredes blindam quase tudo
    this._box(W, H, 0.3, 0, H / 2, -D / 2, this.mats.wall, { shield: 0.05, uv: 1.2 });
    // A parede sul é segmentada ao redor da porta. Nas fases normais o colisor
    // próprio da folha mantém exatamente o bloqueio anterior; na evacuação ele
    // é desativado conforme a porta abre, criando uma passagem real.
    const doorX = 0.5, doorW = 1.1, doorH = 2.2;
    const leftW = doorX - doorW / 2 + W / 2;
    const rightW = W / 2 - (doorX + doorW / 2);
    this._box(leftW, H, 0.3, -W / 2 + leftW / 2, H / 2, D / 2, this.mats.wall, { shield: 0.05, uv: 1.2 });
    this._box(rightW, H, 0.3, doorX + doorW / 2 + rightW / 2, H / 2, D / 2, this.mats.wall, { shield: 0.05, uv: 1.2 });
    this._box(doorW, H - doorH, 0.3, doorX, doorH + (H - doorH) / 2, D / 2, this.mats.wall, { shield: 0.05, uv: 1.2 });
    this._box(0.3, H, D, -W / 2, H / 2, 0, this.mats.wall, { shield: 0.05, uv: 1.2 });
    this._box(0.3, H, D, W / 2, H / 2, 0, this.mats.wall, { shield: 0.05, uv: 1.2 });
    for (const [x, z, w, d] of [[0, -D / 2 + 0.18, W, 0.06], [-W / 2 + 0.18, 0, 0.06, D], [W / 2 - 0.18, 0, 0.06, D]]) {
      this._box(w, 0.9, d, x, 0.45, z, this.mats.wallAccent, { collide: false, uv: 1.2 });
    }
    this._box(leftW, 0.9, 0.06, -W / 2 + leftW / 2, 0.45, D / 2 - 0.18, this.mats.wallAccent, { collide: false, uv: 1.2 });
    this._box(rightW, 0.9, 0.06, doorX + doorW / 2 + rightW / 2, 0.45, D / 2 - 0.18, this.mats.wallAccent, { collide: false, uv: 1.2 });

    // divisória parcial: blindagem importante no meio da sala
    this._box(0.25, H, 6.5, 1.5, H / 2, -D / 2 + 3.25, this.mats.wall, { shield: 0.05, uv: 1.2 });

    this._buildBenches();
    this._buildScientificEquipment();
    this._buildCabinets();
    this._buildShelves();
    this._buildBarrels();
    this._buildCrates();
    this._buildBucket();
    this._buildDoor();
    // ambientação: sinalização, utilidades, tubulações e mobiliário extra
    new LabDecor(this, { W, D, H, doorX, doorW }).build();
    this._mergeStatic();

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

  // Lote estático: junta, por material, as malhas que nunca se movem (paredes,
  // pernas, frisos, sinalização...) em uma geometria só, já no espaço do
  // mundo. Reduz as chamadas de desenho sem mudar nada do que se vê.
  // Ficam de fora: objetos soltos, tampas, peças dentro de grupos móveis
  // (portas, gavetas, armários), malhas multimaterial, transparentes ou
  // marcadas como dinâmicas (ponteiros do relógio).
  _mergeStatic() {
    const lids = new Set(this.containers.map((c) => c.lid).filter(Boolean));
    const props = new Set(this.props);
    const candidates = [];
    const take = (mesh) => {
      if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.material.transparent) return;
      if (mesh.userData.dynamic || lids.has(mesh) || props.has(mesh)) return;
      candidates.push(mesh);
    };
    this.scene.updateMatrixWorld(true);
    for (const child of [...this.scene.children]) {
      if (child.isMesh) take(child);
      else if (child.userData.static) {
        child.traverse((o) => {
          if (o !== child && !o.isMesh && o.userData.dynamic) o.traverse((d) => { d.userData.dynamic = true; });
        });
        child.traverse((o) => { if (o.isMesh) take(o); });
      }
    }
    const batches = new Map();
    for (const mesh of candidates) {
      const key = `${mesh.material.uuid}|${mesh.castShadow}|${mesh.receiveShadow}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(mesh);
    }
    for (const list of batches.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        const g = m.geometry.index ? m.geometry.clone() : m.geometry.toNonIndexed();
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        }
        return g.applyMatrix4(m.matrixWorld);
      });
      if (geos.some((g) => !g.index) || geos.some((g) => !g.attributes.uv)) {
        geos.forEach((g) => g.dispose());
        continue;
      }
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const batch = new THREE.Mesh(merged, list[0].material);
      batch.castShadow = list[0].castShadow;
      batch.receiveShadow = list[0].receiveShadow;
      batch.matrixAutoUpdate = false;
      batch.name = 'lote estático';
      this.scene.add(batch);
      for (const m of list) m.removeFromParent();
    }
    // Dentro de grupos que se movem (gavetas, portas, objetos soltos), as
    // peças irmãs de mesmo material viram uma malha só no espaço do pai:
    // o conjunto continua se movendo junto, com menos chamadas de desenho.
    for (const child of this.scene.children) {
      if (child.isGroup && !child.userData.static) child.traverse((o) => { if (o.isGroup) this._mergeLocal(o); });
    }
  }

  _mergeLocal(parent) {
    const batches = new Map();
    for (const m of parent.children) {
      if (!m.isMesh || m.children.length || Array.isArray(m.material) || m.material.transparent || m.userData.dynamic) continue;
      if (!m.geometry.index || !m.geometry.attributes.uv) continue;
      const key = `${m.material.uuid}|${m.castShadow}|${m.receiveShadow}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(m);
    }
    for (const list of batches.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        m.updateMatrix();
        const g = m.geometry.clone();
        for (const name of Object.keys(g.attributes)) {
          if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        }
        return g.applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const batch = new THREE.Mesh(merged, list[0].material);
      batch.castShadow = list[0].castShadow;
      batch.receiveShadow = list[0].receiveShadow;
      parent.add(batch);
      for (const m of list) m.removeFromParent();
    }
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
      this._box(b.w, 0.08, b.d, b.x, 0.84, b.z, this.mats.tableTop, { collide: false, shield: 0.85, uv: 1 });
      // friso escuro de borda (pingadeira) 8 mm saliente sob o tampo
      this._box(b.w + 0.016, 0.045, b.d + 0.016, b.x, 0.8275, b.z, this.mats.dark, { collide: false });
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
        for (const [ox, oz] of legs) this._benchLeg(b.x + ox, b.z + oz);
        // quadro de travessas baixas ligando as pernas
        for (const s of [-1, 1]) {
          this._box(0.04, 0.04, 2 * insz, b.x + s * insx, 0.16, b.z, this.mats.metal, { collide: false });
          this._box(2 * insx, 0.04, 0.04, b.x, 0.16, b.z + s * insz, this.mats.metal, { collide: false });
        }
      } else if (b.dir !== 0) {
        // gabinete com 4 gavetas na metade esquerda + pernas na direita
        const cx = b.x - b.w * 0.25, cw = b.w * 0.46, cd = b.d - 0.3;
        this._box(cw, 0.76, cd, cx, 0.4, b.z, this.mats.benchBody, { collide: false, shield: 0.55, uv: 0.8 });
        // rodapé recuado escuro sob o gabinete (sombra de base)
        this._box(cw - 0.04, 0.03, cd - 0.04, cx, 0.012, b.z, this.mats.rubber, { collide: false });
        const frontZ = b.z + b.dir * (cd / 2);
        // Grade 2×2 com respiro largo e moldura escura: as quatro frentes
        // continuam grandes, mas agora cada gaveta é lida como peça separada.
        for (const [rowName, y] of [['superior', 0.61], ['inferior', 0.25]]) {
          for (const [colName, side] of [['esquerda', -1], ['direita', 1]]) {
            this._buildDrawer(`gaveta ${rowName} ${colName} da ${b.name}`,
              cx + b.dir * side * 0.34, y, frontZ - b.dir * 0.03, b.dir);
          }
        }
        const legX = b.x + b.w / 2 - 0.12, innerX = b.x + 0.1;
        for (const [lx, lz] of [
          [legX, b.z - b.d / 2 + 0.12], [legX, b.z + b.d / 2 - 0.12],
          [innerX, b.z - b.d / 2 + 0.12], [innerX, b.z + b.d / 2 - 0.12],
        ]) this._benchLeg(lx, lz);
        // travessas: laterais das pernas + barra de apoio para os pés no fundo
        for (const lx of [legX, innerX]) {
          this._box(0.04, 0.04, b.d - 0.24, lx, 0.16, b.z, this.mats.metal, { collide: false });
        }
        this._box(legX - innerX, 0.04, 0.04, (legX + innerX) / 2, 0.16, b.z - b.dir * (b.d / 2 - 0.12), this.mats.metal, { collide: false });
      } else {
        // bancada vertical: gabinete na metade sul + pernas ao norte
        const cz = b.z - b.d * 0.25;
        this._box(b.w - 0.3, 0.76, b.d * 0.46, b.x, 0.4, cz, this.mats.benchBody, { collide: false, shield: 0.55, uv: 0.8 });
        for (const [lx, lz] of [
          [b.x - b.w / 2 + 0.12, b.z + b.d / 2 - 0.12], [b.x + b.w / 2 - 0.12, b.z + b.d / 2 - 0.12],
          [b.x - b.w / 2 + 0.12, b.z + 0.1], [b.x + b.w / 2 - 0.12, b.z + 0.1],
        ]) this._benchLeg(lx, lz);
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

  // Perna de bancada: tubo quadrado com sapata niveladora de borracha.
  _benchLeg(x, z) {
    this._box(0.07, 0.77, 0.07, x, 0.415, z, this.mats.metal, { collide: false });
    if (!this._footGeo) this._footGeo = new THREE.CylinderGeometry(0.032, 0.038, 0.03, 10);
    const foot = new THREE.Mesh(this._footGeo, this.mats.rubber);
    foot.position.set(x, 0.015, z);
    foot.receiveShadow = true;
    this.scene.add(foot);
  }

  _buildMonitor(x, y, z, rotY) {
    const g = new THREE.Group();
    g.position.set(x, y, z); g.rotation.y = rotY;
    this.scene.add(g);
    // base elíptica, coluna metálica e articulação
    const base = this._equipMesh(g, new THREE.CylinderGeometry(0.12, 0.13, 0.016, 20), this.mats.dark, 0, 0.008, -0.03);
    base.scale.z = 0.72;
    this._part(g, 0.05, 0.2, 0.024, 0, 0.11, -0.05, this.mats.metal);    // coluna
    this._part(g, 0.09, 0.06, 0.03, 0, 0.27, -0.042, this.mats.dark);    // articulação
    this._part(g, 0.54, 0.34, 0.04, 0, 0.34, 0, this.mats.dark);         // moldura
    this._part(g, 0.42, 0.26, 0.035, 0, 0.335, -0.03, this.mats.dark);   // carcaça traseira
    this._part(g, 0.48, 0.28, 0.012, 0, 0.34, 0.022, this.mats.screen);  // tela
    this._part(g, 0.06, 0.008, 0.004, 0, 0.183, 0.0205, this.mats.metal); // logotipo
    this._part(g, 0.008, 0.008, 0.004, 0.24, 0.183, 0.0205, this.mats.led); // LED de energia
    // teclado e mouse são soltos: saem do grupo (mantendo a pose no mundo)
    // e viram objetos manipuláveis com F. Continuam caixas unitárias
    // escaladas (a física lê mesh.scale); só o visual muda.
    const kb = this._part(g, 0.38, 0.025, 0.14, 0, 0.013, 0.24, this.mats.dark);
    if (!this._kbMat) {
      this._kbMat = new THREE.MeshStandardMaterial({ map: this.tex.keyboard(), roughness: 0.75 });
    }
    // face superior (+y, índice 2) com as teclas
    kb.material = [this.mats.dark, this.mats.dark, this._kbMat, this.mats.dark, this.mats.dark, this.mats.dark];
    const mouse = new THREE.Mesh(this._mouseGeo, this.mats.dark);
    mouse.scale.set(0.05, 0.018, 0.08);
    mouse.position.set(0.28, 0.01, 0.24);
    mouse.castShadow = mouse.receiveShadow = true;
    g.add(mouse);
    g.updateMatrixWorld(true);
    this.scene.attach(kb);
    this.scene.attach(mouse);
    this.props.push(kb, mouse);
    g.userData.static = true; // o que sobra (tela, base, carcaça) nunca se move
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
    // cantoneiras de proteção e travas laterais
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) this._part(g, 0.03, 0.084, 0.03, sx * 0.17, 0.05, sz * 0.11, this.mats.chrome);
      this._part(g, 0.04, 0.022, 0.012, sx * 0.12, 0.11, 0.124, this.mats.chrome);
    }
    const hinge = new THREE.Group();
    hinge.position.set(0, 0.13, -0.12);
    g.add(hinge);
    this._part(hinge, 0.36, 0.03, 0.24, 0, 0.015, 0.12, this.mats.caseLid);
    // alça de transporte e selo de radiação na tampa (sobem junto ao abrir)
    this._part(hinge, 0.12, 0.016, 0.02, 0, 0.052, 0.2, this.mats.rubber);
    for (const sx of [-0.055, 0.055]) this._part(hinge, 0.014, 0.03, 0.02, sx, 0.04, 0.2, this.mats.rubber);
    const seal = new THREE.Mesh(new THREE.CircleGeometry(0.055, 24), this._radiationDecalMat());
    seal.rotation.x = -Math.PI / 2;
    seal.position.set(0, 0.0305, 0.1);
    hinge.add(seal);
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
    // puxador em barra com dois apoios + porta-etiqueta acima
    this._part(grp, 0.22, 0.02, 0.02, 0, -0.01, 0.145 * dirZ, this.mats.chrome);
    for (const px of [-0.09, 0.09]) this._part(grp, 0.018, 0.018, 0.03, px, -0.01, 0.131 * dirZ, this.mats.chrome);
    this._part(grp, 0.1, 0.032, 0.004, 0, 0.042, 0.1225 * dirZ, this.mats.metal);
    this._part(grp, 0.084, 0.02, 0.003, 0, 0.042, 0.1245 * dirZ, this.mats.labWhite);
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
  _buildCabinet(name, x, z, rotY, label = '') {
    const w = 1.1, h = 2.0, d = 0.65, t = 0.05;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    this.scene.add(g);

    this._partUV(g, w, h, t, 0, h / 2, -d / 2 + t / 2, this.mats.cabinet);          // fundo
    this._partUV(g, t, h, d, -w / 2 + t / 2, h / 2, 0, this.mats.cabinet);          // lateral esq.
    this._partUV(g, t, h, d, w / 2 - t / 2, h / 2, 0, this.mats.cabinet);           // lateral dir.
    this._partUV(g, w, t, d, 0, h - t / 2, 0, this.mats.cabinet);                   // topo
    this._partUV(g, w, t, d, 0, t / 2, 0, this.mats.cabinet);                       // base
    this._partUV(g, w - 2 * t, t, d - 2 * t, 0, 0.95, 0, this.mats.cabinetIn);      // prateleira
    // segunda prateleira alta e trilhos laterais que a sustentam
    this._partUV(g, w - 2 * t, 0.03, d - 2 * t - 0.04, 0, 1.5, -0.02, this.mats.cabinetIn);
    for (const sx of [-1, 1]) {
      for (const py of [0.92, 1.475]) this._part(g, 0.012, 0.02, d - 2 * t - 0.04, sx * (w / 2 - t - 0.006), py, -0.02, this.mats.metal);
    }

    // porta no batente esquerdo, abre para fora
    const hinge = new THREE.Group();
    hinge.position.set(-w / 2 + 0.02, 0, d / 2);
    g.add(hinge);
    const dw = w - 0.05;
    this._partUV(hinge, dw, h - 0.06, 0.04, dw / 2, h / 2, 0, this.mats.cabinetDoor);
    // almofada estampada (painel em relevo) nas metades superior e inferior
    for (const [py, ph] of [[1.42, 0.86], [0.52, 0.66]]) {
      this._partUV(hinge, dw - 0.16, ph, 0.008, dw / 2, py, 0.022, this.mats.cabinetDoor);
    }
    // venezianas de ventilação na almofada inferior
    for (let i = 0; i < 6; i++) {
      this._part(hinge, dw - 0.34, 0.014, 0.01, dw / 2, 0.47 - i * 0.034, 0.031, this.mats.cabinetIn);
    }
    // puxador em barra vertical com apoios + fechadura cilíndrica
    this._part(hinge, 0.022, 0.32, 0.022, w - 0.16, 1.15, 0.06, this.mats.chrome);
    for (const py of [1.01, 1.29]) this._part(hinge, 0.02, 0.02, 0.04, w - 0.16, py, 0.04, this.mats.chrome);
    this._equipMesh(hinge, new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), this.mats.chrome, w - 0.16, 1.37, 0.03, Math.PI / 2);
    // dobradiças aparentes no batente
    for (const py of [0.25, 1.0, 1.75]) {
      this._equipMesh(hinge, new THREE.CylinderGeometry(0.012, 0.012, 0.09, 8), this.mats.metal, -0.004, py, 0.024);
    }
    // placa de identificação no topo da porta
    if (label) {
      const plateMat = new THREE.MeshStandardMaterial({
        map: this.tex.drawn(`plate:${label}`, 256, 64, (c, cw, ch) => {
          c.fillStyle = '#e9edf0'; c.fillRect(0, 0, cw, ch);
          c.strokeStyle = '#1d2a36'; c.lineWidth = 6; c.strokeRect(4, 4, cw - 8, ch - 8);
          c.fillStyle = '#1d2a36';
          c.font = 'bold 34px "Segoe UI", Arial, sans-serif';
          c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(label, cw / 2, ch / 2 + 2);
        }),
        roughness: 0.5,
      });
      const plate = this._part(hinge, 0.34, 0.085, 0.004, dw / 2, 1.88, 0.0265, this.mats.metal);
      plate.material = [this.mats.metal, this.mats.metal, this.mats.metal, this.mats.metal, plateMat, this.mats.metal];
    }

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
    this._buildCabinet('armário oeste', -10.5, -2.5, Math.PI / 2, 'EPI');
    this._buildCabinet('armário norte', 3.2, -7.4, 0, 'REAGENTES');
    this._buildCabinet('armário leste', 10.5, 1.5, -Math.PI / 2, 'AMOSTRAS');
  }

  _buildShelves() {
    const shelves = [
      { x: -3.5, z: -7.5, w: 3, d: 0.6 },
      { x: 10.5, z: 5.5, w: 0.6, d: 3.4 },
    ];
    for (const s of shelves) {
      for (let i = 0; i < 4; i++) {
        const y = 0.35 + i * 0.6;
        this._box(s.w, 0.05, s.d, s.x, y, s.z, this.mats.shelf, { collide: false, uv: 0.6 });
        // abas dobradas da chapa sob as bordas longas (reforço da prateleira)
        const alongX = s.w > s.d;
        for (const side of [-1, 1]) {
          if (alongX) this._box(s.w - 0.02, 0.04, 0.012, s.x, y - 0.04, s.z + side * (s.d / 2 - 0.012), this.mats.shelf, { collide: false });
          else this._box(0.012, 0.04, s.d - 0.02, s.x + side * (s.w / 2 - 0.012), y - 0.04, s.z, this.mats.shelf, { collide: false });
        }
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
        this._box(0.1, 0.012, 0.1, s.x + px * (s.w / 2 - 0.05), 0.006, s.z + pz * (s.d / 2 - 0.05), this.mats.dark, { collide: false });
      }
      // contraventamento em X nas laterais curtas (tirantes finos)
      this._shelfBracing(s);
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

  // Tirantes em X entre cada par de prateleiras nas duas laterais curtas.
  _shelfBracing(s) {
    const alongX = s.w > s.d;
    const half = (alongX ? s.d : s.w) / 2 - 0.05;
    const endOff = (alongX ? s.w : s.d) / 2 - 0.05;
    for (const end of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y0 = 0.35 + i * 0.6 + 0.04, y1 = 0.35 + (i + 1) * 0.6 - 0.07;
        const len = Math.hypot(2 * half, y1 - y0), ang = Math.atan2(y1 - y0, 2 * half);
        const bay = new THREE.Group();
        bay.position.set(s.x + (alongX ? end * endOff : 0), (y0 + y1) / 2, s.z + (alongX ? 0 : end * endOff));
        bay.rotation.y = alongX ? Math.PI / 2 : 0;
        bay.userData.static = true;
        this.scene.add(bay);
        for (const sgn of [-1, 1]) {
          const rod = this._part(bay, len, 0.014, 0.006, 0, 0, sgn * 0.004, this.mats.metal);
          rod.rotation.z = sgn * ang;
          rod.castShadow = false;
        }
      }
    }
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
    // corpo torneado aberto em cima (oco por dentro, graças ao DoubleSide):
    // perfil de tambor de aço com frisos de rolagem fora da faixa dos selos
    // (0,35–0,65 m) e bordas dobradas. Raio máximo 0,356 m — dentro do collider.
    const profile = [
      [0.322, 0], [0.334, 0.012], [0.34, 0.03], [0.34, 0.255],
      [0.348, 0.27], [0.356, 0.29], [0.348, 0.31], [0.34, 0.325],
      [0.34, 0.675], [0.348, 0.69], [0.356, 0.71], [0.348, 0.73], [0.34, 0.745],
      [0.34, 0.86],
    ].map(([r, y]) => new THREE.Vector2(r, y - 0.43));
    const bodyGeo = new THREE.LatheGeometry(profile, 28);
    const bungGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.014, 12);
    const lidRingGeo = new THREE.TorusGeometry(0.33, 0.008, 6, 28);
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
      // detalhes da tampa (filhos: acompanham a física, que usa só a geometria
      // do cilindro): anel estampado e dois bujões rosqueados
      const lidRing = new THREE.Mesh(lidRingGeo, this.mats.metal);
      lidRing.rotation.x = Math.PI / 2;
      lidRing.position.y = 0.025;
      lid.add(lidRing);
      for (const [bx, bz, r] of [[0.2, 0.05, 0.035], [-0.21, -0.04, 0.024]]) {
        const bung = new THREE.Mesh(bungGeo, this.mats.dark);
        bung.position.set(bx, 0.031, bz);
        bung.scale.setScalar(r / 0.032);
        bung.scale.y = 1;
        lid.add(bung);
      }

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
      // UV na largura da caixa: cada face mostra as 4 tábuas inteiras
      const uv = c.w;
      this._box(c.w, t, c.w, c.x, y0 + t / 2, c.z, this.mats.crate, { collide: false, uv });
      this._box(c.w, c.h - t, t, c.x, y0 + t + (c.h - t) / 2, c.z + c.w / 2 - t / 2, this.mats.crate, { collide: false, uv });
      this._box(c.w, c.h - t, t, c.x, y0 + t + (c.h - t) / 2, c.z - c.w / 2 + t / 2, this.mats.crate, { collide: false, uv });
      this._box(t, c.h - t, c.w - 2 * t, c.x + c.w / 2 - t / 2, y0 + t + (c.h - t) / 2, c.z, this.mats.crate, { collide: false, uv });
      this._box(t, c.h - t, c.w - 2 * t, c.x - c.w / 2 + t / 2, y0 + t + (c.h - t) / 2, c.z, this.mats.crate, { collide: false, uv });
      // sarrafos horizontais nas quatro faces (entre os reforços de canto)
      // e estêncil de transporte em duas delas
      this._crateBattens(c, y0);
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

  _crateBattens(c, y0) {
    const out = c.w / 2 + 0.009, len = c.w - 0.13, bh = Math.min(0.09, c.h * 0.11);
    for (const fy of [0.2, 0.8]) {
      const y = y0 + c.h * fy;
      this._box(len, bh, 0.018, c.x, y, c.z + out, this.mats.crateEdge, { collide: false, uv: c.w });
      this._box(len, bh, 0.018, c.x, y, c.z - out, this.mats.crateEdge, { collide: false, uv: c.w });
      this._box(0.018, bh, len, c.x + out, y, c.z, this.mats.crateEdge, { collide: false, uv: c.w });
      this._box(0.018, bh, len, c.x - out, y, c.z, this.mats.crateEdge, { collide: false, uv: c.w });
    }
    if (!this._stencilMat) {
      const tex = this.tex.drawn('crate-stencil', 512, 256, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = 'rgba(28,26,24,0.82)';
        g.textAlign = 'center';
        g.font = 'bold 86px "Arial Black", Impact, sans-serif';
        g.fillText('LAB-07', w / 2, 100);
        g.font = 'bold 32px "Arial Black", Impact, sans-serif';
        g.fillText('MATERIAL DE CALIBRAÇÃO', w / 2, 158, w - 24);
        // setas "este lado para cima"
        for (const ax of [w / 2 - 50, w / 2 + 50]) {
          g.beginPath();
          g.moveTo(ax, 180); g.lineTo(ax + 22, 212); g.lineTo(ax + 8, 212); g.lineTo(ax + 8, 246);
          g.lineTo(ax - 8, 246); g.lineTo(ax - 8, 212); g.lineTo(ax - 22, 212); g.closePath();
          g.fill();
        }
      });
      this._stencilMat = new THREE.MeshStandardMaterial({
        map: tex, transparent: true, roughness: 0.9, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2,
      });
      this._stencilGeo = new THREE.PlaneGeometry(1, 0.5);
    }
    const sw = c.w * 0.7, sy = y0 + c.h * 0.5;
    for (const [px, pz, ry] of [[0, c.w / 2 + 0.002, 0], [c.w / 2 + 0.002, 0, Math.PI / 2]]) {
      const decal = new THREE.Mesh(this._stencilGeo, this._stencilMat);
      decal.scale.set(sw, sw, 1);
      decal.position.set(c.x + px, sy, c.z + pz);
      decal.rotation.y = ry;
      decal.receiveShadow = true;
      this.scene.add(decal);
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
      this._box(0.1, 2.15, 0.14, x + side * 0.5, 1.075, wallZ - 0.07, this.mats.cabinet, { collide: false, uv: 0.8 });
    }
    this._box(1.1, 0.1, 0.14, x, 2.2, wallZ - 0.07, this.mats.cabinet, { collide: false, uv: 0.8 });
    const hinge = new THREE.Group();
    hinge.position.set(x + 0.46, 0, wallZ - 0.1); // dobradiça na ombreira leste
    this.scene.add(hinge);
    this._partUV(hinge, 0.92, 2.16, 0.06, -0.46, 1.08, 0, this.mats.cabinetDoor);
    // maçaneta com espelho na borda livre (lado oposto à dobradiça)
    this._part(hinge, 0.05, 0.14, 0.02, -0.82, 1.05, -0.04, this.mats.dark);
    this._part(hinge, 0.12, 0.035, 0.035, -0.85, 1.05, -0.06, this.mats.metal);
    // visor de vidro aramado com moldura, chapa de chute e fechadura aérea
    if (!this._wiredGlassMat) {
      this._wiredGlassMat = new THREE.MeshStandardMaterial({
        map: this.tex.drawn('wired-glass', 128, 192, (g, w, h) => {
          const grad = g.createLinearGradient(0, 0, w, h);
          grad.addColorStop(0, '#2b3a44'); grad.addColorStop(0.5, '#3d515d'); grad.addColorStop(1, '#22303a');
          g.fillStyle = grad; g.fillRect(0, 0, w, h);
          g.strokeStyle = 'rgba(190,200,205,0.55)'; g.lineWidth = 1.5;
          for (let i = -h; i < w + h; i += 16) {
            g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
            g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
          }
        }),
        roughness: 0.12, metalness: 0.3,
      });
    }
    for (const sy of [-1, 1]) this._part(hinge, 0.32, 0.03, 0.075, -0.46, 1.62 + sy * 0.235, 0, this.mats.metal);
    for (const sx of [-1, 1]) this._part(hinge, 0.03, 0.44, 0.075, -0.46 + sx * 0.145, 1.62, 0, this.mats.metal);
    this._part(hinge, 0.26, 0.44, 0.066, -0.46, 1.62, 0, this._wiredGlassMat);
    this._part(hinge, 0.84, 0.24, 0.004, -0.46, 0.14, -0.032, this.mats.chrome);
    this._part(hinge, 0.26, 0.06, 0.07, -0.22, 2.1, -0.065, this.mats.dark);
    // dobradiças aparentes do lado da ombreira
    for (const py of [0.3, 1.1, 1.9]) {
      this._equipMesh(hinge, new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), this.mats.metal, 0.005, py, -0.03);
    }

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
