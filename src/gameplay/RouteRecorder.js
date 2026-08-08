import * as THREE from 'three';

// ==== ROUTERECORDER =========================================================
// Grava a rota do jogador com a dose em cada ponto e desenha o heatmap
// pedagógico da tela final (vista de cima: o gradiente 1/d² percorrido).
export class RouteRecorder {
  constructor() {
    this.samples = [];
    this._timer = 0;
  }

  reset() {
    this.samples.length = 0;
    this._timer = 0;
  }

  update(dt, pos, dose) {
    this._timer += dt;
    if (this._timer >= 0.35 && this.samples.length < 6000) {
      this._timer = 0;
      this.samples.push({ x: pos.x, z: pos.z, d: dose });
    }
  }

  _doseColor(d) {
    const t = THREE.MathUtils.clamp((Math.log10(Math.max(d, 0.05)) + 1) / 4, 0, 1);
    return `hsl(${Math.round(210 * (1 - t))}, 95%, 55%)`;
  }

  draw(canvas, colliders, source, startPos) {
    const g = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const sx = (x) => (x + 11.3) / 22.6 * W;
    const sz = (z) => (z + 8.3) / 16.6 * H;

    g.fillStyle = '#0d1117';
    g.fillRect(0, 0, W, H);

    // mobiliário e paredes (vista de cima)
    g.fillStyle = 'rgba(150, 160, 172, 0.28)';
    for (const b of colliders) {
      if (b.hideOnMap) continue; // laje do teto: colide, mas não é mobília
      g.fillRect(sx(b.min.x), sz(b.min.z), (b.max.x - b.min.x) / 22.6 * W, (b.max.z - b.min.z) / 16.6 * H);
    }

    // rota colorida pela taxa de dose no instante
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1], b = this.samples[i];
      g.strokeStyle = this._doseColor(b.d);
      g.beginPath();
      g.moveTo(sx(a.x), sz(a.z));
      g.lineTo(sx(b.x), sz(b.z));
      g.stroke();
    }

    // início
    g.strokeStyle = '#ffffff'; g.lineWidth = 2;
    g.beginPath(); g.arc(sx(startPos.x), sz(startPos.z), 6, 0, Math.PI * 2); g.stroke();

    // fonte real
    g.fillStyle = '#ff5252';
    g.font = '20px "Segoe UI", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('☢', sx(source.position.x), sz(source.position.z));
  }
}
