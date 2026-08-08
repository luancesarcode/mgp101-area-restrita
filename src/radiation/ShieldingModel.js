import * as THREE from 'three';

// ==== SHIELDINGMODEL ========================================================
// Blindagem: cada obstáculo (Box3) tem um fator de transmissão. A dose que
// chega ao jogador é multiplicada pela transmissão de tudo que o segmento
// fonte→jogador atravessa, elevada ao expoente do isótopo.
export class ShieldingModel {
  constructor() {
    this.entries = [];
    this._ray = new THREE.Ray();
    this._hit = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  add(box, transmission) {
    const entry = { box, transmission };
    this.entries.push(entry);
    return entry;
  }

  transmission(from, to, exp) {
    this._dir.copy(to).sub(from);
    const len = this._dir.length();
    if (len < 1e-6) return 1;
    this._ray.origin.copy(from);
    this._ray.direction.copy(this._dir).divideScalar(len);
    let t = 1;
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i];
      if (this._ray.intersectBox(e.box, this._hit) &&
          this._hit.distanceToSquared(this._ray.origin) <= len * len) {
        t *= Math.pow(e.transmission, exp);
      }
    }
    return t;
  }
}
