import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as CANNON from 'cannon-es';

export class Dragon {
  constructor({ scene, physics, player, listener, spawnPosition }) {
    this.scene = scene;
    this.physics = physics;
    this.player = player;
    this.listener = listener;

    this.spawnPosition = spawnPosition || new THREE.Vector3(0, 45.0, 0);

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    // Mapeamento de ossos
    this.mountBone = null;
    this.playerLeftLeg = null;
    this.playerRightLeg = null;

    // Animação de Montar
    this.mountClip = null;
    this.mountAction = null;

    // Áudio
    this.flySound = null;
    this._audioCtx = null;

    this.GROUND_LIMIT = 0.5;

    // Configurações de Voo e Solo
    this.scale = 18.0;
    this.flySpeed = 18.0;
    this.boostSpeed = 40.0;
    this.groundSpeed = 4.5;
    this.slowWalkSpeed = 2.2; // Velocidade bem lenta quando caminha sozinho no solo
    this.rotSpeed = 1.2;
    this.flightResponsiveness = 1.5;

    this.isMounted = false;
    this.patrolAltitude = 45.0;
    this.velocity = new THREE.Vector3(0, 0, 0);

    // =========================================================
    // MÁQUINA DE ESTADOS DA IA DO DRAGÃO (100% NATURAL)
    // Estados:
    // - 'SKY_PATROL': Sobrevoa o mapa todo (pousa a cada 3 min / 180s)
    // - 'AUTO_LANDING': Descida lenta e natural para o solo
    // - 'GROUND_ROAM': No solo, parado ou andando bem pouco
    // - 'SUMMON_APPROACH': Vindo da posição atual até o jogador (sem teleporte)
    // - 'SUMMON_WAIT': Pousado perto do jogador (decola após 1 min / 60s sem interação)
    // - 'TAKING_OFF': Decolagem lenta e gradual de volta para o céu
    // =========================================================
    this.aiState = 'SKY_PATROL';
    this.stateTimer = 0;

    this.SKY_PATROL_DURATION = 180.0; // 3 minutos voando pelo mapa antes de pousar
    this.SUMMON_WAIT_TIMEOUT = 60.0;  // 1 minuto esperando o jogador antes de ir embora
    this.GROUND_REST_DURATION = 60.0; // 1 minuto descansando/andando pouco após pouso automático

    this.currentFlightSpeed = 14.0;
    this.verticalSpeed = 0.0;
    this.patrolWaypoint = new THREE.Vector3(0, this.patrolAltitude, 0);
    this.landingSpot = new THREE.Vector3(0, this.GROUND_LIMIT, 0);

    // Controle de caminhada curta quando está no chão
    this.roamSubState = 'IDLE'; // 'IDLE' ou 'WALK'
    this.roamSubTimer = 6.0;
    this.roamTargetAngle = 0;

    this.isLoaded = false;
    this._pickNewPatrolWaypoint();
    this._loadSounds();
    this._loadModel();
    this._loadMountAnimation();
  }

  get isSummoned() {
    return this.aiState === 'SUMMON_APPROACH';
  }

  // ==========================================
  // SOM DE ASSOBIO / CHAMADO DO DRAGÃO
  // ==========================================
  _playSummonWhistle() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this._audioCtx) this._audioCtx = new AudioContextClass();
      if (this._audioCtx.state === 'suspended') this._audioCtx.resume();

      const ctx = this._audioCtx;
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1150, now);
      osc.frequency.exponentialRampToValueAtTime(2100, now + 0.22);
      osc.frequency.setValueAtTime(1450, now + 0.28);
      osc.frequency.exponentialRampToValueAtTime(2450, now + 0.65);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.02, now + 0.24);
      gain.gain.linearRampToValueAtTime(0.25, now + 0.32);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.72);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.75);
    } catch (e) {
      console.warn('[Dragon] Não foi possível tocar o assobio:', e);
    }
  }

  // ==========================================
  // CHAMAR O DRAGÃO (SEM TELETRANSPORTE!)
  // ==========================================
  summon() {
    if (!this.isLoaded || this.isMounted) return false;

    this._playSummonWhistle();

    // Sai exatamente de onde estiver no mapa e vem voando até o jogador
    this.aiState = 'SUMMON_APPROACH';
    this.stateTimer = 0;

    console.log('[Dragon] 🐉 Chamado recebido! O dragão está vindo da posição atual até você...');
    return true;
  }

  // Escolhe um novo ponto amplo para sobrevoar o mapa todo
  _pickNewPatrolWaypoint() {
    const halfSpan = 105; // Cobre toda a extensão da ilha (250x250)
    const rx = (Math.random() * 2 - 1) * halfSpan;
    const rz = (Math.random() * 2 - 1) * halfSpan;
    const ry = this.patrolAltitude + (Math.random() * 12 - 6);
    this.patrolWaypoint.set(rx, ry, rz);
  }

  // Escolhe um ponto seguro no chão da ilha para o pouso de 3 em 3 minutos
  _pickLandingSpot() {
    const halfSafe = 75;
    const lx = (Math.random() * 2 - 1) * halfSafe;
    const lz = (Math.random() * 2 - 1) * halfSafe;
    this.landingSpot.set(lx, this.GROUND_LIMIT, lz);
  }

  // ==========================================
  // CARREGADOR DE ÁUDIO 3D
  // ==========================================
  _loadSounds() {
    if (!this.listener) return;

    const audioLoader = new THREE.AudioLoader();
    this.flySound = new THREE.PositionalAudio(this.listener);

    audioLoader.load(
      './assets/audio/sfx/dragon-voando.mp3',
      (buffer) => {
        this.flySound.setBuffer(buffer);
        this.flySound.setRefDistance(15);
        this.flySound.setMaxDistance(150);
        this.flySound.setLoop(true);
        this.flySound.setVolume(0.8);

        this.group.add(this.flySound);
        console.log('[Dragon] Som de voo carregado com sucesso!');
      },
      undefined,
      (err) => {
        console.warn('[Dragon] Erro ao carregar som de voo:', err);
      }
    );
  }

  _loadMountAnimation() {
    const fbxLoader = new FBXLoader();
    const tryLoad = (path) => {
      fbxLoader.load(
        path,
        (fbx) => {
          if (fbx.animations && fbx.animations.length > 0) {
            const clip = fbx.animations[0];

            clip.tracks.forEach((track) => {
              const parts = track.name.split('.');
              let boneName = parts[0];
              const property = parts[1];

              boneName = boneName.replace(/^.*[\\\/:]/, '');
              boneName = boneName.replace(/^mixamorig:?/i, '').replace(/^mixamorig/i, '');
              track.name = `${boneName}.${property}`;
            });

            this.mountClip = clip;
            console.log('[Dragon] Animação "montada_dragon.fbx" vinculada com sucesso!');
          }
        },
        undefined,
        () => {
          if (path.includes('models')) {
            tryLoad('./assets/animacoes/interacoes/montada_dragon.fbx');
          }
        }
      );
    };
    tryLoad('./assets/animacoes/interacoes/montada_dragon.fbx');
  } 

  _loadModel() {
    const loader = new GLTFLoader();

    loader.load(
      './assets/models/creatures/dragon.glb',
      (gltf) => {
        const model = gltf.scene;

        model.scale.set(this.scale, this.scale, this.scale);
        model.position.set(0, 0, 0);

        let bestBone = null;
        let fallbackBone = null;

        model.traverse((child) => {
          if (child.isMesh) {
            child.frustumCulled = false;
            child.castShadow = true;
            child.receiveShadow = true;

            if (child.material) {
              child.material.needsUpdate = true;
              if (!child.material.map && child.material.color) {
                child.material.color.setHex(0x8b0000);
              } else if (child.material.color) {
                child.material.color.setHex(0xffffff);
              }
            }
          }

          if (child.isBone || child.type === 'Bone') {
            const name = child.name.toLowerCase();

            if (!name.includes('spike') && !name.includes('wing') && !name.includes('tail')) {
              if (name.includes('spine') || name.includes('neck')) {
                fallbackBone = child;
              }
              if (name === 'spine2' || name === 'spine_2' || name === 'spine1' || name === 'neck') {
                bestBone = child;
              }
            }
          }
        });

        this.mountBone = bestBone || fallbackBone;

        this.group.add(model);
        this.group.position.copy(this.spawnPosition);

        if (gltf.animations && gltf.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach((clip) => {
            const name = clip.name.toLowerCase();
            this.actions[name] = this.mixer.clipAction(clip);
          });

          this._playBestAnimation(['fly', 'flying', 'run']);
        }

        this.isLoaded = true;
        console.log('[Dragon] Dragão pronto! Osso de montaria ancorado em:', this.mountBone ? this.mountBone.name : 'NENHUM');
      },
      undefined,
      (error) => {
        console.warn('[Dragon] Erro ao carregar GLB:', error);
        this._createFallbackDragon();
      }
    );
  }

  _createFallbackDragon() {
    const bodyGeo = new THREE.ConeGeometry(8, 20, 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8b0000, roughness: 0.6 });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.rotation.x = Math.PI / 2;
    bodyMesh.position.y = 8;
    bodyMesh.frustumCulled = false;

    this.group.add(bodyMesh);
    this.group.position.set(0, this.patrolAltitude, 0);
    this.isLoaded = true;
  }

  _playBestAnimation(candidates) {
    for (const candidate of candidates) {
      const key = Object.keys(this.actions).find((k) => k.includes(candidate));
      if (key) {
        this.playAnimation(key);
        return key;
      }
    }
    const firstKey = Object.keys(this.actions)[0];
    if (firstKey) this.playAnimation(firstKey);
    return firstKey;
  }

  playAnimation(name) {
    if (!this.mixer || !this.actions[name]) return;
    const newAction = this.actions[name];
    if (this.currentAction === newAction) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.35);
    }
    newAction.reset().fadeIn(0.35).play();
    this.currentAction = newAction;
  }

  _cachePlayerLegBones() {
    if (!this.player || !this.player.group) return;
    if (!this.playerLeftLeg) {
      this.playerLeftLeg = this.player.group.getObjectByName('LeftUpLeg');
    }
    if (!this.playerRightLeg) {
      this.playerRightLeg = this.player.group.getObjectByName('RightUpLeg');
    }
  }

  // Rotaciona suavemente o dragão em direção a um ângulo Y alvo
  _turnTowardsAngle(targetAngle, speedMultiplier, delta) {
    let diff = targetAngle - this.group.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.group.rotation.y += diff * Math.min(delta * speedMultiplier, 1.0);
  }

  toggleMount(player, dogsManager) {
    if (!this.isLoaded || !player) return;

    if (this.isMounted) {
      this.isMounted = false;
      // Ao desmontar, ele fica pousado esperando 1 minuto antes de decolar sozinho
      this.aiState = 'SUMMON_WAIT';
      this.stateTimer = 0;
      this.roamSubState = 'IDLE';
      this.roamSubTimer = 10.0;

      if (this.mountAction) {
        this.mountAction.fadeOut(0.3);
        this.mountAction = null;
      }

      const dropPos = this.group.position.clone();
      dropPos.y = this.GROUND_LIMIT;
      dropPos.x += 8.0;

      player.group.position.copy(dropPos);

      if (player.body) {
        player.body.type = CANNON.Body.DYNAMIC;
        player.body.position.copy(dropPos);
        player.body.velocity.set(0, 0, 0);
        player.body.wakeUp();
      }

      if (dogsManager && dogsManager.companion) {
        dogsManager.companion.visible = true;
        dogsManager.companion.position.copy(dropPos);
      }
    } else {
      this.isMounted = true;
      this.stateTimer = 0;
      console.log('[Dragon] Montado no dorso do dragão!');

      this.velocity.set(0, 0, 0);
      this.group.rotation.x = 0;
      this.group.position.y = Math.max(this.group.position.y, this.GROUND_LIMIT);

      if (player.body) {
        player.body.type = CANNON.Body.KINEMATIC;
        player.body.velocity.set(0, 0, 0);
        player.body.sleep();
      }

      if (dogsManager && dogsManager.companion) {
        dogsManager.companion.visible = false;
      }

      this._cachePlayerLegBones();

      if (this.mountClip && player.mixer) {
        player.mixer.stopAllAction();
        this.mountAction = player.mixer.clipAction(this.mountClip);
        this.mountAction.reset().fadeIn(0.2).play();
      }
    }
  }

  // Comportamento no solo: fica parado (idle) na maior parte do tempo ou anda bem pouquinho e devagar
  _updateGroundBehavior(delta, lookAtPlayerPos = null) {
    const dragonPos = this.group.position;
    dragonPos.y = THREE.MathUtils.lerp(dragonPos.y, this.GROUND_LIMIT, delta * 3.0);
    if (Math.abs(dragonPos.y - this.GROUND_LIMIT) < 0.05) dragonPos.y = this.GROUND_LIMIT;
    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, delta * 3.0);

    this.roamSubTimer -= delta;

    if (this.roamSubTimer <= 0) {
      if (this.roamSubState === 'IDLE') {
        // Anda bem pouco (apenas 3 a 5 segundos)
        this.roamSubState = 'WALK';
        this.roamSubTimer = 3.0 + Math.random() * 2.5;
        if (lookAtPlayerPos) {
          const dx = lookAtPlayerPos.x - dragonPos.x;
          const dz = lookAtPlayerPos.z - dragonPos.z;
          this.roamTargetAngle = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.8;
        } else {
          this.roamTargetAngle = this.group.rotation.y + (Math.random() - 0.5) * 1.4;
        }
      } else {
        // Fica parado descansando (10 a 16 segundos)
        this.roamSubState = 'IDLE';
        this.roamSubTimer = 10.0 + Math.random() * 6.0;
      }
    }

    if (this.roamSubState === 'WALK') {
      // Se estiver perto do jogador esperando, não se afasta demais nem atropela o jogador
      if (lookAtPlayerPos) {
        const distToPlayer = Math.hypot(lookAtPlayerPos.x - dragonPos.x, lookAtPlayerPos.z - dragonPos.z);
        if (distToPlayer < 7.5) {
          this.roamSubState = 'IDLE';
          this._playBestAnimation(['idle', 'stand']);
          return;
        }
      }

      this._turnTowardsAngle(this.roamTargetAngle, 0.8, delta);
      const walkDir = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
      dragonPos.addScaledVector(walkDir, this.slowWalkSpeed * delta);
      this._playBestAnimation(['walk', 'trot', 'run']);
    } else {
      if (lookAtPlayerPos) {
        const dx = lookAtPlayerPos.x - dragonPos.x;
        const dz = lookAtPlayerPos.z - dragonPos.z;
        const angleToPlayer = Math.atan2(dx, dz);
        this._turnTowardsAngle(angleToPlayer, 0.6, delta);
      }
      this._playBestAnimation(['idle', 'stand']);
    }
  }

  update(delta, player, input, cameraYaw, dogsManager) {
    if (!this.isLoaded || !player || !player.group) return;

    if (this.mixer) this.mixer.update(delta);
    if (this.isMounted && player.mixer) player.mixer.update(delta);

    this.group.updateMatrixWorld(true);

    const dragonPos = this.group.position;

    // =========================================================
    // MODO 1: JOGADOR MONTADO PILOTANDO O DRAGÃO
    // =========================================================
    if (this.isMounted) {
      this._cachePlayerLegBones();
      if (this.playerLeftLeg && this.playerRightLeg) {
        this.playerLeftLeg.rotation.z -= 1.1;
        this.playerRightLeg.rotation.z += 1.1;
        this.playerLeftLeg.rotation.x -= 0.5;
        this.playerRightLeg.rotation.x -= 0.5;
        this.playerLeftLeg.rotation.y -= 0.3;
        this.playerRightLeg.rotation.y += 0.3;
      }

      const { forward, right, isRunning } = input ? input.getMovement() : { forward: 0, right: 0, isRunning: false };
      const currentSpeed = isRunning ? this.boostSpeed : this.flySpeed;

      let activeCamera = null;
      this.scene.traverse((child) => {
        if (child.isPerspectiveCamera) activeCamera = child;
      });

      const moveDir = new THREE.Vector3();

      if (activeCamera) {
        const camForward = new THREE.Vector3();
        activeCamera.getWorldDirection(camForward);
        const camRightDir = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)).normalize();

        moveDir.addScaledVector(camForward, forward);
        moveDir.addScaledVector(camRightDir, right);
      } else {
        const camForward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)).normalize();
        const camRight = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)).normalize();
        moveDir.addScaledVector(camForward, forward);
        moveDir.addScaledVector(camRight, right);
      }

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
      }

      const targetVelocity = moveDir.clone().multiplyScalar(currentSpeed);
      this.velocity.lerp(targetVelocity, delta * this.flightResponsiveness);

      dragonPos.addScaledVector(this.velocity, delta);

      if (dragonPos.y < this.GROUND_LIMIT) {
        dragonPos.y = this.GROUND_LIMIT;
        if (this.velocity.y < 0) this.velocity.y = 0;

        if (isRunning || Math.abs(forward) > 0.1 || Math.abs(right) > 0.1) {
          this._playBestAnimation(['run', 'trot', 'walk']);
        } else {
          this._playBestAnimation(['idle', 'stand']);
        }
      } else {
        this._playBestAnimation(['fly', 'flying', 'run']);
      }

      const flatVel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
      if (flatVel.lengthSq() > 0.1) {
        const targetAngle = Math.atan2(flatVel.x, flatVel.z);
        this._turnTowardsAngle(targetAngle, this.rotSpeed, delta);
      }

      let targetPitch = 0;
      const speed = this.velocity.length();
      if (speed > 0.5) {
        targetPitch = Math.asin(this.velocity.y / speed);
      }
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, targetPitch, delta * 2.5);

      const offsetX = 0.0;
      const offsetY = -0.3;
      const offsetZ = -0.2;

      let riderPos = new THREE.Vector3();

      if (this.mountBone) {
        this.mountBone.getWorldPosition(riderPos);
        const localPos = this.group.worldToLocal(riderPos);
        localPos.x = offsetX;
        localPos.y += offsetY;
        localPos.z += offsetZ;
        riderPos.copy(this.group.localToWorld(localPos));
      } else {
        const seatOffset = new THREE.Vector3(offsetX, 34.0, 7.0);
        seatOffset.applyQuaternion(this.group.quaternion);
        riderPos = dragonPos.clone().add(seatOffset);
      }

      player.group.position.copy(riderPos);
      player.group.rotation.y = this.group.rotation.y;

      if (player.body) {
        player.body.position.copy(riderPos);
        player.body.velocity.set(0, 0, 0);
      }
    }
    // =========================================================
    // MODO 2: IA AUTÔNOMA E SISTEMA DE CHAMADO NATURAL
    // =========================================================
    else {
      this.stateTimer += delta;
      const playerPos = player.group.position;

      switch (this.aiState) {
        // -----------------------------------------------------
        // 1. SOBREVOANDO O MAPA TODO (Aterrissa a cada 3 min)
        // -----------------------------------------------------
        case 'SKY_PATROL': {
          const dx = this.patrolWaypoint.x - dragonPos.x;
          const dz = this.patrolWaypoint.z - dragonPos.z;
          const distToWaypoint = Math.hypot(dx, dz);

          if (distToWaypoint < 18.0) {
            this._pickNewPatrolWaypoint();
          }

          const targetAngle = Math.atan2(dx, dz);
          this._turnTowardsAngle(targetAngle, 0.9, delta);

          // Mantém altitude de cruzeiro de forma suave
          const altDiff = this.patrolWaypoint.y - dragonPos.y;
          this.verticalSpeed = THREE.MathUtils.lerp(this.verticalSpeed, THREE.MathUtils.clamp(altDiff * 0.4, -3.5, 3.5), delta * 1.5);
          dragonPos.y += this.verticalSpeed * delta;

          this.currentFlightSpeed = THREE.MathUtils.lerp(this.currentFlightSpeed, 15.0, delta * 1.2);
          const flyDir = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
          dragonPos.addScaledVector(flyDir, this.currentFlightSpeed * delta);

          this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0.0, delta * 2.0);
          this._playBestAnimation(['fly', 'flying', 'run']);

          // A cada 3 minutos (180s), inicia o pouso natural no mapa
          if (this.stateTimer >= this.SKY_PATROL_DURATION) {
            this._pickLandingSpot();
            this.aiState = 'AUTO_LANDING';
            this.stateTimer = 0;
            console.log('[Dragon] 3 minutos de voo completos. Iniciando pouso natural no mapa...');
          }
          break;
        }

        // -----------------------------------------------------
        // 2. POUSO AUTOMÁTICO LENTO E NATURAL (A cada 3 min)
        // -----------------------------------------------------
        case 'AUTO_LANDING': {
          const dx = this.landingSpot.x - dragonPos.x;
          const dz = this.landingSpot.z - dragonPos.z;
          const distXZ = Math.hypot(dx, dz);

          const targetAngle = Math.atan2(dx, dz);
          this._turnTowardsAngle(targetAngle, 1.2, delta);

          // Desacelera horizontalmente conforme chega perto do chão
          const heightAboveGround = Math.max(0, dragonPos.y - this.GROUND_LIMIT);
          const targetHorizSpeed = THREE.MathUtils.clamp(distXZ * 0.25, 3.0, 12.0);
          this.currentFlightSpeed = THREE.MathUtils.lerp(this.currentFlightSpeed, targetHorizSpeed, delta * 1.5);

          if (distXZ > 3.5) {
            const moveDir = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
            dragonPos.addScaledVector(moveDir, this.currentFlightSpeed * delta);
          }

          // Descida vertical bem suave (máx ~3.8 m/s, freando perto do solo)
          const targetDescentRate = -THREE.MathUtils.clamp(heightAboveGround * 0.22, 0.9, 3.8);
          this.verticalSpeed = THREE.MathUtils.lerp(this.verticalSpeed, targetDescentRate, delta * 1.8);
          dragonPos.y += this.verticalSpeed * delta;

          // Leve inclinação natural de planeio
          const glidePitch = heightAboveGround > 3.0 ? -0.08 : 0.0;
          this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, glidePitch, delta * 2.0);

          if (heightAboveGround > 1.8) {
            this._playBestAnimation(['fly', 'flying', 'run']);
          } else {
            this._playBestAnimation(['walk', 'trot', 'idle']);
          }

          // Tocou o solo!
          if (dragonPos.y <= this.GROUND_LIMIT + 0.1) {
            dragonPos.y = this.GROUND_LIMIT;
            this.verticalSpeed = 0;
            this.aiState = 'GROUND_ROAM';
            this.stateTimer = 0;
            this.roamSubState = 'IDLE';
            this.roamSubTimer = 10.0;
            console.log('[Dragon] Pousou no mapa! Ficará parado ou andando bem pouco.');
          }
          break;
        }

        // -----------------------------------------------------
        // 3. NO SOLO (Parado ou andando bem pouco antes de voltar a voar)
        // -----------------------------------------------------
        case 'GROUND_ROAM': {
          this._updateGroundBehavior(delta, null);

          // Após descansar no solo, volta a voar devagar pelo mapa
          if (this.stateTimer >= this.GROUND_REST_DURATION) {
            this.aiState = 'TAKING_OFF';
            this.stateTimer = 0;
            this.verticalSpeed = 0;
            this.currentFlightSpeed = 2.0;
            console.log('[Dragon] Decolando suavemente de volta para o céu...');
          }
          break;
        }

        // -----------------------------------------------------
        // 4. CHAMADO PELO JOGADOR (Vem da posição atual sem teleporte!)
        // -----------------------------------------------------
        case 'SUMMON_APPROACH': {
          const dx = playerPos.x - dragonPos.x;
          const dz = playerPos.z - dragonPos.z;
          const distXZ = Math.hypot(dx, dz);
          const heightAboveGround = Math.max(0, dragonPos.y - this.GROUND_LIMIT);

          const targetAngle = Math.atan2(dx, dz);
          this._turnTowardsAngle(targetAngle, 1.8, delta);

          // Se ainda está distante (> 9.5m), voa na direção do jogador
          if (distXZ > 9.5 || heightAboveGround > 0.6) {
            // Se estava no chão longe do jogador, sobe suavemente primeiro para vir voando
            let desiredAltitude = this.GROUND_LIMIT;
            if (distXZ > 35.0) {
              desiredAltitude = Math.min(this.patrolAltitude, 14.0 + distXZ * 0.18);
            } else if (distXZ > 9.5) {
              // Rampa suave de descida nos últimos 35 metros
              desiredAltitude = this.GROUND_LIMIT + ((distXZ - 9.5) / 25.5) * 14.0;
            }

            const altError = desiredAltitude - dragonPos.y;
            const maxVertSpeed = distXZ > 40.0 ? 6.0 : 3.6;
            const targetVert = THREE.MathUtils.clamp(altError * 0.45, -maxVertSpeed, maxVertSpeed);
            this.verticalSpeed = THREE.MathUtils.lerp(this.verticalSpeed, targetVert, delta * 2.2);
            dragonPos.y = Math.max(this.GROUND_LIMIT, dragonPos.y + this.verticalSpeed * delta);

            // Velocidade horizontal proporcional à distância (desacelera suavemente ao chegar perto)
            const targetSpeed = distXZ > 45.0
              ? 24.0
              : distXZ > 9.5
              ? THREE.MathUtils.lerp(this.groundSpeed, 20.0, (distXZ - 9.5) / 35.5)
              : 0.0;

            this.currentFlightSpeed = THREE.MathUtils.lerp(this.currentFlightSpeed, targetSpeed, delta * 2.0);

            if (distXZ > 8.8) {
              const dirXZ = new THREE.Vector3(dx, 0, dz).normalize();
              dragonPos.addScaledVector(dirXZ, this.currentFlightSpeed * delta);
            }

            const pitch = heightAboveGround > 2.5 ? THREE.MathUtils.clamp(this.verticalSpeed * 0.03, -0.12, 0.12) : 0.0;
            this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, pitch, delta * 2.5);

            if (dragonPos.y > this.GROUND_LIMIT + 1.4) {
              this._playBestAnimation(['fly', 'flying', 'run']);
            } else if (distXZ > 9.5) {
              this._playBestAnimation(['walk', 'trot', 'run']);
            } else {
              this._playBestAnimation(['idle', 'stand']);
            }
          } else {
            // Chegou no jogador e pousou! Inicia a espera de 1 minuto (60s)
            dragonPos.y = this.GROUND_LIMIT;
            this.verticalSpeed = 0;
            this.currentFlightSpeed = 0;
            this.group.rotation.x = 0;
            this.aiState = 'SUMMON_WAIT';
            this.stateTimer = 0;
            this.roamSubState = 'IDLE';
            this.roamSubTimer = 12.0;
            console.log('[Dragon] Pousou ao lado do jogador! Aguardando interação por 1 minuto...');
          }
          break;
        }

        // -----------------------------------------------------
        // 5. ESPERANDO O JOGADOR POR 1 MINUTO (60s)
        // -----------------------------------------------------
        case 'SUMMON_WAIT': {
          this._updateGroundBehavior(delta, playerPos);

          // Se passar 1 minuto (60s) sem o jogador montar, decola devagar e volta a sobrevoar o mapa
          if (this.stateTimer >= this.SUMMON_WAIT_TIMEOUT) {
            this.aiState = 'TAKING_OFF';
            this.stateTimer = 0;
            this.verticalSpeed = 0;
            this.currentFlightSpeed = 2.0;
            console.log('[Dragon] 1 minuto sem interação. Decolando devagar para sobrevoar o mapa...');
          }
          break;
        }

        // -----------------------------------------------------
        // 6. DECOLAGEM LENTA E NATURAL PARA O CÉU
        // -----------------------------------------------------
        case 'TAKING_OFF': {
          this._playBestAnimation(['fly', 'flying', 'run']);

          // Ganha velocidade vertical e horizontal bem devagar para parecer pesado e natural
          this.verticalSpeed = THREE.MathUtils.lerp(this.verticalSpeed, 4.2, delta * 0.75);
          this.currentFlightSpeed = THREE.MathUtils.lerp(this.currentFlightSpeed, 13.0, delta * 0.65);

          dragonPos.y += this.verticalSpeed * delta;

          const forwardDir = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
          dragonPos.addScaledVector(forwardDir, this.currentFlightSpeed * delta);

          // Inclina sutilmente para cima durante a subida
          this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0.12, delta * 1.5);

          // Quando atinge a altitude de patrulha, entra no sobrevoo do mapa (3 min)
          if (dragonPos.y >= this.patrolAltitude - 2.5) {
            this._pickNewPatrolWaypoint();
            this.aiState = 'SKY_PATROL';
            this.stateTimer = 0;
            console.log('[Dragon] Altitude atingida! Sobrevoando o mapa todo (próximo pouso em 3 min).');
          }
          break;
        }
      }
    }

    // ==========================================
    // GERENCIADOR DINÂMICO DE ÁUDIO 3D
    // ==========================================
    if (this.flySound && this.flySound.buffer) {
      const clipName = this.currentAction ? this.currentAction.getClip().name.toLowerCase() : '';
      const isFlyingAnim = clipName.includes('fly') || clipName.includes('flying');

      if (isFlyingAnim && !this.flySound.isPlaying) {
        this.flySound.play();
      } else if (!isFlyingAnim && this.flySound.isPlaying) {
        this.flySound.pause();
      }
    }
  }
}

//'./assets/montada_dragon.fbx