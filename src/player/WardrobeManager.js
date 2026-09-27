import * as THREE from 'three';
import { CONFIG } from '../config.js';

export const DEFAULT_OUTFITS = {
  vestido_branco: './assets/models/vestuario/garota_vestido_branco.glb',
  rosa: './assets/models/vestuario/garota_rosa.glb',
  gustavo: './assets/models/gustavo.glb'
};

export const DEFAULT_HELMETS = {
  capacete_moto_iii: {
    url: './assets/models/vestuario/cabeca/capacete_moto_iii.glb',
    size: 0.36, offset: [0, 0.09, -0.02], rot: [0, 0, 0]
  },
  capacete_vintage: {
    url: './assets/models/vestuario/cabeca/capacete_vintage.glb',
    size: 0.36, offset: [0, 0.09, -0.02], rot: [0, 0, 0]
  },
  capacete_racing: {
    url: './assets/models/vestuario/cabeca/capacete_racing.glb',
    size: 0.37, offset: [0, 0.09, -0.02], rot: [0, 0, 0]
  },
  capacete_off_road: {
    url: './assets/models/vestuario/cabeca/capacete_off_road.glb',
    size: 0.38, offset: [0, 0.09, -0.01], rot: [0, 0, 0]
  },
  capacete_supertech_r10: {
    url: './assets/models/vestuario/cabeca/capacete_supertech_r10.glb',
    size: 0.37, offset: [0, 0.10, -0.03], rot: [0, 0, 0]
  },
  capacete_elementza: {
    url: './assets/models/vestuario/cabeca/capacete_elementza.glb',
    size: 0.36, offset: [0, 0.09, -0.02], rot: [0, 0, 0]
  }
};

export class WardrobeManager {
  constructor(controller) {
    this.controller = controller;
    this.loader = controller.loader;

    this.currentOutfitKey = 'padrao';
    this.isSwapping = false;

    this.currentHelmet = null;
    this.currentHelmetKey = null;
    this.headBoneScale = 1;

    // Modos de cabelo com capacete: 'dome' (contínuo nos ombros), 'hidden' (preso dentro), 'normal'
    this.hairModes = ['dome', 'hidden', 'normal'];
    this.currentHairModeIndex = 0;

    this._setupHelmetTunerKeys();
  }

  _setupHelmetTunerKeys() {
    window.addEventListener('keydown', (e) => {
      if (!this.currentHelmet) return;

      // Tecla H alterna entre Cabelo Contínuo, Cabelo Escondido no Capacete e Cabelo Normal
      if (e.key.toLowerCase() === 'h') {
        this.currentHairModeIndex = (this.currentHairModeIndex + 1) % this.hairModes.length;
        this.applyHelmetHairState(true);
        console.log(`[Capacete] Modo de cabelo alterado para: ${this.hairModes[this.currentHairModeIndex].toUpperCase()}`);
        return;
      }

      const step = 0.01 / this.headBoneScale;
      let changed = false;

      if (e.key === 'ArrowUp') { this.currentHelmet.position.y += step; changed = true; }
      if (e.key === 'ArrowDown') { this.currentHelmet.position.y -= step; changed = true; }
      if (e.key === 'ArrowLeft') { this.currentHelmet.position.z -= step; changed = true; }
      if (e.key === 'ArrowRight') { this.currentHelmet.position.z += step; changed = true; }
      if (e.key === '=' || e.key === '+') { this.currentHelmet.scale.multiplyScalar(1.05); changed = true; }
      if (e.key === '-') { this.currentHelmet.scale.multiplyScalar(0.95); changed = true; }
      if (e.key.toLowerCase() === 'r') { this.currentHelmet.rotation.y += Math.PI / 2; changed = true; }

      if (changed) {
        const oy = (this.currentHelmet.position.y * this.headBoneScale).toFixed(3);
        const oz = (this.currentHelmet.position.z * this.headBoneScale).toFixed(3);
        console.log(`[Ajuste "${this.currentHelmetKey}"] offset: [0, ${oy}, ${oz}] | rotY: ${this.currentHelmet.rotation.y.toFixed(2)}`);
      }
    });
  }

  prepareMaterials(model) {
    model.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = false;

      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((mat) => {
        if (!mat) return;
        if ('metalness' in mat) mat.metalness = 0.0;
        if ('roughness' in mat) mat.roughness = 0.6;
      });
    });
  }

  fitModel(model, targetHeight) {
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.set(1, 1, 1);
    model.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());

    if (size.y > 0.01) {
      const scaleFactor = targetHeight / size.y;
      model.scale.setScalar(scaleFactor);
      model.updateMatrixWorld(true);
    }
  }

  // Corrige o "corte" na nuca: comprime apenas o topo do crânio (t > 0.58) sem puxar a nuca para dentro do pescoço
  applyHelmetHairState(isHelmetOn) {
    const model = this.controller.model;
    if (!model) return;

    const mode = this.hairModes[this.currentHairModeIndex];

    model.traverse((child) => {
      if (!child.isMesh) return;
      const name = (child.name || '').toLowerCase();

      if (name.includes('glasses') || name.includes('oculos')) {
        child.visible = !isHelmetOn;
      }

      if (name.includes('hair') || name.includes('cabelo')) {
        const posAttr = child.geometry?.attributes?.position;
        if (!posAttr) return;

        if (!child.userData.originalHairPositions) {
          child.userData.originalHairPositions = new Float32Array(posAttr.array);
        }

        const original = child.userData.originalHairPositions;
        const current = posAttr.array;

        // Se tirou o capacete, restaura tudo
        if (!isHelmetOn) {
          child.visible = true;
          current.set(original);
          posAttr.needsUpdate = true;
          return;
        }

        // Modo 'hidden': esconde o cabelo longo (100% dentro do capacete fechado)
        if (mode === 'hidden') {
          child.visible = false;
          return;
        }

        // Modo 'normal': mostra o cabelo sem compressão
        if (mode === 'normal') {
          child.visible = true;
          current.set(original);
          posAttr.needsUpdate = true;
          return;
        }

        // Modo 'dome' (Padrão): encolhe apenas a calota superior (t > 0.58) mantendo a nuca intacta!
        child.visible = true;
        let minY = Infinity, maxY = -Infinity;
        const count = posAttr.count;

        for (let i = 0; i < count; i++) {
          const y = original[i * 3 + 1];
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }

        const heightSpan = Math.max(maxY - minY, 0.001);

        // Calcula o centro apenas da parte superior da cabeça (t > 0.6) para não puxar para o pescoço
        let topSumX = 0, topSumZ = 0, topCount = 0;
        for (let i = 0; i < count; i++) {
          const y = original[i * 3 + 1];
          if ((y - minY) / heightSpan > 0.6) {
            topSumX += original[i * 3];
            topSumZ += original[i * 3 + 2];
            topCount++;
          }
        }

        const skullCenterX = topCount > 0 ? topSumX / topCount : 0;
        const skullCenterZ = topCount > 0 ? topSumZ / topCount : 0;

        for (let i = 0; i < count; i++) {
          const ox = original[i * 3];
          const oy = original[i * 3 + 1];
          const oz = original[i * 3 + 2];

          const t = (oy - minY) / heightSpan;

          // Só começa a comprimir acima de 56% da altura (dentro do casco), preservando a nuca!
          const crownFactor = THREE.MathUtils.smoothstep(t, 0.56, 0.78);

          current[i * 3]     = THREE.MathUtils.lerp(ox, skullCenterX, crownFactor * 0.42);
          current[i * 3 + 1] = oy - (crownFactor * heightSpan * 0.06);
          current[i * 3 + 2] = THREE.MathUtils.lerp(oz, skullCenterZ, crownFactor * 0.42);
        }

        posAttr.needsUpdate = true;
      }
    });
  }

  async equipHelmet(helmetKey) {
    const headBone = this.controller.animator.bones.head;
    if (!headBone) {
      console.warn('[WardrobeManager] Osso Head não encontrado!');
      return;
    }

    if (!helmetKey || helmetKey === 'remover_capacete' || this.currentHelmetKey === helmetKey) {
      if (this.currentHelmet?.parent) {
        this.currentHelmet.parent.remove(this.currentHelmet);
      }
      this.currentHelmet = null;
      this.currentHelmetKey = null;
      this.applyHelmetHairState(false);
      return;
    }

    const helmetCfg = DEFAULT_HELMETS[helmetKey];
    if (!helmetCfg) return;

    try {
      const gltf = await this.loader.loadAsync(helmetCfg.url);
      const rawHelmet = gltf.scene;

      rawHelmet.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false;
        }
      });

      if (this.currentHelmet?.parent) {
        this.currentHelmet.parent.remove(this.currentHelmet);
      }

      const helmetWrapper = new THREE.Group();
      helmetWrapper.add(rawHelmet);

      rawHelmet.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(rawHelmet);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());

      rawHelmet.position.sub(center);

      headBone.updateWorldMatrix(true, false);
      const headWorldScale = new THREE.Vector3();
      headBone.getWorldScale(headWorldScale);
      const boneScale = headWorldScale.y || 1;
      this.headBoneScale = boneScale;

      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0.0001) {
        const desiredWorldSize = helmetCfg.size || 0.36;
        helmetWrapper.scale.setScalar((desiredWorldSize / maxDim) / boneScale);
      }

      const [ox, oy, oz] = helmetCfg.offset || [0, 0.09, -0.02];
      const [rx, ry, rz] = helmetCfg.rot || [0, 0, 0];

      helmetWrapper.position.set(ox / boneScale, oy / boneScale, oz / boneScale);
      helmetWrapper.rotation.set(rx, ry, rz);

      headBone.add(helmetWrapper);
      this.currentHelmet = helmetWrapper;
      this.currentHelmetKey = helmetKey;

      this.applyHelmetHairState(true);
      this.controller.playTrigger('victory');
      console.log(`[Wardrobe] Capacete "${helmetKey}" equipado! Pressione 'H' para alternar o estilo do cabelo.`);
    } catch (err) {
      console.error(`[WardrobeManager] Erro ao carregar capacete "${helmetKey}":`, err);
    }
  }

  async changeOutfit(modeloKey) {
    if (DEFAULT_HELMETS[modeloKey] || modeloKey === 'remover_capacete') {
      await this.equipHelmet(modeloKey);
      return;
    }

    if (!this.controller.model || this.isSwapping) return;

    const catalog = {
      padrao: this.controller.defaultModelUrl,
      ...DEFAULT_OUTFITS,
      ...(CONFIG.OUTFITS || {})
    };

    const targetUrl = catalog[modeloKey];
    if (!targetUrl || modeloKey === this.currentOutfitKey) return;

    this.isSwapping = true;
    this.controller.ready = false;

    try {
      const gltf = await this.loader.loadAsync(targetUrl);
      const novoModel = gltf.scene;

      if (this.currentHelmet?.parent) {
        this.currentHelmet.parent.remove(this.currentHelmet);
      }

      const oldModel = this.controller.model;
      this.controller.animator.unbindCurrentModel();
      this.controller.group.remove(oldModel);
      this.disposeModel(oldModel);

      this.prepareMaterials(novoModel);
      this.controller.model = novoModel;
      this.controller.group.add(novoModel);
      this.fitModel(novoModel, this.controller.height);

      this.controller.animator.bindModel(novoModel);
      this.controller.animator.registerEmbeddedClips(gltf.animations);

      if (this.currentHelmet && this.controller.animator.bones.head) {
        this.controller.animator.bones.head.add(this.currentHelmet);
        this.applyHelmetHairState(true);
      }

      this.currentOutfitKey = modeloKey;
      this.controller.animator.isSpecialActionPlaying = false;
      this.controller.animator.isStunned = false;
      this.controller.idleTimer = 0;
      this.controller.animator.resumeState(this.controller.isMoving, this.controller.isRunning);

      this.controller.ready = true;
      this.controller.playTrigger('victory');
    } catch (err) {
      console.error('[WardrobeManager] Falha na troca de roupa:', err);
      this.controller.ready = true;
    } finally {
      this.isSwapping = false;
    }
  }

  disposeModel(model) {
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
          Object.values(mat).forEach((val) => {
            if (val && val.isTexture) val.dispose();
          });
          mat.dispose();
        });
      }
    });
  }
}