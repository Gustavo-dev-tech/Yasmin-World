import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PhysicsWorld } from './physics/Physics.js';
import { CharacterController } from './player/CharacterController.js';
import { World } from './world/World.js';
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
// CENA, CÂMERA, RENDERER
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color('#87CEEB');
scene.fog = new THREE.Fog('#feb47b', 15, 120);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ==========================================
// LUZES
// ==========================================
scene.add(new THREE.AmbientLight(0xffffff, 1.1));
const dirLight = new THREE.DirectionalLight(0xfffaed, 1.4);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.bias = -0.001;
scene.add(dirLight);

// ==========================================
// FÍSICA E PLAYER
// ==========================================
const debug = new DebugHelper(CONFIG.DEBUG);
const physics = new PhysicsWorld();

const player = new CharacterController({
  scene,
  physics,
  debug,
  modelUrl: CONFIG.ACTIVE_MODEL,
  walkAnimationUrl: CONFIG.WALK_ANIMATION_URL,
  position: new THREE.Vector3(0, 0, 0),
  radius: CONFIG.PLAYER_RADIUS,
  height: CONFIG.PLAYER_HEIGHT,
  speed: CONFIG.PLAYER_SPEED,
});

// ==========================================
// SISTEMAS DE ENTIDADES DO MUNDO
// ==========================================
const world = new World({ scene, physics });
const forestManager = new ForestManager({ scene, physics, obstacleMeshes: world.obstacleMeshes });
const animals = new Animals({ scene, obstacleMeshes: world.obstacleMeshes });
const collectibles = new Collectibles({ scene });
const dragon = new Dragon({ scene, physics, player });
const dogs = new Dogs({ scene, player });

const gameModeManager = new GameModeManager({ scene, player });
const minimap = new Minimap({ player, gameModeManager });
const input = new Input();

dogs.spawnCompanion('golden');

// ==========================================
// CÂMERA ORBITAL PADRÃO (DISTÂNCIA MÁXIMA = 48.0)
// ==========================================
class OrbitCameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.yaw = 0;
    this.pitch = THREE.MathUtils.degToRad(20);
    this.distance = 8.0;

    this.minPitch = THREE.MathUtils.degToRad(2);
    this.maxPitch = THREE.MathUtils.degToRad(85);
    
    this.minDistance = 1.0;
    this.maxDistance = 48.0;

    this.yawSpeed = 0.006;
    this.pitchSpeed = 0.006;

    this.target = new THREE.Vector3();
    this._dragging = false;
    this._lastX = 0;
    this._lastY = 0;

    this._bindEvents();
  }

  _isOverJoystick(target) {
    return !!(target && target.closest && target.closest('#joystick-zone'));
  }

  _bindEvents() {
    const onDown = (x, y, target) => {
      if (this._isOverJoystick(target)) return;
      this._dragging = true;
      this._lastX = x;
      this._lastY = y;
    };
    const onMove = (x, y) => {
      if (!this._dragging) return;
      const deltaX = x - this._lastX;
      const deltaY = y - this._lastY;
      this._lastX = x;
      this._lastY = y;

      this.yaw -= deltaX * this.yawSpeed;
      this.pitch = THREE.MathUtils.clamp(
        this.pitch - deltaY * this.pitchSpeed,
        this.minPitch,
        this.maxPitch
      );
    };
    const onUp = () => { this._dragging = false; };

    this.domElement.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      onDown(e.clientX, e.clientY, e.target);
    });
    window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY));
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
    const y = this.target.y + this.distance * Math.sin(this.pitch);
    const z = this.target.z + horizontalR * Math.cos(this.yaw);

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

// BOTÃO DE MONTAR E REFERÊNCIA AOS OUTROS BOTÕES DE AÇÃO
const btnMount = document.getElementById('btn-mount');
if (btnMount) {
  btnMount.addEventListener('click', () => {
    if (dragon) {
      dragon.toggleMount(player, dogs);
    }
  });
}

// MANAGER DO MENU DE PAUSE
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

// MANAGER DO MENU PRINCIPAL
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

  if (isGameStarted && !pauseMenu.isPaused) {
    physics.step(delta);

    // CONTROLE DE VISIBILIDADE DO BOTÃO DE MONTAR E OCULTAÇÃO DE BOTÕES DE ANIMAÇÃO
    if (dragon && dragon.isLoaded) {
      const dist = player.group.position.distanceTo(dragon.group.position);
      const actionBtns = actionsPanel ? actionsPanel.querySelectorAll('button:not(#btn-mount):not(#btn-pause)') : [];

      if (dragon.isMounted) {
        if (btnMount) {
          btnMount.classList.remove('hidden');
          btnMount.innerText = '🛑 Desmontar';
        }
        // Oculta os botões "Dançar" e "Comemorar" durante a pilotagem
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
        // Exibe os botões de ação normalmente fora do dragão
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

  // Debug Ativo
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

// DESABILITA DISPARO DE ANIMAÇÕES TERRESTRES ENQUANTO MONTADO
window.triggerAnim = (animName) => {
  if (dragon && dragon.isMounted) return; // Bloqueia dança/vitória ao voar
  if (player && player.ready && !pauseMenu.isPaused) {
    player.playTrigger(animName);
  }
};