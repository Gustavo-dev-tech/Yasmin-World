import * as THREE from 'three';

export class Animals {
  constructor({ scene, obstacleMeshes = [] }) {
    this.scene = scene;
    this.obstacleMeshes = obstacleMeshes;
    this.raycaster = new THREE.Raycaster();
    this.bunnies = [];

    [[8, -5], [-12, 10], [15, -12], [-8, 18], [22, -5]].forEach(([x, z]) => this._createBunny(x, z));
  }

  _createBunny(x, z) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.9 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), mat);
    body.position.y = 0.3;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), mat);
    head.position.set(0, 0.6, 0.25);
    head.castShadow = true;
    group.add(head);

    [0.1, -0.1].forEach((ox) => {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.05), mat);
      ear.position.set(ox, 0.85, 0.25);
      group.add(ear);
    });

    group.position.set(x, 0, z);
    this.scene.add(group);

    this.bunnies.push({
      group, x, z,
      angle: Math.random() * Math.PI * 2,
      speed: 0.02 + Math.random() * 0.02,
      timer: 0,
      wanderTimer: 0,
    });
  }

  _checkObstacleAhead(bunny) {
    const origin = new THREE.Vector3(bunny.x, 0.3, bunny.z);
    const dir = new THREE.Vector3(Math.sin(bunny.angle), 0, Math.cos(bunny.angle));
    this.raycaster.set(origin, dir);
    this.raycaster.far = 2.5;
    const hits = this.raycaster.intersectObjects(this.obstacleMeshes, false);
    return hits.length > 0;
  }

  update(delta, elapsedTime) {
    this.bunnies.forEach((b) => {
      b.timer += delta;
      b.wanderTimer += delta;

      const blocked = this._checkObstacleAhead(b);
      if (blocked || b.wanderTimer > 4) {
        b.angle += (Math.random() - 0.5) * Math.PI; // vira pra um lado aleatório
        b.wanderTimer = 0;
      }

      b.x += Math.sin(b.angle) * b.speed;
      b.z += Math.cos(b.angle) * b.speed;

      // Mantém dentro da cerca (raio ~68 do centro)
      const distFromCenter = Math.hypot(b.x, b.z);
      if (distFromCenter > 68) {
        b.angle = Math.atan2(-b.x, -b.z); // vira de volta pro centro
      }

      b.group.position.set(b.x, 0, b.z);
      b.group.rotation.y = b.angle;
      b.group.position.y = Math.abs(Math.sin(elapsedTime * 8 + b.x)) * 0.25;
    });
  }
}