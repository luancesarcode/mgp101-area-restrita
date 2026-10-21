import { BACKGROUND_DOSE, PLANT_CORE_SHIELD_EXP, SOURCE_MIN_DIST } from '../config/gameConfig.js';

// ==== PLANTRADIATION ========================================================
// Campo de radiação do modo Usina, com a mesma interface que o GeigerDetector
// espera de uma fonte (doseRateAt). Soma:
// - fundo por zona (contaminação espalhada: pátio, turbinas, reator...);
// - o núcleo exposto, intensíssimo e blindado pelas paredes de concreto;
// - os fragmentos de grafite ativos (no chão, carregados ou já guardados);
// - escombros contaminados invisíveis, que confundem a busca (como os NORMs).
export class PlantRadiation {
  constructor(shielding, zones) {
    this.shielding = shielding;
    this.zones = zones;
    this.core = null;
    this.coreIntensity = 0;
    this.coreMultiplier = 1;
    this.fragments = [];
    this.decoys = [];
    this._minD2 = SOURCE_MIN_DIST * SOURCE_MIN_DIST;
  }

  configure({ core, coreIntensity, fragments, decoys }) {
    this.core = core;
    this.coreIntensity = coreIntensity;
    this.coreMultiplier = 1;
    this.fragments = fragments;
    this.decoys = decoys;
  }

  zoneRate(pos) {
    for (const z of this.zones) {
      if (pos.x >= z.minX && pos.x <= z.maxX && pos.z >= z.minZ && pos.z <= z.maxZ) return z.rate;
    }
    return 0;
  }

  zoneName(pos) {
    for (const z of this.zones) {
      if (pos.x >= z.minX && pos.x <= z.maxX && pos.z >= z.minZ && pos.z <= z.maxZ) return z.name;
    }
    return 'área externa';
  }

  _term(src, intensity, pos, transmission) {
    return intensity * transmission / Math.max(pos.distanceToSquared(src), this._minD2);
  }

  coreDoseAt(pos) {
    if (!this.core) return 0;
    const t = this.shielding.transmission(this.core, pos, PLANT_CORE_SHIELD_EXP);
    return this._term(this.core, this.coreIntensity * this.coreMultiplier, pos, t);
  }

  doseRateAt(pos) {
    let dose = BACKGROUND_DOSE + this.zoneRate(pos) + this.coreDoseAt(pos);
    for (const f of this.fragments) {
      if (!f.hot || f.state === 'deposited') continue;
      // na tenaz não há nada entre o fragmento e o corpo
      const t = f.state === 'carried' ? 1 : this.shielding.transmission(f.position, pos, 1);
      dose += this._term(f.position, f.intensity, pos, t);
    }
    for (const d of this.decoys) {
      dose += this._term(d.position, d.intensity, pos, this.shielding.transmission(d.position, pos, 1));
    }
    return dose;
  }
}
