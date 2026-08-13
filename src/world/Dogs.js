import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Dogs {
  constructor({ scene, player }) {
    this.scene = scene;
    this.player = player;
    this.dogs = [];
    this.loader = new GLTFLoader();

    // Configuração das Raças de Cães na pasta assets/models/
    this.dogBreeds = [
      { id: 'golden', name: 'Golden Retriever', modelUrl: 'assets/models/dog_golden.glb', scale: 0.8 },
      { id: 'shepherd', name: 'Pastor Alemão', modelUrl: 'assets/models/dog_shepherd.glb', scale: 0.85 },
      { id: 'husky', name: 'Husky Siberiano', modelUrl: 'assets/models/dog_husky.glb', scale: 0.8 },
    ];

    this.activeCompanion = null;
  }

  // Carrega um cão de uma raça específica para acompanhar a personagem
  async spawnCompanion(breedId) {
    const breed = this.dogBreeds.find((b) => b.id === breedId) || this.dogBreeds[0];

    try {
      const gltf = await this.loader.loadAsync(breed.modelUrl);
      const dogModel = gltf.scene;

      dogModel.scale.setScalar(breed.scale);
      dogModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Posição inicial ao lado da jogadora
      const playerPos = this.player.group.position;
      dogModel.position.set(playerPos.x + 2, playerPos.y, playerPos.z + 2);
      this.scene.add(dogModel);

      let mixer = null;
      if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(dogModel);
        const runClip = gltf.animations.find((a) => a.name.toLowerCase().includes('run')) || gltf.animations[0];
        const action = mixer.clipAction(runClip);
        action.play();
      }

      this.activeCompanion = {
        model: dogModel,
        mixer,
        speed: 4.8,
      };

      console.log(`[Dogs] Cão companheiro (${breed.name}) carregado com sucesso!`);
    } catch (err) {
      console.warn(`[Dogs] Não foi possível carregar o modelo em "${breed.modelUrl}". Adicione o arquivo .glb na pasta assets/models/`);
    }
  }

  update(delta) {
    if (!this.activeCompanion || !this.player) return;

    const dog = this.activeCompanion;
    const playerPos = this.player.group.position;
    const dogPos = dog.model.position;

    const distance = dogPos.distanceTo(playerPos);

    // Se a jogadora estiver a mais de 2.2 metros, o cão corre atrás dela
    if (distance > 2.2) {
      const dir = new THREE.Vector3().subVectors(playerPos, dogPos).normalize();
      dir.y = 0;

      dogPos.x += dir.x * dog.speed * delta;
      dogPos.z += dir.z * dog.speed * delta;

      // Orienta o cão na direção em que está correndo
      const targetAngle = Math.atan2(dir.x, dir.z);
      dog.model.rotation.y = THREE.MathUtils.lerp(dog.model.rotation.y, targetAngle, delta * 8);

      if (dog.mixer) dog.mixer.update(delta);
    }
  }
}