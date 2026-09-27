import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config.js';
import { CharacterAnimator } from './CharacterAnimator.js';
import { WardrobeManager } from './WardrobeManager.js';

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
    this.defaultModelUrl = modelUrl;

    this.speed = speed;
    this.baseSpeed = speed;
    this.runSpeed = speed * 1.8;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    this.model = null;
    this.loader = new GLTFLoader();

    // Módulos dedicados (Animação e Guarda-Roupa)
    this.animator = new CharacterAnimator(this.loader);
    this.wardrobe = new WardrobeManager(this);

    this.velocity = new THREE.Vector3();
    this.isMoving = false;
    this.isRunning = false;
    this.ready = false;
    this.idleTimer = 0;

    this.body = physics.addPlayerBody(radius, height, position);
    physics.link(this.body, this.group, -height / 2);

    this._setupCollisionDetection();
    this._load(modelUrl, walkAnimationUrl);
  }

  // Getters de compatibilidade para outros scripts que acessem player.actions ou player.mixer
  get actions() { return this.animator.actions; }
  get mixer() { return this.animator.mixer; }

  _setupCollisionDetection() {
    this.body.addEventListener('collide', (event) => {
      if (!this.ready || this.animator.isStunned) return;

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
    if (this.animator.isStunned) return;

    this.animator.isStunned = true;
    this.animator.isSpecialActionPlaying = true;

    this.velocity.set(0, 0, 0);
    this.body.velocity.set(0, 0, 0);

    if (this.model) this.model.position.set(0, 0, 0);
    this.animator.fadeTo('falling', 0.1);

    setTimeout(() => {
      this.animator.isStunned = false;
      this.animator.isSpecialActionPlaying = false;
      this.idleTimer = 0;
      if (this.model) this.model.position.set(0, 0, 0);
    }, 2200);
  }

  async _load(modelUrl, walkAnimationUrl) {
    try {
      const gltf = await this.loader.loadAsync(modelUrl);
      this.model = gltf.scene;
      this.debug?.dumpModel(gltf, modelUrl);

      this.wardrobe.prepareMaterials(this.model);
      this.wardrobe.fitModel(this.model, this.height);
      this.group.add(this.model);

      this.animator.bindModel(this.model);

      if (walkAnimationUrl) {
        await this.animator.loadSingleAnimation('walk', walkAnimationUrl);
      }

      if (CONFIG.ANIMATIONS) {
        for (const [key, url] of Object.entries(CONFIG.ANIMATIONS)) {
          if (url) await this.animator.loadSingleAnimation(key, url);
        }
      }

      this.ready = true;
    } catch (err) {
      console.error('[CharacterController] Erro ao carregar personagem:', err);
    }
  }

  async changeOutfit(modeloKey) {
    return this.wardrobe.changeOutfit(modeloKey);
  }

  async equipHelmet(helmetKey) {
    return this.wardrobe.equipHelmet(helmetKey);
  }

  playTrigger(actionName) {
    if (this.wardrobe.isSwapping) return;
    this.animator.playTrigger(actionName);
  }

  setInput(forward, right, camYaw, isRunning = false) {
    if (this.animator.isStunned) {
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
      this.animator.isSpecialActionPlaying = false;
    }
  }

  update(delta) {
    if (!this.ready || this.wardrobe.isSwapping) return;

    if (this.animator.isStunned) {
      this.body.velocity.set(0, 0, 0);
      this.velocity.set(0, 0, 0);
      this.animator.update(delta);
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

    if (!this.animator.isSpecialActionPlaying) {
      if (this.isMoving) {
        if (this.isRunning && this.actions['run']) {
          this.animator.fadeTo('run', 0.15);
        } else if (this.actions['walk']) {
          this.animator.fadeTo('walk', 0.15);
        }
      } else {
        this.idleTimer += delta;

        if (this.idleTimer > 10 && this.actions['idle_dwarf']) {
          this.animator.fadeTo('idle_dwarf', 0.3);
        } else if (this.idleTimer <= 10) {
          if (this.actions['idle']) {
            this.animator.fadeTo('idle', 0.2);
          } else {
            if (this.animator.currentActionName) {
              this.actions[this.animator.currentActionName].fadeOut(0.2);
              this.animator.currentActionName = null;
            }
            this.animator.applyRestPose();
          }
        }
      }
    }

    this.animator.update(delta);
  }
}