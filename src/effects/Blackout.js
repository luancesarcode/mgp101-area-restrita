import * as THREE from 'three';

// ==== BLACKOUT ==============================================================
// Dificuldade Blackout: a energia do laboratório caiu. Luminárias, forro e a
// luz ambiente se apagam; só sobram a luz de emergência sobre a porta, as
// telas, os LEDs e a lanterna de capacete do jogador (L / RB liga e desliga).
//
// A troca de visibilidade das luzes só acontece no início da fase (recompila
// os shaders uma vez). Ligar/desligar a lanterna mexe apenas na intensidade,
// para não travar o jogo no meio da busca.
export class Blackout {
  constructor(sceneManager, mats) {
    this.sm = sceneManager;
    this.mats = mats;
    this.active = false;
    this.flashlightOn = true;
    this._t = 0;
    this._dir = new THREE.Vector3();
    this._base = {
      hemi: sceneManager.hemi.intensity,
      sun: sceneManager.sun.intensity,
      panel: mats.lightPanel.emissiveIntensity,
      ceilEmissive: mats.ceiling.emissive.clone(),
    };

    this.flashlightIntensity = 26;
    this.flashlight = new THREE.SpotLight(0xfff1dc, this.flashlightIntensity, 16, 0.42, 0.55, 1.6);
    this.flashlight.castShadow = true;
    this.flashlight.shadow.mapSize.set(1024, 1024);
    this.flashlight.shadow.camera.near = 0.1;
    this.flashlight.shadow.camera.far = 16;
    this.flashlight.shadow.bias = -0.0006;
    this.flashlight.shadow.normalBias = 0.03;
    this.flashlight.target = new THREE.Object3D();
    this.flashlight.visible = false;
    sceneManager.scene.add(this.flashlight, this.flashlight.target);

    // luz de emergência vermelha e fraca sobre a porta de saída
    this.emergency = new THREE.PointLight(0xff2a1a, 1.4, 9, 1.8);
    this.emergency.position.set(0.5, 2.6, 7.3);
    this.emergency.visible = false;
    sceneManager.scene.add(this.emergency);
  }

  // Aplica (ou desfaz) o apagão. Pode ser chamado de novo com `true` para
  // reaplicar depois que outro efeito mexer no forro (clima épico da fase 8+).
  setActive(on) {
    this.active = Boolean(on);
    const b = this._base;
    this.sm.hemi.intensity = this.active ? 0.018 : b.hemi;
    this.sm.sun.intensity = this.active ? 0 : b.sun;
    this.mats.lightPanel.emissiveIntensity = this.active ? 0 : b.panel;
    if (this.active) this.mats.ceiling.emissive.setRGB(0, 0, 0);
    else this.mats.ceiling.emissive.copy(b.ceilEmissive);
    this.flashlight.visible = this.active;
    this.emergency.visible = this.active;
    if (this.active) {
      this.flashlightOn = true;
      this.flashlight.intensity = this.flashlightIntensity;
    }
  }

  // Devolve true quando a lanterna mudou de estado (só existe no Blackout).
  toggleFlashlight() {
    if (!this.active) return false;
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? this.flashlightIntensity : 0;
    return true;
  }

  // A lanterna sai do capacete (um pouco abaixo e à direita dos olhos) e
  // aponta para onde o jogador olha. Falha de leve de vez em quando.
  update(dt, camera) {
    if (!this.active) return;
    this._t += dt;
    camera.getWorldDirection(this._dir);
    this.flashlight.position.copy(camera.position);
    this.flashlight.position.y -= 0.08;
    this.flashlight.target.position.copy(camera.position).addScaledVector(this._dir, 6);
    if (this.flashlightOn) {
      const flicker = Math.sin(this._t * 0.9) > 0.985 ? 0.35 + Math.random() * 0.4 : 1;
      this.flashlight.intensity = this.flashlightIntensity * flicker;
    }
    this.emergency.intensity = 1.1 + 0.3 * Math.sin(this._t * 2.4);
  }
}
