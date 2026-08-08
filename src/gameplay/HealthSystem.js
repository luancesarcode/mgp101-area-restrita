import { HEALTH_DAMAGE_DIVISOR, HEALTH_DAMAGE_MAX, HEALTH_DAMAGE_THRESHOLD, HEALTH_MAX, HEALTH_REGEN_RATE, HEALTH_SLOW_MIN, HEALTH_SLOW_START } from '../config/gameConfig.js';

// ==== HEALTHSYSTEM ==========================================================
// Barra de vida por dano de radiação: acima do limiar de taxa de dose a
// saúde cai proporcionalmente ao excesso (efeito determinístico dramatizado);
// em áreas de baixa taxa há regeneração lenta (reparo celular).
export class HealthSystem {
  constructor() {
    this.health = HEALTH_MAX;
    this.minHealth = HEALTH_MAX; // menor valor atingido (estatística final)
    this.damageRate = 0;         // HP/s sendo perdidos agora
  }

  reset() {
    this.health = HEALTH_MAX;
    this.minHealth = HEALTH_MAX;
    this.damageRate = 0;
  }

  // Fator de velocidade pelas queimaduras radioativas: 1 acima de
  // HEALTH_SLOW_START, caindo até HEALTH_SLOW_MIN conforme a saúde vai a zero.
  speedFactor() {
    if (this.health >= HEALTH_SLOW_START) return 1;
    const t = Math.max(0, this.health) / HEALTH_SLOW_START; // 1 no limiar → 0 em saúde zero
    return HEALTH_SLOW_MIN + (1 - HEALTH_SLOW_MIN) * t;
  }

  update(dt, doseRate) {
    if (doseRate > HEALTH_DAMAGE_THRESHOLD) {
      // dano limitado por um teto: a saúde cai mais devagar e nunca é morte
      // instantânea, mesmo com a fonte estourando o monitor.
      this.damageRate = Math.min(HEALTH_DAMAGE_MAX, (doseRate - HEALTH_DAMAGE_THRESHOLD) / HEALTH_DAMAGE_DIVISOR);
      this.health = Math.max(0, this.health - this.damageRate * dt);
      if (this.health < this.minHealth) this.minHealth = this.health;
    } else {
      // Enquanto o risco não está alto (abaixo do limiar de dano), a saúde se
      // recupera devagar. Quanto mais baixa a taxa, mais rápido o reparo; perto
      // do limiar a regeneração praticamente some.
      this.damageRate = 0;
      if (this.health > 0) {
        const safety = 1 - doseRate / HEALTH_DAMAGE_THRESHOLD; // 1 no fundo → 0 no limiar
        this.health = Math.min(HEALTH_MAX, this.health + HEALTH_REGEN_RATE * safety * dt);
      }
    }
  }

  isDead() { return this.health <= 0; }
}
