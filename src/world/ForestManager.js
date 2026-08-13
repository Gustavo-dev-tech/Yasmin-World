import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class ForestManager {
  constructor({ scene, physics, obstacleMeshes }) {
    this.scene = scene;
    this.physics = physics;
    this.obstacleMeshes = obstacleMeshes;
    this.loader = new GLTFLoader();
    this.mixers = [];

    this._loadParkourTrail();
  }

  async _loadParkourTrail() {
    try {
      console.log('[ForestManager] Carregando "assets/models/trees_animated.glb"...');
      const gltf = await this.loader.loadAsync('assets/models/trees_animated.glb');
      const fullModel = gltf.scene;

      fullModel.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(fullModel);
      const nativeHeight = box.getSize(new THREE.Vector3()).y;

      const targetHeight = 6.0;
      const baseScale = nativeHeight > 0.1 ? (targetHeight / nativeHeight) : 0.25;

      const parkourPath = [
        { x: 15, z: -15 },
        { x: 22, z: -28 },
        { x: 16, z: -42 },
        { x: 25, z: -56 },
        { x: 18, z: -70 },
        { x: 28, z: -84 },
        { x: 20, z: -98 },
        { x: 12, z: -112 }
      ];

      parkourPath.forEach((point, index) => {
        const treeInstance = fullModel.clone(true);
        const randScale = baseScale * (0.9 + Math.random() * 0.2);

        treeInstance.position.set(point.x, 0, point.z);
        treeInstance.rotation.y = (index % 2 === 0) ? 0 : Math.PI / 2;
        treeInstance.scale.setScalar(randScale);

        treeInstance.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = false;

            // CONVERSÃO DE MATERIAL: Corrige o bug da extensão KHR_materials_pbrSpecularGlossiness
            const oldMat = child.material;
            const matName = (oldMat?.name || child.name || '').toLowerCase();
            const isTrunk = matName.includes('trunk') || matName.includes('wood') || matName.includes('bark');

            // Recria um material padrão compatível com o Three.js atual
            child.material = new THREE.MeshStandardMaterial({
              map: oldMat?.map || null,
              color: oldMat?.map ? 0xffffff : (isTrunk ? 0x4a2e18 : 0x2d6a4f),
              roughness: 0.8,
              metalness: 0.1,
              side: THREE.DoubleSide,
              transparent: true,
              alphaTest: 0.4,
            });

            child.material.needsUpdate = true;
          }
        });

        this.scene.add(treeInstance);

        this.physics.addStaticCylinder(0.8, targetHeight, new THREE.Vector3(point.x, targetHeight / 2, point.z));
        this.obstacleMeshes.push(treeInstance);

        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(treeInstance);
          const action = mixer.clipAction(gltf.animations[0]);
          action.play();
          action.time = index * 0.4;
          this.mixers.push(mixer);
        }
      });

      console.log('[ForestManager] Árvores convertidas e renderizadas com sucesso!');
    } catch (err) {
      console.error('[ForestManager] Erro ao carregar rota de parkour:', err);
    }
  }

  update(delta) {
    this.mixers.forEach((mixer) => mixer.update(delta));
  }
}