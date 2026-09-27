import * as THREE from 'three';

const HIPS_ROTATION_CORRECTION =
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

const ROOT_BONE_KEYWORDS = ['hips', 'pelvis', 'root'];
const ONE_SHOT_ACTIONS = ['punch', 'kick', 'jump', 'victory', 'excited', 'falling', 'kiss'];

export function normalizeBoneName(name) {
  return name
    .replace(/^.*\|/, '')
    .replace(/mixamorig[_:]?/gi, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isRootBoneName(normalizedName) {
  return ROOT_BONE_KEYWORDS.some((kw) => normalizedName.includes(kw));
}

export class CharacterAnimator {
  constructor(loader) {
    this.loader = loader;
    this.model = null;
    this.mixer = null;

    this.rawClips = {};
    this.retargetedClips = {};
    this.actions = {};
    this.currentActionName = null;

    this.bones = { leftArm: null, rightArm: null, head: null };
    this.bindPose = new Map();
    this.boneMap = {};

    this.isSpecialActionPlaying = false;
    this.isStunned = false;
    this.danceIndex = 0;

    this._onMixerFinished = () => {
      if (!this.isStunned) {
        this.isSpecialActionPlaying = false;
      }
    };
  }

  bindModel(model) {
    this.unbindCurrentModel();
    this.model = model;
    this.scanSkeleton(model);

    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.addEventListener('finished', this._onMixerFinished);

    // Reconstrói todas as animações já carregadas para o novo esqueleto
    for (const [name, rawClip] of Object.entries(this.rawClips)) {
      this.createAction(name, rawClip);
    }
  }

  unbindCurrentModel() {
    if (this.mixer && this.model) {
      this.mixer.stopAllAction();
      this.mixer.removeEventListener('finished', this._onMixerFinished);
      Object.values(this.retargetedClips).forEach((clip) => this.mixer.uncacheClip(clip));
      this.mixer.uncacheRoot(this.model);
      this.mixer = null;
    }
    this.actions = {};
    this.retargetedClips = {};
    this.currentActionName = null;
  }

  scanSkeleton(model) {
    this.bindPose = new Map();
    this.boneMap = {};
    this.bones = { leftArm: null, rightArm: null, head: null };

    model.traverse((child) => {
      if (!child.isBone) return;

      this.bindPose.set(child, child.quaternion.clone());
      const clean = normalizeBoneName(child.name);
      this.boneMap[clean] = child.name;

      if (clean === 'head') {
        this.bones.head = child;
      }

      if (clean.includes('arm') && !clean.includes('fore') && !clean.includes('hand')) {
        if (clean.includes('left') || clean.startsWith('l')) this.bones.leftArm = this.bones.leftArm || child;
        if (clean.includes('right') || clean.startsWith('r')) this.bones.rightArm = this.bones.rightArm || child;
      }
    });
  }

  async loadSingleAnimation(name, url) {
    try {
      const animGltf = await this.loader.loadAsync(url);
      const rawClip = animGltf.animations?.[0];
      if (!rawClip) return;

      this.rawClips[name] = rawClip;
      this.createAction(name, rawClip);
    } catch (err) {
      console.warn(`[CharacterAnimator] Erro ao carregar animação "${name}":`, err);
    }
  }

  registerEmbeddedClips(clips = []) {
    clips.forEach((clip) => {
      const key = clip.name?.toLowerCase();
      if (key && !this.rawClips[key]) {
        this.rawClips[key] = clip;
        this.createAction(key, clip);
      }
    });
  }

  createAction(name, rawClip) {
    if (!this.mixer) return;

    const clip = this._retargetClip(rawClip, this.boneMap);
    if (clip.tracks.length === 0) return;

    const action = this.mixer.clipAction(clip);

    if (ONE_SHOT_ACTIONS.includes(name)) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
    }

    this.retargetedClips[name] = clip;
    this.actions[name] = action;
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
      const dances = ['dance_macarena', 'hiphop'].filter((d) => this.actions[d]);
      if (dances.length > 0) {
        actionName = dances[this.danceIndex % dances.length];
        this.danceIndex++;
      }
    }

    if (!this.actions[actionName]) return;

    this.isSpecialActionPlaying = true;
    this.fadeTo(actionName, 0.15);
  }

  applyRestPose() {
    if (this.bones.leftArm && this.bindPose.has(this.bones.leftArm)) {
      const qDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -1.25);
      this.bones.leftArm.quaternion.copy(this.bindPose.get(this.bones.leftArm)).multiply(qDown);
    }
    if (this.bones.rightArm && this.bindPose.has(this.bones.rightArm)) {
      const qDown = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1.25);
      this.bones.rightArm.quaternion.copy(this.bindPose.get(this.bones.rightArm)).multiply(qDown);
    }
  }

  resumeState(isMoving, isRunning) {
    if (isMoving) {
      const target = isRunning && this.actions['run'] ? 'run' : 'walk';
      if (this.actions[target]) {
        this.fadeTo(target, 0.0);
        return;
      }
    }
    if (this.actions['idle']) {
      this.fadeTo('idle', 0.0);
      return;
    }
    this.applyRestPose();
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }
}