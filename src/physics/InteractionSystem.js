import * as THREE from 'three';
import { INTERACT_DIST, PELLET_AIM_RADIUS, PELLET_GRAB_DIST } from '../config/gameConfig.js';

// --- Física de corpo rígido dos objetos soltos (tampas etc.) ----------------
const PHYS_GRAVITY = 17;            // m/s² — mesma gravidade do jogador
const PHYS_FRICTION = 0.65;         // coeficiente de Coulomb nos contatos
const PHYS_RESTITUTION = 0.06;      // quique mínimo (metal/madeira no piso)
const PHYS_LINEAR_DAMPING = 0.18;   // arrasto do ar (exponencial, por segundo)
const PHYS_ANGULAR_DAMPING = 0.35;  // o giro perde energia gradualmente
const PHYS_MAX_LINEAR_SPEED = 12;   // m/s — teto de segurança
const PHYS_MAX_ANGULAR_SPEED = 16;  // rad/s
const PHYS_SLEEP_LINEAR = 0.035;    // m/s — abaixo disso conta para dormir
const PHYS_SLEEP_ANGULAR = 0.045;   // rad/s
const PHYS_SLEEP_TIME = 0.3;        // s parado E apoiado antes de dormir
const PHYS_SUBSTEP = 1 / 120;       // passo fixo da simulação
const PHYS_MAX_SUBSTEPS = 8;        // teto por frame: queda de FPS não explode
const PHYS_SLOP = 0.004;            // penetração tolerada (anti-vibração)
const PHYS_CORRECTION = 0.4;        // fração da penetração corrigida por passo
const LID_LAUNCH_SPEED = 2.8;       // m/s — ejeção lateral ao abrir barril/caixa
const LID_LAUNCH_LIFT = 5.1;        // m/s — ejeção vertical
const LID_GRAB_DIST = 3.0;          // alcance para pegar uma tampa solta
const LID_HOLD_DELAY = 0.22;        // tempo de F pressionado para retirar a tampa
const LID_HOLD_MIN_DISTANCE = 0.60; // distância mínima da tampa na mão
const LID_HOLD_MAX_DISTANCE = 2.80; // distância máxima da tampa na mão
const LID_HOLD_SCROLL_STEP = 0.16;  // metros por passo de Shift + roda
// Seguidor firme do objeto segurado: a mola recebe também a velocidade da
// câmera, então acompanha corrida e mudanças bruscas sem perder a sensação de
// peso. Os valores são criticamente amortecidos (resposta ágil, sem oscilar).
const HOLD_STIFFNESS = 220;
const HOLD_DAMPING = 30;
const HOLD_GRAVITY_SCALE = 0.06;
const HOLD_MAX_SPEED = 18;
const HOLD_TARGET_MAX_SPEED = 14;
const HOLD_BREAK_DISTANCE = 2.6;    // só solta se realmente ficou preso
const HOLD_BREAK_TIME = 1.0;

// Rascunhos do solver (zero alocação dentro do loop de física)
const _cPoint = new THREE.Vector3();
const _cR = new THREE.Vector3();
const _cVel = new THREE.Vector3();
const _cN = new THREE.Vector3();
const _cT = new THREE.Vector3();
const _cRxN = new THREE.Vector3();
const _cRxT = new THREE.Vector3();
const _cAxis = new THREE.Vector3();
const _cQ = new THREE.Quaternion();
// temporários da colisão corpo↔corpo (lado "B" do par)
const _pbLocal = new THREE.Vector3();
const _pbR = new THREE.Vector3();
const _pbVel = new THREE.Vector3();
const _pbRxN = new THREE.Vector3();
const _pbRxT = new THREE.Vector3();
const _pbQ = new THREE.Quaternion();
// --- Inspeção do objeto segurado (estilo Zelda) -----------------------------
const HELD_ROT_SPEED = 2.6;       // rad/s — velocidade do analógico do gamepad
const HELD_ROT_ACCEL = 10;        // suavização da velocidade angular ao soltar
const HELD_SCROLL_STEP = Math.PI / 6; // 30° por "clique" da rolagem (inclinação)
const HELD_SPIN_RESPONSE = 12;    // rapidez com que o giro pendente do scroll é aplicado
// Controles vetoriais incorporados: não dependem de carregamento de arquivo
// externo durante o jogo, preservando a aparência do painel em qualquer host.
// ==== INTERACTIONSYSTEM =====================================================
// Tecla F: abre/fecha armários e gavetas (animados) e recolhe a pastilha.
// Mostra a dica contextual no HUD.
export class InteractionSystem {
  constructor(containers, colliders, source, camera, hud, audio = null) {
    this.containers = containers;
    this.colliders = colliders;
    this.source = source;
    this.camera = camera;
    this.hud = hud;
    this.audio = audio;
    this.target = null; // { type: 'pellet' | 'container', container?, label }
    this.evacuation = null;
    this.gamepadMode = false;
    this._to = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._raycaster = new THREE.Raycaster();
    this._screenCenter = new THREE.Vector2(0, 0);
    this._lids = []; // corpos rígidos soltos { mesh, vel, ang, contactLocal... }
    this._props = []; // objetos do cenário registrados (voltam ao lugar no reset)
    this._buckets = []; // baldes com alça pendular { prop, pivot, angle, vel... }
    // Cascos reais de TODOS os recipientes (paredes + fundo): os volumes
    // cheios marcados com `hollow` são ignorados pelos objetos soltos, que
    // colidem com estas superfícies — dá para largar um objeto DENTRO de um
    // barril ou caixote aberto.
    this._hullSurfaces = [];
    this._closedLidContainers = [];
    for (const c of containers) {
      if (c.lidColliders) for (const b of c.lidColliders) this._hullSurfaces.push(b);
      if (c.closedLidCollider) this._closedLidContainers.push(c);
    }
    this.heldLid = null;
    this._holdTarget = new THREE.Vector3();
    this._previousHoldTarget = new THREE.Vector3();
    this._holdTargetVelocity = new THREE.Vector3();
    this._holdVelocityDelta = new THREE.Vector3();
    this._hasHoldTarget = false;
    this._physAcc = 0;   // acumulador do passo fixo de física
    this._nearby = [];   // broadphase reutilizada (sem alocação por passo)
    this._pendingOneShot = null;
    this._fHoldTime = 0;
    this._fHoldActivated = false;

    // Scroll inclina como o eixo vertical de LB + RS. M1/M2 formam o par
    // esquerdo/direito equivalente a LT/RT, sem exigir movimento do mouse.
    this._rotInput = { x: false, y: false };
    this._rotVel = { z: 0 };
    this._spinPitch = 0; // inclinação pendente vinda da rolagem
    this._rotQ = new THREE.Quaternion();
    this._rotCameraQ = new THREE.Quaternion();
    this._rotParentQ = new THREE.Quaternion();
    this._rotAxis = new THREE.Vector3();

    addEventListener('mousedown', (e) => {
      if (!this.heldLid || !document.pointerLockElement) return;
      if (e.button === 0) this._rotInput.x = true;
      if (e.button === 2) this._rotInput.y = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this._rotInput.x = false;
      if (e.button === 2) this._rotInput.y = false;
    });
    addEventListener('contextmenu', (e) => { if (this.heldLid) e.preventDefault(); });
    addEventListener('wheel', (e) => {
      if (!this.heldLid || !document.pointerLockElement) return;
      // Shift + roda regula a distância; sem Shift, preserva a rotação no eixo Z.
      if (e.shiftKey) {
        this.heldLid.holdDistance = THREE.MathUtils.clamp(
          this.heldLid.holdDistance + Math.sign(e.deltaY) * LID_HOLD_SCROLL_STEP,
          LID_HOLD_MIN_DISTANCE,
          LID_HOLD_MAX_DISTANCE
        );
        e.preventDefault();
        return;
      }
      this._spinPitch += (e.deltaY > 0 ? 1 : -1) * HELD_SCROLL_STEP;
    }, { passive: false });
  }

  // Nova fase: esquece tampas em voo/na mão e qualquer F pendente. As tampas
  // em si voltam ao lugar via Game._resetContainersForPhase().
  reset() {
    this._lids.length = 0;
    // objetos soltos do cenário voltam à pose original e seguem manipuláveis
    for (const p of this._props) {
      p.mesh.position.copy(p.home.position);
      p.mesh.quaternion.copy(p.home.quaternion);
      p.vel.set(0, 0, 0);
      p.ang.set(0, 0, 0);
      p.resting = true;
      p.supported = true;
      p.sleepTimer = 0;
      p.holdStrain = 0;
      this._lids.push(p);
    }
    this.heldLid = null;
    this._hasHoldTarget = false;
    this._holdTargetVelocity.set(0, 0, 0);
    this._physAcc = 0;
    this._pendingOneShot = null;
    this._fHoldTime = 0;
    this._fHoldActivated = false;
    this.target = null;
    this._rotInput.x = this._rotInput.y = false;
    this._rotVel.z = 0;
    this._spinPitch = 0;
    this.evacuation = null;
  }

  setEvacuation(evacuation) {
    this.evacuation = evacuation?.active ? evacuation : null;
  }

  setGamepadMode(enabled) {
    this.gamepadMode = Boolean(enabled);
    this.target = null; // força a reconstrução imediata do texto contextual
  }

  applyGamepadManipulation(rotateX, rotateY, rotateZ, distance, dt) {
    if (!this.heldLid) return;
    this._applyHeldRotation(
      this.heldLid,
      rotateX * HELD_ROT_SPEED * dt,
      rotateY * HELD_ROT_SPEED * dt,
      rotateZ * HELD_ROT_SPEED * dt
    );
    if (Math.abs(distance) > 0.01) {
      this.heldLid.holdDistance = THREE.MathUtils.clamp(
        this.heldLid.holdDistance + distance * 1.15 * dt,
        LID_HOLD_MIN_DISTANCE,
        LID_HOLD_MAX_DISTANCE
      );
    }
  }

  update(dt) {
    if (this._pendingOneShot && !this._fHoldActivated) {
      this._fHoldTime += dt;
      if (this._fHoldTime >= LID_HOLD_DELAY) {
        // Retirada manual: a tampa passa para a mão. Um novo toque em F a
        // solta; a partir daí gravidade, giro e colisões agem normalmente.
        this._detachOneShot(this._pendingOneShot, true);
        this._fHoldActivated = true;
      }
    }
    // anima portas/gavetas/maletas (suavizado)
    for (const c of this.containers) {
      const goal = c.open ? 1 : 0;
      if (c.apply && c.progress !== goal) {
        c.progress += Math.sign(goal - c.progress) * Math.min(2.8 * dt, Math.abs(goal - c.progress));
        const ease = c.progress * c.progress * (3 - 2 * c.progress); // smoothstep
        c.apply(ease);
      }
    }
    // Scroll inclina em relação à câmera; M1/M2 giram continuamente em
    // sentidos opostos no eixo frontal, como LT/RT no controle.
    if (this.heldLid) {
      this._updateHoldTarget(dt);
      const ease = 1 - Math.exp(-HELD_ROT_ACCEL * dt);
      const rollDirection = (this._rotInput.y ? 1 : 0) - (this._rotInput.x ? 1 : 0);
      this._rotVel.z += (rollDirection * HELD_ROT_SPEED - this._rotVel.z) * ease;
      const pitchStep = this._spinPitch * Math.min(1, HELD_SPIN_RESPONSE * dt);
      this._spinPitch -= pitchStep;
      this._applyHeldRotation(this.heldLid, pitchStep, 0, this._rotVel.z * dt);
    }

    // Física em passo fixo de 1/120 s: estável em qualquer FPS. O dt de
    // entrada é limitado, então travadas longas não geram explosões físicas.
    this._physAcc = Math.min(this._physAcc + Math.min(dt, 0.05), PHYS_SUBSTEP * PHYS_MAX_SUBSTEPS);
    while (this._physAcc >= PHYS_SUBSTEP) {
      this._physAcc -= PHYS_SUBSTEP;
      for (let i = 0; i < this._lids.length; i++) {
        const l = this._lids[i];
        if (l === this.heldLid) this.updateHeldObject(l, PHYS_SUBSTEP);
        else if (!l.resting) this.simulatePhysicsObject(l, PHYS_SUBSTEP);
      }
      // depois de mover todos, os corpos trocam impulsos entre si
      this._resolveBodyPairs();
      // a alça do balde sente a orientação do corpo a cada passo fixo
      for (let i = 0; i < this._buckets.length; i++) {
        this._updateBucketHandle(this._buckets[i], PHYS_SUBSTEP);
      }
    }
    this._pickTarget();
    this.hud.setHint(this.target ? this.target.label : '', this.target?.detail || '');
  }

  // ==== Corpo rígido: objeto solto ==========================================
  // Integração semi-implícita + micro-passos anti-tunneling + contatos por
  // pontos de apoio do formato real (cantos da tábua / bordas do disco).
  simulatePhysicsObject(l, h) {
    // Apoiado em OUTRO corpo e quase parado: a gravidade não é reintegrada.
    // O contato de par roda só depois do passo e devolveria esse empuxo em
    // forma de giro parasita — a caixa de cima "caminharia" até a borda.
    if (!(l.pairSupported && l.vel.lengthSq() < 0.09)) l.vel.y -= PHYS_GRAVITY * h;
    l.vel.multiplyScalar(Math.exp(-PHYS_LINEAR_DAMPING * h));
    l.ang.multiplyScalar(Math.exp(-PHYS_ANGULAR_DAMPING * h));
    this._clampVelocities(l);

    // objeto rápido: divide o passo para não atravessar geometria fina
    const steps = Math.min(4, Math.max(1, Math.ceil(l.vel.length() * h / 0.05)));
    const hh = h / steps;
    for (let s = 0; s < steps; s++) {
      l.mesh.position.addScaledVector(l.vel, hh);
      this._integrateRotation(l, hh);
      this.resolveObjectCollisions(l, hh);
    }
    this._sanitize(l);

    // Atrito de rolamento/contato: apoiado e quase parado, o balanço residual
    // morre rápido — sem isso, os pontos de apoio trocam micro-impulsos
    // alternados para sempre e o corpo nunca atinge o limiar de sono.
    if (l.supported) {
      const v2 = l.vel.lengthSq(), w2 = l.ang.lengthSq();
      if (v2 < 0.09) {
        l.ang.multiplyScalar(Math.exp(-12 * h));
        l.vel.multiplyScalar(Math.exp(-3 * h)); // atrito estático assume aos poucos
      }
      // já é só tremor de milímetros: esmaga de vez, invisível a olho nu
      if (v2 < 0.03 && w2 < 0.25) {
        l.ang.multiplyScalar(Math.exp(-40 * h));
        l.vel.multiplyScalar(Math.exp(-20 * h));
      }
    }

    // repouso: parado E apoiado por alguns décimos → dorme sem tremores.
    // As velocidades são medidas DEPOIS dos contatos, então um objeto em
    // repouso de verdade fica abaixo dos limiares mesmo com gravidade ativa.
    // (sleepMul: objetos pequenos toleram um pouco mais de micro-balanço)
    const sleepMul = l.sleepMul || 1;
    if (l.supported &&
        l.vel.lengthSq() < PHYS_SLEEP_LINEAR * PHYS_SLEEP_LINEAR * sleepMul * sleepMul &&
        l.ang.lengthSq() < PHYS_SLEEP_ANGULAR * PHYS_SLEEP_ANGULAR * sleepMul * sleepMul) {
      l.sleepTimer += h;
      if (l.sleepTimer >= PHYS_SLEEP_TIME) this.putObjectToSleep(l);
    } else {
      l.sleepTimer = 0;
    }
  }

  putObjectToSleep(l) {
    l.resting = true;
    l.vel.set(0, 0, 0);
    l.ang.set(0, 0, 0);
  }

  wakeObject(l) {
    l.resting = false;
    l.sleepTimer = 0;
  }

  // velocidade angular no espaço do mundo → premultiplica o quaternion
  _integrateRotation(l, h) {
    const len = l.ang.length();
    if (len < 1e-6) return;
    _cQ.setFromAxisAngle(_cAxis.copy(l.ang).divideScalar(len), len * h);
    l.mesh.quaternion.premultiply(_cQ).normalize();
  }

  _clampVelocities(l) {
    if (l.vel.lengthSq() > PHYS_MAX_LINEAR_SPEED * PHYS_MAX_LINEAR_SPEED) l.vel.setLength(PHYS_MAX_LINEAR_SPEED);
    if (l.ang.lengthSq() > PHYS_MAX_ANGULAR_SPEED * PHYS_MAX_ANGULAR_SPEED) l.ang.setLength(PHYS_MAX_ANGULAR_SPEED);
  }

  // NaN/estouros nunca se propagam; o objeto nunca escapa do laboratório
  _sanitize(l) {
    const p = l.mesh.position;
    if (!Number.isFinite(p.x + p.y + p.z + l.vel.x + l.vel.y + l.vel.z + l.ang.x + l.ang.y + l.ang.z)) {
      l.vel.set(0, 0, 0);
      l.ang.set(0, 0, 0);
      p.set(0, 1, 2);
      l.mesh.quaternion.set(0, 0, 0, 1);
    }
    p.x = THREE.MathUtils.clamp(p.x, -10.8, 10.8);
    p.z = THREE.MathUtils.clamp(p.z, -7.8, 7.8);
    if (p.y < -0.2) { p.y = 0.5; l.vel.y = 0; }
  }

  // Gera e resolve os contatos deste passo: cada ponto de apoio (já com a
  // rotação atual) é testado contra chão, boca do recipiente e caixas
  // próximas — cantos e bordas colidem de verdade, não uma esfera genérica.
  resolveObjectCollisions(l, h) {
    // o apoio sobre OUTRO corpo (pilha) vem do passo de pares anterior;
    // sem isso, uma caixa sobre outra nunca conta como apoiada, o
    // amortecedor anti-balanço não atua e ela caminha até escorregar
    l.supported = !!l.pairSupported;
    const p = l.mesh.position, q = l.mesh.quaternion;
    const R = l.boundRadius + 0.05;

    // sai do volume "cheio" do dono uma única vez; depois vale o casco real
    if (l.ownerCollider && !l.ownerCollisionActive) {
      const b = l.ownerCollider;
      l.ownerCollisionActive =
        p.x < b.min.x - R || p.x > b.max.x + R ||
        p.y < b.min.y - R || p.y > b.max.y + R ||
        p.z < b.min.z - R || p.z > b.max.z + R;
    }

    // broadphase: só caixas perto do corpo entram nos testes por ponto
    const near = this._nearby;
    near.length = 0;
    for (let i = 0; i < this.colliders.length; i++) {
      const b = this.colliders[i];
      if (b.disabled) continue;
      if (b === l.ownerCollider) continue; // o casco real entra via ownerSurfaces
      if (b.hollow) continue; // recipiente aberto: vale o casco real, não o bloco
      if (l.ignore && l.ignore.indexOf(b) !== -1) continue; // volume cheio da estante
      if (p.x > b.min.x - R && p.x < b.max.x + R &&
          p.y > b.min.y - R && p.y < b.max.y + R &&
          p.z > b.min.z - R && p.z < b.max.z + R) near.push(b);
    }
    if (l.ownerCollisionActive) {
      for (const b of l.ownerSurfaces) near.push(b);
    }
    // cascos dos DEMAIS recipientes valem para qualquer corpo solto — o casco
    // do próprio dono já entrou acima, com o gate de saída (ownerCollisionActive)
    for (let i = 0; i < this._hullSurfaces.length; i++) {
      const b = this._hullSurfaces[i];
      if (l.ownerSurfaces.indexOf(b) !== -1) continue;
      if (p.x > b.min.x - R && p.x < b.max.x + R &&
          p.y > b.min.y - R && p.y < b.max.y + R &&
          p.z > b.min.z - R && p.z < b.max.z + R) near.push(b);
    }

    // Recipiente fechado = casco + tampa. Assim que o jogador o abre,
    // `c.open` passa a true e este colisor deixa de participar.
    for (let i = 0; i < this._closedLidContainers.length; i++) {
      const c = this._closedLidContainers[i];
      if (c.open) continue;
      const b = c.closedLidCollider;
      if (p.x > b.min.x - R && p.x < b.max.x + R &&
          p.y > b.min.y - R && p.y < b.max.y + R &&
          p.z > b.min.z - R && p.z < b.max.z + R) near.push(b);
    }

    // Duas iterações do solver sequencial: os cantos opostos trocam impulsos
    // equilibrados dentro do mesmo passo (menos balanço residual em repouso).
    const m = l.ownerCollisionActive ? l.ownerMouth : null;
    for (let iter = 0; iter < 2; iter++) {
      for (let i = 0; i < l.contactLocal.length; i++) {
        _cPoint.copy(l.contactLocal[i]).applyQuaternion(q).add(p);
        if (_cPoint.y < 0) this._applyContact(l, 0, 1, 0, -_cPoint.y);
        // a boca do recipiente é um apoio que impede a tampa de reentrar no vão
        if (m && _cPoint.x > m.minX && _cPoint.x < m.maxX &&
            _cPoint.z > m.minZ && _cPoint.z < m.maxZ &&
            _cPoint.y < m.topY && _cPoint.y > m.topY - 0.12) {
          this._applyContact(l, 0, 1, 0, m.topY - _cPoint.y);
        }
        for (let k = 0; k < near.length; k++) this._contactPointBox(l, near[k]);
      }
      // teste inverso para caixas FINAS (paredes do caixote, casco do barril):
      // quando a tampa se inclina sobre a borda, a aresta da parede toca a
      // FACE da tampa, entre os pontos de amostragem — sem este teste ela
      // atravessa a parede como se não existisse
      for (let k = 0; k < near.length; k++) this._thinBoxVsBody(l, near[k]);
    }
  }

  // Caixa estática fina contra o corpo orientado: amostra cantos/arestas/
  // faces da caixa e, para cada ponto dentro do OBB do corpo, empurra o
  // corpo pela sua face de saída mais próxima (normal no espaço do mundo).
  _thinBoxVsBody(l, b) {
    const tx = b.max.x - b.min.x, ty = b.max.y - b.min.y, tz = b.max.z - b.min.z;
    if (Math.min(tx, ty, tz) > 0.12) return; // caixa grossa: pontos da tampa bastam
    const he = this._bodyHalfExtents(l);
    const cx = (b.min.x + b.max.x) / 2, cy = (b.min.y + b.max.y) / 2, cz = (b.min.z + b.max.z) / 2;
    _pbQ.copy(l.mesh.quaternion).invert();
    for (let sx = -1; sx <= 1; sx++) for (let sy = -1; sy <= 1; sy++) for (let sz = -1; sz <= 1; sz++) {
      if (sx === 0 && sy === 0 && sz === 0) continue;
      _cPoint.set(cx + sx * tx / 2, cy + sy * ty / 2, cz + sz * tz / 2);
      _pbLocal.copy(_cPoint).sub(l.mesh.position).applyQuaternion(_pbQ);
      const dx = he.x - Math.abs(_pbLocal.x);
      if (dx <= 0) continue;
      const dy = he.y - Math.abs(_pbLocal.y);
      if (dy <= 0) continue;
      const dz = he.z - Math.abs(_pbLocal.z);
      if (dz <= 0) continue;
      // o ponto da parede sai pela face mais próxima do corpo; o corpo recua
      // na direção oposta (sinal negativo), levada ao espaço do mundo
      let depth;
      if (dx <= dy && dx <= dz) { depth = dx; _cN.set(-(Math.sign(_pbLocal.x) || 1), 0, 0); }
      else if (dy <= dz)        { depth = dy; _cN.set(0, -(Math.sign(_pbLocal.y) || 1), 0); }
      else                      { depth = dz; _cN.set(0, 0, -(Math.sign(_pbLocal.z) || 1)); }
      _cN.applyQuaternion(l.mesh.quaternion);
      this._applyContact(l, _cN.x, _cN.y, _cN.z, depth);
    }
  }

  // ponto (_cPoint) dentro de uma AABB: normal = face mais próxima
  _contactPointBox(l, b) {
    const x = _cPoint.x, y = _cPoint.y, z = _cPoint.z;
    if (x <= b.min.x || x >= b.max.x || y <= b.min.y || y >= b.max.y ||
        z <= b.min.z || z >= b.max.z) return;
    let depth = x - b.min.x, nx = -1, ny = 0, nz = 0;
    let d = b.max.x - x; if (d < depth) { depth = d; nx = 1; ny = 0; nz = 0; }
    d = y - b.min.y;     if (d < depth) { depth = d; nx = 0; ny = -1; nz = 0; }
    d = b.max.y - y;     if (d < depth) { depth = d; nx = 0; ny = 1; nz = 0; }
    d = z - b.min.z;     if (d < depth) { depth = d; nx = 0; ny = 0; nz = -1; }
    d = b.max.z - z;     if (d < depth) { depth = d; nx = 0; ny = 0; nz = 1; }
    this._applyContact(l, nx, ny, nz, depth);
  }

  // Baque de contato. Um objeto solto caindo soa a cada quique de verdade,
  // mas o objeto NA MÃO, quando o jogador o força contra uma superfície,
  // registra um contato por passo de física (o toc-toc-toc). Enquanto ele
  // segue tocando a mesma superfície a trava segura o som; ele dispara só no
  // primeiro toque e rearma quando o objeto se separa (um passo sem contato).
  _impactSound(l, strength) {
    if (!this.audio) return;
    if (l && l === this.heldLid) {
      if (l.heldImpactLatched) return;
      l.heldImpactLatched = true;
    }
    this.audio.impact(strength);
  }

  // Impulso de contato no ponto (_cPoint): o torque emerge do braço
  // r = ponto − centro, então bater com um canto tomba/gira o objeto.
  // Atrito de Coulomb freia o deslizamento (|jt| ≤ μ·j) e a penetração é
  // corrigida aos poucos — sem teleporte e sem vibração (folga PHYS_SLOP).
  _applyContact(l, nx, ny, nz, depth) {
    if (l === this.heldLid) l._contactThisStep = true;
    _cN.set(nx, ny, nz);
    _cR.copy(_cPoint).sub(l.mesh.position);
    _cVel.crossVectors(l.ang, _cR).add(l.vel); // velocidade do ponto: v + ω×r
    const vn = _cVel.dot(_cN);
    if (vn < 0) { // só rebate quem está entrando no obstáculo
      _cRxN.crossVectors(_cR, _cN);
      // restituição só em impactos reais; contatos lentos são perfeitamente
      // inelásticos — o corpo em repouso não recebe energia de volta
      const e = vn < -0.35 ? PHYS_RESTITUTION : 0;
      // impacto de verdade (não contato de apoio): baque com volume pela
      // velocidade e atenuação pela distância — o GameAudio limita a cadência
      if (vn < -0.35 && this.audio) {
        const dist = _cPoint.distanceTo(this.camera.position);
        this._impactSound(l, Math.min(1, 0.15 + (-vn - 0.35) / 3.5) * Math.max(0, 1 - dist / 12));
      }
      const j = -(1 + e) * vn /
        (l.invMass + _cRxN.lengthSq() * l.invInertia);
      l.vel.addScaledVector(_cN, j * l.invMass);
      l.ang.addScaledVector(_cRxN, j * l.invInertia);

      // atrito tangencial no ponto de contato
      _cVel.crossVectors(l.ang, _cR).add(l.vel);
      _cT.copy(_cVel).addScaledVector(_cN, -_cVel.dot(_cN));
      const vt = _cT.length();
      if (vt > 1e-5) {
        _cT.divideScalar(vt);
        _cRxT.crossVectors(_cR, _cT);
        let jt = -vt / (l.invMass + _cRxT.lengthSq() * l.invInertia);
        jt = Math.max(jt, -PHYS_FRICTION * j);
        l.vel.addScaledVector(_cT, jt * l.invMass);
        l.ang.addScaledVector(_cRxT, jt * l.invInertia);
      }
      this._clampVelocities(l);
    }
    const corr = (depth - PHYS_SLOP) * PHYS_CORRECTION;
    if (corr > 0) l.mesh.position.addScaledVector(_cN, corr);
    if (ny > 0.5) l.supported = true;
    // enterrado fundo: não pode dormir no meio da expulsão — congelaria
    // atravessando o obstáculo até alguém o acordar
    if (depth > 0.03) l.sleepTimer = 0;
  }

  // ==== Colisão corpo↔corpo (tampas e objetos soltos entre si) ==============
  // Meia-dimensão do corpo como caixa orientada: meshes são a caixa unitária
  // escalada; tampas de barril (cilindro) usam raio/altura da geometria.
  _bodyHalfExtents(l) {
    if (!l._he) {
      const g = l.mesh.geometry;
      l._he = g.type === 'CylinderGeometry'
        ? new THREE.Vector3(g.parameters.radiusTop, g.parameters.height / 2, g.parameters.radiusTop)
        : new THREE.Vector3(l.mesh.scale.x / 2, l.mesh.scale.y / 2, l.mesh.scale.z / 2);
    }
    return l._he;
  }

  // Uma passada por subpasso: pares com pelo menos um corpo acordado e
  // esferas envolventes se tocando entram no teste fino (nos dois sentidos,
  // para cantos de um dentro do outro e vice-versa).
  _resolveBodyPairs() {
    const n = this._lids.length;
    for (let i = 0; i < n; i++) this._lids[i].pairSupported = false;
    for (let i = 0; i < n; i++) {
      const a = this._lids[i];
      for (let j = i + 1; j < n; j++) {
        const b = this._lids[j];
        if (a.resting && b.resting) continue; // pilhas dormentes ficam em paz
        const r = a.boundRadius + b.boundRadius;
        if (a.mesh.position.distanceToSquared(b.mesh.position) > r * r) continue;
        this._collideBodies(a, b);
        this._collideBodies(b, a);
      }
    }
  }

  // Pontos de contato para o teste corpo↔corpo: cantos + meios de aresta +
  // centros de face (26). Só com cantos, duas caixas do mesmo tamanho nunca
  // registram o contato face-a-face — os cantos caem fora da pegada da outra.
  _bodyPairPoints(l) {
    if (!l._pairPoints) {
      const he = this._bodyHalfExtents(l);
      const pts = [];
      for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
        if (sx === 0 && sy === 0 && sz === 0) continue;
        pts.push(new THREE.Vector3(sx * he.x, sy * he.y, sz * he.z));
      }
      // pontos recuados (60%) nas faces de cima e de baixo: entre caixas de
      // tamanho igual, o perímetro cai fora da pegada da outra e só o centro
      // tocaria — um apoio de ponto único tomba; o anel interno forma um
      // polígono de sustentação estável
      for (const sy of [-1, 1]) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        pts.push(new THREE.Vector3(sx * he.x * 0.6, sy * he.y, sz * he.z * 0.6));
      }
      l._pairPoints = pts;
    }
    return l._pairPoints;
  }

  // pontos de contato de A contra a caixa orientada de B
  _collideBodies(a, b) {
    const he = this._bodyHalfExtents(b);
    const pts = this._bodyPairPoints(a);
    _pbQ.copy(b.mesh.quaternion).invert();
    for (let i = 0; i < pts.length; i++) {
      _cPoint.copy(pts[i]).applyQuaternion(a.mesh.quaternion).add(a.mesh.position);
      _pbLocal.copy(_cPoint).sub(b.mesh.position).applyQuaternion(_pbQ);
      const dx = he.x - Math.abs(_pbLocal.x);
      const dy = he.y - Math.abs(_pbLocal.y);
      const dz = he.z - Math.abs(_pbLocal.z);
      if (dx <= 0 || dy <= 0 || dz <= 0) continue;
      // normal = face mais próxima de B, levada ao espaço do mundo
      let depth;
      if (dx <= dy && dx <= dz) { depth = dx; _cN.set(Math.sign(_pbLocal.x) || 1, 0, 0); }
      else if (dy <= dz)        { depth = dy; _cN.set(0, Math.sign(_pbLocal.y) || 1, 0); }
      else                      { depth = dz; _cN.set(0, 0, Math.sign(_pbLocal.z) || 1); }
      _cN.applyQuaternion(b.mesh.quaternion);
      this._applyPairContact(a, b, depth);
    }
  }

  // Impulso simétrico em A e B no ponto _cPoint com normal _cN (de B para A):
  // mesmo modelo do contato estático, mas as duas metades reagem — dá para
  // empurrar, empilhar e derrubar um objeto com o outro.
  _applyPairContact(a, b, depth) {
    if (a === this.heldLid) a._contactThisStep = true;
    else if (b === this.heldLid) b._contactThisStep = true;
    _cR.copy(_cPoint).sub(a.mesh.position);
    _pbR.copy(_cPoint).sub(b.mesh.position);
    _cVel.crossVectors(a.ang, _cR).add(a.vel);
    _pbVel.crossVectors(b.ang, _pbR).add(b.vel);
    _cVel.sub(_pbVel); // velocidade relativa do ponto de contato
    const vn = _cVel.dot(_cN);
    // Corpo dormente só acorda com impacto/empurrão de verdade; o contato de
    // apoio de uma pilha não zera o sono de ninguém (senão pilhas nunca
    // dormiriam, cada um acordando o outro a cada subpasso).
    if (vn < -0.06 || depth > 0.03) {
      if (a.resting) this.wakeObject(a);
      if (b.resting) this.wakeObject(b);
    }
    // quem segue dormindo participa como estático, igual ao chão
    const imA = a.resting ? 0 : a.invMass, iiA = a.resting ? 0 : a.invInertia;
    const imB = b.resting ? 0 : b.invMass, iiB = b.resting ? 0 : b.invInertia;
    if (vn < 0) {
      _cRxN.crossVectors(_cR, _cN);
      _pbRxN.crossVectors(_pbR, _cN);
      const e = vn < -0.35 ? PHYS_RESTITUTION : 0;
      if (vn < -0.35 && this.audio) { // clatter de objeto batendo em objeto
        const dist = _cPoint.distanceTo(this.camera.position);
        const heldInPair = a === this.heldLid ? a : (b === this.heldLid ? b : null);
        this._impactSound(heldInPair, Math.min(1, 0.15 + (-vn - 0.35) / 3.5) * Math.max(0, 1 - dist / 12));
      }
      const j = -(1 + e) * vn / (
        imA + imB + _cRxN.lengthSq() * iiA + _pbRxN.lengthSq() * iiB);
      a.vel.addScaledVector(_cN, j * imA);
      a.ang.addScaledVector(_cRxN, j * iiA);
      b.vel.addScaledVector(_cN, -j * imB);
      b.ang.addScaledVector(_pbRxN, -j * iiB);

      // atrito de Coulomb entre os corpos
      _cVel.crossVectors(a.ang, _cR).add(a.vel);
      _pbVel.crossVectors(b.ang, _pbR).add(b.vel);
      _cVel.sub(_pbVel);
      _cT.copy(_cVel).addScaledVector(_cN, -_cVel.dot(_cN));
      const vt = _cT.length();
      if (vt > 1e-5) {
        _cT.divideScalar(vt);
        _cRxT.crossVectors(_cR, _cT);
        _pbRxT.crossVectors(_pbR, _cT);
        let jt = -vt / (
          imA + imB + _cRxT.lengthSq() * iiA + _pbRxT.lengthSq() * iiB);
        jt = Math.max(jt, -PHYS_FRICTION * j);
        a.vel.addScaledVector(_cT, jt * imA);
        a.ang.addScaledVector(_cRxT, jt * iiA);
        b.vel.addScaledVector(_cT, -jt * imB);
        b.ang.addScaledVector(_pbRxT, -jt * iiB);
      }
      this._clampVelocities(a);
      this._clampVelocities(b);
    }
    // separação repartida pela massa efetiva (dormente não sai do lugar)
    const corr = (depth - PHYS_SLOP) * PHYS_CORRECTION;
    const total = imA + imB;
    if (corr > 0 && total > 0) {
      a.mesh.position.addScaledVector(_cN, corr * (imA / total));
      b.mesh.position.addScaledVector(_cN, -corr * (imB / total));
    }
    if (_cN.y > 0.5) a.supported = a.pairSupported = true;      // A sobre B
    else if (_cN.y < -0.5) b.supported = b.pairSupported = true; // B sob A
  }

  // O alvo é atualizado uma vez por frame, antes dos subpassos da física.
  // Além da posição, guardamos sua velocidade para o objeto herdar a corrida
  // do jogador em vez de tentar alcançá-la atrasado a cada passo fixo.
  _updateHoldTarget(dt) {
    this.camera.getWorldDirection(this._camDir);
    this._holdTarget.copy(this.camera.position).addScaledVector(this._camDir, this.heldLid.holdDistance);
    if (!this._hasHoldTarget || dt <= 0) {
      this._previousHoldTarget.copy(this._holdTarget);
      this._holdTargetVelocity.set(0, 0, 0);
      this._hasHoldTarget = true;
      return;
    }
    this._holdTargetVelocity.copy(this._holdTarget).sub(this._previousHoldTarget).multiplyScalar(1 / dt);
    if (this._holdTargetVelocity.lengthSq() > HOLD_TARGET_MAX_SPEED * HOLD_TARGET_MAX_SPEED) {
      this._holdTargetVelocity.setLength(HOLD_TARGET_MAX_SPEED);
    }
    this._previousHoldTarget.copy(this._holdTarget);
  }

  // ==== Objeto segurado (F): seguidor firme até o alvo à frente da câmera ==
  // O PD criticamente amortecido entrega resposta de jogo de aventura: firme
  // ao correr, sem teleporte e ainda respeitando paredes e outros obstáculos.
  updateHeldObject(l, h) {
    // Forçar o objeto contra o chão gera um contato por passo; sem isto o
    // baque repetiria (toc-toc-toc). Um passo inteiro sem tocar em nada
    // rearma a trava, e o próximo toque volta a soar uma única vez.
    if (!l._contactThisStep) l.heldImpactLatched = false;
    l._contactThisStep = false;
    _cT.copy(this._holdTarget).sub(l.mesh.position);
    this._holdVelocityDelta.copy(this._holdTargetVelocity).sub(l.vel);
    l.vel.addScaledVector(_cT, HOLD_STIFFNESS * h);
    l.vel.addScaledVector(this._holdVelocityDelta, HOLD_DAMPING * h);
    l.vel.y -= PHYS_GRAVITY * HOLD_GRAVITY_SCALE * h;
    if (l.vel.lengthSq() > HOLD_MAX_SPEED * HOLD_MAX_SPEED) l.vel.setLength(HOLD_MAX_SPEED);

    l.ang.multiplyScalar(Math.exp(-6 * h)); // giro residual morre suave
    // mesmo anti-tunneling do objeto livre: a mola chega a 18 m/s e, num
    // passo único, empurraria a tampa através de uma parede de 5 cm sem
    // nenhum ponto de contato registrar a passagem
    const steps = Math.min(4, Math.max(1, Math.ceil(l.vel.length() * h / 0.05)));
    const hh = h / steps;
    for (let s = 0; s < steps; s++) {
      l.mesh.position.addScaledVector(l.vel, hh);
      this.resolveObjectCollisions(l, hh); // não é empurrado através de paredes
    }
    this._sanitize(l);

    // preso atrás de um obstáculo ou esticado demais: solta automaticamente
    if (l.mesh.position.distanceTo(this._holdTarget) > HOLD_BREAK_DISTANCE) l.holdStrain += h;
    else l.holdStrain = 0;
    if (l.holdStrain > HOLD_BREAK_TIME ||
        l.mesh.position.distanceTo(this.camera.position) > LID_HOLD_MAX_DISTANCE + 1.2) {
      this.releaseObject();
    }
  }

  _applyHeldRotation(l, rx, ry, rz) {
    // Eixos relativos à câmera: o sentido do comando permanece coerente com
    // a tela mesmo depois de o objeto acumular rotações próprias.
    this.camera.getWorldQuaternion(this._rotCameraQ);
    this._rotParentQ.identity();
    if (l.mesh.parent) l.mesh.parent.getWorldQuaternion(this._rotParentQ).invert();
    if (Math.abs(rx) > 1e-5) {
      this._rotAxis.set(1, 0, 0).applyQuaternion(this._rotCameraQ).applyQuaternion(this._rotParentQ).normalize();
      this._rotQ.setFromAxisAngle(this._rotAxis, rx);
      l.mesh.quaternion.premultiply(this._rotQ);
    }
    if (Math.abs(ry) > 1e-5) {
      this._rotAxis.set(0, 1, 0).applyQuaternion(this._rotCameraQ).applyQuaternion(this._rotParentQ).normalize();
      this._rotQ.setFromAxisAngle(this._rotAxis, ry);
      l.mesh.quaternion.premultiply(this._rotQ);
    }
    if (Math.abs(rz) > 1e-5) {
      this._rotAxis.set(0, 0, -1).applyQuaternion(this._rotCameraQ).applyQuaternion(this._rotParentQ).normalize();
      this._rotQ.setFromAxisAngle(this._rotAxis, rz);
      l.mesh.quaternion.premultiply(this._rotQ);
    }
    if (Math.abs(rx) + Math.abs(ry) + Math.abs(rz) > 1e-5) l.mesh.quaternion.normalize();
  }

  // Retorna o cosseno entre o olhar e a direção ao alvo (−1 se fora do alcance)
  _aimDot(worldPos, maxDist) {
    this._to.copy(worldPos).sub(this.camera.position);
    const dist = this._to.length();
    if (dist > maxDist) return -1;
    this.camera.getWorldDirection(this._camDir);
    const dot = this._to.divideScalar(dist).dot(this._camDir);
    return dot > 0.55 ? dot : -1;
  }

  // Para mover uma tampa, não basta estar "perto" do centro da mira: o raio
  // que sai do crosshair precisa atingir a geometria real da tampa.
  _lidUnderCrosshair() {
    this._raycaster.setFromCamera(this._screenCenter, this.camera);
    this._raycaster.near = 0;
    this._raycaster.far = LID_GRAB_DIST;
    let closest = null, closestDistance = Infinity;
    for (const l of this._lids) {
      l.mesh.updateMatrixWorld(true);
      // recursivo: o balde é um Group (corpo + alça); tampas simples não têm filhos
      const hit = this._raycaster.intersectObject(l.mesh, true)[0];
      if (hit && hit.distance < closestDistance) {
        closest = l;
        closestDistance = hit.distance;
      }
    }
    return closest;
  }

  // A pastilha é recolhível em dois casos, ambos dentro do alcance:
  //  (A) mira DIRETA: o raio do crosshair passa a ≤ PELLET_AIM_RADIUS do centro
  //      da pastilha (para quando ela está à mostra numa superfície);
  //  (B) olhar para DENTRO: se ela está num recipiente ABERTO com boca (barril/
  //      caixa) e o raio da mira cruza a abertura, você está claramente mirando
  //      o que está lá dentro — mesmo que o ponto caia na parede/fundo.
  // Isso evita o antigo cone largo (pegar sem olhar) sem exigir acertar a
  // pastilha minúscula no fundo de um barril fundo.
  _pelletUnderCrosshair() {
    const pellet = this.source.pellet;
    if (!pellet) return false;
    this.camera.getWorldDirection(this._camDir);
    pellet.getWorldPosition(this._to);
    this._to.sub(this.camera.position);            // câmera → pastilha
    const along = this._to.dot(this._camDir);       // projeção sobre o olhar
    if (along <= 0 || along > PELLET_GRAB_DIST) return false; // atrás ou longe demais
    const perp2 = this._to.lengthSq() - along * along; // distância² do centro ao raio
    if (perp2 <= PELLET_AIM_RADIUS * PELLET_AIM_RADIUS) return true; // (A) mira direta

    // (B) mira para dentro da boca do recipiente aberto
    const c = this.source.container;
    if (c && c.open && c.lidMouth && this._camDir.y < -1e-3) {
      const m = c.lidMouth;
      const t = (m.topY - this.camera.position.y) / this._camDir.y; // onde o raio cruza o topo da boca
      if (t > 0 && t <= PELLET_GRAB_DIST) {
        const hx = this.camera.position.x + this._camDir.x * t;
        const hz = this.camera.position.z + this._camDir.z * t;
        if (hx >= m.minX && hx <= m.maxX && hz >= m.minZ && hz <= m.maxZ) return true;
      }
    }
    return false;
  }

  // Distância² do ponto `focus` ao raio da mira, mas só se ele estiver À FRENTE,
  // dentro de `maxDist` e a no máximo `radius` do raio. Fora disso: Infinity
  // (não está sob a mira). Serve para exigir olhar para o recipiente ao interagir.
  _focusUnderCrosshair(focus, maxDist, radius) {
    this.camera.getWorldDirection(this._camDir);
    this._to.copy(focus).sub(this.camera.position);
    const along = this._to.dot(this._camDir);
    if (along <= 0 || along > maxDist) return Infinity;
    const perp2 = this._to.lengthSq() - along * along;
    return perp2 <= radius * radius ? perp2 : Infinity;
  }

  // Raio de mira de um recipiente: a partir da boca (barril/caixa) quando existe,
  // senão um valor padrão para faces maiores (armário/gaveta/maleta).
  _containerRadius(c) {
    if (c.lidMouth) {
      const m = c.lidMouth;
      return Math.max(m.maxX - m.minX, m.maxZ - m.minZ) * 0.5 + 0.14;
    }
    return 0.55;
  }

  _pickTarget() {
    // O objeto de alvo (e seu rótulo) só é recriado quando o alvo MUDA —
    // evita alocar objetos e montar strings a cada frame do loop principal.
    if (this.heldLid) {
      if (this.target?.type !== 'lid' || this.target.lid !== this.heldLid || !this.target.held) {
        this.target = {
          type: 'lid', lid: this.heldLid, held: true,
          label: 'largar objeto',
          detail: this.gamepadMode
            ? 'LB + analógico direito: girar X/Y · LB + LT/RT: girar Z · LB + analógico esquerdo: ↑ afastar / ↓ aproximar'
            : 'Scroll ↑↓: inclinar como LB + RS · M1: girar à esquerda · M2: girar à direita · Shift + Scroll: distância',
        };
      }
      return;
    }
    // Na evacuação a chave usa o mesmo fluxo de alvo/coleta da pastilha.
    if (this.evacuation?.isKeyCollectable()) {
      this.evacuation.refreshKeyPosition();
      if (this._aimDot(this.evacuation.keyPosition, 3.2) >= 0) {
        if (this.target?.type !== 'evacuation-key') {
          this.target = { type: 'evacuation-key', label: 'recolher a chave de evacuação' };
        }
        return;
      }
    }
    // prioridade normal: recolher a pastilha (se visível/acessível E sob a mira)
    if (!this.evacuation && this.source.active && this.source.isCollectable() && this._pelletUnderCrosshair()) {
      if (this.target?.type !== 'pellet') this.target = { type: 'pellet', label: 'recolher a pastilha' };
      return;
    }
    const bestLid = this._lidUnderCrosshair();
    if (bestLid) {
      if (this.target?.type !== 'lid' || this.target.lid !== bestLid || this.target.held) {
        this.target = {
          type: 'lid', lid: bestLid, held: false,
          label: bestLid.grabLabel || (bestLid.prop ? 'pegar o objeto' : 'pegar a tampa para inspecioná-la'),
        };
      }
      return;
    }
    // exige a mira SOBRE o recipiente: entre os que o crosshair de fato aponta,
    // escolhe aquele cujo raio passa mais perto do foco (a gaveta inferior ganha
    // da superior se for ela que está sob a mira). Antes um cone largo deixava
    // interagir sem olhar para o objeto.
    let best = null, bestPerp = Infinity;
    for (const c of this.containers) {
      if (c.oneShot && c.open) continue; // barril já aberto: sem tampa para fechar
      const perp = this._focusUnderCrosshair(c.focus, INTERACT_DIST, this._containerRadius(c));
      if (perp < bestPerp) { best = c; bestPerp = perp; }
    }
    if (!best) { this.target = null; return; }
    if (this.target?.type === 'container' && this.target.container === best && this.target.open === best.open) return;
    const label = best.oneShot && !best.open
      ? `aperte ${this.gamepadMode ? 'X' : 'F'} para retirar a tampa de ${best.name}`
      : `${best.open ? 'fechar' : 'abrir'} ${best.name}`;
    this.target = { type: 'container', container: best, open: best.open, label };
  }

  keyDownF() {
    if (this.heldLid) { this.releaseObject(); return null; } // F alterna: solta o objeto
    if (this.target?.type === 'lid') {
      this.grabObject(this.target.lid);
      return 'grabbed';
    }
    if (this.target?.type === 'container' && this.target.container.oneShot) {
      this._detachOneShot(this.target.container, true); // um toque já retira a tampa (sem segurar)
      return null;
    }
    return this.use();
  }

  // Com o F em modo alternado (pegar/soltar), soltar a tecla não larga mais o
  // objeto — só cancela a retirada de tampa pendente (segurar F em barril/caixa).
  keyUpF() {
    if (this._pendingOneShot) {
      this._pendingOneShot = null;
      this._fHoldTime = 0;
      this._fHoldActivated = false;
    }
  }

  cancelF() {
    this._pendingOneShot = null;
    this._fHoldTime = 0;
    this._fHoldActivated = false;
    // perdeu o foco da janela: zera os botões de giro (o mouseup pode nunca
    // chegar), mas o objeto continua na mão
    this._rotInput.x = this._rotInput.y = false;
  }

  // ==== Objetos soltos do cenário ===========================================
  // Caixas das estantes, teclados, mouses etc. entram no mesmo motor de
  // física das tampas: dormem onde estão até o jogador pegá-los com F
  // (girar com M1/M2/scroll, largar com F, exatamente como as tampas).
  registerProp(mesh, ignore = [], surfaces = []) {
    // Meshes simples usam a própria escala. Equipamentos compostos (Group)
    // declaram uma caixa física explícita em userData.physicsSize.
    const size = mesh.userData.physicsSize || mesh.scale;
    const hx = size.x / 2, hy = size.y / 2, hz = size.z / 2;
    const mass = Math.max(0.15, mesh.userData.physicsMass || 1);
    const contactLocal = [];
    // mesmo conjunto das tampas (cantos + arestas + faces): sem os pontos
    // internos o objeto atravessa colisores mais estreitos que ele
    for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
      if (sx === 0 && sy === 0 && sz === 0) continue;
      contactLocal.push(new THREE.Vector3(sx * hx, sy * hy, sz * hz));
    }
    const p = {
      mesh, prop: true, grabLabel: mesh.userData.grabLabel || null,
      home: { position: mesh.position.clone(), quaternion: mesh.quaternion.clone() },
      ignore,
      contactLocal,
      boundRadius: Math.hypot(size.x, size.y, size.z) / 2,
      invMass: 1 / mass,
      // inércia no patamar das tampas (piso 0.08): objetos pequenos com a
      // fórmula das dimensões receberiam impulsos angulares enormes a cada
      // contato e ficariam balançando para sempre, sem nunca dormir
      invInertia: 1 / Math.max(mass * (size.x ** 2 + size.y ** 2 + size.z ** 2) / 6, 0.08),
      _he: new THREE.Vector3(hx, hy, hz),
      // limiar de sono mais tolerante: congelar a ≤0.11 rad/s é imperceptível
      sleepMul: 2.5,
      ownerCollider: null, ownerSurfaces: surfaces, ownerMouth: null,
      ownerCollisionActive: true,
      resting: true, supported: true, sleepTimer: 0,
      holdStrain: 0, holdDistance: 1.2,
      vel: new THREE.Vector3(), ang: new THREE.Vector3(),
    };
    this._props.push(p);
    this._lids.push(p);
  }

  // O balde entra no mesmo motor dos objetos soltos, mas com formato próprio:
  // anéis de contato de tronco de cone (o grupo não é uma caixa unitária
  // escalada) e uma alça pendular integrada ao passo fixo da física.
  registerBucket({ mesh, pivot, restAngle, rTop, rBot, halfH, armLen }, ignore = [], surfaces = []) {
    const contactLocal = [new THREE.Vector3(0, -halfH, 0), new THREE.Vector3(0, halfH, 0)];
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      contactLocal.push(new THREE.Vector3(c * rBot, -halfH, s * rBot));
      contactLocal.push(new THREE.Vector3(c * rTop, halfH, s * rTop));
    }
    const p = {
      mesh, prop: true, grabLabel: 'pegar o balde',
      home: { position: mesh.position.clone(), quaternion: mesh.quaternion.clone() },
      ignore, contactLocal,
      boundRadius: Math.hypot(rTop, halfH),
      invMass: 1,
      invInertia: 1 / 0.12,
      sleepMul: 2.5,
      // OBB explícito para pares e paredes finas: um Group não tem geometry,
      // então _bodyHalfExtents não pode deduzi-lo sozinho
      _he: new THREE.Vector3(rTop, halfH, rTop),
      ownerCollider: null, ownerSurfaces: surfaces, ownerMouth: null,
      ownerCollisionActive: true,
      resting: true, supported: true, sleepTimer: 0,
      holdStrain: 0, holdDistance: 1.2,
      vel: new THREE.Vector3(), ang: new THREE.Vector3(),
    };
    this._props.push(p);
    this._lids.push(p);
    this._buckets.push({
      prop: p, pivot, angle: restAngle, vel: 0,
      min: -restAngle, max: restAngle, armLen,
    });
  }

  // ==== Alça do balde: pêndulo de 1 grau de liberdade =======================
  // A alça só gira na dobradiça (eixo X local do balde). A cada passo fixo, a
  // gravidade é projetada no plano da dobradiça CONFORME a orientação atual
  // do corpo — girar o balde na mão faz a alça tombar para o lado que a
  // gravidade manda, com atrito no eixo e batente elástico nos suportes.
  _updateBucketHandle(b, h) {
    const q = b.prop.mesh.quaternion;
    _cAxis.set(1, 0, 0).applyQuaternion(q);                              // dobradiça no mundo
    _cT.set(0, Math.cos(b.angle), Math.sin(b.angle)).applyQuaternion(q); // braço no mundo
    _cN.set(0, -1, 0);
    _cVel.crossVectors(_cT, _cN); // torque da gravidade no braço
    b.vel += (PHYS_GRAVITY / b.armLen) * _cVel.dot(_cAxis) * h;
    b.vel *= Math.exp(-1.6 * h); // atrito da dobradiça
    b.angle += b.vel * h;
    if (b.angle > b.max) { b.angle = b.max; if (b.vel > 0) b.vel *= -0.25; }
    else if (b.angle < b.min) { b.angle = b.min; if (b.vel < 0) b.vel *= -0.25; }
    b.pivot.rotation.x = b.angle;
  }

  grabObject(l) {
    this.heldLid = l;
    this.wakeObject(l);
    l.holdStrain = 0;
    this._hasHoldTarget = false;
    this._holdTargetVelocity.set(0, 0, 0);
    l.holdDistance = THREE.MathUtils.clamp(
      this.camera.position.distanceTo(l.mesh.position),
      LID_HOLD_MIN_DISTANCE, LID_HOLD_MAX_DISTANCE
    );
    l.vel.set(0, 0, 0);
    l.ang.set(0, 0, 0);
    this._rotInput.x = this._rotInput.y = false;
    this._rotVel.z = 0;
    this._spinPitch = 0;
  }

  // Soltar preserva a velocidade da mola (sem impulso extra) e converte o
  // giro de inspeção em velocidade angular real — o objeto continua o
  // movimento que fazia no instante da soltura.
  releaseObject() {
    const l = this.heldLid;
    if (!l) return;
    this.audio?.release();
    this.camera.getWorldDirection(_cT).multiplyScalar(this._rotVel.z);
    l.ang.add(_cT);
    this._clampVelocities(l);
    this.wakeObject(l);
    this.heldLid = null;
    this._hasHoldTarget = false;
    this._holdTargetVelocity.set(0, 0, 0);
    this._rotInput.x = this._rotInput.y = false;
    this._rotVel.z = 0;
    this._spinPitch = 0;
  }

  _detachOneShot(c, grab) {
    if (c.open) return null;
    const result = this.use(c);
    const l = this._lids[this._lids.length - 1];
    if (l && grab) {
      // Retirada manual: a proteção da abertura já vale desde o primeiro
      // quadro, inclusive se o jogador soltar F muito perto da caixa.
      l.ownerCollisionActive = true;
      l.vel.set(0, 0, 0);
      l.ang.set(0, 0, 0);
      this.grabObject(l);
    }
    return result;
  }

  // retorna 'collected' quando a pastilha é recolhida
  use(forcedContainer = null) {
    if (!forcedContainer && !this.target) return null;
    if (!forcedContainer && this.target.type === 'pellet') return 'collected';
    if (!forcedContainer && this.target.type === 'evacuation-key') {
      this.audio?.grab();
      return 'evacuation-key';
    }
    const c = forcedContainer || this.target.container;
    if (c.locked) { // porta trancada: só o aviso, nada abre
      this.audio?.doorLocked();
      this.hud.toast('Porta Trancada', 2.5);
      return null;
    }
    if (c.oneShot) { // barril/caixa: a tampa sai voando, sem volta
      c.open = true;
      c.progress = 1;
      const p = c.lid.position, r = 0.18;
      const ownerCollider = this.colliders.find(b =>
        p.x > b.min.x - r && p.x < b.max.x + r &&
        p.y > b.min.y - r && p.y < b.max.y + r &&
        p.z > b.min.z - r && p.z < b.max.z + r) || null;
      // dimensões reais da tampa (para pousar sem perfurar o chão)
      const isBarrel = c.lid.geometry.type === 'CylinderGeometry';
      let halfT, radius;
      if (isBarrel) {
        halfT = c.lid.geometry.parameters.height / 2;
        radius = c.lid.geometry.parameters.radiusTop;
      } else { // tábua de caixa: BoxGeometry unitária escalada
        halfT = c.lid.scale.y / 2;
        radius = Math.hypot(c.lid.scale.x, c.lid.scale.z) / 2;
      }
      // A tampa é ejetada principalmente para cima. O desvio lateral é pequeno
      // e só garante que ela não volte para dentro do recipiente na descida.
      const launchDir = new THREE.Vector3(
        p.x - this.camera.position.x, 0, p.z - this.camera.position.z
      );
      if (launchDir.lengthSq() < 0.001) {
        launchDir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      }
      launchDir.normalize().applyAxisAngle(
        THREE.Object3D.DEFAULT_UP, (Math.random() - 0.5) * 0.42
      );

      c.lid.position.y += 0.025;

      // Colisor conforme o formato real: anel de pontos nas bordas do disco
      // (tampa de barril) ou os 8 cantos da tábua (tampa de caixa). Os pontos
      // giram com o quaternion do mesh, então a colisão respeita a rotação.
      const contactLocal = [];
      let inertia, boundRadius;
      if (isBarrel) {
        for (let k = 0; k < 8; k++) {
          const a = k * Math.PI / 4, cx = Math.cos(a) * radius, cz = Math.sin(a) * radius;
          contactLocal.push(new THREE.Vector3(cx, -halfT, cz), new THREE.Vector3(cx, halfT, cz));
        }
        // centro e anel interno: sem eles o disco cai DENTRO de colisores mais
        // estreitos que ele (outro barril, caixa) sem registrar contato algum
        contactLocal.push(new THREE.Vector3(0, -halfT, 0), new THREE.Vector3(0, halfT, 0));
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          const cx = Math.cos(a) * radius * 0.5, cz = Math.sin(a) * radius * 0.5;
          contactLocal.push(new THREE.Vector3(cx, -halfT, cz), new THREE.Vector3(cx, halfT, cz));
        }
        inertia = radius * radius / 3; // disco fino (média dos eixos principais)
        boundRadius = Math.hypot(radius, halfT);
      } else {
        // cantos + meios de aresta + centros de face: a tábua é mais larga que
        // o colisor do barril (0,92 m × 0,68 m) — só com os cantos ela desce
        // centrada sem nenhum ponto dentro do colisor e afunda até o chão
        const hx = c.lid.scale.x / 2, hy = c.lid.scale.y / 2, hz = c.lid.scale.z / 2;
        for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
          if (sx === 0 && sy === 0 && sz === 0) continue;
          contactLocal.push(new THREE.Vector3(sx * hx, sy * hy, sz * hz));
        }
        inertia = (c.lid.scale.x ** 2 + c.lid.scale.y ** 2 + c.lid.scale.z ** 2) / 18;
        boundRadius = Math.hypot(c.lid.scale.x, c.lid.scale.y, c.lid.scale.z) / 2;
      }

      // Barris giram mais por serem leves; tábuas de caixa tombam pesadas.
      const spin = isBarrel ? 4.0 : 2.1;
      const horizontalSpeed = LID_LAUNCH_SPEED * (isBarrel ? 1.0 : 0.9) + Math.random() * 0.18;
      this._lids.push({
        mesh: c.lid, ownerCollider,
        contactLocal, boundRadius,
        invMass: 1, invInertia: 1 / Math.max(inertia, 0.005),
        ownerSurfaces: c.lidColliders || [], ownerMouth: c.lidMouth || null,
        ownerCollisionActive: false,
        resting: false, supported: false, sleepTimer: 0,
        holdStrain: 0, holdDistance: 1.2,
        vel: new THREE.Vector3(
          launchDir.x * horizontalSpeed,
          LID_LAUNCH_LIFT + (Math.random() - 0.5) * 0.35,
          launchDir.z * horizontalSpeed
        ),
        ang: new THREE.Vector3(
          ((Math.random() - 0.5) - launchDir.z) * spin,
          (Math.random() - 0.5) * spin,
          ((Math.random() - 0.5) + launchDir.x) * spin
        ),
      });
      return 'toggled';
    }
    c.open = !c.open;
    if (c.shieldEntry) {
      c.shieldEntry.transmission = c.open ? c.openTransmission : c.closedTransmission;
    }
    this.audio?.drawer();
    return 'toggled';
  }
}
