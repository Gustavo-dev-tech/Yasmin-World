import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PATHS } from '../config.js';

export class Castle {
  constructor({
    scene,
    position = new THREE.Vector3(0, 1.8, -95),
    rotationY = -Math.PI / 2
  }) {
    this.scene = scene;
    this.position = position.clone();
    this.rotationY = rotationY;
    this.model = null;

    this._loadModel();
  }

  _loadModel() {
    const gltfLoader = new GLTFLoader();
    const primaryUrl = PATHS?.city?.castle || './assets/models/city/castle.glb';
    const fallbackUrl = './assets/models/castle.glb';

    const onLoaded = (gltf) => {
      const model = gltf.scene;
      this.model = model;

      model.scale.set(0.42, 0.42, 0.42);
      model.rotation.y = this.rotationY;
      model.updateMatrixWorld(true);

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());

      // Centraliza o castelo no eixo X/Z escolhido e eleva o pátio acima do nível do mar
      model.position.x += this.position.x - center.x;
      model.position.z += this.position.z - center.z;
      model.position.y = this.position.y - box.min.y;

      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.scene.add(model);
      console.log('[Castle] Fortaleza posicionada sem água invadindo o pátio!');
    };

    gltfLoader.load(primaryUrl, onLoaded, undefined, () => {
      gltfLoader.load(fallbackUrl, onLoaded, undefined, (error) => {
        console.error('[Castle] Erro ao carregar o castelo:', error);
      });
    });
  }
}