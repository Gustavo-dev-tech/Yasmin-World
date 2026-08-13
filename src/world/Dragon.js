import * as THREE from 'three';

export class Dragon {
  constructor({ scene, center = new THREE.Vector3(0, 20, -50), radius = 30, speed = 0.8 }) {
    this.scene = scene;
    this.center = center;
    this.radius = radius;
    this.speed = speed;
    this.angle = 0;

    this.group = new THREE.Group();
    this.wings = [];

    this._buildDragon();
    this.scene.add(this.group);
  }

  _buildDragon() {
    const scale = 1.8;
    this.group.scale.set(scale, scale, scale);

    const darkRedMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.5 });
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.3, emissive: 0xb45309, emissiveIntensity: 0.3 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2 });

    // Corpo / Tronco
    const bodyGeo = new THREE.ConeGeometry(0.9, 3.5, 6);
    const bodyMesh = new THREE.Mesh(bodyGeo, darkRedMat);
    bodyMesh.rotation.x = Math.PI / 2;
    bodyMesh.castShadow = true;
    this.group.add(bodyMesh);

    // Pescoço e Cabeça
    const neckGeo = new THREE.CylinderGeometry(0.4, 0.7, 2, 6);
    const neckMesh = new THREE.Mesh(neckGeo, darkRedMat);
    neckMesh.position.set(0, 0.8, 1.8);
    neckMesh.rotation.x = -Math.PI / 4;
    this.group.add(neckMesh);

    const headGeo = new THREE.BoxGeometry(0.8, 0.7, 1.4);
    const headMesh = new THREE.Mesh(headGeo, darkRedMat);
    headMesh.position.set(0, 1.5, 2.5);
    headMesh.castShadow = true;
    this.group.add(headMesh);

    // Olhos Brilhantes
    const eyeGeo = new THREE.SphereGeometry(0.12, 8, 8);
    [-0.42, 0.42].forEach((ox) => {
      const eye = new THREE.Mesh(eyeGeo, orangeMat);
      eye.position.set(ox, 1.65, 2.8);
      this.group.add(eye);
    });

    // Chifres
    const hornGeo = new THREE.ConeGeometry(0.15, 0.9, 4);
    [-0.3, 0.3].forEach((ox) => {
      const horn = new THREE.Mesh(hornGeo, goldMat);
      horn.position.set(ox, 2.1, 2.2);
      horn.rotation.x = -Math.PI / 3;
      this.group.add(horn);
    });

    // Cauda
    const tailGeo = new THREE.ConeGeometry(0.4, 4, 5);
    const tailMesh = new THREE.Mesh(tailGeo, darkRedMat);
    tailMesh.position.set(0, -0.2, -3.2);
    tailMesh.rotation.x = -Math.PI / 2.2;
    this.group.add(tailMesh);

    // Asas Esquerda e Direita (Articuladas para Animação de Voo)
    const wingGeo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      0, 0, 0,
      3.5, 0.5, -0.8,
      2.0, 0, -2.5,
    ]);
    wingGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    wingGeo.computeVertexNormals();

    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x990000,
      side: THREE.DoubleSide,
      roughness: 0.6,
    });

    // Asa Esquerda
    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.set(0.6, 0.2, 0.2);
    this.group.add(leftWing);
    this.wings.push({ mesh: leftWing, side: 1 });

    // Asa Direita
    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    rightWing.position.set(-0.6, 0.2, 0.2);
    rightWing.scale.x = -1; // Espelha a asa
    this.group.add(rightWing);
    this.wings.push({ mesh: rightWing, side: -1 });

    // Luz de Fogo Fraca Sob o Dragão
    const fireLight = new THREE.PointLight(0xff4500, 2, 25);
    fireLight.position.set(0, -0.5, 1);
    this.group.add(fireLight);
  }

  update(delta, elapsedTime) {
    // 1. Movimento Circular ao redor do Castelo
    this.angle += this.speed * delta;
    const x = this.center.x + Math.cos(this.angle) * this.radius;
    const z = this.center.z + Math.sin(this.angle) * this.radius;
    
    // Suave oscilação de altitude (subir e descer ao voar)
    const y = this.center.y + Math.sin(elapsedTime * 1.5) * 2.5;

    this.group.position.set(x, y, z);

    // 2. Aponta o dragão na direção da sua trajetória
    this.group.rotation.y = -this.angle;

    // 3. Inclinação lateral ao fazer a curva (Banking Angle)
    this.group.rotation.z = Math.sin(elapsedTime * 1.5) * 0.15 - 0.2;

    // 4. Batimento das Asas
    const wingFlap = Math.sin(elapsedTime * 6) * 0.45;
    this.wings.forEach((w) => {
      w.mesh.rotation.z = wingFlap * w.side;
    });
  }
}