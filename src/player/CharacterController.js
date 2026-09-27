import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';

const HIPS_ROTATION_CORRECTION =
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

const ROOT_BONE_KEYWORDS = ['hips', 'pelvis', 'root'];

const ONE_SHOT_ACTIONS = ['punch', 'kick', 'jump', 'victory', 'excited', 'falling', 'kiss'];

// Catálogo de trajes. Pode migrar para o config.js (CONFIG.OUTFITS) sem mudar o código.
const DEFAULT_OUTFITS = {
  padrao: './assets/models/garota.glb',
  vestido_branco: './assets/models/vestuario/garota_vestido_branco.glb',
};

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
    speed = 90.0,
  }) {
    this.scene = scene;
    this.physics = physics;
    this.debug = debug;
    this.height = height;

    this.speed = speed;
    this.baseSpeed = speed;
    this.runSpeed = speed * 1.8;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentActionName = null;

    // --- NOVO: cache de dados independentes do esqueleto atual ---
    // rawClips guarda os AnimationClip ORIGINAIS (sem retarget), que são a
    // única coisa reaproveitável entre modelos. As actions e os clips já
    // retargetados pertencem a um mixer/esqueleto específico e morrem no swap.
    this.rawClips = {};       // { nome: AnimationClip cru }
    this.retargetedClips = {}; // { nome: AnimationClip ligado ao esqueleto atual }
    this.loader = new GLTFLoader();
    this.isSwapping = false;
    this.currentOutfitKey = 'padrao';

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

    // Handler nomeado: precisa ser reanexado a cada mixer novo.
    this._onMixerFinished = () => {
      if (!this.isStunned) {
        this.isSpecialActionPlaying = false;
      }
    };

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

  // =========================================================================
  // CARREGAMENTO INICIAL
  // =========================================================================

  async _load(modelUrl, walkAnimationUrl) {
    try {
      const gltf = await this.loader.loadAsync(modelUrl);
      this.model = gltf.scene;
      this.debug?.dumpModel(gltf, modelUrl);

      this._prepareMaterials(this.model);
      this._fitModel(this.model);
      this.group.add(this.model);

      // Precisa vir DEPOIS do add/updateMatrixWorld: preenche boneMap/bindPose.
      this._scanSkeleton(this.model);

      this._createMixer();

      if (walkAnimationUrl) {
        await this._loadSingleAnimation('walk', walkAnimationUrl);
      }

      if (CONFIG.ANIMATIONS) {
        for (const [key, url] of Object.entries(CONFIG.ANIMATIONS)) {
          if (url) {
            await this._loadSingleAnimation(key, url);
          }
        }
      }

      this.ready = true;
    } catch (err) {
      console.error('[CharacterController] Erro ao carregar personagem:', err);
    }
  }

  _prepareMaterials(model) {
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false; // evita sumiço da malha animada em close-up

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        if ('metalness' in mat) mat.metalness = 0.0;
        if ('roughness' in mat) mat.roughness = 0.6;
      });
    });
  }

  // Normaliza transform e reescala para a altura da cápsula de física.
  // Sempre recalculado a partir da bounding box do modelo NOVO — copiar o
  // scale antigo dá tamanho errado quando o .glb tem proporção diferente.
  _fitModel(model) {
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    if (size.y > 0.01) {
      const scaleFactor = this.height / size.y;
      model.scale.setScalar(scaleFactor);
      model.updateMatrixWorld(true);
    }
  }

  // Reconstrói boneMap, bindPose e as referências de braço para o esqueleto ATUAL.
  // Sem isso, `_applyRestPose()` continua mexendo nos ossos do modelo destruído
  // e a personagem nova fica literalmente em T-Pose quando está parada.
  _scanSkeleton(model) {
    this.bindPose = new Map();
    this.boneMap = {};
    this.bones = { leftArm: null, rightArm: null };

    model.traverse((child) => {
      if (!child.isBone) return;

      this.bindPose.set(child, child.quaternion.clone());
      const clean = normalizeBoneName(child.name);
      this.boneMap[clean] = child.name;

      if (clean.includes('arm') && !clean.includes('fore') && !clean.includes('hand')) {
        if (clean.includes('left') || clean.startsWith('l')) this.bones.leftArm = this.bones.leftArm || child;
        if (clean.includes('right') || clean.startsWith('r')) this.bones.rightArm = this.bones.rightArm || child;
      }
    });
  }

  _createMixer() {
    this.mixer = new THREE.AnimationMixer(this.model);
    // O listener 'finished' precisa ser reanexado sempre. Se ele se perder,
    // `isSpecialActionPlaying` trava em true e a máquina de estados congela.
    this.mixer.addEventListener('finished', this._onMixerFinished);
  }

  async _loadSingleAnimation(name, url) {
    try {
      const animGltf = await this.loader.loadAsync(url);
      const rawClip = animGltf.animations?.[0];
      if (!rawClip) return;

      this.rawClips[name] = rawClip; // guarda o clip CRU para poder re-retargetar
      this._createAction(name, rawClip);
    } catch (err) {
      console.warn(`[CharacterController] Erro ao carregar animação "${name}":`, err);
    }
  }

  // Retargeta um clip cru contra o esqueleto atual e cria a action no mixer atual.
  _createAction(name, rawClip) {
    if (!this.mixer) return;

    const clip = this._retargetClip(rawClip, this.boneMap);
    if (clip.tracks.length === 0) {
      console.warn(`[CharacterController] Clip "${name}" não casou com nenhum osso do modelo atual.`);
      return;
    }

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

  // =========================================================================
  // HOT-SWAP DE MODELO (LOJA DE ROUPAS)
  // =========================================================================

  async changeOutfit(modeloKey) {
    if (!this.model || this.isSwapping) return;

    const catalog = CONFIG.OUTFITS || DEFAULT_OUTFITS;
    const targetUrl = catalog[modeloKey];
    if (!targetUrl) {
      console.warn(`[CharacterController] Traje desconhecido: "${modeloKey}"`);
      return;
    }
    if (modeloKey === this.currentOutfitKey) return;

    this.isSwapping = true;
    this.ready = false; // congela update() enquanto o esqueleto não existe

    try {
      const gltf = await this.loader.loadAsync(targetUrl);
      const novoModel = gltf.scene;

      // --- 1. Desmonta o antigo por completo ---
      if (this.mixer) {
        this.mixer.stopAllAction();
        this.mixer.removeEventListener('finished', this._onMixerFinished);
        // Limpa o cache de PropertyBinding do mixer. Sem isso o Three segura
        // referências aos ossos destruídos (vazamento + bindings fantasmas).
        Object.values(this.retargetedClips).forEach((clip) => this.mixer.uncacheClip(clip));
        this.mixer.uncacheRoot(this.model);
        this.mixer = null;
      }

      this.group.remove(this.model);
      this._disposeModel(this.model);

      this.actions = {};
      this.retargetedClips = {};
      this.currentActionName = null;

      // --- 2. Monta o novo ---
      this._prepareMaterials(novoModel);
      this.model = novoModel;
      this.group.add(novoModel);
      this._fitModel(novoModel);       // recalcula escala pela bounding box real
      this._scanSkeleton(novoModel);   // boneMap/bindPose/bones do esqueleto NOVO

      this._createMixer();

      // Se o .glb do traje trouxer clipes embutidos e ainda não existir um
      // clip com esse nome, aproveita (Avaturn normalmente exporta sem animação).
      (gltf.animations || []).forEach((clip) => {
        const key = clip.name?.toLowerCase();
        if (key && !this.rawClips[key]) this.rawClips[key] = clip;
      });

      // --- 3. Reconstrói TODAS as actions a partir dos clips crus ---
      // O retarget precisa rodar de novo: as tracks de hips.position foram
      // rebaseadas na pose de repouso do esqueleto ANTIGO.
      for (const [name, rawClip] of Object.entries(this.rawClips)) {
        this._createAction(name, rawClip);
      }

      this.currentOutfitKey = modeloKey;

      // --- 4. Devolve a personagem ao estado de animação correto ---
      this.isSpecialActionPlaying = false;
      this.isStunned = false;
      this.idleTimer = 0;
      this._resumeAnimationState();

      this.ready = true;
      this.playTrigger('victory'); // comemoração da roupa nova (opcional)
    } catch (err) {
      console.error('[CharacterController] Falha no hot-swap de traje:', err);
      this.ready = true; // não deixa o player travado se o load falhar
    } finally {
      this.isSwapping = false;
    }
  }

  // Sai da T-Pose imediatamente após o swap, respeitando o que o jogador faz.
  _resumeAnimationState() {
    if (this.isMoving) {
      const target = this.isRunning && this.actions['run'] ? 'run' : 'walk';
      if (this.actions[target]) {
        this.fadeTo(target, 0.0);
        return;
      }
    }

    if (this.actions['idle']) {
      this.fadeTo('idle', 0.0);
      return;
    }

    this._applyRestPose(); // fallback: pose de repouso com os braços baixados
  }

  _disposeModel(model) {
    if (!model) return;

    model.traverse((child) => {
      if (child.isSkinnedMesh && child.skeleton?.dispose) {
        child.skeleton.dispose();
      }
      if (child.isMesh) {
        child.geometry?.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((mat) => {
          if (!mat) return;
          Object.values(mat).forEach((value) => {
            if (value && value.isTexture) value.dispose();
          });
          mat.dispose();
        });
      }
    });
  }

  // =========================================================================
  // MÁQUINA DE ESTADOS / LOOP
  // =========================================================================

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
    if (this.isStunned || this.isSwapping) return;

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
    if (!this.ready || this.isSwapping) return;

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
          if (this.actions['idle']) {
            // Se existir um clip de respiração, ele é melhor que a pose estática.
            this.fadeTo('idle', 0.2);
          } else {
            if (this.currentActionName) {
              this.actions[this.currentActionName].fadeOut(0.2);
              this.currentActionName = null;
            }
            this._applyRestPose();
          }
        }
      }
    }

    if (this.mixer) this.mixer.update(delta);
  }
}