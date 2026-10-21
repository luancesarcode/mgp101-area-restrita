import * as THREE from 'three';

// ==== LABDECOR ==============================================================
// Ambientação do laboratório: sinalização de segurança, utilidades de parede,
// tubulações e eletrocalha no teto, marcações no piso e mobiliário extra.
//
// Regras para não mexer na jogabilidade:
// - nenhum collider novo: tudo que fica na parede sai no máximo 0,30 m da
//   face (o jogador para a 0,32 m dela) ou fica acima da cabeça (> 2,2 m);
// - nenhuma blindagem nova e nenhum recipiente novo (a fonte e a chave da
//   evacuação continuam sorteadas só nos lugares de antes);
// - o mobiliário extra de piso (banquetas, lixeira, frascos) entra como objeto
//   solto com física, igual aos equipamentos das estantes.

const FACING = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };

// Trifólio de radiação desenhado direto no canvas (pás a 120°, uma para baixo).
function drawTrefoil(g, cx, cy, R, color) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(cx, cy, R * 0.18, 0, Math.PI * 2);
  g.fill();
  for (const deg of [-150, -30, 90]) {
    const a = deg * Math.PI / 180, half = Math.PI / 6;
    g.beginPath();
    g.arc(cx, cy, R, a - half, a + half);
    g.arc(cx, cy, R * 0.3, a + half, a - half, true);
    g.closePath();
    g.fill();
  }
}

function centerText(g, text, x, y, font, color) {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

export class LabDecor {
  constructor(lab, { W, D, H, doorX, doorW }) {
    this.lab = lab;
    this.scene = lab.scene;
    this.mats = lab.mats;
    this.tex = lab.tex;
    this.W = W; this.D = D; this.H = H;
    this.doorX = doorX; this.doorW = doorW;
    // faces internas das paredes (espessura 0,3 m) e da faixa de proteção
    this.face = { north: -D / 2 + 0.15, south: D / 2 - 0.15, west: -W / 2 + 0.15, east: W / 2 - 0.15 };
    this.accent = 0.06; // a faixa azul (até 0,9 m) avança 6 cm da parede

    const T = lab.tex;
    const rub = T.rubber(), powder = T.powderCoat();
    const n = (s) => new THREE.Vector2(s, s);
    this.m = {
      red: new THREE.MeshStandardMaterial({ color: 0xc4231c, roughness: 0.32, metalness: 0.2, normalMap: powder.normalMap, normalScale: n(0.2) }),
      green: new THREE.MeshStandardMaterial({ color: 0x1f8f4a, roughness: 0.45, metalness: 0.2, normalMap: powder.normalMap, normalScale: n(0.3) }),
      pipeBlue: new THREE.MeshStandardMaterial({ color: 0x2f5d8a, roughness: 0.5, metalness: 0.35, normalMap: powder.normalMap, normalScale: n(0.3) }),
      pipeGray: new THREE.MeshStandardMaterial({ color: 0x8a939c, roughness: 0.55, metalness: 0.5 }),
      cloth: new THREE.MeshStandardMaterial({ color: 0xf2f3f1, roughness: 1, normalMap: rub.normalMap, normalScale: n(0.6) }),
      plastic: new THREE.MeshStandardMaterial({ color: 0xf0f1ee, roughness: 0.45 }),
      vinyl: new THREE.MeshStandardMaterial({ color: 0x24303c, roughness: 0.55, normalMap: rub.normalMap, normalScale: n(0.5) }),
      binYellow: new THREE.MeshStandardMaterial({ color: 0xe8bd2a, roughness: 0.5, normalMap: powder.normalMap, normalScale: n(0.3) }),
    };
  }

  build() {
    this._baseboards();
    this._signage();
    this._whiteboard();
    this._evacuationMap();
    this._clock();
    this._fireExtinguisher();
    this._firstAidKit();
    this._electricalPanel();
    this._emergencyShower();
    this._coatRack();
    this._outlets();
    this._cableTray();
    this._eastPipes();
    this._ceilingFixtures();
    this._floorMarkings();
    this._benchReagentShelf();
    this._stools();
    this._wasteBin();
  }

  // ---- utilitários ---------------------------------------------------------

  _mesh(geo, mat, x, y, z, parent = this.scene, cast = false) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  _boxPart(parent, w, h, d, x, y, z, mat, cast = false) {
    const mesh = this._mesh(this.lab._boxGeo, mat, x, y, z, parent, cast);
    mesh.scale.set(w, h, d);
    return mesh;
  }

  // Grupo preso numa parede: o +z local aponta para dentro da sala.
  _onWall(wall, along, y, offset = 0) {
    const g = new THREE.Group();
    const f = this.face;
    if (wall === 'north') { g.position.set(along, y, f.north + offset); g.rotation.y = FACING['+z']; }
    if (wall === 'south') { g.position.set(along, y, f.south - offset); g.rotation.y = FACING['-z']; }
    if (wall === 'west') { g.position.set(f.west + offset, y, along); g.rotation.y = FACING['+x']; }
    if (wall === 'east') { g.position.set(f.east - offset, y, along); g.rotation.y = FACING['-x']; }
    g.userData.static = true; // entra no lote estático (LabBuilder._mergeStatic)
    this.scene.add(g);
    return g;
  }

  // Placa (caixa fina) com a textura só na face frontal (+z local).
  _plate(parent, w, h, d, tex, { body = this.m.plastic, emissive = 0, z = 0 } = {}) {
    const front = new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.5,
      ...(emissive ? { emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: emissive } : {}),
    });
    const mesh = this._boxPart(parent, w, h, d, 0, 0, z + d / 2, body);
    mesh.material = [body, body, body, body, front, body];
    return mesh;
  }

  _drawn(key, w, h, draw) {
    return this.tex.drawn(key, w, h, draw);
  }

  // ---- paredes -------------------------------------------------------------

  // Rodapé de borracha sobre a faixa azul, contornando paredes e divisória.
  _baseboards() {
    const f = this.face, a = this.accent, t = 0.014, h = 0.1, y = h / 2, mat = this.mats.rubber;
    const box = (w, d, x, z) => this.lab._box(w, h, d, x, y, z, mat, { collide: false, shadow: false, uv: 0.5 });
    const inner = this.W - 0.3 - 2 * a;
    box(inner, t, 0, f.north + a + t / 2);
    box(t, this.D - 0.3 - 2 * a, f.west + a + t / 2, 0);
    box(t, this.D - 0.3 - 2 * a, f.east - a - t / 2, 0);
    // parede sul: dois trechos, interrompidos pelo batente da porta
    const doorL = this.doorX - 0.55, doorR = this.doorX + 0.55;
    const left0 = f.west + a, right1 = f.east - a;
    box(doorL - left0, t, (left0 + doorL) / 2, f.south - a - t / 2);
    box(right1 - doorR, t, (doorR + right1) / 2, f.south - a - t / 2);
    // divisória (x = 1,5; z de −8 a −1,5; espessura 0,25)
    const dz0 = f.north, dz1 = -1.5, len = dz1 - dz0;
    box(t, len, 1.375 - t / 2, (dz0 + dz1) / 2);
    box(t, len, 1.625 + t / 2, (dz0 + dz1) / 2);
    box(0.25 + 2 * t, t, 1.5, dz1 + t / 2);
  }

  _signage() {
    const radTex = this._drawn('rad-sign', 384, 512, (g, w, h) => {
      g.fillStyle = '#f2c618'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#121212'; g.fillRect(0, 0, w, 96);
      g.lineWidth = 14; g.strokeStyle = '#121212'; g.strokeRect(7, 7, w - 14, h - 14);
      centerText(g, 'CUIDADO', w / 2, 52, 'bold 62px "Arial Black", Arial, sans-serif', '#f2c618');
      drawTrefoil(g, w / 2, 236, 112, '#7a1f8f'); // magenta tradicional do trifólio
      centerText(g, 'RADIAÇÃO', w / 2, 384, 'bold 50px "Arial Black", Arial, sans-serif', '#121212');
      centerText(g, 'ÁREA CONTROLADA', w / 2, 432, 'bold 36px Arial, sans-serif', '#121212');
      centerText(g, 'Acesso restrito a pessoal autorizado', w / 2, 476, '22px Arial, sans-serif', '#121212');
    });
    const exitTex = this._drawn('exit-sign', 512, 192, (g, w, h) => {
      g.fillStyle = '#0a8a3d'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      // porta e figura correndo (pictograma simplificado)
      g.fillRect(28, 28, 92, 136);
      g.fillStyle = '#0a8a3d'; g.fillRect(40, 40, 68, 124);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(170, 52, 16, 0, Math.PI * 2); g.fill();
      g.lineWidth = 16; g.lineCap = 'round'; g.strokeStyle = '#ffffff';
      g.beginPath(); g.moveTo(162, 76); g.lineTo(150, 118); g.lineTo(122, 150); g.stroke();
      g.beginPath(); g.moveTo(150, 118); g.lineTo(184, 132); g.lineTo(192, 166); g.stroke();
      g.beginPath(); g.moveTo(132, 98); g.lineTo(162, 82); g.lineTo(192, 104); g.stroke();
      centerText(g, 'SAÍDA', 370, 100, 'bold 92px "Arial Black", Arial, sans-serif', '#ffffff');
    });

    // sinal de saída iluminado sobre o batente da porta
    const exit = this._onWall('south', this.doorX, 2.48);
    this._plate(exit, 0.42, 0.16, 0.06, exitTex, { emissive: 0.85 });

    // placas de radiação: acima dos barris e nas duas faces da divisória
    this._plate(this._onWall('north', -0.8, 1.65), 0.42, 0.56, 0.008, radTex);
    for (const [x, facing] of [[1.375, '-x'], [1.625, '+x']]) {
      const g = new THREE.Group();
      g.position.set(x, 1.6, -4.5);
      g.rotation.y = FACING[facing];
      g.userData.static = true;
      this.scene.add(g);
      this._plate(g, 0.42, 0.56, 0.008, radTex);
    }

    // cartaz de proteção radiológica na parede sul
    const posterTex = this._drawn('poster-protecao', 384, 544, (g, w, h) => {
      g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1c4f7c'; g.fillRect(0, 0, w, 88);
      centerText(g, 'PROTEÇÃO', w / 2, 30, 'bold 34px "Arial Black", Arial, sans-serif', '#ffffff');
      centerText(g, 'RADIOLÓGICA', w / 2, 66, 'bold 34px "Arial Black", Arial, sans-serif', '#ffffff');
      const rows = [['TEMPO', 'Fique o mínimo necessário'], ['DISTÂNCIA', 'Dose cai com 1/d²'], ['BLINDAGEM', 'Chumbo, aço, concreto']];
      rows.forEach(([title, sub], i) => {
        const y = 120 + i * 128;
        g.fillStyle = '#e1e7ed'; g.fillRect(18, y, w - 36, 112);
        g.strokeStyle = '#1c4f7c'; g.lineWidth = 5;
        const ix = 74, iy = y + 56;
        if (i === 0) { // relógio
          g.beginPath(); g.arc(ix, iy, 36, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.moveTo(ix, iy); g.lineTo(ix, iy - 24); g.moveTo(ix, iy); g.lineTo(ix + 18, iy + 6); g.stroke();
        } else if (i === 1) { // fonte e pessoa afastada
          drawTrefoil(g, ix - 24, iy, 18, '#7a1f8f');
          g.beginPath(); g.moveTo(ix - 2, iy); g.lineTo(ix + 34, iy); g.stroke();
          g.beginPath(); g.moveTo(ix + 24, iy - 9); g.lineTo(ix + 36, iy); g.lineTo(ix + 24, iy + 9); g.stroke();
        } else { // parede de blindagem
          drawTrefoil(g, ix - 26, iy, 16, '#7a1f8f');
          g.fillStyle = '#5b6773'; g.fillRect(ix - 2, iy - 34, 16, 68);
          g.strokeStyle = '#1c4f7c'; g.beginPath(); g.moveTo(ix + 20, iy); g.lineTo(ix + 38, iy); g.stroke();
        }
        g.textAlign = 'left'; g.textBaseline = 'middle';
        g.fillStyle = '#12263a'; g.font = 'bold 30px "Arial Black", Arial, sans-serif';
        g.fillText(title, 130, y + 40);
        g.fillStyle = '#3a4a5a'; g.font = '20px Arial, sans-serif';
        g.fillText(sub, 130, y + 76);
      });
      centerText(g, 'Princípio ALARA', w / 2, 516, 'bold 24px Arial, sans-serif', '#1c4f7c');
    });
    this._plate(this._onWall('south', -2.6, 1.65), 0.62, 0.88, 0.006, posterTex);
  }

  // Quadro branco com anotações de aula, moldura de alumínio e porta-pincel.
  _whiteboard() {
    const tex = this._drawn('whiteboard', 1024, 512, (g, w, h) => {
      g.fillStyle = '#fbfcfd'; g.fillRect(0, 0, w, h);
      // marcas de apagador (fantasmas de anotações antigas)
      g.strokeStyle = 'rgba(120,130,150,0.07)'; g.lineWidth = 26; g.lineCap = 'round';
      for (const [x0, y0, x1, y1] of [[80, 420, 360, 400], [600, 90, 900, 120], [420, 300, 640, 330]]) {
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      const hand = '"Segoe Print", "Comic Sans MS", "Bradley Hand", cursive';
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillStyle = '#1d4fa3'; g.font = `bold 40px ${hand}`;
      g.fillText('Proteção radiológica — revisão', 40, 64);
      g.strokeStyle = '#1d4fa3'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(40, 76); g.lineTo(640, 80); g.stroke();
      g.fillStyle = '#1a1a1a'; g.font = `bold 46px ${hand}`;
      g.fillText('Ḋ = Ḋ₀ · (d₀ / d)²', 60, 150);
      g.font = `28px ${hand}`;
      g.fillText('dobrar a distância → ¼ da dose', 70, 196);
      // blindagem: setas atravessando camadas
      const lay = [['Pb', '#6d7782'], ['aço', '#9aa4ae'], ['concreto', '#c6c0b4']];
      lay.forEach(([name, col], i) => {
        const x = 120 + i * 80;
        g.fillStyle = col; g.fillRect(x, 250, 34, 150);
        g.fillStyle = '#1a1a1a'; g.font = `22px ${hand}`; g.fillText(name, x - 6, 430);
      });
      g.strokeStyle = '#c0251c';
      for (const [x0, x1, lw] of [[50, 118, 10], [156, 198, 6], [236, 278, 3.5], [316, 380, 1.8]]) {
        g.lineWidth = lw; g.beginPath(); g.moveTo(x0, 325); g.lineTo(x1, 325); g.stroke();
      }
      drawTrefoil(g, 470, 330, 46, '#c0251c');
      // gráfico de decaimento
      const ox = 620, oy = 420;
      g.strokeStyle = '#1a1a1a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(ox, 200); g.lineTo(ox, oy); g.lineTo(ox + 340, oy); g.stroke();
      g.strokeStyle = '#c0251c'; g.lineWidth = 4; g.beginPath();
      for (let i = 0; i <= 60; i++) {
        const t = i / 60, x = ox + t * 330, y = oy - 200 * Math.exp(-t * 3.2);
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.setLineDash([8, 8]); g.strokeStyle = '#1d4fa3'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(ox, oy - 100); g.lineTo(ox + 72, oy - 100); g.lineTo(ox + 72, oy); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#1d4fa3'; g.font = `26px ${hand}`;
      g.fillText('T½', ox + 58, oy + 34);
      g.fillStyle = '#c0251c'; g.fillText('A(t) = A₀·e^(−λt)', ox + 120, 240);
      g.fillStyle = '#1a1a1a'; g.font = `24px ${hand}`;
      g.fillText('Cs-137: T½ ≈ 30 anos', ox + 120, 280);
      g.fillText('Co-60: T½ ≈ 5,3 anos', ox + 120, 312);
      // checklist
      g.fillStyle = '#167a3c'; g.font = `bold 26px ${hand}`;
      g.fillText('☑ dosímetro no jaleco', 700, 60);
      g.fillText('☐ registrar leituras', 700, 100);
      g.fillText('☐ conferir blindagem', 700, 140);
    });
    const g = this._onWall('south', -5.5, 1.7);
    const bw = 2.4, bh = 1.2;
    const board = this._boxPart(g, bw, bh, 0.018, 0, 0, 0.009, this.m.plastic);
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.22, metalness: 0.02 });
    board.material = [this.m.plastic, this.m.plastic, this.m.plastic, this.m.plastic, face, this.m.plastic];
    for (const sy of [-1, 1]) this._boxPart(g, bw + 0.04, 0.03, 0.03, 0, sy * (bh / 2 + 0.005), 0.015, this.mats.chrome);
    for (const sx of [-1, 1]) this._boxPart(g, 0.03, bh + 0.04, 0.03, sx * (bw / 2 + 0.005), 0, 0.015, this.mats.chrome);
    // porta-pincel com pincéis e apagador
    this._boxPart(g, 1.6, 0.012, 0.07, 0, -bh / 2 - 0.03, 0.05, this.mats.chrome);
    this._boxPart(g, 1.6, 0.03, 0.008, 0, -bh / 2 - 0.02, 0.084, this.mats.chrome);
    const marker = new THREE.CylinderGeometry(0.009, 0.009, 0.13, 8);
    [[-0.3, 0x1d4fa3], [-0.12, 0xc0251c], [0.05, 0x1a1a1a]].forEach(([x, color]) => {
      const m = this._mesh(marker, new THREE.MeshStandardMaterial({ color, roughness: 0.4 }), x, -bh / 2 - 0.015, 0.05, g);
      m.rotation.z = Math.PI / 2;
    });
    this._boxPart(g, 0.14, 0.035, 0.05, 0.4, -bh / 2 - 0.005, 0.05, this.mats.dark);
  }

  // Planta de rota de fuga gerada a partir dos próprios colliders da sala.
  _evacuationMap() {
    const lab = this.lab;
    const furniture = lab.colliders.filter((b) => b !== lab.exitDoor?.collider && !b.hideOnMap &&
      (b.max.x - b.min.x) < 8 && (b.max.z - b.min.z) < 8 && (b.max.y - b.min.y) < 2.5);
    const here = { x: this.face.east, z: -4.6 };
    const tex = this._drawn('evac-map', 384, 512, (g, w, h) => {
      g.fillStyle = '#f7f8f4'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a8a3d'; g.fillRect(0, 0, w, 70);
      centerText(g, 'ROTA DE FUGA', w / 2, 36, 'bold 40px "Arial Black", Arial, sans-serif', '#ffffff');
      // quem olha a placa (parede leste) vê +z à direita e +x para cima
      const s = 17.5, cx = w / 2, cy = 70 + (h - 70) / 2 + 6;
      const px = (z) => cx + z * s, py = (x) => cy - x * s;
      g.fillStyle = '#ffffff'; g.fillRect(px(-8), py(11), 16 * s, 22 * s);
      g.fillStyle = '#9aa6b2';
      for (const b of furniture) {
        g.fillRect(px(b.min.z), py(b.max.x), (b.max.z - b.min.z) * s, (b.max.x - b.min.x) * s);
      }
      g.strokeStyle = '#1a1f26'; g.lineWidth = 6;
      g.strokeRect(px(-8), py(11), 16 * s, 22 * s);
      g.lineWidth = 5; g.beginPath(); g.moveTo(px(-8), py(1.5)); g.lineTo(px(-1.5), py(1.5)); g.stroke();
      // vão da porta (parede sul = borda direita) e seta de saída
      g.fillStyle = '#ffffff'; g.fillRect(px(8) - 4, py(this.doorX + 0.55), 8, 1.1 * s);
      g.strokeStyle = '#0a8a3d'; g.fillStyle = '#0a8a3d'; g.lineWidth = 7;
      g.beginPath(); g.moveTo(px(4), py(this.doorX)); g.lineTo(px(7.6), py(this.doorX)); g.stroke();
      g.beginPath(); g.moveTo(px(8.3), py(this.doorX)); g.lineTo(px(7.2), py(this.doorX) - 12); g.lineTo(px(7.2), py(this.doorX) + 12); g.fill();
      // você está aqui
      g.fillStyle = '#d42020';
      g.beginPath(); g.arc(px(here.z), py(here.x) + 8, 10, 0, Math.PI * 2); g.fill();
      g.textAlign = 'left'; g.font = 'bold 18px Arial, sans-serif';
      g.fillText('VOCÊ ESTÁ AQUI', px(here.z) + 16, py(here.x) + 14);
    });
    const g = this._onWall('east', here.z, 1.6);
    this._boxPart(g, 0.56, 0.74, 0.01, 0, 0, 0.005, this.mats.chrome);
    this._plate(g, 0.52, 0.7, 0.008, tex, { z: 0.008 });
  }

  // Relógio de parede com ponteiros reais (seguem a hora do computador).
  _clock() {
    const tex = this._drawn('clock-face', 256, 256, (g, w) => {
      const c = w / 2;
      g.fillStyle = '#fbfbf8'; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1a1a1a';
      for (let i = 0; i < 60; i++) {
        const a = i / 60 * Math.PI * 2, r0 = i % 5 === 0 ? c - 26 : c - 14;
        g.lineWidth = i % 5 === 0 ? 6 : 2;
        g.beginPath();
        g.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0);
        g.lineTo(c + Math.sin(a) * (c - 6), c - Math.cos(a) * (c - 6));
        g.stroke();
      }
      for (const [num, a] of [['12', 0], ['3', 90], ['6', 180], ['9', 270]]) {
        const r = c - 50, rad = a * Math.PI / 180;
        centerText(g, num, c + Math.sin(rad) * r, c - Math.cos(rad) * r + 2, 'bold 30px Arial, sans-serif', '#1a1a1a');
      }
      centerText(g, 'MGP · LAB', c, c + 44, 'bold 14px Arial, sans-serif', '#7a8590');
    });
    const g = this._onWall('west', 2.0, 2.4);
    const r = 0.16;
    this._mesh(new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.04, 32), this.mats.dark, 0, 0, 0.02, g).rotation.x = Math.PI / 2;
    const face = this._mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), 0, 0, 0.041, g);
    face.userData.dynamic = true; // mantém o onBeforeRender fora do lote estático
    const hand = (len, wid, color, z) => {
      const pivot = new THREE.Group();
      pivot.userData.dynamic = true;
      pivot.position.z = z;
      g.add(pivot);
      this._boxPart(pivot, wid, len, 0.003, 0, len / 2 - 0.02, 0, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
      return pivot;
    };
    const hH = hand(0.09, 0.012, 0x1a1a1a, 0.045), hM = hand(0.13, 0.008, 0x1a1a1a, 0.048), hS = hand(0.14, 0.003, 0xc0251c, 0.051);
    this._mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.012, 12), this.mats.dark, 0, 0, 0.05, g).rotation.x = Math.PI / 2;
    // atualiza os ponteiros só quando o relógio é desenhado (custo zero fora da tela)
    face.onBeforeRender = () => {
      const d = new Date();
      const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, hr = (d.getHours() % 12) + m / 60;
      hS.rotation.z = -s / 60 * Math.PI * 2;
      hM.rotation.z = -m / 60 * Math.PI * 2;
      hH.rotation.z = -hr / 12 * Math.PI * 2;
    };
  }

  // Extintor de CO₂/pó em suporte, com mangueira, manômetro e placa.
  _fireExtinguisher() {
    const g = this._onWall('south', -0.75, 0);
    const a = this.accent;
    const zc = a + 0.085, r = 0.075, bodyH = 0.42, y0 = 0.42;
    this._boxPart(g, 0.06, 0.34, 0.012, 0, y0 + 0.22, a + 0.006, this.mats.dark);           // suporte
    this._boxPart(g, 0.05, 0.03, 0.09, 0, y0 + 0.3, a + 0.05, this.mats.dark);
    this._mesh(new THREE.CylinderGeometry(r, r, bodyH, 24), this.m.red, 0, y0 + bodyH / 2, zc, g, true);
    const dome = this._mesh(new THREE.SphereGeometry(r, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.m.red, 0, y0 + bodyH, zc, g, true);
    dome.scale.y = 0.6;
    this._mesh(new THREE.CylinderGeometry(r + 0.001, r + 0.001, 0.11, 24), this.m.plastic, 0, y0 + 0.2, zc, g); // rótulo
    this._mesh(new THREE.CylinderGeometry(r * 0.9, r, 0.02, 24), this.mats.dark, 0, y0 + 0.01, zc, g);        // sapata
    this._mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.06, 12), this.mats.chrome, 0, y0 + bodyH + 0.07, zc, g);
    const lever = this._boxPart(g, 0.14, 0.014, 0.03, 0.02, y0 + bodyH + 0.11, zc, this.mats.dark);
    lever.rotation.z = -0.18;
    this._boxPart(g, 0.12, 0.012, 0.028, 0.015, y0 + bodyH + 0.085, zc, this.mats.dark);
    const gauge = this._mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16), this.m.plastic, -0.03, y0 + bodyH + 0.08, zc + 0.03, g);
    gauge.rotation.x = Math.PI / 2;
    const hose = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.03, y0 + bodyH + 0.08, zc + 0.01),
      new THREE.Vector3(0.1, y0 + bodyH, zc + 0.02),
      new THREE.Vector3(0.1, y0 + 0.2, zc + 0.03),
      new THREE.Vector3(0.085, y0 + 0.08, zc + 0.03),
    ]);
    this._mesh(new THREE.TubeGeometry(hose, 24, 0.011, 8, false), this.mats.rubber, 0, 0, 0, g);
    this._mesh(new THREE.CylinderGeometry(0.016, 0.012, 0.05, 10), this.mats.rubber, 0.085, y0 + 0.06, zc + 0.03, g);
    const sign = this._drawn('extinguisher-sign', 192, 256, (c, w, h) => {
      c.fillStyle = '#c4231c'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff';
      c.fillRect(78, 40, 36, 120); c.beginPath(); c.arc(96, 40, 18, Math.PI, 0); c.fill();
      c.fillRect(70, 30, 52, 10); c.fillRect(110, 24, 30, 8);
      centerText(c, 'EXTINTOR', w / 2, 206, 'bold 30px "Arial Black", Arial, sans-serif', '#ffffff');
    });
    const sg = this._onWall('south', -0.75, 1.3);
    this._plate(sg, 0.2, 0.27, 0.006, sign);
  }

  _firstAidKit() {
    const tex = this._drawn('first-aid', 256, 192, (g, w, h) => {
      g.fillStyle = '#f4f5f2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0a8a3d';
      g.fillRect(w / 2 - 22, 22, 44, 110); g.fillRect(w / 2 - 55, 55, 110, 44);
      centerText(g, 'PRIMEIROS SOCORROS', w / 2, 164, 'bold 22px Arial, sans-serif', '#0a8a3d');
    });
    const g = this._onWall('south', 1.75, 1.5);
    this._plate(g, 0.36, 0.28, 0.12, tex);
    this._boxPart(g, 0.06, 0.02, 0.02, 0.12, -0.08, 0.13, this.mats.chrome);
  }

  _electricalPanel() {
    const warn = this._drawn('elec-warn', 256, 224, (g, w) => {
      g.fillStyle = '#f2c618';
      g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w - 14, 150); g.lineTo(14, 150); g.closePath(); g.fill();
      g.lineWidth = 9; g.strokeStyle = '#121212'; g.stroke();
      g.fillStyle = '#121212';
      g.beginPath(); g.moveTo(140, 44); g.lineTo(104, 104); g.lineTo(128, 104); g.lineTo(112, 140); g.lineTo(156, 88); g.lineTo(132, 88); g.lineTo(150, 44); g.closePath(); g.fill();
      centerText(g, 'PERIGO', w / 2, 178, 'bold 34px "Arial Black", Arial, sans-serif', '#121212');
      centerText(g, 'ALTA TENSÃO', w / 2, 210, 'bold 24px Arial, sans-serif', '#121212');
    });
    const z = -1.6, y = 1.45, pw = 0.5, ph = 0.7, pd = 0.14;
    const g = this._onWall('east', z, y);
    const body = new THREE.MeshStandardMaterial({ color: 0x9ea6ad, roughness: 0.6, metalness: 0.4, normalMap: this.tex.powderCoat().normalMap });
    this._boxPart(g, pw, ph, pd, 0, 0, pd / 2, body, true);
    this._boxPart(g, pw - 0.04, ph - 0.04, 0.006, 0, 0, pd + 0.003, body);            // porta
    this._boxPart(g, 0.02, 0.1, 0.03, pw / 2 - 0.06, 0, pd + 0.015, this.mats.dark);  // fecho
    for (const py of [-0.25, 0.25]) this._boxPart(g, 0.014, 0.08, 0.016, -pw / 2 + 0.012, py, pd, this.mats.metal);
    const sticker = new THREE.Group();
    sticker.position.set(0, 0.15, pd + 0.006);
    g.add(sticker);
    this._plate(sticker, 0.18, 0.16, 0.002, warn, { body: this.m.binYellow });
    // eletroduto subindo até o teto
    this._mesh(new THREE.CylinderGeometry(0.025, 0.025, this.H - (y + ph / 2), 12), this.m.pipeGray, -0.12, (this.H - y - ph / 2) / 2 + ph / 2, 0.03, g);
  }

  // Chuveiro de emergência + lava-olhos na parede oeste.
  _emergencyShower() {
    const along = 5.4, a = this.accent;
    const g = this._onWall('west', along, 0);
    const pipe = this.m.green;
    const zp = a + 0.06;
    // prumada: do teto até o lava-olhos
    this._mesh(new THREE.CylinderGeometry(0.03, 0.03, this.H - 0.9, 14), pipe, 0.22, 0.9 + (this.H - 0.9) / 2, zp, g, true);
    // braço do chuveiro acima da cabeça, com crivo
    const arm = this._mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 12), pipe, 0.22, 2.38, zp + 0.25, g, true);
    arm.rotation.x = Math.PI / 2;
    this._mesh(new THREE.CylinderGeometry(0.03, 0.13, 0.09, 20), this.m.binYellow, 0.22, 2.3, zp + 0.5, g, true);
    // haste de acionamento com triângulo
    this._mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 6), this.mats.chrome, 0.22, 2.12, zp + 0.36, g);
    const tri = this._mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 3), this.m.green, 0.22, 1.84, zp + 0.36, g);
    tri.rotation.z = Math.PI / 2;
    // lava-olhos: ramal, bacia rasa e pá de acionamento
    const branch = this._mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.42, 12), pipe, 0.01, 0.9, zp, g);
    branch.rotation.z = Math.PI / 2;
    this._mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 12), pipe, -0.2, 0.92, zp + 0.04, g).rotation.x = Math.PI / 2;
    const bowl = new THREE.LatheGeometry([
      new THREE.Vector2(0.02, -0.06), new THREE.Vector2(0.06, -0.05), new THREE.Vector2(0.1, -0.02), new THREE.Vector2(0.11, 0.02),
    ], 24);
    const bowlMat = new THREE.MeshStandardMaterial({ color: 0xe8bd2a, roughness: 0.4, side: THREE.DoubleSide });
    this._mesh(bowl, bowlMat, -0.2, 1.0, a + 0.19, g, true);
    for (const sx of [-0.035, 0.035]) this._mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.03, 10), this.m.green, -0.2 + sx, 0.995, a + 0.19, g);
    this._boxPart(g, 0.12, 0.08, 0.008, -0.2, 0.93, a + 0.3, this.m.green);
    const sign = this._drawn('shower-sign', 256, 320, (c, w, h) => {
      c.fillStyle = '#0a8a3d'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#ffffff'; c.strokeStyle = '#ffffff'; c.lineWidth = 10; c.lineCap = 'round';
      c.beginPath(); c.arc(w / 2, 70, 18, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.moveTo(w / 2, 96); c.lineTo(w / 2, 170); c.moveTo(w / 2 - 34, 120); c.lineTo(w / 2 + 34, 120);
      c.moveTo(w / 2, 170); c.lineTo(w / 2 - 24, 214); c.moveTo(w / 2, 170); c.lineTo(w / 2 + 24, 214); c.stroke();
      c.lineWidth = 4;
      for (const dx of [-40, -20, 0, 20, 40]) { c.beginPath(); c.moveTo(w / 2 + dx, 22); c.lineTo(w / 2 + dx * 1.3, 44); c.stroke(); }
      centerText(c, 'CHUVEIRO DE', w / 2, 250, 'bold 26px Arial, sans-serif', '#ffffff');
      centerText(c, 'EMERGÊNCIA', w / 2, 280, 'bold 26px Arial, sans-serif', '#ffffff');
    });
    const sg = this._onWall('west', along - 0.2, 1.55);
    this._plate(sg, 0.24, 0.3, 0.006, sign);
  }

  // Cabideiro com dois jalecos e dosímetro de lapela.
  _coatRack() {
    const along = -4.6;
    const g = this._onWall('west', along, 1.82);
    this._boxPart(g, 1.0, 0.07, 0.022, 0, 0, 0.011, this.mats.crateEdge, true);
    const hookGeo = new THREE.TorusGeometry(0.025, 0.006, 6, 10, Math.PI);
    for (const x of [-0.32, 0, 0.32]) {
      this._boxPart(g, 0.012, 0.012, 0.06, x, 0, 0.05, this.mats.chrome);
      const hk = this._mesh(hookGeo, this.mats.chrome, x, -0.02, 0.075, g);
      hk.rotation.set(0, Math.PI / 2, Math.PI);
    }
    for (const x of [-0.32, 0.32]) this._labCoat(g, x, x > 0);
  }

  _labCoat(parent, x, withBadge) {
    const c = new THREE.Group();
    c.position.set(x, -0.05, 0.11);
    parent.add(c);
    const cloth = this.m.cloth;
    // ombros arredondados + corpo levemente afunilado
    const sh = this._mesh(new THREE.CapsuleGeometry(0.055, 0.26, 4, 10), cloth, 0, -0.06, 0, c, true);
    sh.rotation.z = Math.PI / 2;
    // tronco: pirâmide de 4 lados girada 45° na própria geometria (vira um
    // trapézio frontal) e achatada em profundidade
    const torsoGeo = new THREE.CylinderGeometry(0.2, 0.23, 0.9, 4, 1);
    torsoGeo.rotateY(Math.PI / 4);
    const torso = this._mesh(torsoGeo, cloth, 0, -0.5, 0, c, true);
    torso.scale.set(1, 1, 0.32);
    for (const s of [-1, 1]) {
      const sleeve = this._mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.62, 10), cloth, s * 0.2, -0.38, 0.01, c, true);
      sleeve.rotation.z = s * 0.08;
    }
    // gola em V e botões
    for (const s of [-1, 1]) {
      const lap = this._boxPart(c, 0.025, 0.2, 0.012, s * 0.035, -0.16, 0.075, this.m.cloth);
      lap.rotation.z = s * 0.28;
    }
    for (let i = 0; i < 4; i++) this._mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 8), this.mats.labWhite, 0, -0.32 - i * 0.14, 0.075, c).rotation.x = Math.PI / 2;
    this._boxPart(c, 0.12, 0.004, 0.01, 0.1, -0.7, 0.075, this.mats.cabinetIn);
    if (withBadge) {
      this._boxPart(c, 0.04, 0.055, 0.01, -0.09, -0.24, 0.08, this.m.binYellow);
      this._boxPart(c, 0.028, 0.02, 0.012, -0.09, -0.23, 0.083, this.mats.dark);
    }
  }

  _outlets() {
    const plateGeo = this.lab._boxGeo;
    const mk = (wall, along, y) => {
      const g = this._onWall(wall, along, y);
      const p = this._mesh(plateGeo, this.m.plastic, 0, 0, 0.004, g);
      p.scale.set(0.08, 0.12, 0.008);
      for (const sy of [-0.025, 0.025]) {
        const hole = this._mesh(plateGeo, this.mats.dark, 0, sy, 0.0085, g);
        hole.scale.set(0.035, 0.035, 0.002);
      }
    };
    mk('west', 0.6, 1.05); mk('west', 3.6, 1.05);
    mk('north', -9.9, 1.05); mk('north', 8.9, 1.05);
    mk('south', 5.0, 1.05);
    // interruptor ao lado da porta
    const sw = this._onWall('south', this.doorX - 0.85, 1.2);
    this._boxPart(sw, 0.08, 0.12, 0.01, 0, 0, 0.005, this.m.plastic);
    this._boxPart(sw, 0.025, 0.045, 0.008, 0, 0, 0.012, this.mats.labWhite);
  }

  // ---- teto ----------------------------------------------------------------

  // Eletrocalha perfurada ao longo da parede norte, com cabos e tirantes.
  _cableTray() {
    const y = 2.82, z = this.face.north + 0.22, tw = 0.3;
    const runs = [[this.face.west + 0.05, 1.3], [1.7, this.face.east - 0.05]];
    const cableMats = [0x2b2f36, 0x24518a, 0xc4231c].map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    for (const [x0, x1] of runs) {
      const len = x1 - x0, cx = (x0 + x1) / 2;
      this.lab._box(len, 0.008, tw, cx, y, z, this.mats.metal, { collide: false, shadow: false, uv: 0.5 });
      for (const s of [-1, 1]) this.lab._box(len, 0.06, 0.008, cx, y + 0.03, z + s * tw / 2, this.mats.metal, { collide: false, shadow: false, uv: 0.5 });
      cableMats.forEach((mat, i) => {
        const cable = this._mesh(new THREE.CylinderGeometry(0.014 + i * 0.003, 0.014 + i * 0.003, len, 8), mat, cx, y + 0.02 + i * 0.004, z - 0.08 + i * 0.07);
        cable.rotation.z = Math.PI / 2;
      });
      for (let x = x0 + 0.4; x < x1; x += 1.6) {
        for (const s of [-1, 1]) this._mesh(new THREE.CylinderGeometry(0.005, 0.005, this.H - y, 6), this.mats.metal, x, y + (this.H - y) / 2, z + s * (tw / 2 + 0.01));
        this.lab._box(0.03, 0.02, tw + 0.06, x, y - 0.014, z, this.mats.metal, { collide: false, shadow: false });
      }
    }
  }

  // Duas linhas de tubulação na parede leste, com abraçadeiras e registro.
  _eastPipes() {
    const len = this.D - 0.3, lines = [
      { x: this.face.east - 0.12, y: 2.92, r: 0.05, mat: this.m.pipeBlue },
      { x: this.face.east - 0.3, y: 2.86, r: 0.032, mat: this.m.pipeGray },
    ];
    for (const p of lines) {
      const pipe = this._mesh(new THREE.CylinderGeometry(p.r, p.r, len, 16), p.mat, p.x, p.y, 0, this.scene, true);
      pipe.rotation.x = Math.PI / 2;
      for (let z = -6.5; z <= 6.5; z += 2.6) {
        const ring = this._mesh(new THREE.TorusGeometry(p.r + 0.006, 0.007, 6, 16), this.mats.metal, p.x, p.y, z);
        ring.rotation.y = Math.PI / 2;
        this._mesh(new THREE.CylinderGeometry(0.006, 0.006, this.H - p.y, 6), this.mats.metal, p.x, p.y + (this.H - p.y) / 2, z);
      }
      // flanges de emenda
      for (const z of [-3.9, 3.9]) {
        const fl = this._mesh(new THREE.CylinderGeometry(p.r + 0.022, p.r + 0.022, 0.03, 16), p.mat, p.x, p.y, z);
        fl.rotation.x = Math.PI / 2;
      }
    }
    // registro de gaveta com volante vermelho na linha azul
    const v = lines[0];
    this._mesh(new THREE.BoxGeometry(0.12, 0.13, 0.14), this.m.pipeBlue, v.x, v.y, -0.4);
    this._mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 8), this.mats.chrome, v.x, v.y - 0.12, -0.4);
    const wheel = this._mesh(new THREE.TorusGeometry(0.075, 0.01, 6, 20), this.m.red, v.x, v.y - 0.19, -0.4);
    wheel.rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      const sp = this._boxPart(this.scene, 0.15, 0.008, 0.008, v.x, v.y - 0.19, -0.4, this.m.red);
      sp.rotation.y = k * Math.PI / 3;
    }
  }

  // Difusores de ar, detectores de fumaça e sprinklers pendentes.
  _ceilingFixtures() {
    const H = this.H;
    const grille = this._drawn('vent-grille', 256, 256, (g, w) => {
      g.fillStyle = '#d9dde2'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#5d656e';
      for (let i = 0; i < 6; i++) {
        const m = 18 + i * 19;
        g.lineWidth = 7; g.strokeRect(m, m, w - 2 * m, w - 2 * m);
      }
      g.fillStyle = '#3a4048'; g.fillRect(w / 2 - 14, w / 2 - 14, 28, 28);
    });
    const ventMat = new THREE.MeshStandardMaterial({ map: grille, roughness: 0.6, metalness: 0.3 });
    for (const [x, z] of [[-3, 0], [3, 0], [-2, 5.5], [5, -5.5]]) {
      const v = this._boxPart(this.scene, 0.62, 0.025, 0.62, x, H - 0.0125, z, this.mats.metal);
      v.material = [this.mats.metal, this.mats.metal, this.mats.metal, ventMat, this.mats.metal, this.mats.metal];
    }
    const detBody = new THREE.CylinderGeometry(0.065, 0.07, 0.035, 20);
    for (const [x, z] of [[-3, 4], [4, 4], [-6, -6], [8, 0]]) {
      this._mesh(detBody, this.m.plastic, x, H - 0.018, z);
      this._mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.004, 8), this.mats.led, x + 0.03, H - 0.037, z);
    }
    const head = new THREE.CylinderGeometry(0.012, 0.016, 0.05, 10);
    const deflector = new THREE.CylinderGeometry(0.03, 0.03, 0.004, 12);
    const escutcheon = new THREE.CylinderGeometry(0.04, 0.04, 0.008, 16);
    for (const x of [-8.5, -4, 4, 8.5]) {
      for (const z of [-5.5, 0.5, 5.5]) {
        this._mesh(escutcheon, this.mats.chrome, x, H - 0.004, z);
        this._mesh(head, this.mats.chrome, x, H - 0.033, z);
        this._mesh(deflector, this.mats.chrome, x, H - 0.06, z);
      }
    }
  }

  // ---- piso ----------------------------------------------------------------

  _floorMarkings() {
    const stripes = this._drawn('hazard-stripes', 256, 32, (g, w, h) => {
      g.fillStyle = '#f2c618'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#151515';
      for (let x = -h; x < w + h; x += 64) {
        g.beginPath(); g.moveTo(x, h); g.lineTo(x + 32, h); g.lineTo(x + 32 + h, 0); g.lineTo(x + h, 0); g.closePath(); g.fill();
      }
    });
    stripes.wrapS = THREE.RepeatWrapping;
    const tapeMat = new THREE.MeshStandardMaterial({
      map: stripes, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const tape = (x0, z0, x1, z1, width = 0.06) => {
      const sides = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]];
      for (const [ax, az, bx, bz] of sides) {
        const len = Math.hypot(bx - ax, bz - az) + width;
        const geo = new THREE.PlaneGeometry(len, width);
        const uv = geo.attributes.uv;
        for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len / 0.48);
        const m = this._mesh(geo, tapeMat, (ax + bx) / 2, 0.003, (az + bz) / 2);
        m.rotation.set(-Math.PI / 2, 0, Math.atan2(-(bz - az), bx - ax));
      }
    };
    // área de armazenamento dos barris (norte e sudoeste)
    tape(-1.75, -7.72, 0.15, -5.95);
    tape(-10.72, 6.22, -9.62, 7.72 - 0.02);

    // hachurado "mantenha livre" na frente do quadro elétrico e do chuveiro
    const hatch = this._drawn('keep-clear', 256, 256, (g, w) => {
      g.clearRect(0, 0, w, w);
      g.strokeStyle = 'rgba(242,198,24,0.9)'; g.lineWidth = 14;
      g.strokeRect(7, 7, w - 14, w - 14);
      g.lineWidth = 10;
      for (let i = -w; i < w * 2; i += 44) { g.beginPath(); g.moveTo(i, w); g.lineTo(i + w, 0); g.stroke(); }
    });
    const hatchMat = new THREE.MeshStandardMaterial({
      map: hatch, transparent: true, depthWrite: false, roughness: 0.6,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    for (const [x, z, s] of [[this.face.east - this.accent - 0.42, -1.6, 0.8], [this.face.west + this.accent + 0.48, 5.4, 0.9]]) {
      const m = this._mesh(new THREE.PlaneGeometry(s, s), hatchMat, x, 0.003, z);
      m.rotation.x = -Math.PI / 2;
    }

    // ralo sifonado de piso
    const drain = this._drawn('floor-drain', 128, 128, (g, w) => {
      g.fillStyle = '#8f979f'; g.beginPath(); g.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#20252b';
      for (let y = 28; y < 104; y += 12) for (let x = 28; x < 104; x += 12) {
        if (Math.hypot(x - w / 2, y - w / 2) < 40) g.fillRect(x - 3, y - 3, 6, 6);
      }
    });
    const dm = this._mesh(new THREE.CircleGeometry(0.11, 24), new THREE.MeshStandardMaterial({
      map: drain, roughness: 0.5, metalness: 0.6, polygonOffset: true, polygonOffsetFactor: -2,
    }), -2.2, 0.003, 1.8);
    dm.rotation.x = -Math.PI / 2;
  }

  // ---- mobiliário extra (objetos soltos com física) ------------------------

  // Prateleira de reagentes sobre a bancada noroeste, com três frascos.
  _benchReagentShelf() {
    const lab = this.lab, x0 = -10.68, x1 = -8.52, z = -7.17, d = 0.22, y = 1.3;
    const cx = (x0 + x1) / 2;
    lab._box(x1 - x0, 0.025, d, cx, y, z, this.mats.shelf, { collide: false, uv: 0.6 });
    lab._box(x1 - x0, 0.06, 0.012, cx, y + 0.035, z - d / 2 + 0.006, this.mats.shelf, { collide: false });
    for (const px of [x0 + 0.02, x1 - 0.02]) {
      for (const pz of [z - d / 2 + 0.02, z + d / 2 - 0.02]) {
        lab._box(0.025, y - 0.88, 0.025, px, (y + 0.88) / 2, pz, this.mats.metal, { collide: false });
      }
    }
    lab._propSurfaces.push(new THREE.Box3(
      new THREE.Vector3(x0, y - 0.0125, z - d / 2),
      new THREE.Vector3(x1, y + 0.0125, z + d / 2)
    ));
    const top = y + 0.0125 + 0.17;
    lab._buildReagentBottle('frasco de etanol 70%', -10.3, top, z, this.mats.liquidBlue);
    lab._buildReagentBottle('frasco de ácido nítrico diluído', -9.75, top, z, this.mats.liquidAmber);
    lab._buildReagentBottle('frasco de água deionizada', -9.15, top, z, this.mats.labBlue);
  }

  _stools() {
    for (const [label, x, z, ry] of [
      ['banqueta da bancada noroeste', -8.0, -5.35, 0.3],
      ['banqueta da bancada oeste', -8.65, 1.6, 1.1],
      ['banqueta da bancada sul', 6.0, 5.6, -0.4],
    ]) this._buildStool(label, x, z, ry);
  }

  // Banqueta giratória: assento estofado, pistão a gás, aro de apoio para
  // os pés e base estrela de 5 pés com rodízios. Altura total 0,62 m.
  _buildStool(label, x, z, rotY) {
    const g = new THREE.Group();
    const hh = 0.31;
    const add = (geo, mat, px, py, pz) => this._mesh(geo, mat, px, py, pz, g, true);
    add(new THREE.CylinderGeometry(0.17, 0.16, 0.06, 24), this.m.vinyl, 0, hh - 0.03, 0);
    add(new THREE.TorusGeometry(0.165, 0.012, 8, 24), this.m.vinyl, 0, hh - 0.01, 0).rotation.x = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.12, 0.1, 0.03, 16), this.mats.dark, 0, hh - 0.075, 0);
    add(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 12), this.mats.chrome, 0, 0.07, 0);
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 12), this.mats.dark, 0, -0.14, 0);
    add(new THREE.TorusGeometry(0.17, 0.01, 6, 28), this.mats.chrome, 0, -0.06, 0).rotation.x = Math.PI / 2;
    for (let k = 0; k < 3; k++) {
      const spoke = this._boxPart(g, 0.33, 0.012, 0.012, 0, -0.06, 0, this.mats.chrome);
      spoke.rotation.y = k * Math.PI / 3;
    }
    const caster = new THREE.SphereGeometry(0.022, 10, 8);
    for (let k = 0; k < 5; k++) {
      const a = k * Math.PI * 2 / 5;
      const leg = this._boxPart(g, 0.2, 0.025, 0.035, Math.cos(a) * 0.1, -hh + 0.05, Math.sin(a) * 0.1, this.mats.dark, true);
      leg.rotation.set(0, -a, -0.12);
      add(caster, this.mats.rubber, Math.cos(a) * 0.2, -hh + 0.022, Math.sin(a) * 0.2);
    }
    return this.lab._physicsEquipment(g, label, new THREE.Vector3(0.44, 0.62, 0.44), 5.5, x, hh, z, rotY);
  }

  // Lixeira de rejeito com pedal e selo de radiação (objeto solto).
  _wasteBin() {
    const label = this._drawn('waste-label', 256, 160, (g, w, h) => {
      g.fillStyle = '#f7f3e3'; g.fillRect(0, 0, w, h);
      drawTrefoil(g, 52, h / 2, 40, '#7a1f8f');
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#121212';
      g.font = 'bold 28px "Arial Black", Arial, sans-serif'; g.fillText('REJEITO', 104, 56);
      g.font = 'bold 22px Arial, sans-serif'; g.fillText('RADIOATIVO', 106, 96);
      g.font = '16px Arial, sans-serif'; g.fillText('Classe 2 · LAB-07', 106, 126);
    });
    const g = new THREE.Group(), hh = 0.25, r = 0.16;
    this._mesh(new THREE.CylinderGeometry(r, r - 0.015, 0.44, 24), this.m.binYellow, 0, -0.03, 0, g, true);
    this._mesh(new THREE.CylinderGeometry(r + 0.008, r + 0.008, 0.045, 24), this.mats.dark, 0, hh - 0.04, 0, g, true);
    this._mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12), this.mats.dark, 0, hh - 0.008, 0, g);
    this._mesh(new THREE.TorusGeometry(r - 0.012, 0.008, 6, 24), this.mats.dark, 0, -hh + 0.01, 0, g).rotation.x = Math.PI / 2;
    this._boxPart(g, 0.12, 0.02, 0.07, 0, -hh + 0.02, r + 0.02, this.mats.dark, true);
    const decal = this._mesh(
      new THREE.CylinderGeometry(r + 0.002, r + 0.002 - 0.005, 0.16, 16, 1, true, -0.75, 1.5),
      new THREE.MeshStandardMaterial({ map: label, roughness: 0.6 }),
      0, 0.0, 0, g
    );
    decal.rotation.y = 0;
    this.lab._physicsEquipment(g, 'lixeira de rejeito radioativo', new THREE.Vector3(0.36, 0.5, 0.36), 3.2, 4.6, hh, -7.5, 0);
  }
}
