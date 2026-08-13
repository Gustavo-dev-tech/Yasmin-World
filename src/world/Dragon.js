import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Dragon {
  constructor({ scene, physics, player }) {
    this.scene = scene;
    this.physics = physics;
    this.player = player;
    this.loader = new GLTFLoader();

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    // Estados simplificados: 'FLYING', 'LANDED', 'CHASING'
    this.state = 'FLYING';

    // Rota de Voo
    this.flightCenter = new THREE.Vector3(0, 11.0, -35);
    this.flightRadius = 38;
    this.flightSpeed = 0.45;
    this.flightAngle = 0;

    // Temporizadores de IA
    this.landTimer = 18;
    this.landedTimer = 0;
    this.chaseSpeed = 5.0;
    this.stopDistance = 4.5;

    this._loadDragon();
  }

  async _loadDragon() {
    try {
      console.log('[Dragon] Carregando "assets/models/dragon.glb"...');
      const gltf = await this.loader.loadAsync('assets/models/dragon.glb');
      this.model = gltf.scene;

      this.model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(this.model);
      const size = box.getSize(new THREE.Vector3());

      if (size.y > 0.01) {
        this.model.scale.setScalar(8.5 / size.y);
      } else {
        this.model.scale.setScalar(3.0);
      }

      // CORREÇÃO DE MATERIAL (Para não virar uma silhueta preta)
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false; 

          child.material = new THREE.MeshStandardMaterial({
            color: 0x6b2b3c, // Vermelho/Vinho escuro visível
            emissive: 0x1a0a12, // Leve brilho base para detalhar as escamas na sombra
            roughness: 0.7,
            metalness: 0.1,
            side: THREE.DoubleSide
          });
        }
      });

      this.scene.add(this.model);

      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(this.model);

        const getClip = (name, fallbackIdx) => {
          const found = gltf.animations.find((c) => c.name === name);
          return found || gltf.animations[fallbackIdx] || gltf.animations[0];
        };

        // O SEGREDO: Trocamos o 'fly2' estático pelo 'up' que bate as asas intensamente!
        this.actions['fly'] = this.mixer.clipAction(getClip('Qishilong_up', 23)); 
        this.actions['idle'] = this.mixer.clipAction(getClip('Qishilong_down_dz', 6));
        this.actions['walk'] = this.mixer.clipAction(getClip('Qishilong_skill05', 10)); 
        this.actions['attack'] = this.mixer.clipAction(getClip('Qishilong_attack01', 0));

        // Força loop infinito em todas as ações
        Object.values(this.actions).forEach(action => {
          action.setLoop(THREE.LoopRepeat, Infinity);
        });

        this.playAnim('fly');
        console.log('[Dragon] Animações principais vinculadas. Usando Qishilong_up para o voo!');
      }

    } catch (err) {
      console.warn('[Dragon] Erro ao carregar "assets/models/dragon.glb":', err);
    }
  }

  // TRANSIÇÃO SUAVE DE ANIMAÇÕES (Crossfade)
  playAnim(animName) {
    if (!this.actions[animName] || this.currentAction === animName) return;

    const nextAction = this.actions[animName];
    
    if (this.currentAction && this.actions[this.currentAction]) {
      this.actions[this.currentAction].fadeOut(0.4); // Suaviza a saída da animação antiga
    }

    nextAction.reset();
    nextAction.setEffectiveWeight(1.0);
    nextAction.fadeIn(0.4); // Suaviza a entrada da nova
    nextAction.play();

    this.currentAction = animName;
  }

  update(delta, player) {
    if (!this.model) return;

    if (this.mixer) {
      this.mixer.update(delta);
    }

    const activePlayer = player || this.player;
    const playerPos = activePlayer?.group?.position || activePlayer?.position;

    // --- ESTADO 1: VOO NO CÉU ---
    if (this.state === 'FLYING') {
      this.playAnim('fly'); // Agora vai bater as asas!

      this.flightAngle += this.flightSpeed * delta;
      const x = this.flightCenter.x + Math.cos(this.flightAngle) * this.flightRadius;
      const z = this.flightCenter.z + Math.sin(this.flightAngle) * this.flightRadius;
      const y = 11.0 + Math.sin(this.flightAngle * 2) * 1.5;

      this.model.position.set(x, y, z);

      const nextX = this.flightCenter.x + Math.cos(this.flightAngle + 0.1) * this.flightRadius;
      const nextZ = this.flightCenter.z + Math.sin(this.flightAngle + 0.1) * this.flightRadius;
      this.model.lookAt(nextX, y, nextZ);

      this.landTimer -= delta;
      if (this.landTimer <= 0 && playerPos) {
        this._landOnGround(playerPos);
      }
    } 
    // --- ESTADO 2: POUSADO NO SOLO (PARADO) ---
    else if (this.state === 'LANDED') {
      this.playAnim('idle');

      if (playerPos) {
        this.model.lookAt(new THREE.Vector3(playerPos.x, this.model.position.y, playerPos.z));
        const dist = this.model.position.distanceTo(playerPos);
        if (dist < 8.0) {
          this.state = 'CHASING';
          this.landedTimer = 12.0;
        }
      }

      this.landedTimer -= delta;
      if (this.landedTimer <= 0) {
        this._takeOff();
      }
    } 
    // --- ESTADO 3: PERSEGUIÇÃO NO SOLO ---
    else if (this.state === 'CHASING') {
      if (playerPos) {
        const dragPos = this.model.position;
        const dist = dragPos.distanceTo(playerPos);

        this.model.lookAt(new THREE.Vector3(playerPos.x, dragPos.y, playerPos.z));

        if (dist > this.stopDistance) {
          this.playAnim('walk');

          const dir = new THREE.Vector3().subVectors(playerPos, dragPos);
          dir.y = 0;
          dir.normalize();

          dragPos.x += dir.x * this.chaseSpeed * delta;
          dragPos.z += dir.z * this.chaseSpeed * delta;
          dragPos.y = playerPos.y;
        } else {
          this.playAnim('attack');
        }

        this.landedTimer -= delta;
        if (dist > 35.0 || this.landedTimer <= 0) {
          this._takeOff();
        }
      }
    }
  }

  _landOnGround(playerPos) {
    this.state = 'LANDED';
    this.landedTimer = 15.0;

    const randomAngle = Math.random() * Math.PI * 2;
    const randomDist = 15 + Math.random() * 10;

    this.model.position.set(
      playerPos.x + Math.cos(randomAngle) * randomDist,
      playerPos.y,
      playerPos.z + Math.sin(randomAngle) * randomDist
    );
  }

  _takeOff() {
    this.state = 'FLYING';
    this.landTimer = 22 + Math.random() * 8;
    this.flightCenter.set(this.model.position.x, 11.0, this.model.position.z);
  }
}