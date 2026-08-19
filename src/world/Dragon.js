import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as CANNON from 'cannon-es';

export class Dragon {
  constructor({ scene, physics, player }) {
    this.scene = scene;
    this.physics = physics;
    this.player = player;

    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.mixer = null;
    this.actions = {};
    this.currentAction = null;

    // Mapeamento de ossos
    this.mountBone = null;
    this.playerLeftLeg = null;
    this.playerRightLeg = null;

    // Animação de Montar da Personagem
    this.mountClip = null;
    this.mountAction = null;

    // === CONFIGURAÇÕES GLOBAIS ===
    this.GROUND_LIMIT = 0.5; // Limite strict do chão

    // === CONFIGURAÇÕES DE VOO (GTA Style + Mobile Smoothing) ===
    // Valores de velocidade e rotação equilibrados.
    // responsiveness baixa = inércia alta (mascara glitches de toque)
    this.scale = 18.0;
    this.flySpeed = 18.0;   
    this.boostSpeed = 40.0; 
    this.groundSpeed = 4.5;
    
    // A rotação mais lenta ajuda a ignorar noise do toque falhando
    this.rotSpeed = 1.2; 

    // O pulo do gato: flightResponsiveness define a suavidade da inércia.
    // Baixei agressivamente (de 12.0 para 1.5). Isso faz o dragão ter "massa"
    // e deslizar. Se houver um glitch de toque voltando a zero rápido,
    // o dragão continua deslizando na direção anterior antes de notar.
    this.flightResponsiveness = 1.5; 

    // Estado do Dragão
    this.isMounted = false;
    this.patrolAngle = 0;
    this.patrolRadius = 60.0;
    this.patrolAltitude = 45.0; 
    
    // Vetor de Inércia (Dá a sensação de peso no movimento)
    this.velocity = new THREE.Vector3(0, 0, 0);

    this.debugLogTimer = 0;
    this.isLoaded = false;
    this._loadModel();
    this._loadMountAnimation();
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
            tryLoad('./assets/montada_dragon.fbx');
          }
        }
      );
    };
    tryLoad('./assets/montada_dragon.fbx');
  }

  _loadModel() {
    const loader = new GLTFLoader();
    
    loader.load(
      './assets/models/dragon.glb',
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
        this.group.position.set(0, this.patrolAltitude, 0);

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
      const key = Object.keys(this.actions).find(k => k.includes(candidate));
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
      this.currentAction.fadeOut(0.3);
    }
    newAction.reset().fadeIn(0.3).play();
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

  toggleMount(player, dogsManager) {
    if (!this.isLoaded || !player) return;

    if (this.isMounted) {
      this.isMounted = false;

      if (this.mountAction) {
        this.mountAction.fadeOut(0.3);
        this.mountAction = null;
      }

      const dropPos = this.group.position.clone();
      dropPos.y = this.GROUND_LIMIT; // Garante que ele pouse ao desmontar
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
      console.log('[Dragon] Montado no dorso do dragão (Grounded)!');

      // Reseta inércia e rotações anormais ao montar
      this.velocity.set(0, 0, 0);
      this.group.rotation.x = 0; 

      // FIX (Goal 1): Ao montar, deita no chão onde o jogador está.
      // O dragão autônomo já pousa quando perto, então devemos estar no chão.
      this.group.position.x = player.group.position.x;
      this.group.position.z = player.group.position.z;
      // Garante que monta no chão strict
      this.group.position.y = this.GROUND_LIMIT; 

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

  update(delta, player, input, cameraYaw, dogsManager) {
    if (!this.isLoaded || !player || !player.group) return;

    if (this.mixer) this.mixer.update(delta);
    if (this.isMounted && player.mixer) player.mixer.update(delta);

    this.group.updateMatrixWorld(true);

    const dragonPos = this.group.position;

    // ==========================================
    // ESTADO 1: PILOTANDO O DRAGÃO MONTADO
    // ==========================================
    if (this.isMounted) {
      
      // Ajuste anatômico perfeito (Abraçando o pescoço)
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

      // ----------------------------------------------------------------------
      // SISTEMA DE VOO ESTILO GTA 5 (FOCADO EM MOBILE/ÚNICO ANALÓGICO & PC)
      // ----------------------------------------------------------------------
      
      // Busca a câmera ativa da cena (swipe/touch no mobile ou mouse no PC)
      let activeCamera = null;
      this.scene.traverse((child) => {
          if (child.isPerspectiveCamera) activeCamera = child;
      });

      const moveDir = new THREE.Vector3();

      if (activeCamera) {
          // Extrai o vetor 3D exato de onde a câmera está apontando (Incluindo cima/baixo)
          const camForward = new THREE.Vector3();
          activeCamera.getWorldDirection(camForward);
          
          // O eixo horizontal puro (Para andar pros lados sem alterar a altitude)
          const camRightDir = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)).normalize();

          // Empurra o dragão na direção da visão da câmera
          moveDir.addScaledVector(camForward, forward);
          moveDir.addScaledVector(camRightDir, right);
      } else {
          // Fallback seguro caso a câmera não seja encontrada
          const camForward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw)).normalize();
          const camRight = new THREE.Vector3(Math.cos(cameraYaw), 0, -Math.sin(cameraYaw)).normalize();
          moveDir.addScaledVector(camForward, forward);
          moveDir.addScaledVector(camRight, right);
      }

      if (moveDir.lengthSq() > 0) {
        moveDir.normalize();
      }

      // ----------------------------------------------------------------------
      // INÉRCIA REFORÇADA (Goal 2 Mitigation)
      // Mascara glitches momentâneos do multi-touch que falha no mobile
      // ----------------------------------------------------------------------
      const targetVelocity = moveDir.clone().multiplyScalar(currentSpeed);
      // Fator baixo (this.flightResponsiveness) = inércia alta/massa alta.
      // Se o toque falhar por um frame e voltar a zero, o dragão desliza na velocidade antiga.
      this.velocity.lerp(targetVelocity, delta * this.flightResponsiveness);

      // Aplica a velocidade inercial fisicamente no dragão
      dragonPos.addScaledVector(this.velocity, delta);

      // --- POUSO E COLISÃO COM O CHÃO Strict ---
      // Se mergulhar até o chão ou estiver parado nele:
      if (dragonPos.y < this.GROUND_LIMIT) {
          dragonPos.y = this.GROUND_LIMIT;
          
          // Importante: Zerar a velocidade vertical negativa acumulada
          if (this.velocity.y < 0) this.velocity.y = 0; 
          
          // Lógica de Animação de Pouso/Decolagem:
          // Se estiver grudado no chão strict, force animações terrestres
          if(isRunning || Math.abs(forward) > 0.1 || Math.abs(right) > 0.1) {
              this._playBestAnimation(['run', 'trot', 'walk']);
          } else {
              this._playBestAnimation(['idle', 'stand']);
          }
      } else {
          // No ar: force voo
          this._playBestAnimation(['fly', 'flying', 'run']);
      }

      // --- ROTAÇÃO SUAVE ESQUERDA/DIREITA (Yaw) ---
      const flatVel = new THREE.Vector3(this.velocity.x, 0, this.velocity.z);
      if (flatVel.lengthSq() > 0.1) {
        const targetAngle = Math.atan2(flatVel.x, flatVel.z);
        let diff = targetAngle - this.group.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        // rotação lenta ajuda na suavidade mobile contra noise de toque
        this.group.rotation.y += diff * Math.min(delta * this.rotSpeed, 1.0);
      }

      // --- INCLINAÇÃO MERGULHO/SUBIDA (Pitch) ---
      // Se ganha altura, empina o corpo; se mergulha, embica o focinho.
      let targetPitch = 0;
      const speed = this.velocity.length();
      if (speed > 0.5) {
          targetPitch = Math.asin(this.velocity.y / speed); 
      }
      // Inclinação também suavizada LERP
      this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, targetPitch, delta * 2.5);

      // --- CÁLCULO DE POSIÇÃO DO PERSONAGEM (Grudado no dorso) ---
      const offsetX = 0.0;
      const offsetY = -0.3; // Força de colagem para dar sensação de peso.
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

      return;
    }

    // ==========================================
    // ESTADO 2: AUTÔNOMO (Patrulha ou Perseguição)
    // ==========================================
    // Recupera a postura caso ele tenha sido desmontado inclinado para cima ou para baixo
    this.group.rotation.x = THREE.MathUtils.lerp(this.group.rotation.x, 0, delta * 2.0);

    const playerPos = player.group.position;
    const distXZ = new THREE.Vector3(playerPos.x - dragonPos.x, 0, playerPos.z - dragonPos.z).length();

    if (distXZ <= 35.0) {
      // Pousar strict no chão autônomo
      dragonPos.y = THREE.MathUtils.lerp(dragonPos.y, this.GROUND_LIMIT, delta * 2.0);
      
      const dirXZ = new THREE.Vector3(playerPos.x - dragonPos.x, 0, playerPos.z - dragonPos.z).normalize();
      const targetAngle = Math.atan2(dirXZ.x, dirXZ.z);
      let diff = targetAngle - this.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * Math.min(delta * this.rotSpeed, 1.0);

      if (distXZ > 11.5) {
        dragonPos.addScaledVector(dirXZ, this.groundSpeed * delta);
        this._playBestAnimation(['walk', 'run', 'trot']);
      } else {
        // Se autônomo pousou e parou, trava Y strict
        if(Math.abs(dragonPos.y - this.GROUND_LIMIT) < 0.1) dragonPos.y = this.GROUND_LIMIT;
        this._playBestAnimation(['idle', 'stand']);
      }
    } else {
      this.patrolAngle += delta * 0.25;
      // Garante que a altitude de patrulha seja respeitada autônomo
      dragonPos.y = THREE.MathUtils.lerp(dragonPos.y, this.patrolAltitude, delta * 1.5);

      const targetX = playerPos.x + Math.cos(this.patrolAngle) * this.patrolRadius;
      const targetZ = playerPos.z + Math.sin(this.patrolAngle) * this.patrolRadius;

      const dirX = targetX - dragonPos.x;
      const dirZ = targetZ - dragonPos.z;

      const targetAngle = Math.atan2(dirX, dirZ);
      let diff = targetAngle - this.group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * Math.min(delta * 1.5, 1.0);

      const flyDir = new THREE.Vector3(Math.sin(this.group.rotation.y), 0, Math.cos(this.group.rotation.y));
      dragonPos.addScaledVector(flyDir, 14.0 * delta);

      this._playBestAnimation(['fly', 'flying', 'run']);
    }
  }
}