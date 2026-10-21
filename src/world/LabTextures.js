import * as THREE from 'three';

// ==== LABTEXTURES ===========================================================
// Texturas procedurais (canvas) do laboratório: cor, relevo (normal map) e
// rugosidade gerados em tempo de carregamento — nenhum arquivo externo.
// Um gerador pseudoaleatório com semente fixa deixa o visual idêntico em toda
// partida e não consome Math.random (que sorteia fonte, isótopo e NORMs).

const SIZE = 512;

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w = SIZE, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })];
}

// Ruído de valor tileável (a grade dá a volta nas bordas), suavizado.
// Grades anisotrópicas (cx ≠ cy) geram estrias sem quebrar a repetição.
function valueNoise(rand, cx, cy = cx) {
  const grid = new Float32Array(cx * cy);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const at = (x, y) => grid[((y % cy + cy) % cy) * cx + ((x % cx + cx) % cx)];
  return (u, v) => {
    const x = u * cx, y = v * cy;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

// Soma de oitavas (fBm) sobre ruídos tileáveis com frequências dobradas.
function fbm(rand, baseCells, octaves = 4) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(valueNoise(rand, baseCells << o));
  return (u, v) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (const n of layers) { sum += n(u, v) * amp; norm += amp; amp *= 0.5; }
    return sum / norm;
  };
}

// Preenche um canvas pixel a pixel: fn(u, v, x, y) → [r, g, b] (0–255).
function paint(ctx, fn) {
  const { width: w, height: h } = ctx.canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [r, g, b] = fn(x / w, y / h, x, y, d[i], d[i + 1], d[i + 2]);
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// Converte um mapa de altura (canal R, branco = alto) em normal map tangente
// no padrão OpenGL usado pelo Three.js. As bordas dão a volta (tileável).
function normalFromHeight(heightCanvas, strength = 2) {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, ctx] = makeCanvas(w, h);
  const out = ctx.createImageData(w, h);
  const d = out.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      // a textura é invertida em Y (flipY): +v no UV é "para cima" no canvas
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

function toTexture(canvas, srgb = false) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textureSet(color, height, rough, strength) {
  return {
    map: toTexture(color, true),
    normalMap: toTexture(normalFromHeight(height, strength)),
    roughnessMap: toTexture(rough),
  };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const gray = (v) => { v = clamp255(v); return [v, v, v]; };

export class LabTextures {
  constructor() {
    this._cache = new Map();
  }

  _get(key, build) {
    if (!this._cache.has(key)) this._cache.set(key, build());
    return this._cache.get(key);
  }

  // Piso vinílico: o canvas cobre 2×2 placas de 60 cm. Cada placa tem um tom
  // próprio, pigmentos (flocos) e desgaste leve; o rejunte é baixo e áspero.
  floor() {
    return this._get('floor', () => {
      const rand = mulberry32(101);
      const grime = fbm(rand, 4, 5);
      const fleck = valueNoise(rand, 160);
      const tones = [0, 1, 2, 3].map(() => (rand() - 0.5) * 12);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      const tile = SIZE / 2, seam = 3;
      const seamDist = (x, y) => {
        const tx = x % tile, ty = y % tile;
        return Math.min(tx, tile - 1 - tx, ty, tile - 1 - ty);
      };
      paint(cctx, (u, v, x, y) => {
        const t = tones[((y / tile) | 0) * 2 + ((x / tile) | 0)];
        const s = seamDist(x, y);
        if (s < seam) return [122, 128, 136];
        const g = (grime(u, v) - 0.5) * 22;
        const f = fleck(u, v);
        let base = 196 + t + g;
        let blue = 0;
        if (f > 0.83) { base -= 38; blue = 6; } else if (f < 0.12) base += 14;
        if (s < seam + 2) base -= 10; // bisel escurecido junto ao rejunte
        return [base - 4, base, base + 5 + blue];
      });
      // marcas de arraste: arcos finos e translúcidos
      cctx.strokeStyle = 'rgba(40,46,54,0.08)';
      cctx.lineCap = 'round';
      for (let i = 0; i < 18; i++) {
        cctx.lineWidth = 1 + rand() * 3;
        cctx.beginPath();
        const x = rand() * SIZE, y = rand() * SIZE, r = 30 + rand() * 90, a = rand() * Math.PI * 2;
        cctx.arc(x, y, r, a, a + 0.3 + rand() * 0.6);
        cctx.stroke();
      }
      paint(hctx, (u, v, x, y) => {
        const s = seamDist(x, y);
        if (s < seam) return gray(40);
        const bevel = Math.min(1, (s - seam) / 4);
        return gray(150 + bevel * 70 + (fleck(u, v) - 0.5) * 8);
      });
      paint(rctx, (u, v, x, y) => {
        if (seamDist(x, y) < seam) return gray(235);
        return gray(120 + (grime(u, v) - 0.5) * 90 + (fleck(u, v) > 0.83 ? 30 : 0));
      });
      return textureSet(col, hgt, rgh, 3);
    });
  }

  // Parede em painéis pintados de 1,2 m: junta vertical com parafusos e
  // textura "casca de laranja" da tinta epóxi. Cor final vem do material.
  wall() {
    return this._get('wall', () => {
      const rand = mulberry32(202);
      const mottle = fbm(rand, 3, 4);
      const peel = valueNoise(rand, 128);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      const seamAt = (x) => Math.min(x, SIZE - 1 - x);
      paint(cctx, (u, v, x) => {
        const s = seamAt(x);
        if (s < 2) return gray(150);
        if (s < 4) return gray(208);
        return gray(244 + (mottle(u, v) - 0.5) * 14);
      });
      cctx.fillStyle = 'rgba(70,76,84,0.55)';
      for (let i = 0; i < 4; i++) {
        for (const sx of [9, SIZE - 9]) {
          cctx.beginPath();
          cctx.arc(sx, 64 + i * 128, 3.2, 0, Math.PI * 2);
          cctx.fill();
        }
      }
      paint(hctx, (u, v, x) => {
        const s = seamAt(x);
        if (s < 2) return gray(30);
        if (s < 5) return gray(110 + s * 20);
        return gray(190 + (peel(u, v) - 0.5) * 22);
      });
      paint(rctx, (u, v) => gray(200 + (mottle(u, v) - 0.5) * 40));
      return textureSet(col, hgt, rgh, 1.6);
    });
  }

  // Forro modular 60 cm (2×2 placas no canvas): perfis T claros e placas
  // de fibra mineral com fissuras e furinhos.
  ceiling() {
    return this._get('ceiling', () => {
      const rand = mulberry32(303);
      const pores = valueNoise(rand, 200);
      const blot = fbm(rand, 6, 3);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      const tile = SIZE / 2, bar = 5;
      const d = (x, y) => {
        const tx = x % tile, ty = y % tile;
        return Math.min(tx, tile - 1 - tx, ty, tile - 1 - ty);
      };
      paint(cctx, (u, v, x, y) => {
        const s = d(x, y);
        if (s < bar) return gray(250);
        if (s < bar + 2) return gray(170);
        const p = pores(u, v);
        return gray(236 + (blot(u, v) - 0.5) * 16 - (p > 0.86 ? 50 : 0));
      });
      cctx.strokeStyle = 'rgba(90,96,104,0.35)';
      cctx.lineWidth = 1.2;
      for (let i = 0; i < 140; i++) { // fissuras "vermiculadas"
        const x = rand() * SIZE, y = rand() * SIZE;
        if (d(x | 0, y | 0) < bar + 6) continue;
        cctx.beginPath();
        cctx.moveTo(x, y);
        cctx.quadraticCurveTo(x + (rand() - 0.5) * 14, y + (rand() - 0.5) * 14, x + (rand() - 0.5) * 18, y + (rand() - 0.5) * 18);
        cctx.stroke();
      }
      paint(hctx, (u, v, x, y) => {
        const s = d(x, y);
        if (s < bar) return gray(230);
        if (s < bar + 3) return gray(60);
        return gray(130 - (pores(u, v) > 0.86 ? 60 : 0));
      });
      paint(rctx, (u, v, x, y) => gray(d(x, y) < bar ? 120 : 245));
      return textureSet(col, hgt, rgh, 2.2);
    });
  }

  // Metal escovado em escala de cinza: riscos horizontais longos, alguns
  // arranhões e rugosidade estriada. O `color` do material dá o tom.
  brushedMetal() {
    return this._get('brushed', () => {
      const rand = mulberry32(404);
      const rows = new Float32Array(SIZE);
      for (let y = 0; y < SIZE; y++) rows[y] = rand();
      const smear = valueNoise(rand, 3, 160);
      const blot = fbm(rand, 3, 3);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      const streak = (u, v, y) => rows[y] * 0.6 + smear(u, v) * 0.4;
      paint(cctx, (u, v, x, y) => gray(222 + (streak(u, v, y) - 0.5) * 30 + (blot(u, v) - 0.5) * 18));
      cctx.strokeStyle = 'rgba(255,255,255,0.22)';
      for (let i = 0; i < 26; i++) {
        cctx.lineWidth = 0.6 + rand();
        cctx.beginPath();
        const x = rand() * SIZE, y = rand() * SIZE, len = 20 + rand() * 80, a = (rand() - 0.5) * 1.2;
        cctx.moveTo(x, y);
        cctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
        cctx.stroke();
      }
      paint(hctx, (u, v, x, y) => gray(128 + (rows[y] - 0.5) * 50));
      paint(rctx, (u, v, x, y) => gray(105 + (streak(u, v, y) - 0.5) * 60 + (blot(u, v) - 0.5) * 50));
      return textureSet(col, hgt, rgh, 0.8);
    });
  }

  // Pintura eletrostática (armários, gabinetes, portas): granulado fino,
  // leve variação de brilho e sujeira acumulada em manchas suaves.
  powderCoat() {
    return this._get('powder', () => {
      const rand = mulberry32(505);
      const grain = valueNoise(rand, 256);
      const blot = fbm(rand, 4, 4);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      paint(cctx, (u, v) => gray(238 + (blot(u, v) - 0.5) * 22 + (grain(u, v) - 0.5) * 8));
      paint(hctx, (u, v) => gray(128 + (grain(u, v) - 0.5) * 70));
      paint(rctx, (u, v) => gray(140 + (blot(u, v) - 0.5) * 60));
      return textureSet(col, hgt, rgh, 1.2);
    });
  }

  // Tampo fenólico/epóxi: quase liso, salpicado fino e brilho acetinado.
  benchTop() {
    return this._get('benchTop', () => {
      const rand = mulberry32(606);
      const speck = valueNoise(rand, 220);
      const blot = fbm(rand, 3, 4);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      paint(cctx, (u, v) => {
        const s = speck(u, v);
        return gray(242 + (blot(u, v) - 0.5) * 10 - (s > 0.88 ? 26 : 0) + (s < 0.08 ? 8 : 0));
      });
      cctx.strokeStyle = 'rgba(60,66,74,0.07)';
      for (let i = 0; i < 30; i++) { // micro-riscos de uso
        cctx.lineWidth = 0.8;
        cctx.beginPath();
        const x = rand() * SIZE, y = rand() * SIZE;
        cctx.moveTo(x, y);
        cctx.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 20);
        cctx.stroke();
      }
      paint(hctx, (u, v) => gray(128 + (speck(u, v) - 0.5) * 20));
      paint(rctx, (u, v) => gray(80 + (blot(u, v) - 0.5) * 50));
      return textureSet(col, hgt, rgh, 0.6);
    });
  }

  // Madeira de caixote: 4 tábuas com veios ondulados, nós com anéis,
  // emendas fundas e pregos. Escala de cinza; o material dá o tom.
  wood() {
    return this._get('wood', () => {
      const rand = mulberry32(707);
      const warp = fbm(rand, 4, 3);
      const fine = valueNoise(rand, 96, 20);
      const planks = 4, w = SIZE / planks;
      const tones = [0, 1, 2, 3].map(() => 226 + rand() * 26);
      const knots = [];
      for (let i = 0; i < 5; i++) knots.push({ x: rand() * SIZE, y: rand() * SIZE, r: 8 + rand() * 9 });
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      const grainAt = (u, v, x, y) => {
        const p = (x / w) | 0;
        let gx = x + warp(u, v) * 40 + p * 17;
        let ring = 0;
        for (const k of knots) {
          const dx = x - k.x, dy = (y - k.y) * 0.55;
          const dist = Math.hypot(dx, dy);
          if (dist < k.r * 4) { gx += (k.r * 4 - dist) * Math.sign(dx || 1) * 0.6; }
          if (dist < k.r) ring = Math.max(ring, 0.5 + 0.5 * Math.sin(dist * 1.6));
        }
        const g = 0.5 + 0.5 * Math.sin(gx * 0.42 + fine(u, v) * 3);
        return { p, g: Math.pow(g, 3), ring };
      };
      paint(cctx, (u, v, x, y) => {
        const { p, g, ring } = grainAt(u, v, x, y);
        const tx = x - p * w;
        if (tx < 3) return gray(120);
        let t = tones[p] - g * 28 - ring * 60 + (fine(u, v) - 0.5) * 10;
        if (tx < 6 || tx > w - 3) t -= 22;
        return gray(t);
      });
      cctx.fillStyle = 'rgba(30,30,30,0.6)';
      for (let i = 0; i < planks; i++) {
        for (const ny of [18, SIZE - 18]) {
          cctx.beginPath();
          cctx.arc(i * w + w / 2, ny, 4.5, 0, Math.PI * 2);
          cctx.fill();
        }
      }
      paint(hctx, (u, v, x, y) => {
        const { p, g, ring } = grainAt(u, v, x, y);
        const tx = x - p * w;
        if (tx < 4) return gray(20);
        return gray(170 - g * 40 - ring * 50);
      });
      paint(rctx, (u, v, x, y) => {
        const { g } = grainAt(u, v, x, y);
        return gray(200 + g * 40);
      });
      return textureSet(col, hgt, rgh, 2.6);
    });
  }

  // Tambor de aço pintado: escorridos verticais de sujeira, lascas que
  // mostram o metal e rugosidade irregular. u = circunferência, v = altura.
  barrel() {
    return this._get('barrel', () => {
      const rand = mulberry32(808);
      const blot = fbm(rand, 4, 4);
      const drip = valueNoise(rand, 64, 4);
      const chip = fbm(rand, 16, 3);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      const streak = (u, v) => Math.pow(drip(u, v), 3) * (0.4 + v * 0.8);
      paint(cctx, (u, v) => {
        const c = chip(u, v);
        if (c > 0.72) return [200, 202, 205]; // tinta lascada: aço exposto
        const g = 236 + (blot(u, v) - 0.5) * 26 - streak(u, v) * 60;
        return [g, g - 2, g - 6];
      });
      paint(hctx, (u, v) => gray(chip(u, v) > 0.72 ? 90 : 150 + (blot(u, v) - 0.5) * 20));
      paint(rctx, (u, v) => gray(chip(u, v) > 0.72 ? 90 : 150 + streak(u, v) * 80 + (blot(u, v) - 0.5) * 40));
      return textureSet(col, hgt, rgh, 1.4);
    });
  }

  // Borracha/plástico texturizado: só relevo granulado e rugosidade alta.
  rubber() {
    return this._get('rubber', () => {
      const rand = mulberry32(909);
      const grain = valueNoise(rand, 192);
      const [col, cctx] = makeCanvas(256);
      const [hgt, hctx] = makeCanvas(256);
      const [rgh, rctx] = makeCanvas(256);
      paint(cctx, (u, v) => gray(236 + (grain(u, v) - 0.5) * 14));
      paint(hctx, (u, v) => gray(128 + (grain(u, v) - 0.5) * 90));
      paint(rctx, (u, v) => gray(225 + (grain(u, v) - 0.5) * 30));
      return textureSet(col, hgt, rgh, 1.5);
    });
  }

  // Teclas do teclado: grade de teclas escuras com folga e legendas claras,
  // aplicada só na face superior do teclado.
  keyboard() {
    return this._get('keyboard', () => {
      const [c, g] = makeCanvas(512, 192);
      g.fillStyle = '#121519';
      g.fillRect(0, 0, 512, 192);
      const rows = [
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
        [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
        [1.8, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.2],
        [2.3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.7],
        [1.4, 1.4, 1.4, 6.2, 1.4, 1.4, 1.4, 1.4],
      ];
      const unit = 512 / 15.2, kh = 192 / 5.4;
      rows.forEach((row, r) => {
        let x = unit * 0.1;
        for (const k of row) {
          const w = k * unit;
          const y = r * kh + kh * 0.15;
          g.fillStyle = '#2c3138';
          g.fillRect(x + 2, y + 2, w - 4, kh - 4);
          g.fillStyle = '#3a414a';
          g.fillRect(x + 4, y + 3, w - 8, kh * 0.55);
          if (k < 2 && (r + x) % 3 > 0.6) {
            g.fillStyle = 'rgba(210,220,230,0.55)';
            g.fillRect(x + w * 0.35, y + kh * 0.25, w * 0.25, 3);
          }
          x += w;
        }
      });
      const tex = toTexture(c, true);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }

  // ---- usina (modo Bloco 4) ----------------------------------------------

  // Concreto aparente: manchas de umidade, poros, furos de tirante da forma
  // (grade de 2 × 2 no canvas) e juntas de concretagem. Escala de cinza.
  concrete() {
    return this._get('concrete', () => {
      const rand = mulberry32(1101);
      const stain = fbm(rand, 4, 5);
      const pores = valueNoise(rand, 180);
      const streak = valueNoise(rand, 48, 3);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      paint(cctx, (u, v, x, y) => {
        let g = 196 + (stain(u, v) - 0.5) * 70 - Math.pow(streak(u, v), 4) * 60;
        if (pores(u, v) > 0.88) g -= 40;
        if (y % 256 < 3) g -= 30; // junta de concretagem
        return [g, g - 1, g - 4];
      });
      cctx.fillStyle = 'rgba(40,40,40,0.75)';
      for (const tx of [64, 320]) for (const ty of [64, 320]) {
        cctx.beginPath(); cctx.arc(tx, ty, 7, 0, Math.PI * 2); cctx.fill();
      }
      paint(hctx, (u, v, x, y) => gray(150 + (stain(u, v) - 0.5) * 40 - (pores(u, v) > 0.88 ? 80 : 0) - (y % 256 < 3 ? 90 : 0)));
      paint(rctx, (u, v) => gray(225 + (stain(u, v) - 0.5) * 40));
      return textureSet(col, hgt, rgh, 2.2);
    });
  }

  // Piso de concreto chamuscado: fuligem, rachaduras e borras de fogo.
  scorchedFloor() {
    return this._get('scorched', () => {
      const rand = mulberry32(1202);
      const soot = fbm(rand, 3, 5);
      const grit = valueNoise(rand, 220);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      paint(cctx, (u, v) => {
        const s = soot(u, v);
        const burn = s > 0.56 ? (s - 0.56) * 5 : 0;
        let g = 150 + (grit(u, v) - 0.5) * 26 - burn * 110;
        return [g + 4, g, g - 6];
      });
      // rachaduras: passeios aleatórios, desenhados na cor e no relevo
      const cracks = [];
      for (let i = 0; i < 14; i++) {
        let x = rand() * SIZE, y = rand() * SIZE, a = rand() * Math.PI * 2;
        const pts = [[x, y]];
        for (let k = 0; k < 18; k++) {
          a += (rand() - 0.5) * 1.1; x += Math.cos(a) * 9; y += Math.sin(a) * 9;
          pts.push([x, y]);
        }
        cracks.push({ pts, w: 1 + rand() * 2 });
      }
      const strokeCracks = (ctx, color) => {
        ctx.strokeStyle = color;
        for (const c of cracks) {
          ctx.lineWidth = c.w;
          ctx.beginPath(); ctx.moveTo(c.pts[0][0], c.pts[0][1]);
          for (const [px, py] of c.pts) ctx.lineTo(px, py);
          ctx.stroke();
        }
      };
      strokeCracks(cctx, 'rgba(15,14,12,0.8)');
      paint(hctx, (u, v) => gray(150 + (grit(u, v) - 0.5) * 50));
      strokeCracks(hctx, 'rgb(30,30,30)');
      paint(rctx, (u, v) => gray(230 - (soot(u, v) > 0.6 ? 30 : 0)));
      return textureSet(col, hgt, rgh, 2.4);
    });
  }

  // Asfalto do pátio: agregado claro sobre ligante escuro, remendos e trincas.
  asphalt() {
    return this._get('asphalt', () => {
      const rand = mulberry32(1303);
      const agg = valueNoise(rand, 256);
      const patch = fbm(rand, 3, 4);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      paint(cctx, (u, v) => {
        const a = agg(u, v);
        let g = 62 + (patch(u, v) - 0.5) * 26 + (a > 0.8 ? 38 : a < 0.15 ? -12 : 0);
        return [g, g, g + 2];
      });
      paint(hctx, (u, v) => gray(128 + (agg(u, v) - 0.5) * 120));
      paint(rctx, (u, v) => gray(235 - (agg(u, v) > 0.8 ? 40 : 0)));
      return textureSet(col, hgt, rgh, 2);
    });
  }

  // Aço enferrujado em cor real (sRGB): ferrugem laranja-marrom com restos de
  // tinta cinza-esverdeada; a rugosidade acompanha a corrosão.
  rust() {
    return this._get('rust', () => {
      const rand = mulberry32(1404);
      const blot = fbm(rand, 5, 5);
      const fine = valueNoise(rand, 200);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      const rustAt = (u, v) => blot(u, v) + (fine(u, v) - 0.5) * 0.15;
      paint(cctx, (u, v) => {
        const r = rustAt(u, v);
        if (r < 0.48) { const g = 118 + (fine(u, v) - 0.5) * 16; return [g - 14, g, g - 6]; } // tinta
        const k = Math.min(1, (r - 0.48) * 4);
        return [clamp255(120 + 60 * k + (fine(u, v) - 0.5) * 30), clamp255(70 + 20 * k), clamp255(40 + 6 * k)];
      });
      paint(hctx, (u, v) => gray(rustAt(u, v) < 0.48 ? 170 : 120 + (fine(u, v) - 0.5) * 90));
      paint(rctx, (u, v) => gray(rustAt(u, v) < 0.48 ? 130 : 240));
      return textureSet(col, hgt, rgh, 2);
    });
  }

  // Chapa trapezoidal (fachada e telhado): ondas verticais e escorridos.
  corrugated() {
    return this._get('corrugated', () => {
      const rand = mulberry32(1505);
      const drip = valueNoise(rand, 40, 3);
      const [col, cctx] = makeCanvas();
      const [hgt, hctx] = makeCanvas();
      const [rgh, rctx] = makeCanvas();
      const wave = (x) => 0.5 + 0.5 * Math.sin(x / SIZE * Math.PI * 2 * 8);
      paint(cctx, (u, v, x) => gray(210 + wave(x) * 25 - Math.pow(drip(u, v), 3) * 90));
      paint(hctx, (u, v, x) => gray(60 + wave(x) * 160));
      paint(rctx, (u, v) => gray(150 + Math.pow(drip(u, v), 3) * 100));
      return textureSet(col, hgt, rgh, 3);
    });
  }

  // Grafite nuclear: tijolos empilhados com furo de canal, brilho grafítico.
  graphite() {
    return this._get('graphite', () => {
      const rand = mulberry32(1606);
      const fine = valueNoise(rand, 160);
      const [col, cctx] = makeCanvas(256);
      const [hgt, hctx] = makeCanvas(256);
      const [rgh, rctx] = makeCanvas(256);
      const seam = (x, y) => Math.min(x % 128, 127 - (x % 128), y % 128, 127 - (y % 128));
      paint(cctx, (u, v, x, y) => gray(seam(x, y) < 3 ? 18 : 58 + (fine(u, v) - 0.5) * 22));
      cctx.fillStyle = '#0b0b0c';
      for (const cx of [64, 192]) for (const cy of [64, 192]) { cctx.beginPath(); cctx.arc(cx, cy, 16, 0, Math.PI * 2); cctx.fill(); }
      paint(hctx, (u, v, x, y) => gray(seam(x, y) < 3 ? 20 : 160 + (fine(u, v) - 0.5) * 40));
      paint(rctx, (u, v) => gray(120 + (fine(u, v) - 0.5) * 50));
      return textureSet(col, hgt, rgh, 1.6);
    });
  }

  // Tela de alambrado (losangos) com transparência para alphaTest.
  chainLink() {
    return this._get('chainLink', () => {
      const [c, g] = makeCanvas(256);
      g.clearRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(178,184,188,1)'; g.lineWidth = 3;
      for (let i = -256; i <= 512; i += 32) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 256, 256); g.stroke();
        g.beginPath(); g.moveTo(i + 256, 0); g.lineTo(i, 256); g.stroke();
      }
      return toTexture(c, true);
    });
  }

  // Textura a partir de um desenho em canvas (placas, cartazes, quadro).
  // `draw(ctx, w, h)` pinta o conteúdo; o resultado é cacheado pela chave.
  drawn(key, w, h, draw) {
    return this._get(`drawn:${key}`, () => {
      const [c, g] = makeCanvas(w, h);
      draw(g, w, h);
      const tex = toTexture(c, true);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      return tex;
    });
  }
}

// BoxGeometry com UV em metros (÷ tile) em cada face, para texturas
// tileáveis não esticarem em paredes, tampos e painéis grandes.
// Ordem das faces do BoxGeometry: +x, −x, +y, −y, +z, −z (4 vértices cada).
export function worldBoxGeometry(w, h, d, tile) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile);
    }
  }
  return geo;
}
