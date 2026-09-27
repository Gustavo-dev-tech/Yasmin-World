import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as CANNON from 'cannon-es';

export class Animals {
  constructor({ scene, physics, obstacleMeshes = [] }) {
    this.scene = scene;
    this.physics = physics;
    this.obstacleMeshes = obstacleMeshes;
    
    this.rabbits = []; 
    this.rabbitModel = null;
    this.rabbitAnimations = {};

    this._loadRabbitModel();
  }

  async _loadRabbitModel() {
    const loader = new GLTFLoader();
    
    try {
      const gltf = await loader.loadAsync('./assets/models/rabbit.glb');
      this.rabbitModel = gltf.scene;

      await this._extractAndFixTexture(gltf);

      this.rabbitModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          child.frustumCulled = false; 
        }
      });

      const clips = gltf.animations;
      clips.forEach(clip => {
          this.rabbitAnimations[clip.name] = clip;
      });

      this._spawnRabbitFlock(15); 

    } catch (error) {
      console.error('[Animals] Erro ao carregar o coelho:', error);
    }
  }

  async _extractAndFixTexture(gltf) {
    const parser = gltf.parser;
    const json = parser.json;
    if (!json.materials) return;

    let diffuseTextureIndex = -1;

    for (let i = 0; i < json.materials.length; i++) {
      const mat = json.materials[i];
      const ext = mat.extensions?.KHR_materials_pbrSpecularGlossiness;
      if (ext && ext.diffuseTexture) {
        diffuseTextureIndex = ext.diffuseTexture.index;
        break;
      }
    }

    if (diffuseTextureIndex !== -1) {
      const diffuseTexture = await parser.getDependency('texture', diffuseTextureIndex);
      diffuseTexture.colorSpace = THREE.SRGBColorSpace;
      diffuseTexture.flipY = false; 

      this.rabbitModel.traverse((child) => {
        if (child.isMesh) {
          child.material = new THREE.MeshStandardMaterial({
            map: diffuseTexture,
            color: 0xffffff, 
            roughness: 0.9,
            metalness: 0.0
          });
        }
      });
    }
  }

  _spawnRabbitFlock(count) {
    for (let i = 0; i < count; i++) {
      const clone = SkeletonUtils.clone(this.rabbitModel);
      
      // Define a genética do coelho
      let tipo = 'normal';
      if (i % 3 === 0) tipo = 'alfa';
      else if (i % 4 === 0) tipo = 'filhote';

      this._personalizeRabbit(clone, tipo);
      
      const wrapper = new THREE.Group();
      
      let baseScale = 1.5;
      let speedMult = 1.0;

      if (tipo === 'alfa') {
          baseScale = 2.2;
          speedMult = 0.6; // Mais lento
      } else if (tipo === 'filhote') {
          baseScale = 0.7;
          speedMult = 1.8; // Muito rápido
      }

      const randomScale = baseScale * (0.9 + Math.random() * 0.2); 
      wrapper.scale.set(randomScale, randomScale, randomScale);
      wrapper.add(clone);
      
      const startX = (Math.random() - 0.5) * 80;
      const startZ = (Math.random() - 0.5) * 80;
      const startPos = new THREE.Vector3(startX, 0, startZ);
      
      wrapper.position.copy(startPos);
      wrapper.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(wrapper);

      const mixer = new THREE.AnimationMixer(clone);

      const rabbitData = {
          mesh: wrapper,
          mixer: mixer,
          tipo: tipo,
          state: Math.random() > 0.5 ? 'walk' : 'idle',
          timer: Math.random() * 5, 
          speed: (1.0 + Math.random()) * speedMult, 
          rotationSpeed: 0,
          body: this._createRabbitPhysics(startPos, tipo) 
      };

      this._playRabbitAnim(rabbitData);
      this.rabbits.push(rabbitData);
    }
  }

  _personalizeRabbit(clone, tipo) {
      let corHex = 0xffffff;

      if (tipo === 'alfa') {
          corHex = 0x8b7355; // Marrom escuro imponente
      } else if (tipo === 'filhote') {
          corHex = 0xffffff; // Branco puro
      } else {
          const coresNormais = [0xffffff, 0xdddddd, 0xffe4b5, 0xd2b48c];
          corHex = coresNormais[Math.floor(Math.random() * coresNormais.length)];
      }

      clone.traverse((child) => {
          if (child.isMesh && child.material) {
              child.material = child.material.clone();
              child.material.color.setHex(corHex);
          }
          
          if (child.isBone && child.name.toLowerCase().includes('ear')) {
              // Alfas mantêm as orelhas em pé. Outros têm chance de orelha caída.
              if (tipo !== 'alfa' && Math.random() > 0.6) {
                  child.rotation.z -= (Math.random() * 1.5); 
              }
          }
      });
  }

  _createRabbitPhysics(pos, tipo) {
      if(!this.physics) return null;
      
      let boxSize = 0.5;
      if (tipo === 'alfa') boxSize = 0.8;
      else if (tipo === 'filhote') boxSize = 0.25;

      const shape = new CANNON.Box(new CANNON.Vec3(boxSize, boxSize * 1.2, boxSize)); 
      const body = new CANNON.Body({
          mass: 1, 
          position: new CANNON.Vec3(pos.x, pos.y + 1.0, pos.z), 
          fixedRotation: true,
          linearDamping: 0.9 
      });
      body.addShape(shape);
      this.physics.world.addBody(body);
      return body;
  }

  _playRabbitAnim(rabbitData) {
      let targetAnim = rabbitData.state === 'idle' ? 'idle' : 'walk';
      let clipName = Object.keys(this.rabbitAnimations).find(name => name.toLowerCase().includes(targetAnim));
      
      if (!clipName && Object.keys(this.rabbitAnimations).length > 0) {
          clipName = Object.keys(this.rabbitAnimations)[0];
      }

      const clip = this.rabbitAnimations[clipName];
      if (clip) {
          rabbitData.mixer.stopAllAction();
          const action = rabbitData.mixer.clipAction(clip);
          
          // Filhotes animam mais rápido
          if (rabbitData.tipo === 'filhote') action.setEffectiveTimeScale(1.5);
          // Alfas animam mais devagar
          else if (rabbitData.tipo === 'alfa') action.setEffectiveTimeScale(0.7);

          action.play();
      }
  }

  update(delta, elapsed) {
    if (this.rabbits.length === 0) return;

    this.rabbits.forEach(rabbit => {
        if (rabbit.mixer) rabbit.mixer.update(delta);

        rabbit.timer -= delta;
        if (rabbit.timer <= 0) {
            if (rabbit.state === 'idle') {
                rabbit.state = 'walk';
                rabbit.timer = 2 + Math.random() * 4; 
                rabbit.rotationSpeed = (Math.random() - 0.5) * 2.0; 
                this._playRabbitAnim(rabbit);
            } else {
                rabbit.state = 'idle';
                rabbit.timer = 2 + Math.random() * 5; 
                rabbit.rotationSpeed = 0;
                this._playRabbitAnim(rabbit);
            }
        }

        if (rabbit.body) {
            if (rabbit.body.position.y < -5) {
                rabbit.body.position.y = 5;
                rabbit.body.velocity.set(0, 0, 0);
            }

            if (rabbit.state === 'walk') {
                rabbit.mesh.rotation.y += rabbit.rotationSpeed * delta;
                const dirX = Math.sin(rabbit.mesh.rotation.y);
                const dirZ = Math.cos(rabbit.mesh.rotation.y);
                rabbit.body.velocity.x = dirX * rabbit.speed;
                rabbit.body.velocity.z = dirZ * rabbit.speed;
            } else {
                rabbit.body.velocity.x = 0;
                rabbit.body.velocity.z = 0;
            }

            rabbit.mesh.position.copy(rabbit.body.position);
            
            // Ajuste fino da malha no chão dependendo do tamanho
            let yOffset = 0.6;
            if (rabbit.tipo === 'alfa') yOffset = 0.9;
            else if (rabbit.tipo === 'filhote') yOffset = 0.3;
            
            rabbit.mesh.position.y -= yOffset; 
        }
    });
  }
}