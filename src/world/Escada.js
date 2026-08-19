import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';

export class Escada {
  constructor({ scene, physics, position }) {
    this.scene = scene;
    this.physics = physics;
    
    // Posição que receberemos lá do main.js
    this.position = position || new THREE.Vector3(0, 0, 0); 
    
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.mesh = null;
    this.body = null;       // A colisão física da escada
    this.trigger = null;    // O sensor invisível que detecta a personagem

    this._loadModel();
  }

  _loadModel() {
    const gltfLoader = new GLTFLoader();
    
    // Carrega o seu modelo
    gltfLoader.load('./assets/models/escada.glb', (gltf) => {
      this.mesh = gltf.scene;
      
      // Escala inicial (ajustaremos se ficar gigante ou pequena)
      this.mesh.scale.set(2, 2, 2); 
      
      this.mesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.group.add(this.mesh);
      this.group.position.copy(this.position);

      // Assim que o visual carregar, criamos a física em volta dele
      this._createPhysics();
      
      console.log('[World] Escada carregada com sucesso!');
    }, undefined, (error) => {
      console.error('[World] Erro ao carregar a escada:', error);
    });
  }

  _createPhysics() {
    if (!this.physics) return;

    // 1. CAIXA DE COLISÃO FÍSICA (A Rampa)
    // Esses valores (width, height, depth) precisarão de um ajuste fino 
    // dependendo do tamanho real do seu modelo 3D.
    const shape = new CANNON.Box(new CANNON.Vec3(2, 8, 1)); 
    
    this.body = new CANNON.Body({
      mass: 0, // mass 0 = Objeto estático (não cai, paredes, chão)
      position: new CANNON.Vec3(this.position.x, this.position.y + 4, this.position.z),
    });
    
    // Inclina a caixa de colisão para formar uma rampa (ex: 45 graus)
    this.body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 4);
    
    this.body.addShape(shape);
    this.physics.world.addBody(this.body);

    // 2. CAIXA SENSOR (Trigger) - Fica no pé da escada
    // Quando a personagem encostar aqui, disparamos a animação!
    const triggerShape = new CANNON.Box(new CANNON.Vec3(3, 2, 3));
    this.trigger = new CANNON.Body({
      mass: 0,
      isTrigger: true, // IMPORTANTE: isTrigger faz ser um fantasma que só avisa quando encosta
      position: new CANNON.Vec3(this.position.x, this.position.y + 1, this.position.z + 4),
    });

    this.trigger.addShape(triggerShape);
    this.physics.world.addBody(this.trigger);
  }
}