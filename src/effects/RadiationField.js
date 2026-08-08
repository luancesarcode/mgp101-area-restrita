import * as THREE from 'three';

// ==== RADIATIONFIELD ========================================================
// Campo visual da radiação: núcleo pulsante + halo fresnel (brilha nas
// bordas) + partículas em espiral + luz verde. Surge por proximidade;
// o alcance de aparição depende da dificuldade.
export class RadiationField {
  constructor(scene, source) {
    this.source = source;
    this.group = new THREE.Group();
    this.group.position.copy(source.position);
    scene.add(this.group);

    this.fadeStart = 7.0;
    this.fadeFull = 1.6;
    this._t = 0;

    const sizeFactor = THREE.MathUtils.clamp(0.5 + source.intensity / 1000, 0.65, 1.5);
    this.group.scale.setScalar(sizeFactor);

    const glowGeo = new THREE.SphereGeometry(1, 24, 18);

    // núcleo: brilho aditivo simples
    this.innerMat = new THREE.MeshBasicMaterial({
      color: 0x7dff5e, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.inner = new THREE.Mesh(glowGeo, this.innerMat);
    this.group.add(this.inner);

    // halo: shader fresnel — só as bordas da esfera brilham (efeito "aura")
    this.haloMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x86ff62) },
        uOpacity: { value: 0 },
        uPower: { value: 2.6 },
      },
      vertexShader: /* glsl */`
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uPower;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
          gl_FragColor = vec4(uColor, fresnel * uOpacity);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.halo = new THREE.Mesh(glowGeo, this.haloMat);
    this.group.add(this.halo);

    // partículas ascendentes em espiral
    const N = 140;
    this._particles = [];
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      this._particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 0.15 + Math.random() * 0.9,
        y: -0.2 + Math.random() * 1.6,
        rise: 0.25 + Math.random() * 0.45,
        spin: (Math.random() - 0.5) * 1.6,
      });
    }
    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.pointsMat = new THREE.PointsMaterial({
      color: 0x9cff70, size: 0.05, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.points = new THREE.Points(pointsGeo, this.pointsMat);
    this.points.frustumCulled = false;
    this.group.add(this.points);

    this.light = new THREE.PointLight(0x6cff4d, 0, 7, 2);
    this.light.position.y = 0.25;
    this.group.add(this.light);

    this.group.visible = false;
  }

  // Nova fase: reaproveita geometrias, materiais, partículas e a luz — só
  // reposiciona/redimensiona para a fonte re-sorteada e apaga tudo.
  reset() {
    this._t = 0;
    this.group.position.copy(this.source.position);
    this.group.scale.setScalar(THREE.MathUtils.clamp(0.5 + this.source.intensity / 1000, 0.65, 1.5));
    this.innerMat.opacity = 0;
    this.haloMat.uniforms.uOpacity.value = 0;
    this.pointsMat.opacity = 0;
    this.light.intensity = 0;
    this.group.visible = false;
  }

  update(dt, playerPos) {
    this.group.position.copy(this.source.position); // segue a pastilha (gavetas)
    if (this.fadeStart <= this.fadeFull) { this.group.visible = false; return; } // modo Difícil: sem campo
    const dist = playerPos.distanceTo(this.source.position);
    const p = THREE.MathUtils.clamp((this.fadeStart - dist) / (this.fadeStart - this.fadeFull), 0, 1);

    this.group.visible = p > 0.002;
    if (!this.group.visible) return;

    this._t += dt;
    const pulse = 0.85 + 0.15 * Math.sin(this._t * 3.2);
    this.innerMat.opacity = 0.22 * p * pulse;
    this.haloMat.uniforms.uOpacity.value = 0.55 * p * pulse;
    this.pointsMat.opacity = 0.7 * p;
    this.light.intensity = 4.5 * p * pulse;
    this.inner.scale.setScalar(0.26 * (1 + 0.12 * Math.sin(this._t * 3.2)));
    this.halo.scale.setScalar(0.75 * (1 + 0.08 * Math.sin(this._t * 2.1 + 1)));

    const pos = this.points.geometry.attributes.position;
    for (let i = 0; i < this._particles.length; i++) {
      const pt = this._particles[i];
      pt.y += pt.rise * dt;
      pt.angle += pt.spin * dt;
      if (pt.y > 1.6) { pt.y = -0.2; pt.radius = 0.15 + Math.random() * 0.9; }
      const r = pt.radius * (1 - pt.y * 0.25);
      pos.setXYZ(i, Math.cos(pt.angle) * r, pt.y, Math.sin(pt.angle) * r);
    }
    pos.needsUpdate = true;
  }
}
