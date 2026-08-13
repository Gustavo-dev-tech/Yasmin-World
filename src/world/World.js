import * as THREE from 'three';
import { createMirror } from './Mirror.js';

export class World {
  constructor({ scene, physics }) {
    this.scene = scene;
    this.physics = physics;
    this.obstacleMeshes = []; // usado pela IA dos animais (raycasting)
    this.clock = new THREE.Clock();
    this._waterfallUniforms = null;

    this._createGround();
    this._createFence();
    this._createHouses();
    this._createCastle();
    this._createTreesInstanced();
    this._createWaterfall();
    this._createMirror();
  }

  _createGrassTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4CAF50';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 10000; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? '#43A047' : '#66BB6A';
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 4);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(25, 25);
    return texture;
  }

  _createGround() {
    this.physics.addGroundPlane();
    const groundMat = new THREE.MeshStandardMaterial({ map: this._createGrassTexture(), roughness: 0.9 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  _createFence() {
    const fenceGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 });
    const size = 140;
    const step = 4;

    const addPost = (x, z) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), woodMat);
      post.position.set(x, 0.75, z);
      post.castShadow = true;
      fenceGroup.add(post);
      this.obstacleMeshes.push(post);
      this.physics.addStaticBox({ x: 0.5, y: 1.5, z: 0.5 }, { x, y: 0.75, z });
    };

    for (let i = -size / 2; i <= size / 2; i += step) {
      addPost(i, -size / 2);
      addPost(i, size / 2);
      addPost(-size / 2, i);
      addPost(size / 2, i);
    }
    this.scene.add(fenceGroup);
  }

  _createHouse(x, z, rotationY = 0) {
    const houseGroup = new THREE.Group();

    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(5, 3.5, 5),
      new THREE.MeshStandardMaterial({ color: 0xd2b48c, roughness: 0.8 })
    );
    walls.position.y = 1.75;
    walls.castShadow = true;
    walls.receiveShadow = true;
    houseGroup.add(walls);
    this.obstacleMeshes.push(walls);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(4.2, 2.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.6 })
    );
    roof.position.y = 4.75;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    houseGroup.add(roof);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 2, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x3d2314 })
    );
    door.position.set(0, 1, 2.51);
    houseGroup.add(door);

    houseGroup.position.set(x, 0, z);
    houseGroup.rotation.y = rotationY;
    this.scene.add(houseGroup);

    this.physics.addStaticBox({ x: 5.2, y: 3.5, z: 5.2 }, { x, y: 1.75, z }, rotationY);
  }

  _createHouses() {
    this._createHouse(-25, -25, 0.5);
    this._createHouse(25, 25, -0.8);
    this._createHouse(-28, 22, 1.2);
  }

  // Torre circular construída com segmentos retos (mesma técnica da
  // cerca), deixando um vão livre = porta de entrada real.
  _createCastle() {
    const x = 0, z = -50;
    const radius = 5;
    const height = 6;
    const segments = 16;
    const doorSegments = 2; // quantos segmentos consecutivos viram a porta

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7f8c8d, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.5 });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9 });

    const castleGroup = new THREE.Group();
    castleGroup.position.set(x, 0, z);
    this.scene.add(castleGroup);

    // Piso interno
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(radius - 0.3, radius - 0.3, 0.1, segments), floorMat);
    floor.position.y = 0.05;
    floor.receiveShadow = true;
    castleGroup.add(floor);

    const segAngle = (Math.PI * 2) / segments;
    const doorStart = -Math.floor(doorSegments / 2);

    for (let i = 0; i < segments; i++) {
      const isDoor = i >= doorStart + segments && false; // placeholder, ver abaixo
      const relativeIndex = ((i - doorStart) % segments + segments) % segments;
      if (relativeIndex < doorSegments) continue; // pula os segmentos da porta

      const angle = i * segAngle;
      const segWidth = 2 * radius * Math.sin(segAngle / 2) * 1.05;

      const wall = new THREE.Mesh(new THREE.BoxGeometry(segWidth, height, 0.4), stoneMat);
      wall.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      wall.rotation.y = -angle + Math.PI / 2;
      wall.castShadow = true;
      wall.receiveShadow = true;
      castleGroup.add(wall);
      this.obstacleMeshes.push(wall);

      // Física no espaço do mundo (não do grupo local)
      this.physics.addStaticBox(
        { x: segWidth, y: height, z: 1.2 }, // Espessura aumentada para 0.8
        { x: x + Math.cos(angle) * radius, y: height / 2, z: z + Math.sin(angle) * radius },
        -angle + Math.PI / 2
      );
    }

    const roof = new THREE.Mesh(new THREE.ConeGeometry(radius + 0.5, 3.5, segments), roofMat);
    roof.position.y = height + 1.75;
    roof.castShadow = true;
    castleGroup.add(roof);

    // Tocha simples na entrada
    const torchLight = new THREE.PointLight(0xffa500, 1.2, 8);
    torchLight.position.set(radius - 0.5, 1.5, 0);
    castleGroup.add(torchLight);
  }
  _createMirror() {
    const mirrorGroup = createMirror({
      width: 2.5,
      height: 3.5,
      position: new THREE.Vector3(5, 0, 5),
      rotationY: -Math.PI * 0.75, // ajuste este ângulo até o espelho "olhar" para o spawn
      physics: this.physics,
    });
    this.scene.add(mirrorGroup);
    this.obstacleMeshes.push(mirrorGroup);
}

  _createTreesInstanced() {
    const positions = [
      [-35, -15], [35, -18], [-38, 35], [40, 25], [-12, -40], [20, -42],
    ];

    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 3, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
    trunkMesh.castShadow = true;

    const leafGeo = new THREE.ConeGeometry(2.2, 3.5, 8);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });
    const leafMesh = new THREE.InstancedMesh(leafGeo, leafMat, positions.length);
    leafMesh.castShadow = true;

    const dummy = new THREE.Object3D();
    positions.forEach(([x, z], i) => {
      dummy.position.set(x, 1.5, z);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, 4.75, z);
      dummy.updateMatrix();
      leafMesh.setMatrixAt(i, dummy.matrix);

      this.physics.addStaticCylinder(0.7, 3, { x, y: 1.5, z });
    });

    this.scene.add(trunkMesh, leafMesh);

    // Floresta de fundo, só decorativa (sem física) — mostra o ganho
    // de performance do InstancedMesh com muito mais unidades.
    const bgCount = 60;
    const bgTrunks = new THREE.InstancedMesh(trunkGeo, trunkMat, bgCount);
    const bgLeaves = new THREE.InstancedMesh(leafGeo, leafMat, bgCount);
    for (let i = 0; i < bgCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 65 + Math.random() * 12;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      dummy.position.set(x, 1.5, z);
      dummy.updateMatrix();
      bgTrunks.setMatrixAt(i, dummy.matrix);

      dummy.position.set(x, 4.75, z);
      dummy.updateMatrix();
      bgLeaves.setMatrixAt(i, dummy.matrix);
    }
    this.scene.add(bgTrunks, bgLeaves);
  }

  _createWaterfall() {
    const uniforms = { uTime: { value: 0 } };
    this._waterfallUniforms = uniforms;

    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float scroll = fract(vUv.y * 3.0 - uTime * 1.5);
          float stripes = smoothstep(0.0, 0.15, scroll) * smoothstep(1.0, 0.85, scroll);
          vec3 color = mix(vec3(0.4, 0.75, 0.95), vec3(0.85, 0.95, 1.0), stripes);
          gl_FragColor = vec4(color, 0.75);
        }
      `,
    });


    const geo = new THREE.PlaneGeometry(3, 6);
    const waterfall = new THREE.Mesh(geo, material);
    waterfall.position.set(-45, 3, 5);
    waterfall.rotation.y = Math.PI / 2;
    this.scene.add(waterfall);

    const foamLight = new THREE.PointLight(0x66ccff, 1.5, 6);
    foamLight.position.set(-45, 0.3, 5);
    this.scene.add(foamLight);
  }

  update(delta) {
    if (this._waterfallUniforms) this._waterfallUniforms.uTime.value += delta;
  }
}
//this._createWaterfall();

//position/rotationY