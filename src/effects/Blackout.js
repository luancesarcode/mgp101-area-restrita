import * as THREE from 'three';

// ==== BLACKOUT ==============================================================
// Dificuldade Blackout: a energia do laboratório caiu. Luminárias, forro e a
// luz ambiente se apagam; só sobram a luz de emergência sobre a porta, as
// telas, os LEDs e a lanterna de capacete do jogador (L / RB liga e desliga).
// O MGP-101 é desenhado em cena própria, com luzes próprias: no apagão elas
// também baixam e o painel (material sem iluminação) é escurecido por tinta.
// O LCD fica intocado — retroiluminado, continua legível no escuro.
//
// A troca de visibilidade das luzes só acontece no início da fase (recompila
// os shaders uma vez). Ligar/desligar a lanterna mexe apenas na intensidade,
// para não travar o jogo no meio da busca.
export class Blackout {
  constructor(sceneManager, mats, viewmodel = null) {
    this.sm = sceneManager;
    this.mats = mats;
    // face do aparelho: a malha cujo material usa a textura do painel
    this.faceMat = null;
    viewmodel?.group.traverse((o) => {
      if (o.isMesh && o.material.map && o.material.map === viewmodel.faceTexture) this.faceMat = o.material;
    });
    this.active = false;
    this.flashlightOn = true;
    this._t = 0;
    this._dir = new THREE.Vector3();
    this._base = {
      hemi: sceneManager.hemi.intensity,
      sun: sceneManager.sun.intensity,
      panel: mats.lightPanel.emissiveIntensity,
      ceilEmissive: mats.ceiling.emissive.clone(),
      vmHemi: sceneManager.vmHemi.intensity,
      vmKey: sceneManager.vmKey.intensity,
      face: this.faceMat ? this.faceMat.color.clone() : null,
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
    this._applyDevice();
  }

  // Luz sobre o MGP-101: quase nada no escuro, um pouco da lanterna quando ligada.
  _applyDevice() {
    const b = this._base, sm = this.sm;
    if (!this.active) {
      sm.vmHemi.intensity = b.vmHemi;
      sm.vmKey.intensity = b.vmKey;
      if (this.faceMat) this.faceMat.color.copy(b.face);
      return;
    }
    sm.vmHemi.intensity = this.flashlightOn ? 0.22 : 0.06;
    sm.vmKey.intensity = this.flashlightOn ? 0.3 : 0.05;
    if (this.faceMat) this.faceMat.color.setHex(this.flashlightOn ? 0x5c626b : 0x1e2227);
  }

  // Devolve true quando a lanterna mudou de estado (só existe no Blackout).
  toggleFlashlight() {
    if (!this.active) return false;
    this.flashlightOn = !this.flashlightOn;
    this.flashlight.intensity = this.flashlightOn ? this.flashlightIntensity : 0;
    this._applyDevice();
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
