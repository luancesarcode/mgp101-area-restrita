import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BACKGROUND_DOSE, PLANT_CORE_SHIELD_EXP, PLANT_PROFILES } from '../../src/config/gameConfig.js';
import { PlantRadiation } from '../../src/radiation/PlantRadiation.js';
import { ShieldingModel } from '../../src/radiation/ShieldingModel.js';

const zones = [
  { name: 'reator', minX: 0, maxX: 10, minZ: -10, maxZ: 0, rate: 60 },
  { name: 'pátio', minX: -50, maxX: 50, minZ: -50, maxZ: 50, rate: 1 },
];

describe('radiação do modo Usina', () => {
  it('usa o fundo da primeira zona que contém o ponto', () => {
    const r = new PlantRadiation(new ShieldingModel(), zones);
    r.configure({ core: null, coreIntensity: 0, fragments: [], decoys: [] });
    expect(r.doseRateAt(new THREE.Vector3(5, 1, -5))).toBeCloseTo(BACKGROUND_DOSE + 60);
    expect(r.doseRateAt(new THREE.Vector3(20, 1, 20))).toBeCloseTo(BACKGROUND_DOSE + 1);
    expect(r.zoneName(new THREE.Vector3(5, 1, -5))).toBe('reator');
  });

  it('blinda o núcleo com o expoente de gama duro', () => {
    const shielding = new ShieldingModel();
    shielding.add(new THREE.Box3(new THREE.Vector3(4, -5, -5), new THREE.Vector3(6, 5, 5)), 0.01);
    const r = new PlantRadiation(shielding, []);
    r.configure({ core: new THREE.Vector3(0, 0, 0), coreIntensity: 10000, fragments: [], decoys: [] });
    const behindWall = r.coreDoseAt(new THREE.Vector3(10, 0, 0));
    expect(behindWall).toBeCloseTo(10000 / 100 * Math.pow(0.01, PLANT_CORE_SHIELD_EXP));
    r.coreMultiplier = 2; // pico de emissão
    expect(r.coreDoseAt(new THREE.Vector3(10, 0, 0))).toBeCloseTo(behindWall * 2);
  });

  it('ignora fragmentos inertes ou guardados e não blinda o que está na tenaz', () => {
    const shielding = new ShieldingModel();
    shielding.add(new THREE.Box3(new THREE.Vector3(0.4, -1, -1), new THREE.Vector3(0.6, 1, 1)), 0.1);
    const r = new PlantRadiation(shielding, []);
    const frag = { hot: true, intensity: 1000, state: 'floor', position: new THREE.Vector3(0, 0, 0) };
    const cold = { hot: false, intensity: 0, state: 'floor', position: new THREE.Vector3(0, 0, 0) };
    r.configure({ core: null, coreIntensity: 0, fragments: [frag, cold], decoys: [] });
    const at = new THREE.Vector3(1, 0, 0);
    expect(r.doseRateAt(at) - BACKGROUND_DOSE).toBeCloseTo(100);
    frag.state = 'carried';
    expect(r.doseRateAt(at) - BACKGROUND_DOSE).toBeCloseTo(1000);
    frag.state = 'deposited';
    expect(r.doseRateAt(at)).toBeCloseTo(BACKGROUND_DOSE);
  });

  it('mantém o perfil Liquidante mais exigente que o Reconhecimento', () => {
    const { recon, liquidator } = PLANT_PROFILES;
    expect(liquidator.hotFragments).toBeGreaterThan(recon.hotFragments);
    expect(liquidator.doseLimit).toBeLessThan(recon.doseLimit);
    expect(liquidator.coreIntensity).toBeGreaterThan(recon.coreIntensity);
    expect(liquidator.auraDistance).toBeLessThan(recon.auraDistance);
  });
});
