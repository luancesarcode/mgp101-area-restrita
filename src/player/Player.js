import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { CROUCH_HEIGHT, CROUCH_SPEED_FACTOR, EYE_OFFSET, GRAVITY, JUMP_SPEED, PLAYER_HALF, PLAYER_HEIGHT, RUN_SPEED, WALK_SPEED } from '../config/gameConfig.js';

// ==== PLAYER ================================================================
// Controlador FPS com colisão AABB por eixo contra a lista de Box3.
export class Player {
  constructor(camera, domElement, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.controls = new PointerLockControls(camera, domElement);

    this.position = new THREE.Vector3(0, 0, 6.2); // pés do jogador
    this.velocity = new THREE.Vector3();
    this.onGround = true;
    this.speedXZ = 0;
    this.running = false;
    this.healthFactor = 1; // queimaduras radioativas: saúde baixa deixa mais lento
    this.height = PLAYER_HEIGHT; // altura atual (Ctrl agacha suavemente)

    this.keys = { fwd: false, back: false, left: false, right: false, run: false, crouch: false };
    this.gamepad = { moveX: 0, moveY: 0, run: false, crouch: false };
    this.crouchToggle = false; // agachar alterna (Ctrl/B): aperta agacha, aperta de novo levanta
    this._prevPadCrouch = false;
    this._box = new THREE.Box3();
    this._dir = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();

    addEventListener('keydown', (e) => this._onKey(e, true));
    addEventListener('keyup', (e) => this._onKey(e, false));
    this._syncCamera();
  }

  _onKey(e, down) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp': this.keys.fwd = down; break;
      case 'KeyS': case 'ArrowDown': this.keys.back = down; break;
      case 'KeyA': case 'ArrowLeft': this.keys.left = down; break;
      case 'KeyD': case 'ArrowRight': this.keys.right = down; break;
      case 'ShiftLeft': case 'ShiftRight': this.keys.run = down; break;
      case 'ControlLeft': case 'ControlRight':
        if (down && !e.repeat) this.crouchToggle = !this.crouchToggle; // alterna: aperta agacha/levanta
        e.preventDefault(); break;
      case 'Space': if (down) this.jump(); break;
    }
  }

  setGamepadInput(moveX, moveY, run, crouch) {
    this.gamepad.moveX = THREE.MathUtils.clamp(moveX, -1, 1);
    this.gamepad.moveY = THREE.MathUtils.clamp(moveY, -1, 1);
    this.gamepad.run = Boolean(run);
    const c = Boolean(crouch);
    if (c && !this._prevPadCrouch) this.crouchToggle = !this.crouchToggle; // B alterna agachar
    this._prevPadCrouch = c;
  }

  jump() {
    if (!this.onGround) return;
    this.velocity.y = JUMP_SPEED;
    this.onGround = false;
  }

  _playerBox(pos) {
    this._box.min.set(pos.x - PLAYER_HALF.x, pos.y, pos.z - PLAYER_HALF.z);
    this._box.max.set(pos.x + PLAYER_HALF.x, pos.y + this.height, pos.z + PLAYER_HALF.z);
    return this._box;
  }

  _collides(pos) {
    const box = this._playerBox(pos);
    for (let i = 0; i < this.colliders.length; i++) {
      if (!this.colliders[i].disabled && box.intersectsBox(this.colliders[i])) return this.colliders[i];
    }
    return null;
  }

  update(dt) {
    this.camera.getWorldDirection(this._dir);
    this._dir.y = 0; this._dir.normalize();
    this._right.crossVectors(this._dir, THREE.Object3D.DEFAULT_UP).negate();

    const forwardInput = THREE.MathUtils.clamp(
      (this.keys.fwd ? 1 : 0) - (this.keys.back ? 1 : 0) - this.gamepad.moveY, -1, 1
    );
    const sideInput = THREE.MathUtils.clamp(
      (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0) - this.gamepad.moveX, -1, 1
    );
    this._wish.copy(this._dir).multiplyScalar(forwardInput).addScaledVector(this._right, sideInput);
    const inputMagnitude = Math.min(1, this._wish.length());

    // agachar/levantar suave; para levantar precisa de espaço livre acima
    const desiredH = this.crouchToggle ? CROUCH_HEIGHT : PLAYER_HEIGHT;
    const newH = this.height + (desiredH - this.height) * Math.min(1, 10 * dt);
    if (newH > this.height) {
      const oldH = this.height;
      this.height = newH;
      if (this._collides(this.position)) this.height = oldH;
    } else {
      this.height = newH;
    }
    const crouching = this.height < PLAYER_HEIGHT - 0.1;

    this.running = (this.keys.run || this.gamepad.run) && forwardInput > 0.2 && !crouching;
    let targetSpeed = inputMagnitude > 0 ? (this.running ? RUN_SPEED : WALK_SPEED) * inputMagnitude : 0;
    if (crouching) targetSpeed *= CROUCH_SPEED_FACTOR;
    targetSpeed *= this.healthFactor; // queimaduras radioativas: mais lento com a saúde baixa
    if (this._wish.lengthSq() > 0) this._wish.normalize();

    const accel = this.onGround ? 14 : 4;
    this.velocity.x += (this._wish.x * targetSpeed - this.velocity.x) * Math.min(1, accel * dt);
    this.velocity.z += (this._wish.z * targetSpeed - this.velocity.z) * Math.min(1, accel * dt);
    this.velocity.y -= GRAVITY * dt;

    this._moveAxis('x', this.velocity.x * dt);
    this._moveAxis('z', this.velocity.z * dt);
    this._moveY(this.velocity.y * dt);

    this.speedXZ = Math.hypot(this.velocity.x, this.velocity.z);
    this._syncCamera();
  }

  _moveAxis(axis, amount) {
    if (amount === 0) return;
    this.position[axis] += amount;
    const hit = this._collides(this.position);
    if (hit) {
      this.position[axis] = amount > 0
        ? hit.min[axis] - PLAYER_HALF[axis] - 0.001
        : hit.max[axis] + PLAYER_HALF[axis] + 0.001;
      this.velocity[axis] = 0;
    }
  }

  _moveY(amount) {
    this.position.y += amount;
    const hit = this._collides(this.position);
    if (hit) {
      if (amount <= 0) {
        this.position.y = hit.max.y + 0.001;
        this.onGround = true;
      } else {
        this.position.y = hit.min.y - this.height - 0.001;
      }
      this.velocity.y = 0;
    } else if (this.position.y <= 0) {
      this.position.y = 0;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }

  _syncCamera() {
    this.camera.position.set(this.position.x, this.position.y + this.height - EYE_OFFSET, this.position.z);
  }
}
