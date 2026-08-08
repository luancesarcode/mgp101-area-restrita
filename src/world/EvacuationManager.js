import * as THREE from 'three';

// ==== EVACUATIONMANAGER =====================================================
// Reutiliza o laboratório, os contêineres e a porta existentes para a fase de evacuação.
// A chave e a névoa são criadas uma vez e apenas alternam de estado entre fases.
export class EvacuationManager {
  constructor(scene, lab) {
    this.scene = scene;
    this.lab = lab;
    this.exitDoor = lab.exitDoor;
    this.active = false;
    this.hasKey = false;
    this.completed = false;
    this.chamberActivated = false;
    this.keyContainer = null;
    this.keyPosition = new THREE.Vector3();
    this._baseFog = scene.fog ? {
      color: scene.fog.color.clone(), near: scene.fog.near, far: scene.fog.far,
    } : null;
    this._baseBackground = scene.background?.isColor ? scene.background.clone() : null;
    this._whiteColor = new THREE.Color(0xffffff);
    this.whiteoutEl = document.getElementById('evac-whiteout');
    this.key = this._buildKey();
    this.corridorColliders = [];
    this.fog = this._buildFog();
  }

  _buildKey() {
    const key = new THREE.Group();
    const agedMetal = new THREE.MeshStandardMaterial({
      color: 0x8b7447, metalness: 0.82, roughness: 0.42, flatShading: true,
    });
    const darkMetal = new THREE.MeshStandardMaterial({
      color: 0x45463f, metalness: 0.78, roughness: 0.5, flatShading: true,
    });
    const addPart = (geometry, material, x, y, z = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rz;
      mesh.castShadow = mesh.receiveShadow = true;
      key.add(mesh);
      return mesh;
    };

    // Aro antigo octogonal, inspirado no modelo fornecido.
    addPart(new THREE.TorusGeometry(1.18, 0.18, 8, 18), agedMetal, 0, -2.05);
    addPart(new THREE.CylinderGeometry(0.24, 0.21, 0.5, 8), darkMetal, -0.54, -1.03, 0, -0.42);
    addPart(new THREE.CylinderGeometry(0.24, 0.21, 0.5, 8), darkMetal, 0.54, -1.03, 0, 0.42);

    // Haste com pescoço e anéis decorativos em baixo-relevo.
    addPart(new THREE.CylinderGeometry(0.13, 0.16, 3.35, 8), agedMetal, 0, 0.05);
    addPart(new THREE.CylinderGeometry(0.2, 0.24, 0.52, 8), agedMetal, 0, -1.12);
    for (const [y, top, bottom] of [
      [-0.55, 0.21, 0.27], [-0.29, 0.28, 0.21], [0.02, 0.21, 0.27], [0.28, 0.27, 0.21],
    ]) addPart(new THREE.CylinderGeometry(top, bottom, 0.19, 8), darkMetal, 0, y);

    // Haste superior afunilada e bandas de reforço.
    addPart(new THREE.CylinderGeometry(0.105, 0.13, 2.35, 8), agedMetal, 0, 2.62);
    for (const y of [1.58, 2.25, 3.08]) {
      addPart(new THREE.CylinderGeometry(0.145, 0.145, 0.09, 8), darkMetal, 0, y);
    }

    // Segredo/dentes laterais: volumes assimétricos deixam a silhueta legível.
    addPart(new THREE.BoxGeometry(0.52, 0.72, 0.34), agedMetal, -0.22, 3.72);
    addPart(new THREE.BoxGeometry(0.4, 0.86, 0.42), darkMetal, -0.66, 3.72);
    addPart(new THREE.BoxGeometry(0.36, 0.22, 0.48), agedMetal, -1.02, 4.02);
    addPart(new THREE.BoxGeometry(0.36, 0.22, 0.48), agedMetal, -1.02, 3.43);
    const topPin = addPart(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 8), darkMetal, 0, 4.08);
    topPin.rotation.z = Math.PI / 2;

    key.rotation.x = Math.PI / 2;
    // Comprimento final ≈ 0,23 m: pequeno o bastante para gavetas/caixas,
    // mas ainda reconhecível sobre bancadas e estantes.
    key.scale.setScalar(0.028);
    key.visible = false;
    this.scene.add(key);
    return key;
  }

  _buildFog() {
    const fog = new THREE.Group();
    const corridorStart = 8.12, corridorEnd = 22.5;
    const corridorLength = corridorEnd - corridorStart;
    const corridorCenter = (corridorStart + corridorEnd) / 2;
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

    // Câmara branca física/visual inteiramente depois da soleira. Ela só fica
    // visível quando a porta começa a abrir.
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1.1, corridorLength), white);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0.5, 0.002, corridorCenter);
    fog.add(floor);
    const ceiling = floor.clone();
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 2.2;
    fog.add(ceiling);
    for (const x of [-0.05, 1.05]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(corridorLength, 2.2), white);
      wall.rotation.y = Math.PI / 2;
      wall.position.set(x, 1.1, corridorCenter);
      fog.add(wall);
    }
    const endWall = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.2), white);
    endWall.position.set(0.5, 1.1, corridorEnd);
    fog.add(endWall);

    // Paredes invisíveis mantêm o jogador dentro da câmara durante a caminhada.
    this.corridorColliders = [
      new THREE.Box3(new THREE.Vector3(-0.22, 0, corridorStart), new THREE.Vector3(-0.05, 2.3, corridorEnd)),
      new THREE.Box3(new THREE.Vector3(1.05, 0, corridorStart), new THREE.Vector3(1.22, 2.3, corridorEnd)),
    ];
    for (const collider of this.corridorColliders) {
      collider.disabled = true;
      this.lab.colliders.push(collider);
    }
    fog.visible = false;
    this.scene.add(fog);
    return fog;
  }

  start() {
    this.active = true;
    this.hasKey = false;
    this.completed = false;
    this.chamberActivated = false;
    this.fog.visible = false;
    this._updateWhiteout(null, false);
    this.exitDoor.locked = true;
    this.exitDoor.open = false;
    this.exitDoor.apply?.(0);

    this.key.removeFromParent();
    // A chave de evacuação só pode aparecer nas gavetas e na maleta vermelha
    // (o "baú" vermelho de amostras que fica sobre a bancada). Nunca em caixas
    // de madeira, armários, barris nem apoiada em superfícies abertas.
    const containerChoices = this.lab.containers.filter((c) =>
      c.pelletMount && /(gaveta|maleta)/i.test(c.name));
    const choices = containerChoices.map((container) => ({ container }));
    const choice = choices[(Math.random() * choices.length) | 0] || { spot: { position: new THREE.Vector3(-3.5, 1, -7.1) } };
    this.keyContainer = choice.container || null;
    if (this.keyContainer) {
      this.keyContainer.pelletMount.add(this.key);
      this.key.position.copy(this.keyContainer.pelletLocal).add(new THREE.Vector3(0, 0.022, 0));
    } else {
      this.scene.add(this.key);
      this.key.position.copy(choice.spot.position).add(new THREE.Vector3(0, 0.018, 0));
    }
    this.key.visible = true;
    this.refreshKeyPosition();
  }

  stop() {
    this.active = false;
    this.hasKey = false;
    this.completed = false;
    this.chamberActivated = false;
    this.key.visible = false;
    this.key.removeFromParent();
    this.scene.add(this.key);
    this.fog.visible = false;
    for (const collider of this.corridorColliders) collider.disabled = true;
    this._updateWhiteout(null, false);
  }

  refreshKeyPosition() {
    if (this.key.parent) this.key.getWorldPosition(this.keyPosition);
  }

  isKeyCollectable() {
    return this.active && !this.hasKey && (!this.keyContainer || this.keyContainer.open);
  }

  collectKey() {
    if (!this.isKeyCollectable()) return false;
    this.hasKey = true;
    this.key.visible = false;
    this.key.removeFromParent();
    this.exitDoor.locked = false;
    return true;
  }

  // A névoa nativa é contínua e independente da ordenação de transparência.
  // A intensidade cresce suavemente depois da soleira e volta ao padrão ao sair.
  _updateWhiteout(playerPos, chamberVisible) {
    const fogK = chamberVisible && playerPos
      ? THREE.MathUtils.smoothstep(playerPos.z, 8.05, 17.0)
      : 0;
    // A camada 2D cobre também o viewmodel do MGP-101, renderizado em uma cena
    // separada e portanto imune à névoa 3D. Ela cresce durante quase todo o túnel.
    const screenProgress = chamberVisible && playerPos
      ? THREE.MathUtils.smoothstep(playerPos.z, 9.0, 21.8)
      : 0;
    const screenK = Math.pow(screenProgress, 1.35);
    if (this.scene.fog && this._baseFog) {
      this.scene.fog.color.copy(this._baseFog.color).lerp(this._whiteColor, fogK);
      this.scene.fog.near = THREE.MathUtils.lerp(this._baseFog.near, 0.08, fogK);
      this.scene.fog.far = THREE.MathUtils.lerp(this._baseFog.far, 2.4, fogK);
    }
    if (this.scene.background?.isColor && this._baseBackground) {
      this.scene.background.copy(this._baseBackground).lerp(this._whiteColor, fogK);
    }
    if (this.whiteoutEl) this.whiteoutEl.style.opacity = screenK.toFixed(3);
  }

  update(playerPos, onComplete) {
    if (!this.active || this.completed) return;
    if (!this.hasKey) this.refreshKeyPosition();
    if (!this.chamberActivated && this.exitDoor.open && this.exitDoor.progress > 0.12) {
      this.chamberActivated = true;
    }
    const chamberVisible = this.chamberActivated;
    this.fog.visible = chamberVisible;
    for (const collider of this.corridorColliders) collider.disabled = !chamberVisible;
    this._updateWhiteout(playerPos, chamberVisible);
    if (this.exitDoor.open && playerPos.z > this.exitDoor.thresholdZ && Math.abs(playerPos.x - 0.5) < 0.9) {
      this.completed = true;
      onComplete();
    }
  }
}
