import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class World {
  constructor({ scene, physics }) {
    this.scene = scene;
    this.physics = physics;
    this.obstacleMeshes = [];
    this.loader = new GLTFLoader();

    this._loadModularGround();
    this._createRuinsAndTowers();
  }

  async _loadModularGround() {
    try {
      console.log('[World] Carregando bloco de solo "assets/models/terrain_tile.glb"...');
      const gltf = await this.loader.loadAsync('assets/models/terrain_tile.glb');
      const tileModel = gltf.scene;

      // Medição precisa do bloco de solo
      tileModel.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(tileModel);
      
      const widthX = box.max.x - box.min.x;
      const widthZ = box.max.z - box.min.z;
      const topY = box.max.y; // Ponto mais alto da superfície da grama

      const tileSizeX = widthX > 0.1 ? (widthX - 0.03) : 10;
      const tileSizeZ = widthZ > 0.1 ? (widthZ - 0.03) : 10;

      // EXPANSÃO DO MAPA: Aumentado para 15 (Cria um grid expandido)
      const gridRadius = 15; 

      for (let x = -gridRadius; x <= gridRadius; x++) {
        for (let z = -gridRadius; z <= gridRadius; z++) {
          const tileInstance = tileModel.clone(true);

          tileInstance.position.set(
            x * tileSizeX, 
            -topY, 
            z * tileSizeZ
          );

          tileInstance.traverse((child) => {
            if (child.isMesh) {
              child.receiveShadow = true;
              child.castShadow = false;
            }
          });

          this.scene.add(tileInstance);
        }
      }

      this.physics.addGroundPlane();
      console.log('[World] Mapa expandido com sucesso!');

    } catch (err) {
      console.warn('[World] "terrain_tile.glb" não encontrado. Usando plano fallback.', err);
      this._createFallbackTerrain();
    }
  }

  _createFallbackTerrain() {
    const groundGeo = new THREE.PlaneGeometry(500, 500, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.8 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.physics.addGroundPlane();
  }

  _createRuinsAndTowers() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.6 });

    // Torre genérica de obstáculo mantida
    const towerGeo = new THREE.CylinderGeometry(4, 4.5, 16, 12);
    const tower = new THREE.Mesh(towerGeo, stoneMat);
    tower.position.set(20, 8, -40);
    tower.castShadow = true;
    tower.receiveShadow = true;
    this.scene.add(tower);

    this.physics.addStaticCylinder(4, 16, tower.position);
    this.obstacleMeshes.push(tower);
  }

  update(delta) {}
  
}