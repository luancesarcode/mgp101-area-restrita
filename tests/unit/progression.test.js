import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, EVAC_PHASE, PHASE_INTENSITY_MAX } from '../../src/config/gameConfig.js';
import { Game } from '../../src/core/Game.js';

const phaseDifficulty = (base, phase) => Game.prototype._makePhaseDifficulty.call({}, base, phase);

describe('progressão da campanha', () => {
  it('preserva os valores base na fase 1', () => {
    const result = phaseDifficulty(DIFFICULTIES.normal, 1);

    expect(result.fieldFadeStart).toBe(2.8);
    expect(result.doseLimit).toBe(10);
    expect(result.intensityMultiplier).toBe(1);
    expect(result.decoyCount).toBe(1);
    expect(result.destabilizeAfter).toBe(80);
    expect(result.destabilizeMultiplier).toBe(1.7);
  });

  it('atinge a progressão documentada na fase 12', () => {
    const normal = phaseDifficulty(DIFFICULTIES.normal, 12);
    const hard = phaseDifficulty(DIFFICULTIES.hard, 12);

    expect(normal.intensityMultiplier).toBeCloseTo(PHASE_INTENSITY_MAX, 10);
    expect(normal.decoyCount).toBe(3);
    expect(normal.destabilizeAfter).toBe(36);
    expect(normal.destabilizeMultiplier).toBeCloseTo(2.2, 10);
    expect(hard.decoyCount).toBe(4);
    expect(hard.destabilizeAfter).toBe(18);
    expect(hard.destabilizeMultiplier).toBeCloseTo(2.6, 10);
  });

  it('desativa radiação e dano na evacuação', () => {
    const result = phaseDifficulty(DIFFICULTIES.hard, EVAC_PHASE);

    expect(result.evacuation).toBe(true);
    expect(result.doseLimit).toBe(Infinity);
    expect(result.intensityMultiplier).toBe(0);
    expect(result.decoyCount).toBe(0);
    expect(result.healthDamage).toBe(false);
  });
});
