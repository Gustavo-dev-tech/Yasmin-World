import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export class Dogs {
  constructor({ scene, player }) {
    this.scene = scene;
    this.player = player;
    this.activeCompanion = null;
    this.fbxLoader = new FBXLoader();
    this.textureLoader = new THREE.TextureLoader();

    this.dogBreeds = [
      { id: 'golden', name: 'Pastor Alemão', modelUrl: 'assets/models/dog_mesh.fbx', targetHeight: 0.75 },
    ];
  }

  async spawnCompanion(breedId = 'golden') {
    const breed = this.dogBreeds.find((b) => b.id === breedId) || this.dogBreeds[0];

    try {
      // 1. Texturas PBR
      let mapB = null, mapN = null, mapR = null;
      try {
        const [texB, texN, texR] = await Promise.all([
          this.textureLoader.loadAsync('assets/models/dog_b.png'),
          this.textureLoader.loadAsync('assets/models/dog_n.png'),
          this.textureLoader.loadAsync('assets/models/dog_r.png'),
        ]);

        texB.colorSpace = THREE.SRGBColorSpace;
        texB.flipY = true;
        texN.flipY = true;
        texR.flipY = true;

        mapB = texB;
        mapN = texN;
        mapR = texR;
      } catch (tErr) {
        console.warn('[Dogs] Texturas PBR não encontradas.');
      }

      // 2. Modelo FBX Principal
      const dogModel = await this.fbxLoader.loadAsync(breed.modelUrl);

      dogModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          if (mapB) {
            child.material = new THREE.MeshStandardMaterial({
              map: mapB,
              normalMap: mapN || null,
              roughnessMap: mapR || null,
              roughness: 0.7,
              metalness: 0.0,
            });
            child.material.needsUpdate = true;
          }
        }
      });

      // 3. Auto-dimensionamento e Altura do Solo
      dogModel.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(dogModel);
      const size = box.getSize(new THREE.Vector3());

      if (size.y > 0.01) {
        const scaleFactor = breed.targetHeight / size.y;
        dogModel.scale.setScalar(scaleFactor);
      }

      dogModel.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(dogModel);
      const baseYOffset = -scaledBox.min.y + 0.02;

      const playerPos = this.player.group.position;
      dogModel.position.set(playerPos.x + 1.8, playerPos.y + baseYOffset, playerPos.z + 1.8);
      this.scene.add(dogModel);

      // 4. Carregamento de Animações
      const mixer = new THREE.AnimationMixer(dogModel);
      const actions = {};

      const [runFbx, walkFbx, idleFbx, playFbx] = await Promise.all([
        this.fbxLoader.loadAsync('assets/models/dog_run.fbx').catch(() => null),
        this.fbxLoader.loadAsync('assets/models/dog_walk.fbx').catch(() => null),
        this.fbxLoader.loadAsync('assets/models/dog_idle.fbx').catch(() => null),
        this.fbxLoader.loadAsync('assets/models/dog_play.fbx').catch(() => null),
      ]);

      if (runFbx && runFbx.animations && runFbx.animations.length > 0) {
        actions['run'] = mixer.clipAction(runFbx.animations[0]);
      }
      if (walkFbx && walkFbx.animations && walkFbx.animations.length > 0) {
        actions['walk'] = mixer.clipAction(walkFbx.animations[0]);
      }
      if (idleFbx && idleFbx.animations && idleFbx.animations.length > 0) {
        actions['idle'] = mixer.clipAction(idleFbx.animations[0]);
      }
      if (playFbx && playFbx.animations && playFbx.animations.length > 0) {
        actions['play'] = mixer.clipAction(playFbx.animations[0]);
        // Configura a animação de brincar para não fazer loop infinito contínuo
        actions['play'].setLoop(THREE.LoopOnce);
        actions['play'].clampWhenFinished = true;
      }

      if (!actions['walk'] && actions['run']) {
        actions['walk'] = actions['run'];
      }

      if (actions['idle']) actions['idle'].play();

      this.activeCompanion = {
        model: dogModel,
        mixer,
        actions,
        currentAction: 'idle',
        baseYOffset,
        walkSpeed: 2.2,
        runSpeed: 5.2,
        idleTimer: 0,
        cycleTimer: 0,
        hasPlayedFirst: false,
        isPlayingAnim: false,
        playDuration: 3.2,
        playAnimTimer: 0,
      };

      console.log('[Dogs] Pastor Alemão pronto com ciclos de brincar (4s / 10s)!');
    } catch (err) {
      console.error(`[Dogs] Erro ao carregar "${breed.modelUrl}":`, err);
    }
  }

  update(delta) {
    if (!this.activeCompanion || !this.player) return;

    const dog = this.activeCompanion;
    const playerPos = this.player.group.position;
    const dogPos = dog.model.position;

    const distance = dogPos.distanceTo(new THREE.Vector3(playerPos.x, dogPos.y, playerPos.z));

    let targetAction = 'idle';
    let moveSpeed = 0;
    let extraY = 0;

    if (distance > 5.5) {
      targetAction = 'run';
      moveSpeed = dog.runSpeed;
      extraY = 0.18;
      this._resetIdleCounters(dog);
    } else if (distance > 2.0) {
      targetAction = 'walk';
      moveSpeed = dog.walkSpeed;
      extraY = 0.03;
      this._resetIdleCounters(dog);
    } else {
      // Comportamento Parado (Idle + Ciclos da Animação de Brincar)
      if (dog.isPlayingAnim) {
        dog.playAnimTimer += delta;
        targetAction = 'play';

        if (dog.playAnimTimer >= dog.playDuration) {
          dog.isPlayingAnim = false;
          dog.playAnimTimer = 0;
          dog.cycleTimer = 0; // Reinicia a contagem dos 10 segundos
          targetAction = 'idle';
        }
      } else {
        dog.idleTimer += delta;
        dog.cycleTimer += delta;

        const triggerFirstTime = !dog.hasPlayedFirst && dog.idleTimer >= 4.0;
        const triggerRepeatTime = dog.hasPlayedFirst && dog.cycleTimer >= 10.0;

        if ((triggerFirstTime || triggerRepeatTime) && dog.actions['play']) {
          targetAction = 'play';
          dog.isPlayingAnim = true;
          dog.playAnimTimer = 0;
          dog.hasPlayedFirst = true;
        } else {
          targetAction = 'idle';
        }
      }
    }

    // Suavização de altura Y sobre o solo
    const targetY = playerPos.y + dog.baseYOffset + extraY;
    dogPos.y = THREE.MathUtils.lerp(dogPos.y, targetY, delta * 8);

    if (moveSpeed > 0) {
      const dir = new THREE.Vector3().subVectors(playerPos, dogPos);
      dir.y = 0;
      dir.normalize();

      dogPos.x += dir.x * moveSpeed * delta;
      dogPos.z += dir.z * moveSpeed * delta;

      const targetAngle = Math.atan2(dir.x, dir.z);
      let diff = targetAngle - dog.model.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      dog.model.rotation.y += diff * Math.min(delta * 10, 1);

      const turnLean = THREE.MathUtils.clamp(diff * 0.25, -0.2, 0.2);
      dog.model.rotation.z = THREE.MathUtils.lerp(dog.model.rotation.z, -turnLean, delta * 6);
    } else {
      dog.model.rotation.z = THREE.MathUtils.lerp(dog.model.rotation.z, 0, delta * 6);
    }

    // Gerenciador de Transições de Animação
    if (dog.actions[targetAction] && dog.currentAction !== targetAction) {
      const prevAction = dog.actions[dog.currentAction];
      const nextAction = dog.actions[targetAction];

      if (prevAction) prevAction.fadeOut(0.25);

      nextAction.reset().fadeIn(0.25).play();

      if (targetAction === 'walk' && nextAction === dog.actions['run']) {
        nextAction.timeScale = 0.5;
      } else {
        nextAction.timeScale = 1.0;
      }

      dog.currentAction = targetAction;
    }

    if (dog.mixer) dog.mixer.update(delta);
  }

  _resetIdleCounters(dog) {
    dog.idleTimer = 0;
    dog.cycleTimer = 0;
    dog.hasPlayedFirst = false;
    dog.isPlayingAnim = false;
    dog.playAnimTimer = 0;
  }
}