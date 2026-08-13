import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

// Cria um espelho funcional (reflexo em tempo real) com moldura.
export function createMirror({ width = 2.5, height = 3.5, position, rotationY = 0, physics }) {
  const geometry = new THREE.PlaneGeometry(width, height);

  const mirror = new Reflector(geometry, {
    color: 0x889999,
    textureWidth: window.innerWidth * window.devicePixelRatio,
    textureHeight: window.innerHeight * window.devicePixelRatio,
  });

  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = rotationY;

  mirror.position.y = height / 2; // base do espelho encosta no chão
  group.add(mirror);

  // Moldura decorativa, um pouco atrás da superfície reflexiva
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b1d0e, roughness: 0.6 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, height + 0.3, 0.12), frameMat);
  frame.position.set(0, height / 2, -0.07);
  frame.castShadow = true;
  frame.receiveShadow = true;
  group.add(frame);

  // Colisão física (impede atravessar o espelho)
  if (physics) {
    physics.addStaticBox(
      { x: width + 0.3, y: height + 0.3, z: 0.2 },
      { x: position.x, y: (height + 0.3) / 2, z: position.z },
      rotationY
    );
  }

  return group;
}