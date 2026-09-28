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

    // Estado do Farol e Automação
    this.headlightOn = false;
    this._lastAutoEnvDark = null;

    // Sistema de Buzina (Web Audio API)
    this._audioCtx = null;
    this._hornOsc1 = null;
    this._hornOsc2 = null;
    this._hornGain = null;
    this.isHonking = false;

    this._buildHeadlightSystem();
    this._loadModel();
  }

  // =========================================================================
  // SISTEMA DE BUZINA DA HONDA TWISTER 300 (DUPLO TOM REALISTA + LAMPEJO)
  // =========================================================================
  startHorn() {
    if (this.isHonking || !this.isLoaded) return;
    this.isHonking = true;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        if (!this._audioCtx) this._audioCtx = new AudioContextClass();
        if (this._audioCtx.state === 'suspended') this._audioCtx.resume();

        const ctx = this._audioCtx;
        const now = ctx.currentTime;

        // Duplo oscilador harmônico (430 Hz + 516 Hz = timbre clássico de buzina de moto)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc1.type = 'sawtooth';
        osc2.type = 'sawtooth';
        osc1.frequency.setValueAtTime(430, now);
        osc2.frequency.setValueAtTime(516, now);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(950, now);
        filter.Q.setValueAtTime(1.4, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.22, now + 0.02);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);

        this._hornOsc1 = osc1;
        this._hornOsc2 = osc2;
        this._hornGain = gain;
      }
    } catch (e) {
      console.warn('[Motorcycle] Erro ao iniciar buzina:', e);
    }

    // Lampejo de farol alto (Pass Light) enquanto buzina
    if (this.spotLight && this.headlightFlare) {
      this.spotLight.intensity = 38.0;
      this.bulbLight.intensity = 4.0;
      this.headlightFlare.material.opacity = 1.0;
      this.headlightFlare.scale.set(0.95, 0.95, 1);
      this.lightBeamMesh.material.opacity = 0.14;
    }
  }

  stopHorn() {
    if (!this.isHonking) return;
    this.isHonking = false;

    try {
      if (this._hornGain && this._audioCtx) {
        const now = this._audioCtx.currentTime;
        this._hornGain.gain.cancelScheduledValues(now);
        this._hornGain.gain.setValueAtTime(this._hornGain.gain.value, now);
        this._hornGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

        const o1 = this._hornOsc1;
        const o2 = this._hornOsc2;
        setTimeout(() => {
          try { if (o1) o1.stop(); } catch (_) {}
          try { if (o2) o2.stop(); } catch (_) {}
        }, 50);
      }
    } catch (_) {}

    this._hornOsc1 = null;
    this._hornOsc2 = null;
    this._hornGain = null;

    // Restaura o estado original do farol após o lampejo
    if (this.headlightFlare) {
      this.headlightFlare.scale.set(0.65, 0.65, 1);
    }
    this.setHeadlight(this.headlightOn);
  }

  // Toque rápido de buzina ("Bibi!") para cliques simples
  triggerHornBeep(durationMs = 220) {
    this.startHorn();
    clearTimeout(this._hornBeepTimeout);
    this._hornBeepTimeout = setTimeout(() => {
      this.stopHorn();
    }, durationMs);
  }

  // =========================================================================
  // SISTEMA DE FAROL DE LED BRANCO (+Z FRENTE) E LANTERNA TRASEIRA (-Z TRÁS)
  // =========================================================================
  _createLightFlareTexture() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    grad.addColorStop(0.25, 'rgba(230, 245, 255, 0.85)');
    grad.addColorStop(0.6, 'rgba(180, 220, 255, 0.25)');
    grad.addColorStop(1.0, 'rgba(180, 220, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(canvas);
  }

  _buildHeadlightSystem() {
    this.headlightGroup = new THREE.Group();
    this.headlightGroup.position.set(0, 0.78, 0.82);
    this.leanGroup.add(this.headlightGroup);

    this.spotLight = new THREE.SpotLight(0xf5faff, 0, 75, Math.PI / 4.2, 0.45, 1.3);
    this.spotLight.position.set(0, 0, 0);
    this.spotLight.castShadow = false;

    this.spotTarget = new THREE.Object3D();
    this.spotTarget.position.set(0, -0.62, 16.0);
    this.headlightGroup.add(this.spotTarget);
    this.spotLight.target = this.spotTarget;
    this.headlightGroup.add(this.spotLight);

    this.bulbLight = new THREE.PointLight(0xffffff, 0, 4.5, 2.0);
    this.bulbLight.position.set(0, 0, 0.08);
    this.headlightGroup.add(this.bulbLight);

    const flareTex = this._createLightFlareTexture();
    this.headlightFlare = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flareTex,
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
    );
    this.headlightFlare.scale.set(0.65, 0.65, 1);
    this.headlightFlare.position.set(0, 0, 0.05);
    this.headlightGroup.add(this.headlightFlare);

    const coneLength = 14.0;
    const coneRadius = 3.2;
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneLength, 24, 1, true);
    coneGeo.translate(0, -coneLength / 2, 0);
    coneGeo.rotateX(-Math.PI / 2);

    this.lightBeamMesh = new THREE.Mesh(
      coneGeo,
      new THREE.MeshBasicMaterial({
        color: 0xe8f4ff,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    this.lightBeamMesh.rotation.x = 0.04;
    this.headlightGroup.add(this.lightBeamMesh);

    this.tailLightSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: flareTex,
        color: 0xff1111,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false
      })
    );
    this.tailLightSprite.position.set(0, 0.84, -0.92);
    this.tailLightSprite.scale.set(0.35, 0.25, 1);
    this.leanGroup.add(this.tailLightSprite);

    this.setHeadlight(false);
  }

  setHeadlight(state) {
    this.headlightOn = Boolean(state);

    if (this.headlightOn) {
      this.spotLight.intensity = 24.0;
      this.bulbLight.intensity = 2.5;
      this.headlightFlare.material.opacity = 0.95;
      this.lightBeamMesh.material.opacity = 0.08;
      this.tailLightSprite.material.opacity = 0.65;
    } else {
      this.spotLight.intensity = 0;
      this.bulbLight.intensity = 0;
      this.headlightFlare.material.opacity = 0;
      this.lightBeamMesh.material.opacity = 0;
      this.tailLightSprite.material.opacity = 0;
    }

    return this.headlightOn;
  }

  toggleHeadlight() {
    return this.setHeadlight(!this.headlightOn);
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
      console.log('[Motorcycle] Honda Twister 300 pronta com farol e buzina!');
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
      this.stopHorn();
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

      if (clean === 'spine' || clean === 'spine1' || clean === 'spine01' || clean === 'spine2' || clean === 'spine02') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, c.spinePitch));
      } else if (clean === 'neck' || clean === 'head') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, c.headPitch));
      } else if (clean === 'leftshoulder' || clean === 'rightshoulder') {
        child.quaternion.copy(baseQuat).multiply(q(0, 1, 0, c.shoulderFwd * sideSign));
      } else if (clean === 'leftarm' || clean === 'rightarm') {
        const downQ = q(0, 0, 1, c.armDown * sideSign);
        const fwdQ = q(1, 0, 0, c.armForward);
        const twistQ = q(0, 1, 0, c.armTwist * sideSign);
        child.quaternion.copy(baseQuat).multiply(downQ).multiply(fwdQ).multiply(twistQ);
      } else if (clean === 'leftforearm' || clean === 'rightforearm') {
        const bendQ = q(1, 0, 0, c.elbowBend);
        const twistQ = q(0, 1, 0, c.forearmTwist * sideSign);
        child.quaternion.copy(baseQuat).multiply(bendQ).multiply(twistQ);
      } else if (clean === 'lefthand' || clean === 'righthand') {
        const pitchQ = q(1, 0, 0, c.wristPitch);
        const yawQ = q(0, 0, 1, c.wristYaw * sideSign);
        const rollQ = q(0, 1, 0, c.wristRoll * sideSign);
        child.quaternion.copy(baseQuat).multiply(pitchQ).multiply(yawQ).multiply(rollQ);
      } else if (clean.includes('thumb')) {
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
      } else if (clean === 'leftupleg' || clean === 'rightupleg') {
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

  update(delta, player, input, dayNight = null) {
    if (!this.isLoaded) return;

    if (dayNight) {
      const isEnvDark = Boolean(
        (dayNight.isNight && dayNight.isNight()) ||
        (dayNight.isRaining && dayNight.isRaining())
      );
      if (this._lastAutoEnvDark === null) {
        this._lastAutoEnvDark = isEnvDark;
        if (isEnvDark) this.setHeadlight(true);
      } else if (isEnvDark !== this._lastAutoEnvDark) {
        this._lastAutoEnvDark = isEnvDark;
        this.setHeadlight(isEnvDark);
      }
    }

    if (!this.isMounted) {
      this.speed = THREE.MathUtils.lerp(this.speed, 0, delta * 5);
      this.leanGroup.rotation.z = THREE.MathUtils.lerp(this.leanGroup.rotation.z, 0, delta * 6);
    } else {
      const { forward, right, isRunning } = input.getMovement();
      const currentMaxSpeed = isRunning ? this.boostSpeed : this.maxSpeed;

      const isBraking = forward < -0.05;
      if (this.tailLightSprite) {
        this.tailLightSprite.material.opacity = isBraking ? 1.0 : (this.headlightOn ? 0.65 : 0.0);
        this.tailLightSprite.scale.setScalar(isBraking ? 0.48 : 0.35);
      }

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
      this.group.position.x += Math.sin(this.group.rotation.y) * moveDist;
      this.group.position.z += Math.cos(this.group.rotation.y) * moveDist;

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
          w.rotation.x += (this.speed / 0.32) * delta;
        });
      }
    }
  }
}