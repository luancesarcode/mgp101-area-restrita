import * as THREE from 'three';

// ==== EMBERFIELD ============================================================
// "Fogo radioativo" dos menus: brasas verdes densas na base que sobem com
// deriva lateral e morrem — a maioria baixa, algumas altas — sobre um clarão
// pulsante no rodapé. Intensidade ajustável (dificuldade/tela).
export class EmberField {
  constructor(containerId, count = 420) {
    this.box = document.getElementById(containerId);
    this.particles = [];
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      // DEGRADÊ de densidade: distribuição cúbica — a grande maioria das
      // brasas morre nos primeiros ~25vh; pouquíssimas chegam ao topo
      const riseVh = 6 + Math.pow(Math.random(), 2.8) * 100;
      const nearBase = 1 - riseVh / 106;                     // 1 = rente ao chão
      const size = 1.5 + Math.random() * 2.5 + nearBase * 6; // maiores na base
      const dur = riseVh / (14 + Math.random() * 10);        // velocidade ~constante
      s.style.width = s.style.height = `${size.toFixed(1)}px`;
      s.style.left = `${(Math.random() * 100).toFixed(1)}%`;
      s.style.setProperty('--rise', `-${riseVh.toFixed(0)}vh`);
      s.style.setProperty('--sway', `${((Math.random() - 0.5) * 70).toFixed(0)}px`);
      s.style.animationDelay = `${(-Math.random() * 20).toFixed(1)}s`;
      this.box.appendChild(s);
      // brasas que sobem alto são mais tênues (reforça o degradê)
      this.particles.push({ el: s, dur, fade: 0.45 + 0.55 * nearBase });
    }
    this.setIntensity(1);
  }

  setIntensity(k) {
    const visible = Math.min(this.particles.length, Math.round(130 + 130 * k));
    const op = Math.min(0.95, 0.5 + 0.22 * k);
    this.box.style.setProperty('--glow-op', Math.min(0.95, 0.35 + 0.28 * k).toFixed(2));
    this.particles.forEach((p, i) => {
      p.el.style.display = i < visible ? 'block' : 'none';
      p.el.style.animationDuration = `${(p.dur / k).toFixed(2)}s`;
      p.el.style.setProperty('--p-op', (op * p.fade).toFixed(2));
    });
  }
}
