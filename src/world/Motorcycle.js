import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// Coordenadas definidas como novo padrão
const DEFAULT_RIDER_CONFIG = {
  bikeScale: 1.00,   // Multiplicador de tamanho da moto (ex: 1.15 deixa 15% maior)
  seatX: 0.00,
  seatY: 0.04,
  seatZ: -0.22,
  riderYaw: 0.01,
  spinePitch: 0.30,
  armDown: 1.18,
  armForward: 0.34,
  armTwist: 0.46,
  elbowBend: -0.62,
  thighLift: 1.20,
  thighSpread: 0.30,
  thighTwist: -0.56,
  kneeBend: -1.00,
  anklePitch: 0.00,  // Inclinação do pé/tornozelo na pedaleira
  modelYawOffset: 4.7124
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

    // Configuração carregada com os seus valores padrão
    this.cfg = { ...DEFAULT_RIDER_CONFIG };
    this.modelYawOffset = this.cfg.modelYawOffset;
    this.tunerPanel = null;

    this._createTunerUI();
    this._loadModel();
  }

  // Painel visual com limites ampliados em +2 / -2 pontos e novos ajustes
  _createTunerUI() {
    const panel = document.createElement('div');
    panel.id = 'moto-tuner-panel';
    panel.style.cssText = `
      display: none;
      position: fixed;
      top: 12px;
      left: 12px;
      width: 300px;
      max-height: 88vh;
      overflow-y: auto;
      background: rgba(15, 23, 42, 0.92);
      border: 2px solid #ffd700;
      border-radius: 12px;
      padding: 12px;
      color: #fff;
      font-family: monospace;
      font-size: 12px;
      z-index: 2000;
      pointer-events: auto;
      touch-action: pan-y;
    `;

    ['pointerdown', 'pointermove', 'pointerup', 'wheel'].forEach((evt) => {
      panel.addEventListener(evt, (e) => e.stopPropagation());
    });

    // Todos os limites foram expandidos em +2 / -2 pontos
    const controls = [
      { key: 'bikeScale', label: 'Tamanho da Moto (Escala)', min: 0.5, max: 3.0, step: 0.02 },
      { key: 'seatY', label: 'Banco Altura (Y)', min: -2.8, max: 2.8, step: 0.01 },
      { key: 'seatZ', label: 'Banco Frente/Trás (Z)', min: -2.9, max: 2.9, step: 0.01 },
      { key: 'seatX', label: 'Banco Esq/Dir (X)', min: -2.4, max: 2.4, step: 0.01 },
      { key: 'riderYaw', label: 'Giro Corpo (Yaw)', min: -5.14, max: 5.14, step: 0.05 },
      { key: 'spinePitch', label: 'Tronco Inclinar', min: -3.2, max: 3.2, step: 0.02 },
      { key: 'armDown', label: 'Braço Descer (Z)', min: -4.0, max: 4.0, step: 0.02 },
      { key: 'armForward', label: 'Braço Frente (X)', min: -4.0, max: 4.0, step: 0.02 },
      { key: 'armTwist', label: 'Braço Fechar (Y)', min: -4.0, max: 4.0, step: 0.02 },
      { key: 'elbowBend', label: 'Cotovelo Dobrar', min: -4.0, max: 4.0, step: 0.02 },
      { key: 'thighLift', label: 'Coxa Subir (X)', min: -4.2, max: 3.2, step: 0.02 },
      { key: 'thighSpread', label: 'Coxa Abrir (Z)', min: -3.4, max: 3.4, step: 0.02 },
      { key: 'thighTwist', label: 'Coxa Girar (Y)', min: -3.4, max: 3.4, step: 0.02 },
      { key: 'kneeBend', label: 'Joelho Dobrar (X)', min: -3.5, max: 4.5, step: 0.02 },
      { key: 'anklePitch', label: 'Pé Inclinar (X)', min: -3.0, max: 3.0, step: 0.02 }
    ];

    let html = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <strong style="color:#ffd700; font-size:13px;">🏍️ Editor de Pose da Moto</strong>
        <button id="btn-rotate-moto-mesh" style="padding:4px 8px; font-size:11px; background:#334155; color:#fff; border:1px solid #ffd700; border-radius:6px; cursor:pointer;">Girar Moto 90°</button>
      </div>
    `;

    controls.forEach((c) => {
      const val = this.cfg[c.key];
      html += `
        <div style="margin-bottom:6px;">
          <div style="display:flex; justify-content:space-between;">
            <span>${c.label}</span>
            <span id="val-${c.key}" style="color:#34d399;">${val.toFixed(2)}</span>
          </div>
          <input type="range" id="slider-${c.key}" min="${c.min}" max="${c.max}" step="${c.step}" value="${val}" style="width:100%; cursor:pointer;">
        </div>
      `;
    });

    html += `
      <button id="btn-log-moto-cfg" style="width:100%; margin-top:8px; padding:8px; background:#22c55e; color:#000; font-weight:bold; border:none; border-radius:6px; cursor:pointer; font-size:12px;">
        📋 Gerar Log no Console (F12)
      </button>
    `;

    panel.innerHTML = html;
    document.body.appendChild(panel);
    this.tunerPanel = panel;

    controls.forEach((c) => {
      const slider = panel.querySelector(`#slider-${c.key}`);
      const valSpan = panel.querySelector(`#val-${c.key}`);

      slider.addEventListener('input', (e) => {
        const num = parseFloat(e.target.value);
        this.cfg[c.key] = num;
        valSpan.innerText = num.toFixed(2);

        if (c.key === 'bikeScale') {
          this.meshWrapper.scale.setScalar(this.cfg.bikeScale);
        }

        if (this.isMounted && this.player) {
          this.player.group.position.set(this.cfg.seatX, this.cfg.seatY, this.cfg.seatZ);
          this.player.group.rotation.set(0, this.cfg.riderYaw, 0);
          this._applyRiderPose(this.player, true);
        }
      });

      slider.addEventListener('change', () => this.logCurrentConfig());
    });

    panel.querySelector('#btn-rotate-moto-mesh').addEventListener('click', () => {
      this.modelYawOffset = (this.modelYawOffset + Math.PI / 2) % (Math.PI * 2);
      this.cfg.modelYawOffset = this.modelYawOffset;
      this.meshWrapper.rotation.y = this.modelYawOffset;
      this.logCurrentConfig();
    });

    panel.querySelector('#btn-log-moto-cfg').addEventListener('click', () => {
      this.logCurrentConfig(true);
    });
  }

  logCurrentConfig(copyToClipboard = false) {
    const cleanCfg = {};
    for (const [k, v] of Object.entries(this.cfg)) {
      cleanCfg[k] = Number(v.toFixed(2));
    }
    cleanCfg.modelYawOffset = Number(this.modelYawOffset.toFixed(4));

    const jsonStr = JSON.stringify(cleanCfg, null, 2);
    console.log('%c[MOTO POSE CONFIG - COPIE E ENVIE ABAIXO]:\n' + jsonStr, 'color: #ffd700; font-weight: bold;');

    if (copyToClipboard && navigator.clipboard) {
      navigator.clipboard.writeText(jsonStr).catch(() => {});
    }
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

      // Aplica a rotação e escala salvas na configuração padrão
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
      console.log('[Motorcycle] Honda Twister 300 carregada com sucesso!');
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

      if (this.tunerPanel) this.tunerPanel.style.display = 'block';
    } else {
      if (this.tunerPanel) this.tunerPanel.style.display = 'none';
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

      // Tronco e Cabeça
      if (clean === 'spine' || clean === 'spine1' || clean === 'spine01') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, c.spinePitch));
      } else if (clean === 'neck' || clean === 'head') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, -c.spinePitch * 0.6));
      }
      // Braços
      else if (clean === 'leftarm') {
        const downQ = q(0, 0, 1, c.armDown);
        const fwdQ = q(1, 0, 0, c.armForward);
        const twistQ = q(0, 1, 0, c.armTwist);
        child.quaternion.copy(baseQuat).multiply(downQ).multiply(fwdQ).multiply(twistQ);
      } else if (clean === 'rightarm') {
        const downQ = q(0, 0, 1, -c.armDown);
        const fwdQ = q(1, 0, 0, c.armForward);
        const twistQ = q(0, 1, 0, -c.armTwist);
        child.quaternion.copy(baseQuat).multiply(downQ).multiply(fwdQ).multiply(twistQ);
      }
      // Cotovelos
      else if (clean === 'leftforearm' || clean === 'rightforearm') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, c.elbowBend));
      }
      // Coxas
      else if (clean === 'leftupleg') {
        const liftQ = q(1, 0, 0, c.thighLift);
        const spreadQ = q(0, 0, 1, c.thighSpread);
        const twistQ = q(0, 1, 0, c.thighTwist);
        child.quaternion.copy(baseQuat).multiply(liftQ).multiply(spreadQ).multiply(twistQ);
      } else if (clean === 'rightupleg') {
        const liftQ = q(1, 0, 0, c.thighLift);
        const spreadQ = q(0, 0, 1, -c.thighSpread);
        const twistQ = q(0, 1, 0, -c.thighTwist);
        child.quaternion.copy(baseQuat).multiply(liftQ).multiply(spreadQ).multiply(twistQ);
      }
      // Joelhos
      else if (clean === 'leftleg' || clean === 'rightleg') {
        child.quaternion.copy(baseQuat).multiply(q(1, 0, 0, c.kneeBend));
      }
      // Tornozelos / Pés
      else if (clean === 'leftfoot' || clean === 'rightfoot') {
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