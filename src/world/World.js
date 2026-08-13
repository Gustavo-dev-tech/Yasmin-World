import * as THREE from 'three';

export class World {
  constructor({ scene, physics }) {
    this.scene = scene;
    this.physics = physics;
    this.obstacleMeshes = [];

    this._createTerrain();
    this._createRuinsAndTowers();
    this._createForestAndDecorations();
  }

  _createTerrain() {
    // Chão Expandido (300x300m)
    const groundGeo = new THREE.PlaneGeometry(300, 300, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x4ade80,
      roughness: 0.8,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this.physics.addGroundPlane();
  }

  _createRuinsAndTowers() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6 });

    // Torre de Vigia com Ameias
    const towerGeo = new THREE.CylinderGeometry(4, 4.5, 16, 12);
    const tower = new THREE.Mesh(towerGeo, stoneMat);
    tower.position.set(20, 8, -40);
    tower.castShadow = true;
    tower.receiveShadow = true;
    this.scene.add(tower);

    this.physics.addStaticCylinder(4, 16, tower.position);
    this.obstacleMeshes.push(tower);

    // Castelo Central Expandido
    const castleGeo = new THREE.BoxGeometry(25, 14, 25);
    const castle = new THREE.Mesh(castleGeo, stoneMat);
    castle.position.set(0, 7, -120);
    castle.castShadow = true;
    castle.receiveShadow = true;
    this.scene.add(castle);

    this.physics.addStaticBox({ x: 25, y: 14, z: 25 }, castle.position);
    this.obstacleMeshes.push(castle);
  }

  _createForestAndDecorations() {
    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 4, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const leavesGeo = new THREE.ConeGeometry(2.5, 6, 8);
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 });

    // Floresta Densa Espalhada
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 260;
      const z = (Math.random() - 0.5) * 260;

      if (Math.abs(x) < 15 && Math.abs(z) < 15) continue; // Abre espaço no spawn

      const group = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 2;
      trunk.castShadow = true;
      group.add(trunk);

      const leaves = new THREE.Mesh(leavesGeo, leavesMat);
      leaves.position.y = 6;
      leaves.castShadow = true;
      group.add(leaves);

      group.position.set(x, 0, z);
      this.scene.add(group);

      this.physics.addStaticCylinder(0.5, 4, new THREE.Vector3(x, 2, z));
      this.obstacleMeshes.push(group);
    }
  }

  update(delta) {}
}