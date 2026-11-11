import * as THREE from 'three';

// Ponto de luz macio (núcleo claro + halo) para as partículas de radiação.
// Sem ele, THREE.Points desenha quadrados chapados. Uma textura só, criada
// no primeiro uso e compartilhada por todos os efeitos.
let texture = null;

export function glowSprite() {
  if (texture) return texture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.22, 'rgba(255, 255, 255, 0.85)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  texture = new THREE.CanvasTexture(canvas);
  return texture;
}
