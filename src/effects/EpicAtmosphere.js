import * as THREE from 'three';
import { EVAC_PHASE, MENU_MUSIC_FROM_PHASE } from '../config/gameConfig.js';

// ==== EPICATMOSPHERE ========================================================
// A partir da fase 8 (mesma virada da trilha sonora), o laboratório inteiro
// ganha um clima radioativo "épico": uma névoa verde que borra toda a cena e
// um enxame de partículas verdes flutuando por todo o ambiente. Fases 1–7 e a
// evacuação ficam com o visual normal. Reaproveita a fog nativa da cena (o
// viewmodel do monitor é renderizado em cena própria, então não é afetado).
export class EpicAtmosphere {
  constructor(scene, ceilingMat = null) {
    this.scene = scene;
    this.active = false;
    this._t = 0;
    this.speedMultiplier = 1;

    // fog/fundo originais, para restaurar ao desligar
    this._baseFog = { color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far };
    this._baseBg = scene.background?.isColor ? scene.background.clone() : null;
    this._greenFog = new THREE.Color(0x0e3a16);
    this._greenBg = new THREE.Color(0x0a2410);

    // O teto é uma face virada para BAIXO e tem emissivo próprio, então nem a
    // fog nem a luz de preenchimento o esverdeiam — tingimos o material dele.
    this.ceilMat = ceilingMat;
    if (this.ceilMat) {
      this._baseCeil = { color: this.ceilMat.color.clone(), emissive: this.ceilMat.emissive.clone() };
      // Tom CLARO e suave (mesmo brilho do teto original, só com cast verde),
      // para o teto ficar como as paredes sob a névoa — não uma tinta chapada.
      this._greenCeilColor = new THREE.Color(0xbac8bc);
      this._greenCeilEmissive = new THREE.Color(0x4e6052);
    }

    // luz de preenchimento verde: tinge todo o cenário de leve quando ligada
    this.fill = new THREE.HemisphereLight(0x6cff4d, 0x0a2a12, 0);
    scene.add(this.fill);

    // enxame espalhado pelo laboratório inteiro (x ±10,5 · y 0,1–3,0 · z ±7,5)
    this.bounds = { x: 10.5, y0: 0.1, y1: 3.0, z: 7.5 };
    const N = 700;
    const positions = new Float32Array(N * 3);
    this._rise = new Float32Array(N); // velocidade de subida por partícula
    for (let i = 0; i < N; i++) {
      positions[i * 3]     = (Math.random() * 2 - 1) * this.bounds.x;
      positions[i * 3 + 1] = this.bounds.y0 + Math.random() * (this.bounds.y1 - this.bounds.y0);
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * this.bounds.z;
      this._rise[i] = 0.08 + Math.random() * 0.22;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.mat = new THREE.PointsMaterial({
      color: 0x9cff70, size: 0.05, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  // Da fase 8 à 12, a velocidade sobe linearmente de ×1 para ×2,4.
  // A progressão reproduz a sensação de intensificação das brasas do menu.
  setPhase(phase) {
    const progress = THREE.MathUtils.clamp(
      (phase - MENU_MUSIC_FROM_PHASE) / ((EVAC_PHASE - 1) - MENU_MUSIC_FROM_PHASE),
      0,
      1
    );
    this.speedMultiplier = THREE.MathUtils.lerp(1, 2.4, progress);
  }

  setActive(on) {
    on = Boolean(on);
    if (on === this.active) return;
    this.active = on;
    this.points.visible = on;
    if (on) {
      this.scene.fog.color.copy(this._greenFog);
      this.scene.fog.near = 6;
      this.scene.fog.far = 28;
      if (this._baseBg) this.scene.background.copy(this._greenBg);
      if (this.ceilMat) {
        this.ceilMat.color.copy(this._greenCeilColor);
        this.ceilMat.emissive.copy(this._greenCeilEmissive);
      }
    } else {
      this.scene.fog.color.copy(this._baseFog.color);
      this.scene.fog.near = this._baseFog.near;
      this.scene.fog.far = this._baseFog.far;
      if (this._baseBg) this.scene.background.copy(this._baseBg);
      if (this.ceilMat) {
        this.ceilMat.color.copy(this._baseCeil.color);
        this.ceilMat.emissive.copy(this._baseCeil.emissive);
      }
      this.mat.opacity = 0;
      this.fill.intensity = 0;
    }
  }

  update(dt) {
    if (!this.active) return;
    this._t += dt;
    const pulse = 0.8 + 0.2 * Math.sin(this._t * 1.6);
    this.mat.opacity = 0.55 * pulse;
    this.fill.intensity = 0.5 * pulse;

    const arr = this.points.geometry.attributes.position.array;
    for (let i = 0; i < this._rise.length; i++) {
      let y = arr[i * 3 + 1] + this._rise[i] * this.speedMultiplier * dt;
      arr[i * 3] += Math.sin(this._t * 0.5 + i) * 0.02 * this.speedMultiplier * dt;
      if (y > this.bounds.y1) { // reinsere embaixo, em novo x/z
        y = this.bounds.y0;
        arr[i * 3]     = (Math.random() * 2 - 1) * this.bounds.x;
        arr[i * 3 + 2] = (Math.random() * 2 - 1) * this.bounds.z;
      }
      arr[i * 3 + 1] = y;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
