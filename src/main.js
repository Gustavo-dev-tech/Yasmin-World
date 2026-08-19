import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PhysicsWorld } from './physics/Physics.js';
import { CharacterController } from './player/CharacterController.js';
import { World } from './world/World.js';
import { Castle } from './world/Castle.js'; 
import { Escada } from './world/Escada.js'; // <-- IMPORTAÇÃO CORRETA
import { Animals } from './world/Animals.js';
import { Collectibles } from './world/Collectibles.js';
import { Dragon } from './world/Dragon.js';
import { Input } from './Input.js';
import { DebugHelper } from './DebugHelper.js';
import { GameModeManager } from './game/GameModeManager.js';
import { Minimap } from './ui/Minimap.js';
import { Dogs } from './world/Dogs.js';
import { ForestManager } from './world/ForestManager.js';
import { MainMenu } from './ui/MainMenu.js';
import { PauseMenu } from './ui/PauseMenu.js';

// ==========================================
// CENA, CÂMERA, RENDERER E NÉVOA
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#87CEEB'); 
scene.fog = new THREE.Fog('#87CEEB', 200, 1200);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

const listener = new THREE.AudioListener();
camera.add(listener);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ==========================================
// LUZES DO SOL E AMBIENTE
// ==========================================
const ambientLight = new THREE.AmbientLight(0xffffff, 1.1);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xfffaed, 1.4);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.bias = -0.001;
scene.add(dirLight);

// ==========================================
// REFLETORES DAS 4 PONTAS (LUZ BRANCA POTENTE)
// ==========================================
const cornerLights = [];
const lightPositions = [
  new THREE.Vector3(200, 150, 200),
  new THREE.Vector3(-200, 150, 200),
  new THREE.Vector3(200, 150, -200),
  new THREE.Vector3(-200, 150, -200)
];

lightPositions.forEach(pos => {
  const light = new THREE.PointLight('#ffffff', 0, 2000, 0.5); 
  light.position.copy(pos);
  scene.add(light);
  cornerLights.push(light);
});

// ==========================================
// MÁQUINA DE DIA E NOITE
// ==========================================
class DayNightCycle {
  constructor(scene, dirLight, ambientLight, cornerLights) {
    this.scene = scene;
    this.dirLight = dirLight;
    this.ambientLight = ambientLight;
    this.cornerLights = cornerLights;

    this.time = 8; 
    this.timeSpeed = 0.5; 

    this.colors = {
      night: new THREE.Color('#020208'),
      sunrise: new THREE.Color('#ff7b00'),
      day: new THREE.Color('#87CEEB'),
      sunset: new THREE.Color('#ff4500')
    };
  }

  update(delta) {
    this.time += delta * this.timeSpeed;
    if (this.time >= 24) this.time = 0; 

    let skyColor = new THREE.Color();
    let lightInt = 0;
    let ambientInt = 0;
    let reflectorInt = 0; 

    if (this.time >= 0 && this.time < 5) { 
        skyColor.copy(this.colors.night);
        lightInt = 0; 
        ambientInt = 0.6; 
        reflectorInt = 5.0; 
    } else if (this.time >= 5 && this.time < 8) { 
        const t = (this.time - 5) / 3;
        skyColor.lerpColors(this.colors.night, this.colors.sunrise, t);
        lightInt = t * 0.8; 
        ambientInt = 0.6 + (t * 0.2); 
        reflectorInt = 5.0 - (t * 5.0); 
    } else if (this.time >= 8 && this.time < 11) { 
        const t = (this.time - 8) / 3;
        skyColor.lerpColors(this.colors.sunrise, this.colors.day, t);
        lightInt = 0.8 + (t * 0.6); 
        ambientInt = 0.8 + (t * 0.3);
        reflectorInt = 0; 
    } else if (this.time >= 11 && this.time < 16) { 
        skyColor.copy(this.colors.day);
        lightInt = 1.4; 
        ambientInt = 1.1;
        reflectorInt = 0; 
    } else if (this.time >= 16 && this.time < 19) { 
        const t = (this.time - 16) / 3;
        skyColor.lerpColors(this.colors.day, this.colors.sunset, t);
        lightInt = 1.4 - (t * 0.6); 
        ambientInt = 1.1 - (t * 0.3);
        reflectorInt = 0; 
    } else if (this.time >= 19 && this.time < 21) { 
        const t = (this.time - 19) / 2;
        skyColor.lerpColors(this.colors.sunset, this.colors.night, t);
        lightInt = 0.8 - (t * 0.8); 
        ambientInt = 0.8 - (t * 0.2); 
        reflectorInt = t * 5.0; 
    } else { 
        skyColor.copy(this.colors.night);
        lightInt = 0; 
        ambientInt = 0.6; 
        reflectorInt = 5.0; 
    }

    this.scene.background.copy(skyColor);
    this.scene.fog.color.copy(skyColor);

    const sunAngle = ((this.time - 6) / 12) * Math.PI;
    const sunRadius = 150;
    this.dirLight.position.x = Math.cos(sunAngle) * sunRadius;
    this.dirLight.position.y = Math.sin(sunAngle) * sunRadius;
    this.dirLight.intensity = lightInt;
    
    this.ambientLight.intensity = ambientInt;

    this.cornerLights.forEach(light => {
        light.intensity = reflectorInt;
    });
  }
}

const dayNight = new DayNightCycle(scene, dirLight, ambientLight, cornerLights);

// ==========================================
// FÍSICA E ENTIDADES DO JOGO
// ==========================================
const debug = new DebugHelper(CONFIG.DEBUG);
const physics = new PhysicsWorld();

const player = new CharacterController({
  scene,
  physics,
  debug,
  modelUrl: CONFIG.ACTIVE_MODEL,
  walkAnimationUrl: CONFIG.WALK_ANIMATION_URL,
  position: new THREE.Vector3(0, 0, 150), 
  radius: CONFIG.PLAYER_RADIUS,
  height: CONFIG.PLAYER_HEIGHT,
  speed: CONFIG.PLAYER_SPEED,
});

const world = new World({ scene, physics });

// O Castelo carrega de forma limpa pelo módulo
const castle = new Castle({ scene });

// A Escada é instanciada e posicionada próxima à muralha do castelo
const escada = new Escada({ 
    scene, 
    physics, 
    position: new THREE.Vector3(400, -0.2, -380) // Ajustaremos essas coordenadas baseados no seu teste visual
});

const forestManager = new ForestManager({ scene, physics, obstacleMeshes: world.obstacleMeshes });
const animals = new Animals({ scene, obstacleMeshes: world.obstacleMeshes });
const collectibles = new Collectibles({ scene });

const dragon = new Dragon({ 
    scene, 
    physics, 
    player, 
    listener,
    spawnPosition: new THREE.Vector3(400, 45.0, -400) 
});

const dogs = new Dogs({ scene, player });

const gameModeManager = new GameModeManager({ scene, player });
const minimap = new Minimap({ player, gameModeManager });
const input = new Input();

dogs.spawnCompanion('golden');

// ==========================================
// CÂMERA ORBITAL (VOO E PINCH-TO-ZOOM MULTI-TOUCH)
// ==========================================
class OrbitCameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.yaw = 0;
    this.pitch = THREE.MathUtils.degToRad(20);
    this.distance = 8.0;
    this.minPitch = THREE.MathUtils.degToRad(-45);
    this.maxPitch = THREE.MathUtils.degToRad(85);
    this.minDistance = 1.0;
    this.maxDistance = 48.0;
    this.yawSpeed = 0.006;
    this.pitchSpeed = 0.006;
    this.pinchZoomSpeed = 0.05; 
    this.target = new THREE.Vector3();
    this.pointers = []; 
    this.prevPinchDistance = null;
    this._lastX = 0;
    this._lastY = 0;
    this._bindEvents();
  }

  _isOverJoystick(target) {
    return !!(target && target.closest && target.closest('#joystick-zone'));
  }

  _bindEvents() {
    const onDown = (e) => {
      if (this._isOverJoystick(e.target)) return;
      const existingPointer = this.pointers.find(p => p.id === e.pointerId);
      if (!existingPointer) {
        this.pointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
      }
      if (this.pointers.length === 1) {
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      } else if (this.pointers.length === 2) {
        const dx = this.pointers[0].x - this.pointers[1].x;
        const dy = this.pointers[0].y - this.pointers[1].y;
        this.prevPinchDistance = Math.hypot(dx, dy);
      }
    };
    
    const onMove = (e) => {
      const pointer = this.pointers.find(p => p.id === e.pointerId);
      if (!pointer) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (this.pointers.length === 1) {
        const deltaX = e.clientX - this._lastX;
        const deltaY = e.clientY - this._lastY;
        this._lastX = e.clientX;
        this._lastY = e.clientY;

        this.yaw -= deltaX * this.yawSpeed;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - deltaY * this.pitchSpeed,
          this.minPitch,
          this.maxPitch
        );
      } else if (this.pointers.length === 2) {
        const dx = this.pointers[0].x - this.pointers[1].x;
        const dy = this.pointers[0].y - this.pointers[1].y;
        const currentPinchDistance = Math.hypot(dx, dy);

        if (this.prevPinchDistance !== null) {
          const pinchDelta = this.prevPinchDistance - currentPinchDistance;
          this.distance = THREE.MathUtils.clamp(
            this.distance + pinchDelta * this.pinchZoomSpeed,
            this.minDistance,
            this.maxDistance
          );
        }
        this.prevPinchDistance = currentPinchDistance;
      }
    };
    
    const onUp = (e) => {
      this.pointers = this.pointers.filter(p => p.id !== e.pointerId);
      if (this.pointers.length === 1) {
        this._lastX = this.pointers[0].x;
        this._lastY = this.pointers[0].y;
      } else if (this.pointers.length < 2) {
        this.prevPinchDistance = null; 
      }
    };

    this.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    this.domElement.addEventListener('wheel', (e) => {
      this.distance = THREE.MathUtils.clamp(
        this.distance + e.deltaY * 0.012,
        this.minDistance,
        this.maxDistance
      );
    }, { passive: true });
  }

  update(playerPosition, delta) {
    const zoomFactor = 1 - THREE.MathUtils.clamp((this.distance - this.minDistance) / (this.maxDistance - this.minDistance), 0, 1);
    const targetHeight = THREE.MathUtils.lerp(1.2, 1.8, zoomFactor);

    const focusPoint = playerPosition.clone().add(new THREE.Vector3(0, targetHeight, 0));
    const lerpAlpha = 1 - Math.pow(0.001, delta);
    this.target.lerp(focusPoint, lerpAlpha);

    const horizontalR = this.distance * Math.cos(this.pitch);
    const x = this.target.x + horizontalR * Math.sin(this.yaw);
    const z = this.target.z + horizontalR * Math.cos(this.yaw);
    
    let y = this.target.y + this.distance * Math.sin(this.pitch);
    y = Math.max(0.5, y); 

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }
}

const orbitCamera = new OrbitCameraRig(camera, renderer.domElement);
const clock = new THREE.Clock();

const uiContainer = document.getElementById('ui-container');
const actionsPanel = document.getElementById('actions-panel');
const modalControls = document.getElementById('modal-controls');

if (uiContainer) uiContainer.classList.add('hidden');
if (actionsPanel) actionsPanel.classList.add('hidden');

let isGameStarted = false;

const btnMount = document.getElementById('btn-mount');
if (btnMount) {
  btnMount.addEventListener('click', () => {
    if (dragon) {
      dragon.toggleMount(player, dogs);
    }
  });
}

const pauseMenu = new PauseMenu({
  onResume: () => {
    console.log('[Game] Jogo Retomado');
  },
  onOpenControls: () => {
    if (modalControls) modalControls.classList.remove('hidden');
  },
  onMainMenu: () => {
    isGameStarted = false;
    pauseMenu.canPause = false;
    mainMenu.show();
    if (uiContainer) uiContainer.classList.add('hidden');
    if (actionsPanel) actionsPanel.classList.add('hidden');
  }
});

const mainMenu = new MainMenu({
  onStartGame: () => {
    isGameStarted = true;
    pauseMenu.canPause = true;
    
    if (uiContainer) uiContainer.classList.remove('hidden');
    if (actionsPanel) actionsPanel.classList.remove('hidden');
    
    console.log('[Game] Jogo Iniciado!');
  }
});

// ==========================================
// LOOP DE EXECUÇÃO DO JOGO
// ==========================================
function animate() {
  requestAnimationFrame(animate);
  
  const delta = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  dayNight.update(delta);

  if (isGameStarted && !pauseMenu.isPaused) {
    physics.step(delta);

    if (dragon && dragon.isLoaded) {
      const dist = player.group.position.distanceTo(dragon.group.position);
      const actionBtns = actionsPanel ? actionsPanel.querySelectorAll('button:not(#btn-mount):not(#btn-pause)') : [];

      if (dragon.isMounted) {
        if (btnMount) {
          btnMount.classList.remove('hidden');
          btnMount.innerText = '🛑 Desmontar';
        }
        actionBtns.forEach(btn => btn.classList.add('hidden'));
      } else {
        if (btnMount) {
          if (dist <= 10.0) {
            btnMount.classList.remove('hidden');
            btnMount.innerText = '🐉 Montar';
          } else {
            btnMount.classList.add('hidden');
          }
        }
        actionBtns.forEach(btn => btn.classList.remove('hidden'));
      }
    }

    if (dragon && dragon.isMounted) {
      dragon.update(delta, player, input, orbitCamera.yaw, dogs);
    } else {
      const { forward, right, isRunning } = input.getMovement();
      player.setInput(forward, right, orbitCamera.yaw, isRunning);
      player.update(delta, elapsed);

      dogs.update(delta);
      dragon.update(delta, player, input, orbitCamera.yaw, dogs);
    }

    collectibles.update(player.group.position, elapsed);
    gameModeManager.update(delta, elapsed);
    minimap.update(orbitCamera.yaw);

    world.update(delta);
    forestManager.update(delta);
    animals.update(delta, elapsed);

    orbitCamera.update(player.group.position, delta);

  } else if (!isGameStarted) {
    orbitCamera.yaw += 0.15 * delta;
    
    world.update(delta);
    forestManager.update(delta);
    animals.update(delta, elapsed);
    dragon.update(delta, player, input, orbitCamera.yaw, dogs);
    
    orbitCamera.update(player.group.position, delta);
  }

  if (CONFIG.DEBUG && isGameStarted && !pauseMenu.isPaused) {
    const { forward, right } = input.getMovement();
    debug.update(
      `forward: ${forward.toFixed(2)} | right: ${right.toFixed(2)}\n` +
      `pos: (${player.group.position.x.toFixed(1)}, ${player.group.position.z.toFixed(1)})\n` +
      `camYaw: ${THREE.MathUtils.radToDeg(orbitCamera.yaw).toFixed(0)}° | pitch: ${THREE.MathUtils.radToDeg(orbitCamera.pitch).toFixed(0)}°\n` +
      `fps: ${(1 / delta).toFixed(0)}`
    );
  }

  renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.triggerAnim = (animName) => {
  if (dragon && dragon.isMounted) return; 
  if (player && player.ready && !pauseMenu.isPaused) {
    player.playTrigger(animName);
  }
};