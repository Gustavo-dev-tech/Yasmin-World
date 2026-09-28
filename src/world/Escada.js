import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Escada {
  constructor({
    scene,
    physics,
    position = new THREE.Vector3(0, 0, -35),
    width = 8.0,
    totalHeight = 14.0,
    totalRun = 28.0,
    stepsCount = 45,
    platformDepth = 14.0
  }) {
    this.scene = scene;
    this.physics = physics;

    // A posição marca exatamente o PÉ da escada (onde o jogador começa a subir)
    this.position = position.clone();
    this.width = width;
    this.totalHeight = totalHeight;
    this.totalRun = totalRun;
    this.stepsCount = stepsCount;
    this.platformDepth = platformDepth;

    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    this.scene.add(this.group);

    this.bodies = [];
    this._buildProceduralStaircase();
    this._createExactPhysics();
  }

  // Gera textura procedural de blocos de pedra envelhecida com musgo (Zero arquivos externos)
  _createStoneTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#4a4c4e';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 8;
    const cols = 4;
    const rowH = 512 / rows;
    const colW = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (colW * 0.5);
      for (let c = -1; c <= cols; c++) {
        const x = c * colW + offset;
        const y = r * rowH;
        const shade = 62 + Math.floor(Math.random() * 32);
        ctx.fillStyle = `rgb(${shade}, ${shade + 2}, ${shade - 2})`;
        ctx.fillRect(x + 3, y + 3, colW - 6, rowH - 6);

        // Rejunte escuro
        ctx.strokeStyle = '#232527';
        ctx.lineWidth = 4;
        ctx.strokeRect(x + 2, y + 2, colW - 4, rowH - 4);
      }
    }

    // Manchas sutis de musgo e desgaste
    for (let i = 0; i < 180; i++) {
      const mx = Math.random() * 512;
      const my = Math.random() * 512;
      const mr = 4 + Math.random() * 16;
      ctx.fillStyle = Math.random() > 0.45 ? 'rgba(45, 72, 42, 0.16)' : 'rgba(20, 20, 22, 0.18)';
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildProceduralStaircase() {
    const stoneTex = this._createStoneTexture();

    const stoneMat = new THREE.MeshStandardMaterial({
      map: stoneTex,
      roughness: 0.85,
      metalness: 0.08,
    });

    const darkStoneMat = new THREE.MeshStandardMaterial({
      map: stoneTex,
      color: 0x777a7c,
      roughness: 0.9,
      metalness: 0.1,
    });

    const stepRise = this.totalHeight / this.stepsCount;
    const stepRun = this.totalRun / this.stepsCount;

    // 1. DEGRAUS EM INSTANCED MESH (1 único Draw Call para todos os 45 degraus!)
    const stepGeo = new THREE.BoxGeometry(this.width, stepRise * 1.4, stepRun * 1.15);
    const stepsInstanced = new THREE.InstancedMesh(stepGeo, stoneMat, this.stepsCount);
    stepsInstanced.castShadow = true;
    stepsInstanced.receiveShadow = true;

    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.stepsCount; i++) {
      const y = (i + 0.5) * stepRise;
      const z = -(i + 0.5) * stepRun;
      dummy.position.set(0, y, z);
      dummy.updateMatrix();
      stepsInstanced.setMatrixAt(i, dummy.matrix);
    }
    stepsInstanced.instanceMatrix.needsUpdate = true;
    this.group.add(stepsInstanced);

    // 2. ESTRUTURA DE SUSTENTAÇÃO E MURETAS LATERAIS (Guarda-corpos inclinados)
    const hyp = Math.hypot(this.totalHeight, this.totalRun);
    const slopeAngle = Math.atan2(this.totalHeight, this.totalRun);
    const stringerWidth = 0.85;
    const stringerHeight = 1.6;

    const stringerGeo = new THREE.BoxGeometry(stringerWidth, stringerHeight, hyp + 1.0);
    [-1, 1].forEach((side) => {
      const wall = new THREE.Mesh(stringerGeo, darkStoneMat);
      wall.position.set(
        side * (this.width * 0.5 + stringerWidth * 0.45),
        this.totalHeight * 0.5 + 0.35,
        -this.totalRun * 0.5
      );
      wall.rotation.x = slopeAngle;
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.group.add(wall);
    });

    // 3. PILARES COM TOCHAS AO LONGO DA SUBIDA
    const pillarGeo = new THREE.BoxGeometry(1.15, 2.8, 1.15);
    const brazierGeo = new THREE.CylinderGeometry(0.38, 0.22, 0.35, 8);
    const brazierMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.7, roughness: 0.4 });
    const flameGeo = new THREE.ConeGeometry(0.26, 0.65, 8);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7700 });

    const pillarPairs = 4;
    for (let p = 0; p <= pillarPairs; p++) {
      const frac = p / pillarPairs;
      const py = frac * this.totalHeight;
      const pz = -frac * this.totalRun;

      [-1, 1].forEach((side) => {
        const px = side * (this.width * 0.5 + stringerWidth * 0.5);

        const pillar = new THREE.Mesh(pillarGeo, darkStoneMat);
        pillar.position.set(px, py + 1.4, pz);
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        this.group.add(pillar);

        const brazier = new THREE.Mesh(brazierGeo, brazierMat);
        brazier.position.set(px, py + 2.95, pz);
        this.group.add(brazier);

        const flame = new THREE.Mesh(flameGeo, flameMat);
        flame.position.set(px, py + 3.35, pz);
        this.group.add(flame);
      });
    }

    // Luzes reais no pé e no topo da escada para iluminar o jogador à noite sem pesar no FPS
    const bottomLight = new THREE.PointLight(0xff8822, 6.0, 22, 1.5);
    bottomLight.position.set(0, 3.8, -1.0);
    this.group.add(bottomLight);

    const topLight = new THREE.PointLight(0xff6611, 10.0, 32, 1.4);
    topLight.position.set(0, this.totalHeight + 4.5, -this.totalRun - this.platformDepth * 0.5);
    this.group.add(topLight);

    // 4. PLATAFORMA DO TOPO (ALTAR DO DRAGÃO)
    const platWidth = this.width + 6.0;
    const platThickness = 2.0;
    const platGeo = new THREE.BoxGeometry(platWidth, platThickness, this.platformDepth);
    const platformMesh = new THREE.Mesh(platGeo, stoneMat);
    platformMesh.position.set(
      0,
      this.totalHeight - platThickness * 0.5,
      -this.totalRun - this.platformDepth * 0.5
    );
    platformMesh.castShadow = true;
    platformMesh.receiveShadow = true;
    this.group.add(platformMesh);

    // Pilares Monolíticos no Topo (Onde o Dragão fica acorrentado no Ato IV)
    const monolithGeo = new THREE.BoxGeometry(1.4, 5.5, 1.4);
    const corners = [
      [-platWidth * 0.42, -this.totalRun - 2.0],
      [ platWidth * 0.42, -this.totalRun - 2.0],
      [-platWidth * 0.42, -this.totalRun - this.platformDepth + 2.0],
      [ platWidth * 0.42, -this.totalRun - this.platformDepth + 2.0],
    ];
    corners.forEach(([cx, cz]) => {
      const mono = new THREE.Mesh(monolithGeo, darkStoneMat);
      mono.position.set(cx, this.totalHeight + 2.75, cz);
      mono.castShadow = true;
      mono.receiveShadow = true;
      this.group.add(mono);
    });

    console.log('[Escada] Escadaria Monumental e Altar do Dragão gerados via script!');
  }

  _createExactPhysics() {
    if (!this.physics || !this.physics.world) return;

    const hyp = Math.hypot(this.totalHeight, this.totalRun);
    const slopeAngle = Math.atan2(this.totalHeight, this.totalRun);
    const rampThickness = 1.0;

    // 1. Rampa Física Contínua (Alinhada milimetricamente com os degraus)
    const rampShape = new CANNON.Box(
      new CANNON.Vec3(this.width * 0.5, rampThickness * 0.5, hyp * 0.5)
    );

    const cosA = Math.cos(slopeAngle);
    const sinA = Math.sin(slopeAngle);

    const rampBody = new CANNON.Body({
      mass: 0,
      position: new CANNON.Vec3(
        this.position.x,
        this.position.y + this.totalHeight * 0.5 - (rampThickness * 0.5) * cosA,
        this.position.z - this.totalRun * 0.5 - (rampThickness * 0.5) * sinA
      ),
    });

    // Inclina o eixo -Z para subir até +Y
    rampBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), slopeAngle);
    rampBody.addShape(rampShape);
    this.physics.world.addBody(rampBody);
    this.bodies.push(rampBody);

    // 2. Colisão das Muretas Laterais (Impede o jogador de cair pelas bordas na subida)
    const sideWallShape = new CANNON.Box(new CANNON.Vec3(0.45, 1.2, hyp * 0.5));
    [-1, 1].forEach((side) => {
      const wallBody = new CANNON.Body({
        mass: 0,
        position: new CANNON.Vec3(
          this.position.x + side * (this.width * 0.5 + 0.45),
          this.position.y + this.totalHeight * 0.5 + 0.8,
          this.position.z - this.totalRun * 0.5
        ),
      });
      wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), slopeAngle);
      wallBody.addShape(sideWallShape);
      this.physics.world.addBody(wallBody);
      this.bodies.push(wallBody);
    });

    // 3. Piso Físico da Plataforma do Topo (Altar do Dragão)
    const platWidth = this.width + 6.0;
    const platThickness = 2.0;
    const platShape = new CANNON.Box(
      new CANNON.Vec3(platWidth * 0.5, platThickness * 0.5, this.platformDepth * 0.5)
    );
    const platBody = new CANNON.Body({
      mass: 0,
      position: new CANNON.Vec3(
        this.position.x,
        this.position.y + this.totalHeight - platThickness * 0.5,
        this.position.z - this.totalRun - this.platformDepth * 0.5
      ),
    });
    platBody.addShape(platShape);
    this.physics.world.addBody(platBody);
    this.bodies.push(platBody);
  }
}