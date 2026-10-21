import * as THREE from 'three';
import { PLANT_CARRY_DISTANCE, PLANT_CASK_DIST, PLANT_GRAB_DIST } from '../config/gameConfig.js';
import { PlantRadiation } from '../radiation/PlantRadiation.js';
import { PlantBuilder } from '../world/PlantBuilder.js';

// ==== PLANTMODE =============================================================
// Modo Usina · Bloco 4. O jogador entra na usina destruída com o MGP-101 e
// uma lanterna. Entre os blocos de grafite espalhados pela explosão, só
// alguns estão ativos: o detector é o único jeito de distingui-los. Cada
// fragmento ativo é levado na tenaz até um contêiner blindado — e carregá-lo
// irradia o jogador o caminho inteiro. Com tudo contido, resta evacuar.
//
// Picos de emissão do núcleo acontecem de tempos em tempos (tremor + toast):
// é hora de se abrigar atrás de concreto.
export class PlantMode {
  constructor(textures) {
    this.textures = textures;
    this.world = null;
    this.radiation = null;
    this.fragments = [];
    this.carried = null;
    this.stage = 'search';
    this.profile = null;
    this._t = 0;
    this._v = new THREE.Vector3();
    this._dir = new THREE.Vector3();
    this._worldCarry = new THREE.Vector3();
    this._hints = [];
  }

  // A usina só é construída na primeira partida (o menu não paga esse custo).
  ensureBuilt() {
    if (this.world) return this.world;
    this.world = new PlantBuilder(this.textures).build();
    this.radiation = new PlantRadiation(this.world.shielding, this.world.zones);
    const scene = this.world.scene;

    // blocos de grafite (tijolo com furo de canal), um por ponto candidato
    const brick = new THREE.BoxGeometry(0.5, 0.25, 0.25);
    const aura = new THREE.SpriteMaterial({
      map: this._auraTexture(), color: 0x86ff62, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this._inertMat = this.world.graphiteMat.clone();
    this._inertMat.color.setHex(0x9a9a92); // bloco já verificado e inerte (marcado com giz)
    for (const spot of this.world.graphiteSpots) {
      const mesh = new THREE.Mesh(brick, this.world.graphiteMat);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      const glow = new THREE.Sprite(aura.clone());
      glow.scale.setScalar(1.3);
      mesh.add(glow);
      this.fragments.push({
        spot, mesh, glow, position: mesh.position, hot: false, intensity: 0, state: 'floor', checked: false, hotMat: null,
      });
    }

    // tenaz: dois braços que saem da mão esquerda até a ponta (segue a câmera)
    this.rig = new THREE.Group();
    scene.add(this.rig);
    const arm = new THREE.CylinderGeometry(0.012, 0.012, 1, 6);
    const tongMat = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, roughness: 0.4, metalness: 0.8 });
    this._tong = new THREE.Group();
    for (const dx of [-0.03, 0.03]) {
      const from = new THREE.Vector3(-0.2 + dx, -0.55, -0.2), to = new THREE.Vector3(-0.28 + dx, -0.38, -PLANT_CARRY_DISTANCE + 0.15);
      const rod = new THREE.Mesh(arm, tongMat);
      rod.position.copy(from).add(to).multiplyScalar(0.5);
      rod.scale.y = from.distanceTo(to);
      rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      this._tong.add(rod);
    }
    this._tong.visible = false;
    this.rig.add(this._tong);
    this._carryLocal = new THREE.Vector3(-0.28, -0.38, -PLANT_CARRY_DISTANCE);

    // lanterna de capacete
    this.flashlight = new THREE.SpotLight(0xfff2dc, 28, 26, 0.45, 0.6, 1.7);
    this.flashlight.target = new THREE.Object3D();
    scene.add(this.flashlight, this.flashlight.target);
    return this.world;
  }

  _auraTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  get total() { return this.fragments.filter((f) => f.hot).length; }
  get contained() { return this.fragments.filter((f) => f.hot && f.state === 'deposited').length; }

  start(profile) {
    this.ensureBuilt();
    this.profile = profile;
    this.stage = 'search';
    this.carried = null;
    this._t = 0;
    this._shake = 0;
    this._surgeLeft = 0;
    this._nextSurge = this._rand(profile.surgeEvery);
    this._sirenTimer = 6;
    this._tong.visible = false;

    // sorteio: N blocos ativos, com um mínimo deles dentro do salão do reator
    const spots = this.fragments.map((_, i) => i);
    const reactor = spots.filter((i) => this.fragments[i].spot.zone === 'reator');
    const other = spots.filter((i) => this.fragments[i].spot.zone !== 'reator');
    const pick = (list, k) => {
      const copy = [...list], out = [];
      while (out.length < k && copy.length) out.push(copy.splice((Math.random() * copy.length) | 0, 1)[0]);
      return out;
    };
    const hotR = pick(reactor, profile.minReactorFragments);
    const rest = pick([...other, ...reactor.filter((i) => !hotR.includes(i))], profile.hotFragments - hotR.length);
    const hotSet = new Set([...hotR, ...rest]);
    this.fragments.forEach((f, i) => {
      f.hot = hotSet.has(i);
      f.state = 'floor';
      f.checked = false;
      f.position = f.mesh.position;
      f.intensity = f.hot ? Math.round(this._rand(profile.fragmentIntensity)) : 0;
      if (f.mesh.parent !== this.world.scene) this.world.scene.add(f.mesh);
      f.mesh.position.copy(f.spot.position);
      f.mesh.rotation.set(0, f.spot.rotY, 0);
      f.mesh.visible = true;
      if (f.hot) {
        if (!f.hotMat) f.hotMat = this.world.hotGraphiteMat.clone();
        f.hotMat.emissiveIntensity = 0;
        f.mesh.material = f.hotMat;
      } else {
        f.mesh.material = this.world.graphiteMat;
      }
      f.glow.material.opacity = 0;
    });
    const decoys = pick(this.world.decoySpots.map((_, i) => i), profile.decoys)
      .map((i) => ({ position: this.world.decoySpots[i], intensity: this._rand(profile.decoyIntensity) }));
    this.radiation.configure({ core: this.world.core, coreIntensity: profile.coreIntensity, fragments: this.fragments, decoys });
    for (const c of this.world.casks) { c.count = 0; c.anim = 0; c.lid.position.y = c.lidY; c.lamp.emissiveIntensity = 0.6; }
    this.world.beacon.material = this.world.beacon.material.clone();
    this.world.beacon.material.emissiveIntensity = 0.25;
    this._hints = [
      { t: 2, msg: 'O reator do Bloco 4 explodiu. Fragmentos de grafite do núcleo foram lançados pela usina.' },
      { t: 9, msg: 'Só alguns blocos estão ativos. Aproxime o MGP-101: os ativos fazem a leitura disparar.' },
      { t: 19, msg: 'Recolha um fragmento ativo com F e leve-o a um contêiner blindado (A no pátio, B nas turbinas).' },
      { t: 31, msg: 'Carregar o fragmento irradia você. F longe do contêiner larga o bloco para você se recuperar.' },
      { t: 46, msg: 'O núcleo exposto estoura o monitor. Paredes e escombros entre você e o poço blindam a radiação.' },
    ];
  }

  stop() {
    this._tong.visible = false;
    this.carried = null;
  }

  _rand([a, b]) { return a + Math.random() * (b - a); }

  missionText() {
    if (this.stage === 'extract') return 'Fragmentos contidos. Vá ao ponto de evacuação no portão sul.';
    const base = `Contenha os fragmentos ativos: ${this.contained}/${this.total}.`;
    return this.carried ? `${base} Leve o fragmento a um contêiner!` : base;
  }

  // Bloco sob a mira (raio da câmera passa a ≤ 0,4 m do centro do bloco).
  _aimed(camera) {
    camera.getWorldDirection(this._dir);
    let best = null, bestD = Infinity;
    for (const f of this.fragments) {
      if (f.state !== 'floor' || !f.mesh.visible) continue;
      this._v.copy(f.position).sub(camera.position);
      const along = this._v.dot(this._dir);
      if (along <= 0 || along > PLANT_GRAB_DIST) continue;
      const off = Math.sqrt(Math.max(0, this._v.lengthSq() - along * along));
      if (off < 0.4 && along < bestD) { best = f; bestD = along; }
    }
    return best;
  }

  _nearCask(pos) {
    let best = null, bestD = PLANT_CASK_DIST;
    for (const c of this.world.casks) {
      const d = Math.hypot(pos.x - c.position.x, pos.z - c.position.z);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }

  // Altura de apoio para largar o bloco (o mesmo critério do laboratório).
  _supportAt(x, z) {
    let y = 0;
    for (const b of this.world.colliders) {
      if (x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y <= 1.75 && b.max.y > y) y = b.max.y;
    }
    return y;
  }

  _blocked(x, z) {
    return this.world.colliders.some((b) => x > b.min.x && x < b.max.x && z > b.min.z && z < b.max.z && b.max.y > 1.75);
  }

  // Tecla F / botão X. Devolve um evento para o Game reagir (som, HUD).
  interact(camera, player, hud, audio) {
    if (this.carried) {
      const cask = this._nearCask(player.position);
      const f = this.carried;
      if (cask) {
        f.state = 'deposited';
        f.mesh.visible = false;
        this.carried = null;
        this._tong.visible = false;
        cask.count++;
        cask.anim = 1;
        audio.drawer();
        if (this.contained >= this.total) {
          this.stage = 'extract';
          this.world.beacon.material.emissiveIntensity = 2.4;
          hud.toast('Todos os fragmentos ativos estão contidos! Evacue pelo portão sul.', 6);
        } else {
          hud.toast(`Fragmento guardado no ${cask.name} (${this.contained}/${this.total}).`, 4);
        }
        return 'deposited';
      }
      // largar à frente, no chão ou sobre um apoio baixo
      camera.getWorldDirection(this._dir);
      this._dir.y = 0; this._dir.normalize();
      let x = player.position.x + this._dir.x * 0.8, z = player.position.z + this._dir.z * 0.8;
      if (this._blocked(x, z)) { x = player.position.x; z = player.position.z; }
      this.world.scene.attach(f.mesh);
      f.mesh.position.set(x, this._supportAt(x, z) + 0.125, z);
      f.mesh.rotation.set(0, Math.random() * Math.PI, 0);
      f.state = 'floor';
      this.carried = null;
      this._tong.visible = false;
      audio.release();
      hud.toast('Fragmento largado. Afaste-se e use o concreto para se recuperar.', 4);
      return 'dropped';
    }
    const f = this._aimed(camera);
    if (!f) return null;
    if (!f.hot) {
      f.checked = true;
      f.mesh.material = this._inertMat;
      audio.release();
      hud.toast('Bloco inerte: o MGP-101 só mostra o fundo. Marcado com giz.', 3.5);
      return 'inert';
    }
    f.state = 'carried';
    this.carried = f;
    this.rig.attach(f.mesh);
    f.mesh.position.copy(this._carryLocal);
    f.mesh.rotation.set(0.2, 0.4, 0);
    this._tong.visible = true;
    audio.grab();
    hud.toast('Fragmento ativo na tenaz! Cada segundo carregando irradia você.', 4);
    return 'picked';
  }

  // Atualização por quadro. Devolve 'won' quando o jogador evacua.
  update(dt, camera, player, hud, audio) {
    const w = this.world;
    this._t += dt;
    for (const a of w.animated) a.update(dt, this._t, camera.position);

    // tenaz e lanterna acompanham a câmera
    this.rig.position.copy(camera.position);
    this.rig.quaternion.copy(camera.quaternion);
    if (this.carried) {
      const bob = Math.sin(this._t * 7) * 0.008 * Math.min(1, player.speedXZ);
      this.carried.mesh.position.set(this._carryLocal.x, this._carryLocal.y + bob, this._carryLocal.z);
      this.carried.mesh.getWorldPosition(this._v);
      // a fonte usa a posição no mundo (o mesh vive no rig)
      this.carried.position = this._worldCarry.copy(this._v);
    }
    camera.getWorldDirection(this._dir);
    this.flashlight.position.copy(camera.position).addScaledVector(this._dir, 0.2);
    this.flashlight.position.y -= 0.1;
    this.flashlight.target.position.copy(camera.position).addScaledVector(this._dir, 8);

    // aura dos ativos: só aparece dentro do alcance do perfil
    for (const f of this.fragments) {
      if (!f.hot || f.state === 'deposited') continue;
      if (f.state === 'floor' && f.position !== f.mesh.position) f.position = f.mesh.position;
      const d = f.state === 'carried' ? 0 : camera.position.distanceTo(f.position);
      const k = THREE.MathUtils.clamp((this.profile.auraDistance - d) / Math.max(0.5, this.profile.auraDistance - 0.8), 0, 1);
      const pulse = 0.8 + 0.2 * Math.sin(this._t * 3.4 + f.intensity);
      f.glow.material.opacity = (f.state === 'carried' ? 0.25 : 0.55 * k) * pulse;
      f.hotMat.emissiveIntensity = (f.state === 'carried' ? 0.9 : 1.6 * k) * pulse;
    }

    // picos de emissão do núcleo
    this._nextSurge -= dt;
    if (this._nextSurge <= 0 && this._surgeLeft <= 0) {
      this._surgeLeft = this.profile.surgeDuration;
      this._nextSurge = this._rand(this.profile.surgeEvery);
      this._shake = 1.6;
      this.radiation.coreMultiplier = this.profile.surgeMultiplier;
      audio.impact(1);
      audio._noise?.(1.4, 0.12, 180);
      hud.toast('⚠ Pico de emissão no núcleo! Abrigue-se atrás de concreto.', 5);
    }
    if (this._surgeLeft > 0) {
      this._surgeLeft -= dt;
      w.coreLight.intensity *= 1.6;
      if (this._surgeLeft <= 0) {
        this.radiation.coreMultiplier = 1;
        hud.toast('A emissão do núcleo voltou ao nível anterior.', 3);
      }
    }
    if (this._shake > 0) {
      this._shake -= dt;
      const a = 0.06 * Math.min(1, this._shake);
      camera.position.x += (Math.random() - 0.5) * a;
      camera.position.y += (Math.random() - 0.5) * a;
      camera.position.z += (Math.random() - 0.5) * a;
    }

    // sirene distante (dois tons) a cada ~30 s
    this._sirenTimer -= dt;
    if (this._sirenTimer <= 0) {
      this._sirenTimer = 28 + Math.random() * 10;
      for (let i = 0; i < 4; i++) setTimeout(() => audio._tone?.(i % 2 ? 470 : 640, 0.42, 0.018), i * 460);
    }

    // tampa do contêiner sobe e desce ao receber um fragmento
    for (const c of w.casks) {
      if (c.anim > 0) {
        c.anim = Math.max(0, c.anim - dt * 1.4);
        c.lid.position.y = c.lidY + Math.sin(c.anim * Math.PI) * 0.45;
      }
      c.lamp.emissiveIntensity = 0.6 + (c.count > 0 ? 0.8 + 0.4 * Math.sin(this._t * 4) : 0);
    }
    if (this.stage === 'extract') {
      w.beacon.material.emissiveIntensity = 1.4 + 1.2 * Math.max(0, Math.sin(this._t * 5));
    }

    // dicas e mira
    if (this._hints.length && this._t > this._hints[0].t) hud.toast(this._hints.shift().msg, 5.5);
    if (this.carried) {
      const cask = this._nearCask(player.position);
      hud.setHint(cask ? `Depositar no ${cask.name}` : 'Largar o fragmento');
    } else {
      const f = this._aimed(camera);
      hud.setHint(f ? (f.checked ? 'Bloco inerte (verificado)' : 'Recolher bloco de grafite com a tenaz') : '');
    }
    hud.setMission(this.missionText());

    const e = w.extraction, p = player.position;
    if (this.stage === 'extract' && p.x > e.minX && p.x < e.maxX && p.z > e.minZ && p.z < e.maxZ) return 'won';
    return null;
  }

  nearestActiveDistance(pos) {
    let best = Infinity;
    for (const f of this.fragments) {
      if (f.hot && f.state === 'floor') best = Math.min(best, pos.distanceTo(f.position));
    }
    return best;
  }
}
