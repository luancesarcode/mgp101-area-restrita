import * as THREE from 'three';
import { HEALTH_MAX } from '../config/gameConfig.js';

// ==== HUD ===================================================================
export class HUD {
  constructor() {
    this.root = document.getElementById('hud');
    this.missionEl = document.getElementById('hud-mission');
    this.timeEl = document.getElementById('hud-time');
    this.doseEl = document.getElementById('hud-dose');
    this.budgetEl = document.getElementById('hud-budget');
    this.healthEl = document.getElementById('hud-health');
    this.vignetteDmgEl = document.getElementById('vignette-dmg');
    this.toastEl = document.getElementById('toast');
    this.crosshair = document.getElementById('crosshair');
    this.hintEl = document.getElementById('hint');
    this.hintKeyEl = document.getElementById('hint-key');
    this.hintKeyLabelEl = document.getElementById('hint-key-label');
    this.hintTextEl = document.getElementById('hint-text');
    this.manipulationHelpEl = document.getElementById('manipulation-help');
    this.vignetteEl = document.getElementById('vignette');
    this.healthPanel = document.getElementById('health-panel');
    this.healthValEl = document.getElementById('hud-health-val');
    this.toastTextEl = document.getElementById('toast-text');
    this.objectivePanel = document.getElementById('objective-panel');
    this._visible = false;
    this._evacuation = false;
    this._manipulatingObject = false;
    this._toastTimer = null;
    this._lastVignette = -1;
    this._lastDamage = -1;
    this._lastHint = null;
  }

  show() {
    this._visible = true;
    this.root.style.display = 'flex';
    this._syncHealthVisibility();
    this.crosshair.style.display = 'block';
  }
  hide() {
    this._visible = false;
    this.root.style.display = 'none';
    this._manipulatingObject = false;
    this.healthPanel.style.display = 'none';
    this.crosshair.style.display = 'none';
    this.hintEl.style.display = 'none';
    this.manipulationHelpEl.style.display = 'none';
    this.vignetteEl.style.opacity = '0';
    this.vignetteDmgEl.style.opacity = '0';
    // força a reescrita dos estilos guardados quando o HUD voltar
    this._lastVignette = -1;
    this._lastDamage = -1;
    this._lastHint = null;
  }

  setMission(text) { this.missionEl.textContent = text; }

  _syncHealthVisibility() {
    this.healthPanel.style.display = this._visible ? 'flex' : 'none';
  }

  setGamepadMode(enabled) {
    this.hintKeyLabelEl.textContent = enabled ? 'X' : 'F';
    this.hintKeyEl.classList.toggle('gp-btn', enabled);
    this.hintKeyEl.classList.toggle('x', enabled);
  }

  setEvacuation(active) {
    this._evacuation = Boolean(active);
    this._manipulatingObject = false;
    for (const row of this.objectivePanel.querySelectorAll('.info-row, .budget')) {
      row.style.display = this._evacuation ? 'none' : '';
    }
    this._syncHealthVisibility();
    if (this._evacuation) {
      this.vignetteEl.style.opacity = '0';
      this.vignetteDmgEl.style.opacity = '0';
    }
  }

  setHint(text, detail = '') {
    const signature = `${text}\u0000${detail}`;
    if (signature === this._lastHint) return; // evita reescrever o DOM a cada frame
    this._lastHint = signature;
    this._manipulatingObject = Boolean(detail);
    this._syncHealthVisibility();
    if (!text) {
      this.hintEl.style.display = 'none';
      this.manipulationHelpEl.style.display = 'none';
      return;
    }
    this.hintTextEl.textContent = text;
    this.manipulationHelpEl.style.display = detail ? 'flex' : 'none';
    this.hintEl.style.display = 'flex';
  }

  // Vinheta verde proporcional ao log da taxa de dose. A guarda evita
  // reescrever o estilo no DOM quando a variação visual seria imperceptível.
  setDoseRate(dose) {
    const v = THREE.MathUtils.clamp((Math.log10(Math.max(dose, 0.01)) - 0.4) / 2.4, 0, 0.9);
    if (Math.abs(v - this._lastVignette) > 0.02) {
      this._lastVignette = v;
      this.vignetteEl.style.opacity = v.toFixed(2);
    }
  }

  // vinheta vermelha enquanto a saúde está caindo (pulsa se saúde crítica)
  setDamage(damageRate, health, time) {
    let v = 0;
    if (damageRate > 0) v = Math.min(0.85, 0.2 + damageRate / 6);
    if (health < 30 && health > 0) v = Math.max(v, 0.25 + 0.15 * Math.sin(time * 6));
    if (Math.abs(v - this._lastDamage) < 0.02) return;
    this._lastDamage = v;
    this.vignetteDmgEl.style.opacity = v.toFixed(2);
  }

  toast(text, seconds = 3) {
    this.toastTextEl.textContent = text; // o texto vive num span; preserva a linha de pulso
    this.toastEl.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => { this.toastEl.style.opacity = '0'; }, seconds * 1000);
  }

  update(elapsed, accumulated, doseLimit, health) {
    const m = Math.floor(elapsed / 60), s = Math.floor(elapsed % 60);
    this.timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    this.doseEl.textContent = `${accumulated.toFixed(3)} / ${doseLimit} µSv`;
    const frac = Math.min(1, accumulated / doseLimit);
    this.budgetEl.style.width = `${(frac * 100).toFixed(1)}%`;
    this.budgetEl.style.background = frac < 0.5 ? '#43df84' : frac < 0.8 ? '#f2c94c' : '#ff5964';

    const hFrac = health / HEALTH_MAX;
    this.healthEl.style.width = `${(hFrac * 100).toFixed(1)}%`;
    this.healthEl.style.background = hFrac > 0.5 ? '#35e0ff' : hFrac > 0.25 ? '#f2c94c' : '#ff5964';
    this.healthValEl.textContent = `${Math.round(health)}%`;
  }
}
