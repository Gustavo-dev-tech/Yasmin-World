import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Pose definitiva calibrada para a Honda Twister 300
const FINAL_RIDER_CONFIG = {
  bikeScale: 1.00,
  seatX: 0.00,
  seatY: 0.04,
  seatZ: -0.22,
  riderYaw: 0.01,
  thighLift: 1.18,
  thighSpread: 0.30,
  thighTwist: -0.08,
  kneeBend: -1.90,
  anklePitch: 0.46,
  modelYawOffset: 4.7124,
  spinePitch: 0.24,
  headPitch: -0.26,
  shoulderFwd: -0.14,
  armDown: 1.04,
  armForward: 0.46,
  armTwist: 0.44,
  elbowBend: -0.68,
  forearmTwist: -0.72,
  wristPitch: 0.00,
  wristYaw: 0.00,
  wristRoll: 0.00,
  gripCurlX: 1.06,
  gripCurlZ: 0.00,
  leverFingers: 0.00,
  thumbCurl: 0.32,
  thumbSpread: -0.80
};

export class Motorcycle {
  constructor({
    scene,
    physics,
    player,
    spawnPosition = new THREE.Vector3(6, 0, 142),
    modelUrl = './assets/models/veiculos/moto_twister_300.glb'
  }) {
    this.scene = scene;
    this.physics = physics;
    this.player = player;
    this.modelUrl = modelUrl;

    this.group = new THREE.Group();
    this.group.position.copy(spawnPosition);
    this.scene.add(this.group);

    this.leanGroup = new THREE.Group();
    this.group.add(this.leanGroup);

    this.meshWrapper = new THREE.Group();
    this.leanGroup.add(this.meshWrapper);

    this.model = null;
    this.modelBasePos = new THREE.Vector3();
    this.mixer = null;
    this.wheelActions = [];
    this.wheelMeshes = [];

    this.isLoaded = false;
    this.isMounted = false;

    // Física de condução da moto
    this.speed = 0;
    this.maxSpeed = 42.0;
    this.boostSpeed = 62.0;
    this.maxReverseSpeed = -12.0;
    this.acceleration = 28.0;
    this.braking = 45.0;
    this.friction = 10.0;
    this.turnSpeed = 2.4;
    this.currentLean = 0;

    this.cfg = { ...FINAL_RIDER_CONFIG };
    this.modelYawOffset = this.cfg.modelYawOffset;

    this._loadModel();
  }

  async _loadModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(this.modelUrl);
      const model = gltf.scene;
      this.model = model;

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;
        }
        const name = (child.name || '').toLowerCase();
        if (name.includes('wheel') || name.includes('roda') || name.includes('tire') || name.includes('pneu')) {
          this.wheelMeshes.push(child);
        }
      });

      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());

      this.meshWrapper.rotation.y = this.modelYawOffset;
      this.meshWrapper.scale.setScalar(this.cfg.bikeScale);

      const maxHorizontal = Math.max(size.x, size.z, 0.001);
      const targetLength = 2.15;
      const scaleFactor = targetLength / maxHorizontal;
      model.scale.setScalar(scaleFactor);

      model.updateMatrixWorld(true);
      const scaledBox = new THREE.Box3().setFromObject(model);
      const scaledCenter = scaledBox.getCenter(new THREE.Vector3());

      model.position.x -= scaledCenter.x;
      model.position.z -= scaledCenter.z;
      model.position.y -= scaledBox.min.y;
      this.modelBasePos.copy(model.position);

      this.meshWrapper.add(model);

      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(model);
        gltf.animations.forEach((clip) => {
          const action = this.mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
          this.wheelActions.push(action);
        });
      }

      this.isLoaded = true;
      console.log('[Motorcycle] Honda Twister 300 pronta com pose calibrada!');
    } catch (err) {
      console.error('[Motorcycle] Erro ao carregar moto_twister_300.glb:', err);
    }
  }

  toggleMount(player, dogs) {
    if (!this.isLoaded || !player || !player.ready) return;

    this.isMounted = !this.isMounted;

    if (this.isMounted) {
      this.speed = 0;
      player.body.velocity.set(0, 0, 0);
      player.setInput(0, 0, 0, false);

      this.leanGroup.add(player.group);
      player.group.position.set(this.cfg.seatX, this.cfg.seatY, this.cfg.seatZ);
      player.group.rotation.set(0, this.cfg.riderYaw, 0);

      if (player.mixer) {
        player.mixer.stopAllAction();
      }
      this._applyRiderPose(player, true);
    } else {
      this._applyRiderPose(player, false);

      const dismountPos = this.group.position.clone();
      const sideOffset = new THREE.Vector3(1.3, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
      dismountPos.add(sideOffset);

      this.scene.add(player.group);
      player.group.position.copy(dismountPos);
      player.group.rotation.set(0, this.group.rotation.y, 0);

      if (player.body) {
        player.body.position.set(dismountPos.x, dismountPos.y + player.height / 2, dismountPos.z);
        player.body.velocity.set(0, 0, 0);
        player.body.wakeUp();
      }

      this.leanGroup.rotation.z = 0;
      this.currentLean = 0;
      this.speed = 0;

      if (player.animator) {
        player.animator.currentActionName = null;
        player.animator.resumeState(false, false);
      }
    }
  }

  _applyRiderPose(player, isRiding) {
    if (!player || !player.model || !player.animator) return;

    const bindPose = player.animator.bindPose;
    if (!isRiding) {
      bindPose.forEach((quat, bone) => {
        bone.quaternion.copy(quat);
      });
      return;
    }

    const c = this.cfg;
    const q = (ax, ay, az, angle) =>
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(ax, ay, az), angle);

    player.model.traverse((child) => {
      if (!child.isBone || !bindPose.has(child)) return;

      const clean = child.name
        .replace(/^.*\|/, '')
        .replace(/mixamorig[_:]?/gi, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

      const baseQuat = bindPose.get(child).clone();
      const isLeft = clean.includes('left') || clean.startsWith('l') || clean.endsWith('l');
      const sideSign = isLeft ? 1 : -1;

      // 1. Tronco, Cabeça e Ombros
      if (clean === 'spine' || clean === 'spine1' || clean === 'spine01' || clean === 'spine2' || clean === 'spine02') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, c.spinePitch));
      } else if (clean === 'neck' || clean === 'head') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, c.headPitch));
      } else if (clean === 'leftshoulder' || clean === 'rightshoulder') {
        child.quaternion.copy(baseQuat).multiply(q(0, 1, 0, c.shoulderFwd * sideSign));
      }

      // 2. Braços e Antebraços
      else if (clean === 'leftarm' || clean === 'rightarm') {
        const downQ = q(0, 0, 1, c.armDown * sideSign);
        const fwdQ = q(1, 0, 0, c.armForward);
        const twistQ = q(0, 1, 0, c.armTwist * sideSign);
        child.quaternion.copy(baseQuat).multiply(downQ).multiply(fwdQ).multiply(twistQ);
      } else if (clean === 'leftforearm' || clean === 'rightforearm') {
        const bendQ = q(1, 0, 0, c.elbowBend);
        const twistQ = q(0, 1, 0, c.forearmTwist * sideSign);
        child.quaternion.copy(baseQuat).multiply(bendQ).multiply(twistQ);
      }

      // 3. Punhos / Mãos
      else if (clean === 'lefthand' || clean === 'righthand') {
        const pitchQ = q(1, 0, 0, c.wristPitch);
        const yawQ = q(0, 0, 1, c.wristYaw * sideSign);
        const rollQ = q(0, 1, 0, c.wristRoll * sideSign);
        child.quaternion.copy(baseQuat).multiply(pitchQ).multiply(yawQ).multiply(rollQ);
      }

      // 4. Dedos e Manetes
      else if (clean.includes('thumb')) {
        const curlQ = q(1, 0, 0, c.thumbCurl);
        const spreadQ = q(0, 0, 1, c.thumbSpread * sideSign);
        child.quaternion.copy(baseQuat).multiply(spreadQ).multiply(curlQ);
      } else if (clean.includes('index') || clean.includes('middle')) {
        const curlX = q(1, 0, 0, c.gripCurlX + c.leverFingers);
        const curlZ = q(0, 0, 1, c.gripCurlZ * sideSign);
        child.quaternion.copy(baseQuat).multiply(curlX).multiply(curlZ);
      } else if (clean.includes('ring') || clean.includes('pinky') || clean.includes('little')) {
        const curlX = q(1, 0, 0, c.gripCurlX);
        const curlZ = q(0, 0, 1, c.gripCurlZ * sideSign);
        child.quaternion.copy(baseQuat).multiply(curlX).multiply(curlZ);
      }

      // 5. Pernas e Pés
      else if (clean === 'leftupleg' || clean === 'rightupleg') {
        const liftQ = q(1, 0, 0, c.thighLift);
        const spreadQ = q(0, 0, 1, c.thighSpread * sideSign);
        const twistQ = q(0, 1, 0, c.thighTwist * sideSign);
        child.quaternion.copy(baseQuat).multiply(liftQ).multiply(spreadQ).multiply(twistQ);
      } else if (clean === 'leftleg' || clean === 'rightleg') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, c.kneeBend));
      } else if (clean === 'leftfoot' || clean === 'rightfoot') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, c.anklePitch));
      }
    });
  }

  update(delta, player, input) {
    if (!this.isLoaded) return;

    if (!this.isMounted) {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, delta * 5);
      this.leanGroup.rotation.z = THREE.MathUtils.lerp(this.leanGroup.rotation.z, 0, delta * 6);
    } else {
      const { forward, right, isRunning } = input.getMovement();
      const currentMaxSpeed = isRunning ? this.boostSpeed : this.maxSpeed;

      if (forward > 0.05) {
        this.speed += forward * this.acceleration * delta;
      } else if (forward < -0.05) {
        if (this.speed > 0.5) {
          this.speed += forward * this.braking * delta;
        } else {
          this.speed += forward * (this.acceleration * 0.5) * delta;
        }
      } else {
        if (Math.abs(this.speed) > 0.1) {
          this.speed -= Math.sign(this.speed) * this.friction * delta;
        } else {
          this.speed = 0;
        }
      }

      this.speed = THREE.MathUtils.clamp(this.speed, this.maxReverseSpeed, currentMaxSpeed);

      const speedFactor = Math.min(Math.abs(this.speed) / 8.0, 1.0);
      const reverseDir = this.speed >= 0 ? 1 : -1;

      if (Math.abs(this.speed) > 0.2) {
        this.group.rotation.y -= right * this.turnSpeed * speedFactor * reverseDir * delta;
      }

      const targetLean = right * 0.42 * speedFactor * reverseDir;
      this.currentLean = THREE.MathUtils.lerp(this.currentLean, targetLean, delta * 8);
      this.leanGroup.rotation.z = this.currentLean;

      const moveDist = this.speed * delta;
      this.group.position.x -= Math.sin(this.group.rotation.y) * moveDist;
      this.group.position.z -= Math.cos(this.group.rotation.y) * moveDist;

      player.group.position.set(this.cfg.seatX, this.cfg.seatY, this.cfg.seatZ);
      player.group.rotation.set(0, this.cfg.riderYaw, 0);
      this._applyRiderPose(player, true);

      if (player.body) {
        player.body.position.set(
          this.group.position.x,
          this.group.position.y + player.height / 2,
          this.group.position.z
        );
        player.body.velocity.set(0, 0, 0);
      }
    }

    if (Math.abs(this.speed) > 0.05) {
      if (this.mixer) {
        this.wheelActions.forEach((action) => {
          action.timeScale = this.speed / 8.0;
        });
        this.mixer.update(delta);
        if (this.model) this.model.position.copy(this.modelBasePos);
      } else if (this.wheelMeshes.length > 0) {
        this.wheelMeshes.forEach((w) => {
          w.rotation.x -= (this.speed / 0.32) * delta;
        });
      }
    }
  }
}