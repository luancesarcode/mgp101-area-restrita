// ==== EMBERFIELD ============================================================
// "Fogo radioativo" dos menus: brasas verdes densas na base que sobem com
// deriva lateral e morrem — a maioria baixa, algumas altas — sobre um clarão
// pulsante no rodapé. Intensidade ajustável (dificuldade/tela).
//
// As brasas são desenhadas em UM canvas 2D. Antes cada brasa era um <span>
// animado por CSS com duas sombras desfocadas; centenas dessas camadas sobre
// o WebGL custavam mais que a cena 3D inteira em GPU integrada.
const GLOW = 13;                  // alcance do brilho além da borda da brasa (px)
const SPRITE_DIAMETERS = [3, 6, 9]; // brasas pequenas, médias e grandes

function makeSprite(diameter) {
  const radius = diameter / 2 + GLOW;
  const scale = 2; // nitidez extra: o sprite é reduzido ao desenhar
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(radius * 2 * scale);
  const g = c.getContext('2d');
  const mid = c.width / 2, core = (diameter / 2) / radius;
  const grad = g.createRadialGradient(mid, mid, 0, mid, mid, mid);
  grad.addColorStop(0, 'rgba(125, 255, 94, 1)');
  grad.addColorStop(core * 0.9, 'rgba(125, 255, 94, 1)');
  grad.addColorStop(Math.min(0.98, core + 0.12), 'rgba(125, 255, 94, 0.42)');
  grad.addColorStop(Math.min(0.99, core + 0.4), 'rgba(125, 255, 94, 0.13)');
  grad.addColorStop(1, 'rgba(125, 255, 94, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return { canvas: c, radius };
}

let sprites = null;

export class EmberField {
  constructor(containerId, count = 420) {
    this.box = document.getElementById(containerId);
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.box.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    sprites ||= SPRITE_DIAMETERS.map(makeSprite);

    this.particles = [];
    for (let i = 0; i < count; i++) {
      // DEGRADÊ de densidade: distribuição cúbica — a grande maioria das
      // brasas morre nos primeiros ~25vh; pouquíssimas chegam ao topo
      const riseVh = 6 + Math.pow(Math.random(), 2.8) * 100;
      const nearBase = 1 - riseVh / 106;                     // 1 = rente ao chão
      const size = 1.5 + Math.random() * 2.5 + nearBase * 6; // maiores na base
      const dur = riseVh / (14 + Math.random() * 10);        // velocidade ~constante
      this.particles.push({
        size, dur,
        rise: riseVh / 100,                    // fração da altura da tela
        left: Math.random(),                   // fração da largura
        sway: (Math.random() - 0.5) * 70,      // deriva lateral (px)
        delay: Math.random() * 20,             // defasagem inicial (s)
        // brasas que sobem alto são mais tênues (reforça o degradê)
        fade: 0.45 + 0.55 * nearBase,
        sprite: sprites[size < 4.5 ? 0 : size < 7.5 ? 1 : 2],
      });
    }
    this._visible = 0;
    this._speed = 1;
    this._opacity = 0.8;
    this._clock = 0;
    this._last = performance.now();
    this._frame = (now) => this._draw(now);
    this.setIntensity(1);
    requestAnimationFrame(this._frame);
  }

  setIntensity(k) {
    this._visible = Math.min(this.particles.length, Math.round(130 + 130 * k));
    this._opacity = Math.min(0.95, 0.5 + 0.22 * k);
    this._speed = k;
    this.box.style.setProperty('--glow-op', Math.min(0.95, 0.35 + 0.28 * k).toFixed(2));
  }

  _draw(now) {
    requestAnimationFrame(this._frame);
    const dt = Math.min((now - this._last) / 1000, 0.1);
    this._last = now;
    const w = this.box.clientWidth, h = this.box.clientHeight;
    if (!w || !h) return; // tela fechada: nada é desenhado
    // "Reduzir animações": as brasas ficam paradas onde estão
    if (!document.body.classList.contains('a11y-reduced-motion')) this._clock += dt * this._speed;
    else if (this._drawnAt === this._clock && this.canvas.width === w && this.canvas.height === h) return;
    this._drawnAt = this._clock;

    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    const g = this.ctx;
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < this._visible; i++) {
      const p = this.particles[i];
      const t = ((this._clock + p.delay) / p.dur) % 1;
      // sobem com deriva lateral, encolhem e morrem (maioria morre baixo)
      const fadeOut = t < 0.7 ? 1 - (0.45 * t) / 0.7 : 0.55 * (1 - (t - 0.7) / 0.3);
      const alpha = this._opacity * p.fade * fadeOut;
      if (alpha < 0.01) continue;
      const scale = 1 - 0.7 * t;
      const r = (p.size / 2 + GLOW) * scale;
      const x = p.left * w + p.sway * t;
      const y = h + 14 - p.size / 2 - p.rise * h * t;
      g.globalAlpha = alpha;
      g.drawImage(p.sprite.canvas, x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1;
  }
}
