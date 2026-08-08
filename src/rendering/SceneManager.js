import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// ==== SCENEMANAGER ==========================================================
// Cena principal, câmera, luzes, renderer + pós-processamento (bloom).
// Mantém também a cena separada do viewmodel, renderizada por cima.
export class SceneManager {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x11151c);
    this.scene.fog = new THREE.Fog(0x11151c, 18, 40);

    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 80);

    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.domElement.classList.add('webgl');
    document.body.appendChild(this.renderer.domElement);

    // Composer: cena → bloom (apenas áreas brilhantes) → saída
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.4, 0.75);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    // Qualidade adaptativa (ver Game._adaptQuality): 0 alta · 1 média · 2 baixa
    this.quality = 0;
    this.useComposer = true;

    this._buildLights();
    addEventListener('resize', () => this._onResize());
  }

  setQuality(level) {
    level = Math.max(0, Math.min(2, level));
    if (level === this.quality) return;
    this.quality = level;
    const ratio = [Math.min(devicePixelRatio, 1.5), Math.min(devicePixelRatio, 1.25), 1][level];
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
    this.bloom.strength = [0.38, 0.26, 0][level];
    this.useComposer = level < 2; // nível 2: render direto, sem pós-processamento
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xdfe8f5, 0x39404d, 0.85));

    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(8, 10, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14; sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 12;  sun.shadow.camera.bottom = -12;
    sun.shadow.camera.far = 40;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025; // remove o serrilhado (acne) em arestas finas
    this.scene.add(sun);

    this.vmScene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.5));
    const vmKey = new THREE.DirectionalLight(0xffffff, 1.6);
    vmKey.position.set(-0.5, 1, 0.6);
    this.vmScene.add(vmKey);
  }

  _onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = innerWidth / innerHeight;
    this.vmCamera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  render() {
    if (this.useComposer) {
      this.composer.render();
    } else {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
    }
    this.renderer.clearDepth();
    this.renderer.render(this.vmScene, this.vmCamera);
  }
}
