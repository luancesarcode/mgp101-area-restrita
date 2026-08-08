import * as THREE from 'three';
import { BACKGROUND_DOSE, DECOY_COUNT, ISOTOPES, SOURCE_MIN_DIST } from '../config/gameConfig.js';
import { SurfaceSampler } from '../world/SurfaceSampler.js';

// ==== RADIATIONSOURCE =======================================================
// A fonte é uma PASTILHA física. A posição é PROCEDURAL a cada partida:
// ~93% de chance de estar dentro de um container (armário, gaveta, barril,
// caixa, maleta) e ~7% apoiada em uma superfície aleatória (piso, tampos,
// atrás de móveis) — sempre com gravidade, nunca flutuando. Também sorteia o
// isótopo e posiciona fontes falsas NORM procedurais.
export class RadiationSource {
  constructor(scene, lab, shielding) {
    this.scene = scene;
    this.lab = lab;
    this.shielding = shielding;
    this._minD2 = SOURCE_MIN_DIST * SOURCE_MIN_DIST;
    this._sampler = new SurfaceSampler(lab.colliders);

    // pastilha: cilindro cerâmico escuro com leve brilho (criada UMA vez;
    // as fases seguintes reutilizam a mesma malha via respawn())
    this.pellet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.028, 0.028, 0.06, 14),
      new THREE.MeshStandardMaterial({
        color: 0x40463f, roughness: 0.35, metalness: 0.45,
        emissive: 0x2c5a18, emissiveIntensity: 0.9,
      })
    );
    this.pellet.rotation.z = Math.PI / 2; // deitada
    this.pellet.castShadow = true;

    this.position = new THREE.Vector3();
    this.decoys = [];
    this.debugTransmission = 1;
    this.baseIntensity = 0;
    this.unstable = false;
    this.active = true;
    this.respawn(1);
  }

  // Nova fase: re-sorteia isótopo, intensidade, esconderijo e NORMs,
  // reutilizando a mesma pastilha/material (nada novo entra na GPU).
  respawn(intensityMultiplier = 1, decoyCount = DECOY_COUNT) {
    this.active = true;
    this.pellet.removeFromParent();

    this.isotope = ISOTOPES[Math.floor(Math.random() * ISOTOPES.length)];
    const [lo, hi] = this.isotope.intensity;
    this.intensity = Math.round((lo + Math.random() * (hi - lo)) * intensityMultiplier);
    this.baseIntensity = this.intensity;
    this.unstable = false;

    // A fonte quase sempre fica escondida DENTRO de um recipiente; ficar à
    // mostra (chão, tampos, estantes) é raro. Entre os recipientes, as gavetas
    // pesam pouco no sorteio — são muitas e não devem concentrar as fontes.
    const mounts = this.lab.containers.filter((c) => c.pelletMount);
    if (Math.random() < 0.93 && mounts.length) {
      this.container = this._pickContainer(mounts);
      this.spotName = `dentro de: ${this.container.name}`;
      this.container.pelletMount.add(this.pellet);
      this.pellet.position.copy(this.container.pelletLocal);
      this.container.pelletMount.updateMatrixWorld(true);
    } else {
      this.container = null;
      const s = this._sampler.sample();
      this.spotName = s.desc;
      this.scene.add(this.pellet);
      this.pellet.position.copy(s.position);
    }
    this.pellet.getWorldPosition(this.position);

    // Fontes falsas NORM procedurais. Elas crescem pela raiz da pressão da
    // fase: continuam críveis sem virar fontes letais ou acompanhar 1:1 a fonte.
    this.decoys.length = 0;
    for (let i = 0; i < decoyCount; i++) {
      const d = this._sampler.sample();
      this.decoys.push({
        position: d.position.clone(),
        name: d.desc,
        intensity: (12 + Math.random() * 20) * Math.sqrt(intensityMultiplier), // µSv/h @1m
      });
    }

    this.debugTransmission = 1;
  }

  // Sorteio ponderado dos recipientes: cada gaveta conta 0.25 e os demais 1.
  // Como há muitas gavetas, sem isso elas dominariam os sorteios; assim a
  // chance de a fonte cair numa gaveta específica (e nas gavetas em geral)
  // fica baixa, favorecendo caixas, armários, barris e maletas.
  _pickContainer(mounts) {
    const weight = (c) => (/gaveta/i.test(c.name) ? 0.25 : 1);
    let total = 0;
    for (const c of mounts) total += weight(c);
    let r = Math.random() * total;
    for (const c of mounts) {
      r -= weight(c);
      if (r < 0) return c;
    }
    return mounts[mounts.length - 1];
  }

  disable() {
    this.active = false;
    this.pellet.removeFromParent();
    this.decoys.length = 0;
    this.intensity = 0;
    this.baseIntensity = 0;
    this.unstable = false;
    this.debugTransmission = 1;
  }

  // A desestabilização é aplicada somente uma vez na fase atual. As fontes
  // falsas NORM continuam iguais: é a pastilha perdida que passa a emitir mais.
  destabilize(multiplier) {
    if (this.unstable) return false;
    this.unstable = true;
    this.intensity = Math.round(this.baseIntensity * multiplier);
    return true;
  }

  // A pastilha pode se mover (gaveta abrindo): sincroniza a posição da fonte
  refreshPosition() {
    this.pellet.getWorldPosition(this.position);
  }

  isCollectable() {
    return !this.container || this.container.open;
  }

  doseRateAt(pos) {
    if (!this.active) return BACKGROUND_DOSE;
    let dose = BACKGROUND_DOSE;
    this.debugTransmission = this.shielding.transmission(this.position, pos, this.isotope.shieldExp);
    dose += this._term(this.position, this.intensity, pos, this.debugTransmission);
    for (let i = 0; i < this.decoys.length; i++) {
      const d = this.decoys[i];
      const t = this.shielding.transmission(d.position, pos, 1.0);
      dose += this._term(d.position, d.intensity, pos, t);
    }
    return dose;
  }

  _term(srcPos, intensity, pos, transmission) {
    const d2 = pos.distanceToSquared(srcPos);
    return intensity * transmission / Math.max(d2, this._minD2);
  }

  horizontalDistanceTo(pos) {
    return Math.hypot(pos.x - this.position.x, pos.z - this.position.z);
  }
}
