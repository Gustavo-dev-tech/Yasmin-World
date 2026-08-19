import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Castle {
  constructor({ scene }) {
    this.scene = scene;
    
    // Posição na ponta do mapa (Longe do centro 0,0,0)
    this.position = new THREE.Vector3(400, -0.2, -400); 

    this._loadModel();
  }

  _loadModel() {
    const gltfLoader = new GLTFLoader();
    
    gltfLoader.load('./assets/models/castle.glb', (gltf) => {
        const model = gltf.scene;
        
        model.scale.set(0.5, 0.5, 0.5); 
        model.position.copy(this.position);

        model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });

        this.scene.add(model);
        console.log('[World] Castelo Ninho carregado na ponta do mapa!');
    }, undefined, (error) => {
        console.error('[World] Erro ao carregar o castelo:', error);
    });
  }
}