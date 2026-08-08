import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GeigerDetector } from '../../src/radiation/GeigerDetector.js';
import { RadiationSource } from '../../src/radiation/RadiationSource.js';
import { ShieldingModel } from '../../src/radiation/ShieldingModel.js';
import { HealthSystem } from '../../src/gameplay/HealthSystem.js';

describe('radiação e blindagem', () => {
  it('aplica a transmissão e o expoente do isótopo', () => {
    const shielding = new ShieldingModel();
    shielding.add(
      new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5)),
      0.25,
    );

    expect(shielding.transmission(new THREE.Vector3(-2, 0, 0), new THREE.Vector3(2, 0, 0), 1)).toBeCloseTo(0.25);
    expect(shielding.transmission(new THREE.Vector3(-2, 0, 0), new THREE.Vector3(2, 0, 0), 0.5)).toBeCloseTo(0.5);
  });

  it('acumula dose usando taxa vezes tempo dividido por 3600', () => {
    const detector = new GeigerDetector({ doseRateAt: () => 7200 });
    detector.update(0.5, new THREE.Vector3());

    expect(detector.trueDose).toBe(7200);
    expect(detector.accumulated).toBeCloseTo(1);
    expect(detector.peakDose).toBe(7200);
  });

  it('preserva a lei do inverso do quadrado e a distância mínima', () => {
    const source = Object.create(RadiationSource.prototype);
    source.active = true;
    source.position = new THREE.Vector3(0, 0, 0);
    source.intensity = 400;
    source.isotope = { shieldExp: 1 };
    source.shielding = { transmission: () => 1 };
    source.decoys = [];
    source._minD2 = 0.4 ** 2;

    expect(source.doseRateAt(new THREE.Vector3(1, 0, 0))).toBeCloseTo(400.12);
    expect(source.doseRateAt(new THREE.Vector3(2, 0, 0))).toBeCloseTo(100.12);
    expect(source.doseRateAt(new THREE.Vector3(0.1, 0, 0))).toBeCloseTo(2500.12);
  });

  it('desestabiliza a fonte uma única vez', () => {
    const source = Object.create(RadiationSource.prototype);
    source.unstable = false;
    source.baseIntensity = 700;

    expect(source.destabilize(2.2)).toBe(true);
    expect(source.intensity).toBe(1540);
    expect(source.destabilize(2.6)).toBe(false);
    expect(source.intensity).toBe(1540);
  });

  it('entra em OverLoad somente acima de 10000', () => {
    const detector = new GeigerDetector({ doseRateAt: () => 0.12 });
    detector.displayDose = 10000;
    expect(detector.formatDisplay().line2).toBe('10000');

    detector.displayDose = 10000.01;
    expect(detector.formatDisplay().line2).toBe('OverLoad');
  });
});

describe('saúde', () => {
  it('limita o dano a 5 HP por segundo', () => {
    const health = new HealthSystem();
    health.update(2, 100000);

    expect(health.damageRate).toBe(5);
    expect(health.health).toBe(90);
  });

  it('regenera e preserva o fator mínimo de velocidade', () => {
    const health = new HealthSystem();
    health.health = 0;
    expect(health.speedFactor()).toBe(0.45);

    health.health = 50;
    health.update(1, 0);
    expect(health.health).toBeCloseTo(51.2);
    expect(health.speedFactor()).toBeGreaterThan(0.45);
    expect(health.speedFactor()).toBeLessThan(1);
  });
});
