import { BACKGROUND_DOSE, EQUIPMENT_MAX_DOSE } from '../config/gameConfig.js';

// ==== GEIGERDETECTOR ========================================================
// Leitura física + valor exibido com ruído estatístico + dose acumulada.
export class GeigerDetector {
  constructor(source) {
    this.source = source;
    this.trueDose = BACKGROUND_DOSE;
    this.displayDose = BACKGROUND_DOSE;
    this.accumulated = 0; // µSv
    this.peakDose = 0;
    this.sampleInterval = 0.18;
    this._sampleTimer = 0;
    this._displayNoise = 0;
    this.transient = null;
    this.onSample = null;
    this.silent = false;
    this.evacuation = false;
  }

  // Nova fase: zera dose acumulada, pico e o estado do visor (a fonte é a
  // mesma instância, re-sorteada por respawn()).
  reset() {
    this.trueDose = BACKGROUND_DOSE;
    this.displayDose = BACKGROUND_DOSE;
    this.accumulated = 0;
    this.peakDose = 0;
    this._sampleTimer = 0;
    this._displayNoise = 0;
    this.transient = null;
  }

  setEvacuation(active) {
    this.evacuation = Boolean(active);
    this.silent = Boolean(active);
    this.trueDose = this.displayDose = BACKGROUND_DOSE;
    this.accumulated = 0;
    this.peakDose = 0;
  }

  showTransient(line1, line2, seconds = 1.3) {
    this.transient = { line1, line2, until: performance.now() / 1000 + seconds };
    if (this.onSample) this.onSample();
  }

  update(dt, playerEyePos) {
    this.trueDose = this.evacuation ? BACKGROUND_DOSE : this.source.doseRateAt(playerEyePos);
    if (!this.evacuation) this.accumulated += this.trueDose * dt / 3600;
    if (this.trueDose > this.peakDose) this.peakDose = this.trueDose;

    if (this.transient && performance.now() / 1000 > this.transient.until) {
      this.transient = null;
      if (this.onSample) this.onSample();
    }

    this._sampleTimer += dt;
    let sampled = false;
    if (this._sampleTimer >= this.sampleInterval) {
      this._sampleTimer -= this.sampleInterval;
      const rel = 0.05 + 0.06 / Math.sqrt(Math.max(this.trueDose, 0.05));
      this._displayNoise = this._gaussian() * rel;
      sampled = true;
    }
    // A dose real é recalculada a cada frame. Aplicar o último ruído de
    // amostragem sobre ela evita que o visor fique preso entre duas leituras
    // quando o jogador está se movendo.
    this.displayDose = Math.max(0.01, this.trueDose * (1 + this._displayNoise));
    if (sampled && this.onSample) this.onSample();
  }

  _gaussian() { // Box-Muller
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  formatDisplay() {
    if (this.transient) return { line1: this.transient.line1, line2: this.transient.line2 };
    const v = this.displayDose;
    if (v > EQUIPMENT_MAX_DOSE) return { line1: 'H*(10)  µSv/h', line2: 'OverLoad' };
    const num = v < 10 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toString();
    return { line1: 'H*(10)  µSv/h', line2: num };
  }
}
