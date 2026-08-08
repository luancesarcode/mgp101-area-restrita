import * as THREE from 'three';

// ==== SURFACESAMPLER ========================================================
// Amostra posições procedurais que respeitam a "gravidade": um ponto (x,z)
// aleatório é apoiado sobre a superfície mais alta abaixo dele (piso, tampo,
// caixa...). Nunca gera pastilha flutuando nem dentro de sólidos.
export class SurfaceSampler {
  constructor(colliders) {
    this.all = colliders;
    // móveis: exclui paredes/divisória (muito extensas ou altas)
    this.furniture = colliders.filter(b =>
      (b.max.x - b.min.x) < 8 && (b.max.z - b.min.z) < 8 && (b.max.y - b.min.y) < 2.5);
  }

  // altura de apoio em (x,z): topo mais alto (≤1.75 m) que contém o ponto
  supportHeightAt(x, z) {
    let y = 0;
    for (const b of this.all) {
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z &&
          b.max.y <= 1.75 && b.max.y > y) y = b.max.y;
    }
    return y;
  }

  sample() {
    for (let t = 0; t < 50; t++) {
      let x, z, mode;
      const r = Math.random();
      const rand = (a, b) => a + Math.random() * (b - a);
      if (r < 0.45 && this.furniture.length) { // junto a um móvel (escondido)
        const b = this.furniture[(Math.random() * this.furniture.length) | 0];
        const off = 0.2 + Math.random() * 0.45;
        const side = (Math.random() * 4) | 0;
        if (side === 0) { x = b.min.x - off; z = rand(b.min.z, b.max.z); }
        else if (side === 1) { x = b.max.x + off; z = rand(b.min.z, b.max.z); }
        else if (side === 2) { z = b.min.z - off; x = rand(b.min.x, b.max.x); }
        else { z = b.max.z + off; x = rand(b.min.x, b.max.x); }
        mode = 'no piso, junto a um móvel';
      } else if (r < 0.75 && this.furniture.length) { // sobre um móvel
        const b = this.furniture[(Math.random() * this.furniture.length) | 0];
        if (b.max.y > 1.0) continue;
        x = rand(b.min.x + 0.1, b.max.x - 0.1);
        z = rand(b.min.z + 0.1, b.max.z - 0.1);
        mode = 'sobre um móvel';
      } else { // qualquer ponto do laboratório
        x = (Math.random() * 2 - 1) * 10.3;
        z = (Math.random() * 2 - 1) * 7.3;
        mode = 'no piso do laboratório';
      }
      if (Math.abs(x) > 10.4 || Math.abs(z) > 7.4) continue;
      const y = this.supportHeightAt(x, z);
      if (y > 1.7) continue;
      return {
        position: new THREE.Vector3(x, y + 0.032, z),
        desc: y > 0.05 ? 'sobre uma superfície' : mode,
      };
    }
    return { position: new THREE.Vector3(0, 0.032, 2), desc: 'no piso do laboratório' };
  }
}
