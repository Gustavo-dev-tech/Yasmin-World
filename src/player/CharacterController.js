import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';

const HIPS_ROTATION_CORRECTION =
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

const ROOT_BONE_KEYWORDS = ['hips', 'pelvis', 'root'];

function normalizeBoneName(name) {
  return name
    .replace(/^.*\|/, '')
    .replace(/mixamorig[_:]?/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isRootBoneName(normalizedName) {
  return ROOT_BONE_KEYWORDS.some((kw) => normalizedName.includes(kw));
}

export class CharacterController {
  constructor({
    scene,
    physics,
    debug,
    modelUrl,
    walkAnimationUrl = null,
    position = new THREE.Vector3(),
    radius = 0.48,
    height = 1.75,
    speed = 90.0, // <-- VELOCIDADE DOBRADA AQUI!
  }) {
    this.scene = scene;
    this.physics = physics;
    this.debug = debug;
    this.height = height;
    
    this.speed = speed;
    this.baseSpeed = speed;
    this.runSpeed = speed * 1.8; // A corrida será 1.8x mais rápida que a caminhada nova

    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentActionName = null;

    this.bones = { leftArm: null, rightArm: null };
    this.bindPose = new Map();
    this.boneMap = {};

    this.velocity = new THREE.Vector3();
    this.isMoving = false;
    this.isRunning = false;
    this.ready = false;

    this.idleTimer = 0;
    this.isSpecialActionPlaying = false;
    this.isStunned = false;
    this.danceIndex = 0;

    this.body = physics.addPlayerBody(radius, height, position);
    physics.link(this.body, this.group, -height / 2);

    this._setupCollisionDetection();
    this._load(modelUrl, walkAnimationUrl);
  }

  _setupCollisionDetection() {
    this.body.addEventListener('collide', (event) => {
      if (!this.ready || this.isStunned) return;

      const contact = event.contact;
      const relativeVelocity = contact.getImpactVelocityAlongNormal();

      if (relativeVelocity > 2.0 && this.actions['falling']) {
        const recoilDir = this.velocity.clone().negate().normalize();
        if (recoilDir.lengthSq() < 0.1) {
          recoilDir.set(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.group.rotation.y);
        }

        const recoilDistance = 0.6;
        this.body.position.x += recoilDir.x * recoilDistance;
        this.body.position.z += recoilDir.z * recoilDistance;

        this.body.velocity.set(0, 0, 0);

        this.triggerFall();
      }
    });
  }

  triggerFall() {
    if (this.isStunned) return;

    this.isStunned = true;
    this.isSpecialActionPlaying = true;
    
    this.velocity.set(0, 0, 0);
    this.body.velocity.set(0, 0, 0);

    if (this.model) {
      this.model.position.set(0, 0, 0);
    }

    this.fadeTo('falling', 0.1);

    setTimeout(() => {
      this.isStunned = false;
      this.isSpecialActionPlaying = false;
      this.idleTimer = 0;
      if (this.model) {
        this.model.position.set(0, 0, 0);
      }
    }, 2200);
  }

  async _load(modelUrl, walkAnimationUrl) {
    const loader = new GLTFLoader();

    try {
      const gltf = await loader.loadAsync(modelUrl);
      this.model = gltf.scene;
      this.debug?.dumpModel(gltf, modelUrl);

      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;

          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((mat) => {
            if (!mat) return;
            if ('metalness' in mat) mat.metalness = 0.0;
            if ('roughness' in mat) mat.roughness = 0.6;
          });
        }

        if (child.isBone) {
          this.bindPose.set(child, child.quaternion.clone());
          const clean = normalizeBoneName(child.name);
          this.boneMap[clean] = child.name;

          if (clean.includes('arm') && !clean.includes('fore') && !clean.includes('hand')) {
            if (clean.includes('left') || clean.startsWith('l')) this.bones.leftArm = this.bones.leftArm || child;
            if (clean.includes('right') || clean.startsWith('r')) this.bones.rightArm = this.bones.rightArm || child;
          }
        }
      });

      this.model.position.set(0, 0, 0);
      this.model.rotation.y = 0;
      this.model.scale.set(1, 1, 1);
      this.model.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(this.model);
      const size = box.getSize(new THREE.Vector3());

      if (size.y > 0.01) {
        const scaleFactor = this.height / size.y;
        this.model.scale.setScalar(scaleFactor);
        this.model.updateMatrixWorld(true);
      }

      this.group.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);

      this.mixer.addEventListener('finished', () => {
        if (!this.isStunned) {
          this.isSpecialActionPlaying = false;
        }
      });

      if (walkAnimationUrl) {
        await this._loadSingleAnimation('walk', walkAnimationUrl, loader);
      }

      if (CONFIG.ANIMATIONS) {
        for (const [key, url] of Object.entries(CONFIG.ANIMATIONS)) {
          if (url) {
            await this._loadSingleAnimation(key, url, loader);
          }
        }
      }

      this.ready = true;
    } catch (err) {
      console.error('[CharacterController] Erro ao carregar personagem:', err);
    }
  }

  async _loadSingleAnimation(name, url, loader) {
    try {
      const animGltf = await loader.loadAsync(url);
      const rawClip = animGltf.animations?.[0];
      if (rawClip) {
        const clip = this._retargetClip(rawClip, this.boneMap);
        if (clip.tracks.length > 0) {
          const action = this.mixer.clipAction(clip);
          
          if (['punch', 'kick', 'jump', 'victory', 'excited', 'falling', 'kiss'].includes(name)) {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          } else {
            action.setLoop(THREE.LoopRepeat, Infinity);
          }

          this.actions[name] = action;
        }
      }
    } catch (err) {
      console.warn(`[CharacterController] Erro ao carregar animação "${name}":`, err);
    }
  }

  _retargetClip(rawClip, boneMap) {
    const clip = rawClip.clone();
    const tracksToKeep = [];

    clip.tracks.forEach((track) => {
      const parts = track.name.split('.');
      const property = parts.pop();
      const rawBoneStr = parts.join('.');
      const cleanBone = normalizeBoneName(rawBoneStr);
      const targetBoneName = boneMap[cleanBone];

      if (!targetBoneName) return;

      const isRoot = isRootBoneName(cleanBone);

      if (isRoot && property === 'position') {
        track = this._rebaseHipsPositionTrack(track, targetBoneName);
      }

      if (isRoot && property === 'quaternion') {
        track = this._applyHipsRotationCorrection(track, HIPS_ROTATION_CORRECTION);
      }

      track.name = `${targetBoneName}.${property}`;
      tracksToKeep.push(track);
    });

    clip.tracks = tracksToKeep;
    return clip;
  }

  _rebaseHipsPositionTrack(track, targetBoneName) {
    let targetBone = null;
    this.model.traverse((child) => {
      if (child.isBone && child.name === targetBoneName) targetBone = child;
    });
    if (!targetBone) return track;

    const restPos = targetBone.position.clone();
    const values = track.values;
    const baseX = values[0], baseY = values[1], baseZ = values[2];

    const newValues = new Float32Array(values.length);
    for (let i = 0; i < values.length; i += 3) {
      newValues[i]     = restPos.x + (values[i]     - baseX);
      newValues[i + 1] = restPos.y + (values[i + 1] - baseY);
      newValues[i + 2] = restPos.z + (values[i + 2] - baseZ);
    }

    return new THREE.VectorKeyframeTrack(track.name, track.times, newValues);
  }

  _applyHipsRotationCorrection(track, correctionQuat) {
    const values = track.values;
    const newValues = new Float32Array(values.length);
    const q = new THREE.Quaternion();

    for (let i = 0; i < values.length; i += 4) {
      q.set(values[i], values[i + 1], values[i + 2], values[i + 3]);
      q.premultiply(correctionQuat);
      newValues[i] = q.x; newValues[i + 1] = q.y; newValues[i + 2] = q.z; newValues[i + 3] = q.w;
    }

    return new THREE.QuaternionKeyframeTrack(track.name, track.times, newValues);
  }

  fadeTo(targetName, duration = 0.2) {
    if (this.currentActionName === targetName) return;

    const current = this.actions[this.currentActionName];
    const target = this.actions[targetName];

    if (current) current.fadeOut(duration);

    if (target) {
      target.reset().fadeIn(duration).play();
      this.currentActionName = targetName;
    } else if (current) {
      this.currentActionName = null;
    }
  }

  playTrigger(actionName) {
    if (this.isStunned) return;

    if (actionName === 'dance') {
      const dances = ['dance_macarena', 'hiphop'].filter(d => this.actions[d]);
      if (dances.length > 0) {
        actionName = dances[this.danceIndex % dances.length];
        this.danceIndex++;
      }
    }

    if (!this.actions[actionName]) return;
    
    this.isSpecialActionPlaying = true;
    this.fadeTo(actionName, 0.15);
  }

  _applyRestPose() {
    if (this.bones.leftArm && this.bindPose.has(this.bones.leftArm)) {
      const qDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.25);
      this.bones.leftArm.quaternion.copy(this.bindPose.get(this.bones.leftArm)).multiply(qDown);
    }
    if (this.bones.rightArm && this.bindPose.has(this.bones.rightArm)) {
      const qDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.25);
      this.bones.rightArm.quaternion.copy(this.bindPose.get(this.bones.rightArm)).multiply(qDown);
    }
  }

  setInput(forward, right, camYaw, isRunning = false) {
    if (this.isStunned) {
      this.velocity.set(0, 0, 0);
      this.isMoving = false;
      this.isRunning = false;
      return;
    }

    const dirX = -forward * Math.sin(camYaw) + right * Math.cos(camYaw);
    const dirZ = -forward * Math.cos(camYaw) - right * Math.sin(camYaw);

    this.velocity.set(dirX, 0, dirZ);
    if (this.velocity.lengthSq() > 1) this.velocity.normalize();
    
    this.isMoving = this.velocity.lengthSq() > 0.0001;
    this.isRunning = isRunning && this.isMoving;

    if (this.isMoving) {
      this.idleTimer = 0;
      this.isSpecialActionPlaying = false;
    }
  }

  update(delta) {
    if (!this.ready) return;

    if (this.isStunned) {
      this.body.velocity.set(0, 0, 0);
      this.velocity.set(0, 0, 0);
      if (this.mixer) this.mixer.update(delta);
      return;
    }

    if (this.isMoving) this.body.wakeUp();

    const currentSpeed = this.isRunning ? this.runSpeed : this.baseSpeed;
    this.body.velocity.x = this.velocity.x * currentSpeed;
    this.body.velocity.z = this.velocity.z * currentSpeed;

    if (this.isMoving) {
      const targetRot = Math.atan2(this.velocity.x, this.velocity.z);
      let diff = targetRot - this.group.rotation.y;
      
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.group.rotation.y += diff * Math.min(delta * 12, 1);
    }

    if (!this.isSpecialActionPlaying) {
      if (this.isMoving) {
        if (this.isRunning && this.actions['run']) {
          this.fadeTo('run', 0.15);
        } else if (this.actions['walk']) {
          this.fadeTo('walk', 0.15);
        }
      } else {
        this.idleTimer += delta;

        if (this.idleTimer > 10 && this.actions['idle_dwarf']) {
          this.fadeTo('idle_dwarf', 0.3);
        } else if (this.idleTimer <= 10) {
          if (this.currentActionName) {
            this.actions[this.currentActionName].fadeOut(0.2);
            this.currentActionName = null;
          }
          this._applyRestPose();
        }
      }
    }

    if (this.mixer) this.mixer.update(delta);
  }
}