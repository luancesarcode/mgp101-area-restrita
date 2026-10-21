import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ShieldingModel } from '../radiation/ShieldingModel.js';
import { worldBoxGeometry } from './LabTextures.js';

// ==== PLANTBUILDER ==========================================================
// Mapa do modo Usina · Bloco 4: uma usina nuclear fictícia na noite seguinte
// à explosão do reator. Cena própria (a do laboratório fica intacta), com
// colliders, blindagem e zonas de contaminação próprios.
//
// Planta (vista de cima, +z = sul, onde o jogador começa):
//
//   z −26 ┌──────────────┬──────────────────────────┬──────────┐
//         │ sala de      │                          │ depósito │
//         │ bombas       ╡ salão do reator (aberto) │ (maciço) │
//   z −16 ├─────┤├──────┤      ◎ núcleo exposto    │          │
//         │ sala de      │                          │          │
//         │ controle     │                          │          │
//   z  −4 ├───┤├─────────┴─────┤├──────────────╡╞───┴──────────┤
//         │ corredor de serviço                                │
//   z   2 ├────────────────┤├────────────────────╡   ╞─────────┤
//         │ salão das turbinas   [T1]      [T2]   desabamento  │
//   z  12 └──────┤├─────────────┤    ├───────────────────────────┘
//                pátio · contêiner A · tenda · portão de evacuação
//   z  30 ─────────────────────────┤ portão ├─────────────────────
//        x −30                     x 0                      x 30

export const PLANT_BOUNDS = { minX: -42, maxX: 42, minZ: -32, maxZ: 31 };

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawTrefoil(g, cx, cy, R, color) {
  g.fillStyle = color;
  g.beginPath(); g.arc(cx, cy, R * 0.18, 0, Math.PI * 2); g.fill();
  for (const deg of [-150, -30, 90]) {
    const a = deg * Math.PI / 180, half = Math.PI / 6;
    g.beginPath();
    g.arc(cx, cy, R, a - half, a + half);
    g.arc(cx, cy, R * 0.3, a + half, a - half, true);
    g.closePath(); g.fill();
  }
}

function centerText(g, text, x, y, font, color) {
  g.font = font; g.fillStyle = color;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

// Textura radial suave para partículas (fogo, fumaça, aura).
function softDot(color) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PlantBuilder {
  constructor(textures) {
    this.tex = textures;
    this.scene = new THREE.Scene();
    this.static = new THREE.Group();
    this.scene.add(this.static);
    this.colliders = [];
    this.shielding = new ShieldingModel();
    this.rand = mulberry32(4242);
    this.animated = [];
    this.graphiteSpots = [];
    this.decoySpots = [];
    this.casks = [];
    this.zones = [];
    this.mapLabels = [];
    this._geos = new Map();
    this._initMaterials();
  }

  _initMaterials() {
    const T = this.tex;
    const n = (s) => new THREE.Vector2(s, s);
    const pbr = (set, normal, extra) => ({
      map: set.map, normalMap: set.normalMap, normalScale: n(normal), roughnessMap: set.roughnessMap, ...extra,
    });
    const Std = (o) => new THREE.MeshStandardMaterial(o);
    const conc = T.concrete(), scorch = T.scorchedFloor(), asph = T.asphalt(), rust = T.rust();
    const corr = T.corrugated(), graph = T.graphite(), brush = T.brushedMetal(), powder = T.powderCoat(), rub = T.rubber();
    const corium = T.drawn('plant-corium', 256, 256, (g, w) => {
      g.fillStyle = '#1a0a04'; g.fillRect(0, 0, w, w);
      const r = mulberry32(77);
      for (let i = 0; i < 70; i++) {
        g.strokeStyle = `rgba(255,${120 + (r() * 100) | 0},30,${0.5 + r() * 0.5})`;
        g.lineWidth = 1 + r() * 4;
        g.beginPath();
        let x = r() * w, y = r() * w;
        g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 50; y += (r() - 0.5) * 50; g.lineTo(x, y); }
        g.stroke();
      }
    });
    corium.wrapS = corium.wrapT = THREE.RepeatWrapping;
    this.m = {
      concrete: Std(pbr(conc, 1, { color: 0xb3afa6, roughness: 1 })),
      concreteDark: Std(pbr(conc, 1, { color: 0x7a766f, roughness: 1 })),
      concreteBurnt: Std(pbr(conc, 1, { color: 0x4f4a44, roughness: 1 })),
      floor: Std(pbr(scorch, 1, { color: 0xd6d0c4, roughness: 1 })),
      asphalt: Std(pbr(asph, 1, { roughness: 1 })),
      ground: Std({ color: 0x2a2a21, roughness: 1, normalMap: asph.normalMap, normalScale: n(0.6) }),
      rust: Std(pbr(rust, 1, { roughness: 1, metalness: 0.45 })),
      steel: Std(pbr(brush, 0.5, { color: 0x8d959b, roughness: 1, metalness: 0.7 })),
      darkSteel: Std(pbr(brush, 0.5, { color: 0x3d4247, roughness: 1, metalness: 0.75 })),
      turbine: Std(pbr(powder, 0.6, { color: 0x6c8a7b, roughness: 0.9, metalness: 0.45 })),
      yellow: Std(pbr(powder, 0.4, { color: 0xd9a21b, roughness: 0.8, metalness: 0.3 })),
      red: Std(pbr(powder, 0.4, { color: 0xa8241c, roughness: 0.6, metalness: 0.3 })),
      white: Std(pbr(powder, 0.3, { color: 0xd7dad4, roughness: 0.8 })),
      panel: Std(pbr(powder, 0.4, { color: 0x8f9a8a, roughness: 0.7, metalness: 0.3 })),
      corrugated: Std(pbr(corr, 0.8, { color: 0x8a9199, roughness: 1, metalness: 0.5, side: THREE.DoubleSide })),
      graphite: Std(pbr(graph, 0.8, { roughness: 1, metalness: 0.35 })),
      dark: Std(pbr(rub, 0.4, { color: 0x23262a, roughness: 0.8 })),
      canvas: Std(pbr(rub, 0.6, { color: 0xd8c27a, roughness: 1, side: THREE.DoubleSide })),
      glassDark: Std({ color: 0x0d141a, roughness: 0.15, metalness: 0.6 }),
      water: Std({ color: 0x17302e, roughness: 0.06, metalness: 0.3, transparent: true, opacity: 0.85 }),
      corium: Std({ color: 0x2a1206, emissive: 0xff7a26, emissiveIntensity: 2.4, emissiveMap: corium, map: corium, roughness: 0.6 }),
      emergency: Std({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 2.2 }),
      lampWarm: Std({ color: 0x332a10, emissive: 0xffd28a, emissiveIntensity: 1.8 }),
      lampCold: Std({ color: 0x1b2330, emissive: 0xcfe2ff, emissiveIntensity: 2.4 }),
      beaconOff: Std({ color: 0x0f2a12, emissive: 0x1f7a2e, emissiveIntensity: 0.25 }),
    };
    this.m.hotGraphite = Std(pbr(graph, 0.8, { roughness: 1, metalness: 0.35, emissive: 0xff5a1a, emissiveIntensity: 0, emissiveMap: corium }));
  }

  // ---- utilitários ---------------------------------------------------------

  _geo(w, h, d, tile) {
    const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${tile}`;
    if (!this._geos.has(key)) this._geos.set(key, worldBoxGeometry(w, h, d, tile));
    return this._geos.get(key);
  }

  // `tile: 0` usa UV 0..1 por face (texturas desenhadas, como painéis).
  box(w, h, d, x, y, z, mat, { collide = true, shield = 0, tile = 2, cast = true, parent = this.static, rot = null } = {}) {
    const mesh = new THREE.Mesh(tile ? this._geo(w, h, d, tile) : new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    if (collide || shield) {
      let b;
      if (rot) { mesh.updateMatrixWorld(true); b = new THREE.Box3().setFromObject(mesh); }
      else b = new THREE.Box3(new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2), new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2));
      if (collide) this.colliders.push(b);
      if (shield) this.shielding.add(b, shield);
    }
    return mesh;
  }

  mesh(geo, mat, x, y, z, { rot = null, scale = null, cast = true, parent = this.static } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    if (scale) m.scale.set(scale[0], scale[1], scale[2]);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  collider(minX, minY, minZ, maxX, maxY, maxZ, shield = 0) {
    const b = new THREE.Box3(new THREE.Vector3(minX, minY, minZ), new THREE.Vector3(maxX, maxY, maxZ));
    this.colliders.push(b);
    if (shield) this.shielding.add(b, shield);
    return b;
  }

  // Parede ao longo de X (em z), com vãos [x0, x1, altura do vão]. Acima de
  // cada vão fica a verga; `jag` acrescenta um topo quebrado.
  wallX(x0, x1, z, h, openings = [], { t = 0.6, mat = this.m.concrete, shield = 0.01, jag = 0 } = {}) {
    let cur = x0;
    for (const [a, b, oh] of [...openings].sort((p, q) => p[0] - q[0])) {
      if (a > cur) this.box(a - cur, h, t, (cur + a) / 2, h / 2, z, mat, { shield });
      if (oh < h) this.box(b - a, h - oh, t, (a + b) / 2, oh + (h - oh) / 2, z, mat, { shield });
      cur = b;
    }
    if (x1 > cur) this.box(x1 - cur, h, t, (cur + x1) / 2, h / 2, z, mat, { shield });
    if (jag) this._jagged(true, x0, x1, z, h, t, jag, mat, openings);
  }

  wallZ(z0, z1, x, h, openings = [], { t = 0.6, mat = this.m.concrete, shield = 0.01, jag = 0 } = {}) {
    let cur = z0;
    for (const [a, b, oh] of [...openings].sort((p, q) => p[0] - q[0])) {
      if (a > cur) this.box(t, h, a - cur, x, h / 2, (cur + a) / 2, mat, { shield });
      if (oh < h) this.box(t, h - oh, b - a, x, oh + (h - oh) / 2, (a + b) / 2, mat, { shield });
      cur = b;
    }
    if (z1 > cur) this.box(t, h, z1 - cur, x, h / 2, (cur + z1) / 2, mat, { shield });
    if (jag) this._jagged(false, z0, z1, x, h, t, jag, mat, openings);
  }

  // Topo quebrado: blocos irregulares acima da parede (só visual, alto demais
  // para o jogador alcançar). Vãos de altura total ficam sem topo.
  _jagged(alongX, a0, a1, c, h, t, jag, mat, openings) {
    for (let a = a0; a < a1;) {
      const w = 0.8 + this.rand() * 2.4, mid = Math.min(a1, a + w / 2 + 0.01);
      const inFullGap = openings.some(([o0, o1, oh]) => oh >= h && mid > o0 && mid < o1);
      const hh = this.rand() * jag;
      if (!inFullGap && hh > 0.3) {
        const ww = Math.min(w, a1 - a);
        if (alongX) this.box(ww, hh, t * 0.9, a + ww / 2, h + hh / 2, c, mat, { collide: false });
        else this.box(t * 0.9, hh, ww, c, h + hh / 2, a + ww / 2, mat, { collide: false });
      }
      a += w;
    }
  }

  // Monte de escombros: pedaços de concreto, ferragens e chapas. O collider
  // é a caixa interna do monte (dá para subir nos montes baixos).
  rubble(x, z, r, h, { collide = true, shield = 0.3, count = 0, burnt = false } = {}) {
    const n = count || Math.round(8 + r * r * 5);
    const mats = burnt ? [this.m.concreteBurnt, this.m.concreteDark, this.m.rust] : [this.m.concrete, this.m.concreteDark, this.m.concreteBurnt, this.m.rust];
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, d = Math.sqrt(this.rand()) * r;
      const fall = 1 - d / r;
      const s = 0.25 + this.rand() * (0.35 + h * 0.35) * (0.4 + fall);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const py = Math.max(s * 0.3, fall * h * (0.55 + this.rand() * 0.4));
      const mat = mats[(this.rand() * mats.length) | 0];
      this.box(s * (0.7 + this.rand()), s * (0.5 + this.rand() * 0.6), s * (0.7 + this.rand()), px, py, pz, mat, {
        collide: false, tile: 1, rot: [this.rand() * 1.2 - 0.6, this.rand() * Math.PI, this.rand() * 1.2 - 0.6],
      });
    }
    const rebar = new THREE.CylinderGeometry(0.014, 0.014, 1, 5);
    for (let i = 0; i < Math.round(r * 3); i++) {
      const a = this.rand() * Math.PI * 2, d = this.rand() * r * 0.8;
      const len = 0.8 + this.rand() * 1.6;
      this.mesh(rebar, this.m.rust, x + Math.cos(a) * d, h * 0.4 + len * 0.3, z + Math.sin(a) * d, {
        rot: [this.rand() * 1.6 - 0.8, 0, this.rand() * 1.6 - 0.8], scale: [1, len, 1], cast: false,
      });
    }
    const top = h * 0.72;
    if (collide && top > 0.25) this.collider(x - r * 0.68, 0, z - r * 0.68, x + r * 0.68, top, z + r * 0.68, shield);
    return top;
  }

  // Bloco de grafite candidato (alguns serão sorteados como ativos).
  graphite(x, y, z, zone, rotY = null) {
    this.graphiteSpots.push({ position: new THREE.Vector3(x, y + 0.125, z), zone, rotY: rotY ?? this.rand() * Math.PI });
  }

  zone(name, minX, maxX, minZ, maxZ, rate) {
    this.zones.push({ name, minX, maxX, minZ, maxZ, rate });
  }

  drawn(key, w, h, draw) { return this.tex.drawn(`plant-${key}`, w, h, draw); }

  // Placa plana (sem collider) virada para `ry`.
  sign(tex, w, h, x, y, z, ry, { emissive = 0 } = {}) {
    const mat = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.7,
      ...(emissive ? { emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive } : {}),
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    const m = this.mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z, { rot: [0, ry, 0], cast: false });
    return m;
  }

  // ---- construção ----------------------------------------------------------

  build() {
    this._zones();
    this._ground();
    this._buildingShell();
    this._yard();
    this._turbineHall();
    this._corridor();
    this._controlRoom();
    this._pumpRoom();
    this._reactorHall();
    this._distant();
    this._sky();
    this._lights();
    this._effects();
    this._batchStatic();
    return {
      scene: this.scene,
      colliders: this.colliders,
      shielding: this.shielding,
      zones: this.zones,
      graphiteSpots: this.graphiteSpots,
      decoySpots: this.decoySpots,
      casks: this.casks,
      core: this.core,
      startPos: new THREE.Vector3(0, 0, 27.6),
      extraction: { minX: -4, maxX: 4, minZ: 25.2, maxZ: 29.8 },
      beacon: this.beacon,
      graphiteMat: this.m.graphite,
      hotGraphiteMat: this.m.hotGraphite,
      animated: this.animated,
      bounds: PLANT_BOUNDS,
      mapLabels: this.mapLabels,
      coreLight: this.coreLight,
    };
  }

  // Fundo de contaminação por área (o primeiro retângulo que contém o ponto vale).
  _zones() {
    this.zone('salão do reator', -12, 22, -26, -4, 60);
    this.zone('sala de bombas', -30, -12, -26, -16, 9);
    this.zone('sala de controle', -30, -12, -16, -4, 5);
    this.zone('corredor de serviço', -30, 30, -4, 2, 14);
    this.zone('salão das turbinas (desabamento)', 14, 30, 2, 12, 28);
    this.zone('salão das turbinas', -30, 14, 2, 12, 7);
    this.zone('pátio junto ao prédio', -42, 42, 12, 17, 3);
    this.zone('pátio', -42, 42, 17, 31, 0.8);
    this.mapLabels.push(
      { text: 'REATOR', x: 5, z: -8 }, { text: 'BOMBAS', x: -21, z: -21 }, { text: 'CONTROLE', x: -21, z: -10 },
      { text: 'CORREDOR', x: 0, z: -1 }, { text: 'TURBINAS', x: -2, z: 7 }, { text: 'PÁTIO', x: -20, z: 26 },
    );
  }

  _ground() {
    const plane = (w, d, tile, mat, x, y, z) => {
      const geo = new THREE.PlaneGeometry(w, d);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
      const m = this.mesh(geo, mat, x, y, z, { rot: [-Math.PI / 2, 0, 0], cast: false });
      return m;
    };
    plane(600, 600, 6, this.m.ground, 0, -0.02, 0);
    plane(84, 19, 4, this.m.asphalt, 0, 0.004, 21.5);
    plane(60, 38, 3, this.m.floor, 0, 0.006, -7);
    // faixa pintada do caminho até o portão
    const lane = this.drawn('lane', 64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(225,190,60,0.75)';
      for (let y = 0; y < h; y += 64) g.fillRect(24, y, 16, 40);
    });
    lane.wrapT = THREE.RepeatWrapping;
    const laneMat = new THREE.MeshStandardMaterial({ map: lane, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    const lg = new THREE.PlaneGeometry(0.6, 13);
    const luv = lg.attributes.uv;
    for (let i = 0; i < luv.count; i++) luv.setY(i, luv.getY(i) * 3.2);
    this.mesh(lg, laneMat, 0, 0.01, 18.6, { rot: [-Math.PI / 2, 0, 0], cast: false });
  }

  // Paredes externas e internas do prédio principal.
  _buildingShell() {
    const c = this.m.concrete, burnt = this.m.concreteBurnt;
    // fachada sul (porta principal e porta lateral)
    this.wallX(-30, 30, 12, 9, [[-2, 2, 4.4], [-22, -20, 2.6]], { jag: 0 });
    // laterais externas
    this.wallZ(2, 12, -30, 9);
    this.wallZ(-26, 2, -30, 6.4);
    this.wallZ(2, 12, 30, 9, [], { jag: 0 });
    this.wallZ(-4, 2, 30, 6.4);
    // norte
    this.wallX(-30, -12, -26, 6.4);
    this.wallX(-12, 22, -26, 15, [], { mat: burnt, jag: 4 });
    // turbinas ↔ corredor (porta e brecha de explosão)
    this.wallX(-30, 30, 2, 9, [[-8, -6, 2.6], [14, 18, 9]], { jag: 0 });
    // corredor ↔ controle / reator
    this.wallX(-30, -12, -4, 6.3, [[-22, -20, 2.4]]);
    this.wallX(-12, 22, -4, 14, [[-2, 0, 2.6], [15, 17.6, 14]], { mat: burnt, jag: 4 });
    // controle ↔ bombas, controle/bombas ↔ reator, reator ↔ depósito
    this.wallX(-30, -12, -16, 6.3, [[-16, -14, 2.4]]);
    this.wallZ(-26, -4, -12, 14, [[-22.5, -20.5, 3]], { mat: burnt, jag: 4 });
    this.wallZ(-26, -4, 22, 13, [], { mat: burnt, jag: 4 });
    // depósito de combustível: bloco maciço e inacessível
    this.box(7.7, 10, 21.4, 26.15, 5, -15, this.m.concreteDark, { shield: 0.01, tile: 3 });

    // lajes de cobertura (sem collider; o teto das turbinas acaba no desabamento)
    this.box(44.6, 0.45, 10.6, -7.7, 9.22, 7, this.m.concreteDark, { collide: false, tile: 3 });
    this.box(60.6, 0.35, 6.6, 0, 6.15, -1, this.m.concreteDark, { collide: false, tile: 3 });
    // laje da sala de controle com um buraco aberto pela queda de destroços
    this.box(8.3, 0.3, 12.6, -26.15, 4.75, -10, this.m.concreteDark, { collide: false, tile: 3 });
    this.box(6.3, 0.3, 12.6, -15.15, 4.75, -10, this.m.concreteDark, { collide: false, tile: 3 });
    this.box(4, 0.3, 4.3, -20, 4.75, -14.15, this.m.concreteDark, { collide: false, tile: 3 });
    this.box(4, 0.3, 4.3, -20, 4.75, -5.85, this.m.concreteDark, { collide: false, tile: 3 });
    this.box(18.6, 0.35, 10.6, -21, 6.15, -21, this.m.concreteDark, { collide: false, tile: 3 });
    // treliças do teto das turbinas e trechos pendurados após o desabamento
    for (let x = -27; x <= 12; x += 6) this.box(0.35, 0.8, 10, x, 8.6, 7, this.m.rust, { collide: false });
    this.box(0.35, 0.8, 9, 17.5, 6.2, 8, this.m.rust, { collide: false, rot: [0, 0.2, 0.55] });
    this.box(6, 0.3, 4, 18.5, 5.6, 4.5, this.m.concreteBurnt, { collide: false, rot: [0.35, 0.1, -0.6] });
    this.box(0.35, 0.8, 9, 23.5, 4.4, 6, this.m.rust, { collide: false, rot: [0.4, -0.3, -0.25] });

    // fachada: chapas trapezoidais na parte alta e letreiro da unidade
    this.box(60.4, 3, 0.08, 0, 7.4, 12.34, this.m.corrugated, { collide: false, tile: 3 });
    const unit = this.drawn('unit4', 1024, 160, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      centerText(g, 'USINA NUCLEAR ARAUCÁRIA · UNIDADE 4', w / 2, h / 2 + 4, 'bold 64px "Arial Black", Arial, sans-serif', 'rgba(232,232,222,0.92)');
    });
    this.sign(unit, 16, 2.5, -6, 7.4, 12.4, 0);
    const turbSign = this.drawn('turb-sign', 512, 128, (g, w, h) => {
      g.fillStyle = '#20384a'; g.fillRect(0, 0, w, h);
      centerText(g, 'SALÃO DAS TURBINAS', w / 2, h / 2, 'bold 52px Arial, sans-serif', '#ffffff');
    });
    this.sign(turbSign, 3.2, 0.8, 0, 5, 12.32, 0);
  }

  _fence(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(z1 - z0, x1 - x0);
    const link = this.tex.chainLink();
    if (!this._fenceMat) {
      this._fenceMat = new THREE.MeshStandardMaterial({ map: link, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.6 });
    }
    const geo = new THREE.PlaneGeometry(len, 3);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 1.2, uv.getY(i) * 3 / 1.2);
    this.mesh(geo, this._fenceMat, (x0 + x1) / 2, 1.55, (z0 + z1) / 2, { rot: [0, -ang, 0] });
    const post = new THREE.CylinderGeometry(0.05, 0.05, 3.4, 8);
    const steps = Math.max(1, Math.round(len / 3));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.mesh(post, this.m.steel, x0 + (x1 - x0) * t, 1.7, z0 + (z1 - z0) * t);
    }
    const wire = new THREE.CylinderGeometry(0.008, 0.008, len, 4);
    wire.rotateZ(Math.PI / 2);
    for (const y of [3.15, 3.3]) this.mesh(wire, this.m.steel, (x0 + x1) / 2, y, (z0 + z1) / 2, { rot: [0, -ang, 0], cast: false });
    const minX = Math.min(x0, x1) - 0.1, maxX = Math.max(x0, x1) + 0.1, minZ = Math.min(z0, z1) - 0.1, maxZ = Math.max(z0, z1) + 0.1;
    this.collider(minX, 0, minZ, maxX, 4, maxZ);
  }

  _cask(x, z, label) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    this.static.add(g);
    this.box(2.4, 0.18, 2.4, 0, 0.09, 0, this.m.rust, { collide: false, parent: g });
    const body = new THREE.CylinderGeometry(0.85, 0.88, 1.6, 28);
    this.mesh(body, this.m.darkSteel, 0, 0.98, 0, { parent: g });
    const fin = new THREE.TorusGeometry(0.89, 0.035, 6, 28);
    for (const y of [0.35, 0.65, 1.3, 1.6]) this.mesh(fin, this.m.darkSteel, 0, y, 0, { rot: [Math.PI / 2, 0, 0], parent: g });
    const band = this.drawn('cask-band', 512, 96, (c, w, h) => {
      c.fillStyle = '#e3b21d'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) drawTrefoil(c, 64 + i * 128, h / 2, 34, '#141414');
    });
    band.wrapS = THREE.RepeatWrapping;
    this.mesh(new THREE.CylinderGeometry(0.886, 0.886, 0.3, 28, 1, true), new THREE.MeshStandardMaterial({ map: band, roughness: 0.6 }), 0, 0.98, 0, { parent: g, cast: false });
    // tampa animada (fica fora do lote estático)
    const lid = new THREE.Group();
    lid.position.set(x, 1.78, z);
    this.scene.add(lid);
    this.mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.16, 28), this.m.steel, 0, 0, 0, { parent: lid });
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      this.box(0.12, 0.18, 0.06, Math.cos(a) * 0.62, 0.15, Math.sin(a) * 0.62, this.m.yellow, { collide: false, parent: lid, rot: [0, -a, 0] });
    }
    const lamp = new THREE.MeshStandardMaterial({ color: 0x0b2a10, emissive: 0x39ff6a, emissiveIntensity: 0.6 });
    this.mesh(new THREE.SphereGeometry(0.07, 12, 8), lamp, 0, 0.12, 0, { parent: lid, cast: false });
    // placa em poste
    const plate = this.drawn(`cask-${label}`, 512, 256, (c, w, h) => {
      c.fillStyle = '#f2f0e6'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#1b5e2b'; c.fillRect(0, 0, w, 70);
      centerText(c, 'CONTÊINER BLINDADO', w / 2, 36, 'bold 40px Arial, sans-serif', '#ffffff');
      centerText(c, label, w / 2, 140, 'bold 110px "Arial Black", Arial, sans-serif', '#1b5e2b');
      centerText(c, 'Depositar fragmentos ativos aqui', w / 2, 222, 'bold 26px Arial, sans-serif', '#222');
    });
    this.mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), this.m.steel, 1.6, 1.1, 0.9, { parent: g });
    const s = this.sign(plate, 1.2, 0.6, 1.6, 2.0, 0.92, 0);
    g.add(s);
    s.position.set(1.6, 2.0, 0.93);
    this.collider(x - 1.05, 0, z - 1.05, x + 1.05, 2, z + 1.05, 0.001);
    this.casks.push({ name: `contêiner ${label}`, label, position: new THREE.Vector3(x, 1.1, z), lid, lamp, lidY: 1.78, count: 0, anim: 0 });
  }

  _yard() {
    // cerca e portão (o portão fica fechado: a evacuação é na faixa verde)
    this._fence(-40, 30.5, -3, 30.5);
    this._fence(3, 30.5, 40, 30.5);
    this._fence(-40, 12, -40, 30.5);
    this._fence(40, 12, 40, 30.5);
    this._fence(-40, 12.4, -30.3, 12.4);
    this._fence(30.3, 12.4, 40, 12.4);
    for (const s of [-1, 1]) {
      this.box(3, 2.8, 0.08, s * 1.5, 1.5, 30.5, this.m.steel, { collide: false, tile: 1 });
      this.box(0.12, 3.2, 0.12, s * 3, 1.6, 30.5, this.m.yellow, { collide: false });
    }
    this.collider(-3, 0, 30.3, 3, 4, 30.7);
    const excl = this.drawn('exclusion', 512, 256, (g, w, h) => {
      g.fillStyle = '#f2c618'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#141414'; g.fillRect(0, 0, w, 64);
      centerText(g, 'ZONA DE EXCLUSÃO', w / 2, 34, 'bold 44px "Arial Black", Arial, sans-serif', '#f2c618');
      drawTrefoil(g, 90, 160, 62, '#141414');
      centerText(g, 'ENTRADA', 320, 130, 'bold 52px Arial, sans-serif', '#141414');
      centerText(g, 'PROIBIDA', 320, 190, 'bold 52px Arial, sans-serif', '#141414');
    });
    this.sign(excl, 1.6, 0.8, -1.5, 1.7, 30.44, Math.PI);
    this.sign(excl, 1.6, 0.8, 1.5, 1.7, 30.56, 0);

    // ponto de evacuação: faixa pintada + farol que acende no fim da missão
    const evac = this.drawn('evac-floor', 512, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,220,110,0.85)'; g.lineWidth = 16; g.strokeRect(10, 10, w - 20, h - 20);
      centerText(g, 'PONTO DE', w / 2, 96, 'bold 64px "Arial Black", Arial, sans-serif', 'rgba(60,220,110,0.85)');
      centerText(g, 'EVACUAÇÃO', w / 2, 170, 'bold 64px "Arial Black", Arial, sans-serif', 'rgba(60,220,110,0.85)');
    });
    const evacMat = new THREE.MeshStandardMaterial({ map: evac, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
    this.mesh(new THREE.PlaneGeometry(8, 4), evacMat, 0, 0.012, 27.5, { rot: [-Math.PI / 2, 0, Math.PI], cast: false });
    this.mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), this.m.steel, 4.4, 1.5, 29.6);
    this.beacon = this.mesh(new THREE.SphereGeometry(0.22, 16, 10), this.m.beaconOff, 4.4, 3.15, 29.6, { parent: this.scene, cast: false });

    // ônibus de evacuação além do portão, com faróis
    const bus = new THREE.Group();
    bus.position.set(0, 0, 35);
    this.static.add(bus);
    this.box(11, 2.6, 2.6, 0, 1.75, 0, this.m.yellow, { collide: false, parent: bus });
    this.box(10.6, 0.8, 2.64, 0, 2.3, 0, this.m.glassDark, { collide: false, parent: bus });
    const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 16);
    wheel.rotateX(Math.PI / 2);
    for (const wx of [-3.6, 3.6]) for (const wz of [-1.3, 1.3]) this.mesh(wheel, this.m.dark, wx, 0.5, wz, { parent: bus });
    for (const wz of [-0.9, 0.9]) this.mesh(new THREE.SphereGeometry(0.16, 10, 8), this.m.lampCold, -5.52, 1.1, wz, { parent: bus, cast: false });

    // tenda de descontaminação
    const tx = -10, tz = 21.5;
    for (const s of [-1, 1]) this.box(6.2, 0.06, 2.4, tx, 1.75, tz + s * 0.95, this.m.canvas, { collide: false, rot: [s * 0.75, 0, 0] });
    this.box(6.2, 0.12, 0.12, tx, 2.55, tz, this.m.steel, { collide: false });
    this.collider(tx - 3.1, 0, tz - 1.9, tx + 3.1, 2.6, tz + 1.9);
    const decon = this.drawn('decon', 512, 128, (g, w, h) => {
      g.fillStyle = '#1b5e2b'; g.fillRect(0, 0, w, h);
      centerText(g, 'DESCONTAMINAÇÃO', w / 2, h / 2, 'bold 54px Arial, sans-serif', '#ffffff');
    });
    this.sign(decon, 2.4, 0.6, tx, 1.2, tz + 1.95, 0);
    for (const bx of [-8.2, -7.6]) this.mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 16), this.m.yellow, bx, 0.45, 23.9);

    // caminhão de bombeiros abandonado
    const truck = new THREE.Group();
    truck.position.set(-24, 0, 22);
    truck.rotation.y = 0.35;
    this.static.add(truck);
    this.box(7, 1.9, 2.5, 0.6, 1.55, 0, this.m.red, { collide: false, parent: truck });
    this.box(2.2, 2.2, 2.5, -3.6, 1.7, 0, this.m.red, { collide: false, parent: truck });
    this.box(0.1, 0.9, 2.2, -4.72, 2.1, 0, this.m.glassDark, { collide: false, parent: truck });
    this.box(6, 0.15, 0.5, 1, 2.75, 0, this.m.steel, { collide: false, parent: truck, rot: [0, 0, -0.06] });
    for (const wx of [-3.5, 1, 2.8]) for (const wz of [-1.25, 1.25]) this.mesh(wheel, this.m.dark, wx, 0.5, wz, { parent: truck });
    truck.updateMatrixWorld(true);
    const tb = new THREE.Box3().setFromObject(truck);
    this.colliders.push(tb);

    // torre de iluminação (o holofote é um SpotLight em _lights)
    this.mesh(new THREE.CylinderGeometry(0.12, 0.18, 9, 8), this.m.steel, 17, 4.5, 26);
    this.box(1.6, 0.8, 0.5, 17, 9.1, 25.8, this.m.dark, { collide: false });
    this.box(1.4, 0.6, 0.05, 17, 9.1, 25.53, this.m.lampCold, { collide: false, cast: false });
    this.collider(16.7, 0, 25.7, 17.3, 9, 26.3);

    // sacos de areia e barreiras de concreto
    for (let i = 0; i < 5; i++) this.box(1.4, 0.45, 0.6, 10 + i * 1.45, 0.25, 15.2, this.m.canvas, { collide: false, tile: 1, rot: [0, (this.rand() - 0.5) * 0.2, 0] });
    this.collider(9.2, 0, 14.8, 16.5, 0.5, 15.6);
    for (const [bx, bz, ry] of [[-15, 15, 0.1], [-18.5, 15.5, -0.2], [26, 18, 1.2]]) {
      this.box(3, 0.9, 0.6, bx, 0.45, bz, this.m.concrete, { tile: 1, rot: [0, ry, 0] });
    }
    // escombros arremessados pela explosão até o pátio
    this.rubble(21, 15.2, 2.2, 1.6, { burnt: true });
    this.rubble(27, 14.6, 1.4, 1.1);
    this.rubble(-28, 16, 1.2, 0.9);
    this.decoySpots.push(new THREE.Vector3(21, 0.6, 15.2), new THREE.Vector3(-28, 0.4, 16));

    this._cask(7.5, 21, 'A');
    // blocos de grafite candidatos no pátio
    this.graphite(-14, 0, 17, 'pátio');
    this.graphite(13.5, 0, 17.4, 'pátio');
    this.graphite(24.5, 0, 16.2, 'pátio');
    this.graphite(-31, 0, 20, 'pátio');
    this.graphite(4.2, 0, 14.4, 'pátio');
    this._fire(20.2, 13.4, 1.1, true);
  }

  _turbine(cx, damaged) {
    const z = 7, y = 3.1;
    this.box(15, 1.2, 4.4, cx, 0.6, z, this.m.concreteDark, { collide: false, tile: 2 });
    const seg = (dx, len, r, rz = 0, ry = 0) => {
      const geo = new THREE.CylinderGeometry(r, r, len, 28);
      geo.rotateZ(Math.PI / 2);
      return this.mesh(geo, this.m.turbine, cx + dx, y + (damaged ? rz * 0.6 : 0), z, { rot: [0, ry, rz] });
    };
    seg(-5.2, 3, 1.25, damaged ? 0.05 : 0);
    seg(-2, 3.6, 1.55, damaged ? -0.04 : 0, damaged ? 0.05 : 0);
    seg(1.8, 4, 1.75, damaged ? 0.12 : 0, damaged ? -0.08 : 0);
    // flanges e mancais
    const flange = new THREE.CylinderGeometry(1.9, 1.9, 0.18, 28);
    flange.rotateZ(Math.PI / 2);
    for (const dx of [-3.7, -0.2, 3.8]) this.mesh(flange, this.m.steel, cx + dx, y, z);
    for (const dx of [-6.8, 4.4]) this.box(0.8, 1.8, 2.2, cx + dx, 2.1, z, this.m.steel, { collide: false });
    // gerador
    if (!damaged) this.box(3.2, 2.6, 2.9, cx + 6, 2.5, z, this.m.turbine, { collide: false });
    else this.box(3.2, 1.4, 2.9, cx + 6, 1.9, z, this.m.concreteBurnt, { collide: false, rot: [0, 0.1, 0.12] });
    // tubulação de vapor subindo ao teto
    const pipe = new THREE.CylinderGeometry(0.45, 0.45, 5, 18);
    this.mesh(pipe, this.m.rust, cx - 2, 6.4, z, { rot: damaged ? [0.3, 0, 0.2] : null });
    // guarda-corpo do pedestal
    const rail = (x0, x1, zz) => this.box(x1 - x0, 0.05, 0.05, (x0 + x1) / 2, 2.25, zz, this.m.yellow, { collide: false });
    for (const zz of [z - 2.15, z + 2.15]) {
      rail(cx - 7.4, cx + 7.4, zz);
      for (let px = cx - 7.4; px <= cx + 7.4; px += 1.85) this.box(0.05, 1.05, 0.05, px, 1.72, zz, this.m.yellow, { collide: false });
    }
    this.collider(cx - 7.5, 0, z - 2.2, cx + 7.5, 4.9, z + 2.2, 0.25);
  }

  _turbineHall() {
    this._turbine(-12, false);
    this._turbine(8, true);
    // escombros do teto desabado na ponta leste
    this.rubble(20, 7, 2.4, 2.6, { burnt: true });
    this.rubble(26.5, 4.2, 1.8, 1.8);
    this.rubble(25, 10.2, 1.5, 1.2);
    this.rubble(17, 10.6, 1.1, 0.8);
    this.decoySpots.push(new THREE.Vector3(20, 1, 7), new THREE.Vector3(26.5, 0.7, 4.2));
    this._fire(25.2, 7.6, 1.3, true);
    // lâmpadas de emergência nas paredes
    for (const x of [-24, -8, 6]) this.box(0.5, 0.18, 0.12, x, 4.2, 11.62, this.m.lampWarm, { collide: false, cast: false });
    this._cask(-26.5, 7.2, 'B');
    // blocos de grafite candidatos
    this.graphite(-24, 0, 10.4, 'turbinas');
    this.graphite(-4, 0, 3.4, 'turbinas');
    this.graphite(17.5, 0, 9.3, 'turbinas');
    this.graphite(22.5, 0, 3.4, 'turbinas');
    this.graphite(28.3, 0, 8.6, 'turbinas');
    this.graphite(2.8, 0, 10.7, 'turbinas');
    // armários elétricos ao longo da parede sul
    for (let x = -18; x <= -6; x += 1.3) this.box(1.2, 2.1, 0.6, x, 1.05, 11.4, this.m.panel, { tile: 1, shield: 0 });
  }

  _corridor() {
    // tubulações e eletrocalha ao longo do teto
    for (const [zz, r, mat] of [[-3.2, 0.25, this.m.rust], [-2.6, 0.16, this.m.steel], [1.2, 0.2, this.m.turbine]]) {
      const g = new THREE.CylinderGeometry(r, r, 60, 14);
      g.rotateZ(Math.PI / 2);
      this.mesh(g, mat, 0, 5.3, zz, { cast: false });
    }
    for (let x = -26; x <= 26; x += 8) this.box(0.5, 0.18, 0.12, x, 3.6, 1.62, this.m.emergency, { collide: false, cast: false });
    const ctrl = this.drawn('sign-control', 512, 128, (g, w, h) => {
      g.fillStyle = '#20384a'; g.fillRect(0, 0, w, h);
      centerText(g, '← SALA DE CONTROLE', w / 2, h / 2, 'bold 46px Arial, sans-serif', '#ffffff');
    });
    this.sign(ctrl, 2.4, 0.6, -16, 3, -3.68, 0);
    const reactor = this.drawn('sign-reactor', 512, 256, (g, w, h) => {
      g.fillStyle = '#f2c618'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#141414'; g.fillRect(0, 0, w, 70);
      centerText(g, 'SALÃO DO REATOR', w / 2, 38, 'bold 46px "Arial Black", Arial, sans-serif', '#f2c618');
      drawTrefoil(g, 96, 164, 66, '#7a1f8f');
      centerText(g, 'PERIGO', 330, 140, 'bold 58px "Arial Black", Arial, sans-serif', '#141414');
      centerText(g, 'ACESSO PROIBIDO', 330, 200, 'bold 32px Arial, sans-serif', '#141414');
    });
    this.sign(reactor, 1.8, 0.9, -1, 3.4, -3.68, 0);
    this.sign(reactor, 1.8, 0.9, 12.5, 3.4, -3.68, 0);
    // porta arrancada caída no corredor e escombros da brecha
    this.box(1.1, 0.06, 2.2, 1.2, 0.05, -1.4, this.m.steel, { collide: false, rot: [0, 0.5, 0.05] });
    this.rubble(16.3, -2.8, 1.2, 1.0, { collide: false, burnt: true });
    this.rubble(16, 3.2, 1.3, 1.2, { collide: false, burnt: true });
    this.graphite(-25, 0, -1, 'corredor');
    this.graphite(8, 0, -2.6, 'corredor');
    this.graphite(25.5, 0, 0.2, 'corredor');
  }

  _controlRoom() {
    const mimic = this.drawn('mimic', 1024, 512, (g, w, h) => {
      g.fillStyle = '#7c8a78'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#3c463a'; g.fillRect(30, 30, w - 60, h - 60);
      const r = mulberry32(11);
      // mapa de canais do núcleo: círculo de lâmpadas (o painel icônico)
      for (let y = 0; y < 22; y++) for (let x = 0; x < 22; x++) {
        const dx = x - 10.5, dy = y - 10.5;
        if (dx * dx + dy * dy > 120) continue;
        const v = r();
        g.fillStyle = v > 0.86 ? '#ff3a24' : v > 0.7 ? '#ffd23a' : v > 0.3 ? '#efeee6' : '#28302a';
        g.beginPath(); g.arc(250 + dx * 19, h / 2 + dy * 19, 6.5, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 6; i++) {
        g.fillStyle = '#e9e6d8'; g.beginPath(); g.arc(560 + (i % 3) * 140, 150 + Math.floor(i / 3) * 190, 52, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#1a1a1a'; g.lineWidth = 5; g.beginPath();
        const a = r() * Math.PI * 1.6 - 0.8;
        g.moveTo(560 + (i % 3) * 140, 150 + Math.floor(i / 3) * 190);
        g.lineTo(560 + (i % 3) * 140 + Math.sin(a) * 44, 150 + Math.floor(i / 3) * 190 - Math.cos(a) * 44);
        g.stroke();
      }
    });
    const console_ = this.drawn('console', 512, 256, (g, w, h) => {
      g.fillStyle = '#8a9787'; g.fillRect(0, 0, w, h);
      const r = mulberry32(23);
      for (let y = 20; y < h - 20; y += 34) for (let x = 20; x < w - 20; x += 34) {
        const v = r();
        g.fillStyle = v > 0.8 ? '#c8261c' : v > 0.6 ? '#2c2f2b' : v > 0.45 ? '#e8c22a' : '#d9d6c8';
        g.fillRect(x, y, 20, 20);
      }
    });
    const front = (tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.08 });
    const mimicMat = front(mimic), consoleMat = front(console_);
    // painéis contra a parede sul da sala (z = −16) — a sala fica ao norte do corredor
    for (let x = -28.5; x <= -17; x += 3.6) { // a última posição liberaria a porta para as bombas
      const p = this.box(3.4, 2.6, 0.7, x, 1.3, -15.3, this.m.panel, { shield: 0.3, tile: 0 });
      p.material = [this.m.panel, this.m.panel, this.m.panel, this.m.panel, mimicMat, this.m.panel];
    }
    // mesa de operação em L
    for (const [w, d, x, z] of [[8, 1, -21, -10], [1, 4, -25.5, -8.5]]) {
      const desk = this.box(w, 0.9, d, x, 0.45, z, this.m.panel, { tile: 0 });
      desk.material = [this.m.panel, this.m.panel, consoleMat, this.m.panel, this.m.panel, this.m.panel];
    }
    // cadeiras tombadas e papéis espalhados
    for (const [x, z, r] of [[-19, -8.8, 0.4], [-22.5, -7.6, 1.9]]) {
      this.box(0.5, 0.08, 0.5, x, 0.5, z, this.m.dark, { collide: false, rot: [0, r, 0] });
      this.box(0.5, 0.6, 0.08, x, 0.8, z - 0.25, this.m.dark, { collide: false, rot: [0, r, 0] });
    }
    const paper = new THREE.PlaneGeometry(0.21, 0.3);
    for (let i = 0; i < 28; i++) {
      this.mesh(paper, this.m.white, -29 + this.rand() * 16, 0.012 + i * 0.0003, -14.5 + this.rand() * 10, { rot: [-Math.PI / 2, 0, this.rand() * 6], cast: false });
    }
    // buraco no teto com escombros (a laje foi feita em dois trechos)
    this.rubble(-20, -7.2, 1.3, 1.1, { burnt: true });
    // luz de alarme giratória
    this.alarmMesh = this.mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.26, 12), this.m.emergency, -21, 4.45, -5.2, { parent: this.scene, cast: false });
    this.graphite(-26, 0, -6.2, 'controle');
    this.graphite(-15.5, 0, -12.6, 'controle');
    this.decoySpots.push(new THREE.Vector3(-20, 0.5, -7.2));
  }

  _pumpRoom() {
    for (const x of [-27, -22, -17]) {
      this.box(2.2, 0.5, 1.8, x, 0.25, -21, this.m.concreteDark, { collide: false, tile: 1 });
      const motor = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 18);
      motor.rotateZ(Math.PI / 2);
      this.mesh(motor, this.m.turbine, x - 0.3, 1.1, -21);
      this.mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.6, 20), this.m.rust, x + 0.75, 1.0, -21, { rot: [Math.PI / 2, 0, 0] });
      this.mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.2, 12), this.m.rust, x + 0.75, 3.4, -21);
      this.collider(x - 1.1, 0, -21.9, x + 1.2, 1.8, -20.1, 0.4);
    }
    const header = new THREE.CylinderGeometry(0.35, 0.35, 18, 16);
    header.rotateZ(Math.PI / 2);
    this.mesh(header, this.m.rust, -21, 5.2, -21);
    this.mesh(header, this.m.steel, -21, 4.4, -25);
    // piso alagado
    const water = this.mesh(new THREE.PlaneGeometry(17.4, 9.4), this.m.water, -21, 0.05, -21, { rot: [-Math.PI / 2, 0, 0], cast: false, parent: this.scene });
    water.receiveShadow = true;
    this.box(0.5, 0.18, 0.12, -21, 3.6, -16.38, this.m.lampWarm, { collide: false, cast: false });
    this.graphite(-25, 0, -24.6, 'bombas');
    this.graphite(-14.5, 0, -24.4, 'bombas');
    this.graphite(-19.4, 0, -18.3, 'bombas');
    this.decoySpots.push(new THREE.Vector3(-13.5, 0.4, -21.5));
    this.rubble(-13.4, -21.5, 1.1, 1.0, { collide: false, burnt: true });
  }

  _reactorHall() {
    const cx = 5, cz = -15;
    this.core = new THREE.Vector3(cx, 1.2, cz);
    // borda do poço: anel de concreto rompido (collider alto demais para pular)
    const rim = new THREE.LatheGeometry([
      new THREE.Vector2(3.5, 0), new THREE.Vector2(5, 0), new THREE.Vector2(5, 0.9), new THREE.Vector2(4.6, 1.45), new THREE.Vector2(3.7, 1.3), new THREE.Vector2(3.5, 0.8),
    ], 36);
    this.mesh(rim, this.m.concreteBurnt, cx, 0, cz);
    for (let i = 0; i < 26; i++) {
      const a = this.rand() * Math.PI * 2, d = 4.2 + this.rand() * 1.6, s = 0.4 + this.rand() * 0.9;
      // sobre o anel até r = 5; fora dele, apoiados no chão
      const py = d < 4.9 ? 1.0 + this.rand() * 0.4 : s * 0.3;
      this.box(s, s * 0.7, s, cx + Math.cos(a) * d, py, cz + Math.sin(a) * d, this.m.concreteBurnt, {
        collide: false, tile: 1, rot: [this.rand(), this.rand() * 3, this.rand()],
      });
    }
    this.collider(cx - 5, 0, cz - 5, cx + 5, 1.45, cz + 5);
    // corium incandescente e pilhas de grafite rompidas dentro do poço
    this.mesh(new THREE.SphereGeometry(3.5, 32, 12), this.m.corium, cx, 0.2, cz, { scale: [1, 0.28, 1], cast: false });
    for (let i = 0; i < 40; i++) {
      const a = this.rand() * Math.PI * 2, d = Math.sqrt(this.rand()) * 3.1, hh = 0.4 + this.rand() * 2.2;
      this.box(0.26, hh, 0.26, cx + Math.cos(a) * d, hh / 2, cz + Math.sin(a) * d, this.m.graphite, {
        collide: false, tile: 0.5, rot: [(this.rand() - 0.5) * 0.6, this.rand(), (this.rand() - 0.5) * 0.6],
      });
    }
    // tampa do escudo biológico superior, tombada contra a parede norte
    const disc = new THREE.CylinderGeometry(4, 4, 0.9, 32);
    this.mesh(disc, this.m.rust, 13, 3.1, -23.6, { rot: [1.05, 0, 0.1] });
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2;
      this.mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), this.m.rust, 13 + Math.cos(a) * 3, 3.1 + Math.sin(a) * 1.4, -23.1 + Math.sin(a) * 0.4, { rot: [1.05, 0, 0.1], cast: false });
    }
    this.collider(9, 0, -26, 17, 5.8, -21.6, 0.02);
    // ponte rolante desabada em diagonal
    this.box(26, 1.1, 1.3, 1, 6.4, -18, this.m.yellow, { collide: false, rot: [0, 0.5, 0.42] });
    this.collider(10.5, 0, -14.2, 13.8, 1.6, -11.6);
    // pilares de aço nas paredes e trilhos da ponte rolante no alto
    for (let z = -24; z <= -6; z += 6) {
      this.box(0.5, 13, 0.5, -11.45, 6.5, z, this.m.rust, { collide: false });
      this.box(0.5, 12, 0.5, 21.45, 6, z, this.m.rust, { collide: false });
    }
    this.box(0.5, 0.7, 22, -11.4, 12.4, -15, this.m.rust, { collide: false });
    // tubulações de vapor arrancadas
    const p = new THREE.CylinderGeometry(0.4, 0.4, 7, 16);
    this.mesh(p, this.m.rust, -10, 4.5, -11, { rot: [0.2, 0, 0.35] });
    this.mesh(p, this.m.rust, -9.5, 3.5, -19, { rot: [-0.4, 0, 0.6] });
    // escombros que servem de abrigo da radiação do núcleo
    this.rubble(-1, -8.2, 1.9, 2.6, { shield: 0.12, burnt: true });
    this.rubble(-5, -15, 2.2, 3, { shield: 0.12, burnt: true });
    this.rubble(15.5, -7.6, 1.7, 2.3, { shield: 0.12, burnt: true });
    this.rubble(-6.5, -23.3, 1.6, 1.8, { shield: 0.15, burnt: true });
    this.rubble(19, -19, 1.8, 2.2, { shield: 0.15, burnt: true });
    this.decoySpots.push(new THREE.Vector3(-1, 1, -8.2), new THREE.Vector3(19, 1, -19), new THREE.Vector3(-6.5, 0.8, -23.3));
    this._fire(-3.4, -20.5, 1.2, true);
    this._fire(13.4, -10.6, 0.8, false);
    // fragmentos candidatos no salão do reator
    this.graphite(-7.4, 0, -10, 'reator');
    this.graphite(-9, 0, -21.4, 'reator');
    this.graphite(13.6, 0, -5.8, 'reator');
    this.graphite(19.8, 0, -23.8, 'reator');
    this.graphite(-2.2, 0, -17.6, 'reator');
    this.graphite(12.2, 0, -16.8, 'reator');
    this.graphite(3, 0, -6.4, 'reator');
  }

  // Silhuetas distantes: chaminé de ventilação, torres de resfriamento e
  // outras unidades da usina com algumas janelas acesas.
  _distant() {
    const stripes = this.drawn('stack', 64, 512, (g, w, h) => {
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#b8b2a8' : '#9a2a20'; g.fillRect(0, i * h / 8, w, h / 8); }
    });
    const stackMat = new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.9 });
    this.mesh(new THREE.CylinderGeometry(2, 3, 70, 20, 1, true), stackMat, 26, 35, -36);
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + Math.PI / 4;
      this.box(0.4, 62, 0.4, 26 + Math.cos(a) * 4.5, 31, -36 + Math.sin(a) * 4.5, this.m.steel, { collide: false, rot: [Math.sin(a) * 0.07, 0, -Math.cos(a) * 0.07] });
    }
    const tower = new THREE.LatheGeometry(Array.from({ length: 12 }, (_, i) => {
      const t = i / 11, y = t * 70;
      return new THREE.Vector2(26 - 14 * Math.sin(t * Math.PI * 0.8) + t * 6, y);
    }), 40);
    for (const [x, z] of [[-95, -70], [-150, -40]]) this.mesh(tower, this.m.concreteDark, x, 0, z, { cast: false });
    const windows = this.drawn('windows', 256, 128, (g, w, h) => {
      g.fillStyle = '#20232a'; g.fillRect(0, 0, w, h);
      const r = mulberry32(5);
      for (let y = 10; y < h; y += 20) for (let x = 8; x < w; x += 18) {
        g.fillStyle = r() > 0.9 ? '#f3d38a' : '#2c3038'; g.fillRect(x, y, 10, 10);
      }
    });
    const winMat = new THREE.MeshStandardMaterial({ map: windows, emissive: 0xffffff, emissiveMap: windows, emissiveIntensity: 0.5, roughness: 1 });
    for (const [x, z, w, h, d] of [[80, -50, 40, 22, 22], [-70, 40, 30, 14, 18], [90, 30, 26, 16, 20]]) {
      this.box(w, h, d, x, h / 2, z, winMat, { collide: false, tile: 12, cast: false });
    }
  }

  _sky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(450, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { uGlowDir: { value: new THREE.Vector3(0.05, 0.25, -1).normalize() } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 uGlowDir; varying vec3 vDir;
          void main(){
            float h = clamp(vDir.y, -0.1, 1.0);
            vec3 zenith = vec3(0.012, 0.016, 0.03);
            vec3 horizon = vec3(0.13, 0.075, 0.06);
            vec3 col = mix(horizon, zenith, pow(max(h, 0.0), 0.45));
            float glow = pow(max(dot(normalize(vDir), uGlowDir), 0.0), 10.0);
            col += vec3(0.55, 0.22, 0.08) * glow * 0.6;
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    sky.renderOrder = -1;
    this.scene.add(sky);
    const n = 700, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = this.rand() * Math.PI * 2, e = 0.15 + this.rand() * 1.35;
      pos.set([Math.cos(a) * Math.cos(e) * 420, Math.sin(e) * 420, Math.sin(a) * Math.cos(e) * 420], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xc9d4ff, size: 1.3, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.7 })));
    this.scene.background = new THREE.Color(0x05070d);
    this.scene.fog = new THREE.FogExp2(0x12110f, 0.011);
  }

  _lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x50608a, 0x1a140e, 0.9));
    const moon = new THREE.DirectionalLight(0xa9bce6, 0.9);
    moon.position.set(-30, 60, 40);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    Object.assign(moon.shadow.camera, { left: -46, right: 46, top: 40, bottom: -40, near: 1, far: 160 });
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.04;
    s.add(moon);
    this.coreLight = new THREE.PointLight(0xff8a3a, 260, 42, 1.7);
    this.coreLight.position.set(5, 3, -15);
    s.add(this.coreLight);
    const flood = new THREE.SpotLight(0xdfe8ff, 260, 60, 0.6, 0.5, 1.6);
    flood.position.set(17, 9, 25.4);
    flood.target.position.set(4, 0, 12);
    s.add(flood, flood.target);
    // luzes internas: emergência das turbinas, alarme da sala de controle, bombas
    const warm = new THREE.PointLight(0xffc27a, 9, 18, 1.8);
    warm.position.set(-8, 4, 10.5);
    s.add(warm);
    const alarm = new THREE.PointLight(0xff2a1a, 10, 14, 1.8);
    alarm.position.set(-21, 4, -6);
    s.add(alarm);
    const pump = new THREE.PointLight(0x9fe0c8, 6, 14, 1.8);
    pump.position.set(-21, 3.4, -18);
    s.add(pump);
    const corridor = new THREE.PointLight(0xff4a30, 6, 16, 1.8);
    corridor.position.set(6, 3.5, -1);
    s.add(corridor);
    this.animated.push({
      update: (dt, t) => {
        const k = 0.5 + 0.5 * Math.sin(t * 5.2);
        alarm.intensity = 2 + 12 * k * k;
        if (this.alarmMesh) this.alarmMesh.rotation.y = t * 5.2;
        corridor.intensity = 3 + 5 * (0.5 + 0.5 * Math.sin(t * 2.1));
        warm.intensity = Math.random() < 0.03 ? 1 : 9; // lâmpada de emergência falhando
        this.coreLight.intensity = 240 + 45 * Math.sin(t * 1.3) + 25 * Math.sin(t * 7.1);
      },
    });
  }

  // Fogo: partículas aditivas subindo e luz tremulante (opcional).
  _fire(x, z, size, withLight) {
    const n = Math.round(60 * size);
    const pos = new Float32Array(n * 3), seeds = [];
    for (let i = 0; i < n; i++) seeds.push({ a: Math.random() * 6.28, r: Math.random() * 0.6 * size, y: Math.random() * 1.6 * size, v: 0.8 + Math.random() * 1.2 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (!this._fireTex) this._fireTex = softDot('rgba(255,160,60,1)');
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      map: this._fireTex, color: 0xffa040, size: 0.9 * size, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    pts.position.set(x, 0, z);
    pts.frustumCulled = false;
    this.scene.add(pts);
    this.rubble(x, z, 0.7 * size, 0.5, { collide: false, burnt: true, count: 8 });
    let light = null;
    if (withLight) {
      light = new THREE.PointLight(0xff7a2a, 12 * size, 14, 1.8);
      light.position.set(x, 1.2, z);
      this.scene.add(light);
    }
    this.animated.push({
      update: (dt, t) => {
        const a = geo.attributes.position;
        for (let i = 0; i < n; i++) {
          const s = seeds[i];
          s.y += s.v * dt;
          if (s.y > 1.8 * size) { s.y = 0; s.r = Math.random() * 0.6 * size; }
          const k = 1 - s.y / (1.8 * size);
          a.setXYZ(i, Math.cos(s.a + t) * s.r * k, s.y, Math.sin(s.a + t) * s.r * k);
        }
        a.needsUpdate = true;
        if (light) light.intensity = 12 * size * (0.75 + 0.25 * Math.sin(t * 13 + x) + 0.15 * Math.sin(t * 29));
      },
    });
  }

  // Coluna de fumaça do núcleo, brilho ionizado azul e cinzas caindo.
  _effects() {
    // fumaça
    const n = 260, pos = new Float32Array(n * 3), seeds = [];
    for (let i = 0; i < n; i++) seeds.push({ y: Math.random() * 60, a: Math.random() * 6.28, r: Math.random() * 2.5 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const smoke = new THREE.Points(geo, new THREE.PointsMaterial({
      map: softDot('rgba(120,112,104,1)'), size: 9, transparent: true, opacity: 0.32, depthWrite: false, color: 0x8a8278,
    }));
    smoke.position.copy(this.core).setY(0);
    smoke.frustumCulled = false;
    this.scene.add(smoke);
    // brilho ionizado sobre o reator (coluna aditiva que some para cima)
    const grad = this.drawn('beam', 16, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x4f8dff, alphaMap: grad, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 70, 24, 1, true), beamMat);
    beam.position.set(this.core.x, 35 + 0.5, this.core.z);
    this.scene.add(beam);
    // cinzas e poeira caindo ao redor do jogador
    const an = 1400, apos = new Float32Array(an * 3);
    for (let i = 0; i < an; i++) apos.set([(Math.random() - 0.5) * 40, Math.random() * 14, (Math.random() - 0.5) * 40], i * 3);
    const ageo = new THREE.BufferGeometry();
    ageo.setAttribute('position', new THREE.BufferAttribute(apos, 3));
    const ash = new THREE.Points(ageo, new THREE.PointsMaterial({ color: 0xbdb6a8, size: 0.045, transparent: true, opacity: 0.75, depthWrite: false }));
    ash.frustumCulled = false;
    this.scene.add(ash);
    this.animated.push({
      update: (dt, t, cam) => {
        const a = geo.attributes.position;
        for (let i = 0; i < n; i++) {
          const s = seeds[i];
          s.y += (1.8 + s.r * 0.3) * dt;
          if (s.y > 60) { s.y = 0; s.r = Math.random() * 2.5; }
          const spread = s.r + s.y * 0.18;
          a.setXYZ(i, Math.cos(s.a + t * 0.05) * spread + s.y * 0.35, s.y, Math.sin(s.a + t * 0.05) * spread);
        }
        a.needsUpdate = true;
        beamMat.opacity = 0.18 + 0.05 * Math.sin(t * 0.9);
        if (cam) {
          ash.position.set(cam.x, 0, cam.z);
          const p = ageo.attributes.position;
          for (let i = 0; i < an; i++) {
            let y = p.getY(i) - (0.35 + (i % 7) * 0.05) * dt;
            if (y < 0) y += 14;
            p.setY(i, y);
            p.setX(i, p.getX(i) + Math.sin(t * 0.7 + i) * 0.12 * dt);
          }
          p.needsUpdate = true;
        }
      },
    });
  }

  // Lote estático: junta por material as malhas que nunca se movem.
  _batchStatic() {
    this.static.updateMatrixWorld(true);
    const batches = new Map();
    this.static.traverse((m) => {
      if (!m.isMesh || Array.isArray(m.material) || m.material.transparent) return;
      if (!m.geometry.index || !m.geometry.attributes.uv) return;
      const key = `${m.material.uuid}|${m.castShadow}`;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(m);
    });
    for (const list of batches.values()) {
      if (list.length < 2) continue;
      const geos = list.map((m) => {
        const g = m.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        return g.applyMatrix4(m.matrixWorld);
      });
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!merged) continue;
      const batch = new THREE.Mesh(merged, list[0].material);
      batch.castShadow = list[0].castShadow;
      batch.receiveShadow = true;
      batch.matrixAutoUpdate = false;
      this.scene.add(batch);
      for (const m of list) m.removeFromParent();
    }
  }
}
