import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PhysicsWorld } from './physics/Physics.js';
import { CharacterController } from './player/CharacterController.js';
import { OrbitCameraRig } from './player/OrbitCameraRig.js';
import { DayNightCycle } from './world/DayNightCycle.js';
import { WaterSystem } from './world/WaterSystem.js';
import { World } from './world/World.js';
import { Castle } from './world/Castle.js'; 
import { Escada } from './world/Escada.js';
import { Animals } from './world/Animals.js';
import { Collectibles } from './world/Collectibles.js';
import { Dragon } from './world/Dragon.js';
import { Motorcycle } from './world/Motorcycle.js';
import { Input } from './Input.js';
import { DebugHelper } from './DebugHelper.js';
import { GameModeManager } from './game/GameModeManager.js';
import { Minimap } from './ui/Minimap.js';
import { Dogs } from './world/Dogs.js';
import { ForestManager } from './world/ForestManager.js';
import { Shop } from './world/Shop.js';
import { UIManager } from './ui/UIManager.js';

// ==========================================
// CENA, CÂMERA, RENDERER E CICLO DIA/NOITE
// ==========================================
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 4000);
const listener = new THREE.AudioListener();
camera.add(listener);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const dayNight = new DayNightCycle(scene);
const orbitCamera = new OrbitCameraRig(camera, renderer.domElement);
const clock = new THREE.Clock();

// ==========================================
// FÍSICA E ENTIDADES DO MUNDO
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

// Oceano com Batimetria 3D cercando o continente do jogo
const water = new WaterSystem({
  scene,
  landSize: 250,
  oceanSize: 600,
  resolution: 48
});

const castle = new Castle({ scene });
const escada = new Escada({ 
  scene, 
  physics, 
  position: new THREE.Vector3(400, -0.2, -380)
});

const forestManager = new ForestManager({ scene, physics, obstacleMeshes: world.obstacleMeshes });
const animals = new Animals({ scene, physics, obstacleMeshes: world.obstacleMeshes });
const collectibles = new Collectibles({ scene });
const loja = new Shop(scene);

const dragon = new Dragon({ 
  scene, 
  physics, 
  player, 
  listener,
  spawnPosition: new THREE.Vector3(400, 45.0, -400) 
});

const moto = new Motorcycle({
  scene,
  physics,
  player,
  spawnPosition: new THREE.Vector3(6, 0, 142)
});

const dogs = new Dogs({ scene, player });
dogs.spawnCompanion('golden');

const gameModeManager = new GameModeManager({ scene, player });
const minimap = new Minimap({ player, gameModeManager });
const input = new Input();

// Gerenciador central de UI, Menus, Atalhos e Controle Xbox
const ui = new UIManager({
  player,
  dragon,
  moto,
  dogs,
  loja,
  input,
  orbitCamera,
  water,
  dayNight
});

// ==========================================
// LOOP PRINCIPAL DE EXECUÇÃO
// ==========================================
function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  const activePlayerPos = (moto && moto.isMounted) ? moto.group.position : player.group.position;

  dayNight.update(delta, activePlayerPos);
  water.update(delta, elapsed, activePlayerPos, dayNight);
  ui.updateGamepad(elapsed, activePlayerPos);

  if (ui.isGameStarted && !ui.isPaused) {
    physics.step(delta);
    ui.updateHUDButtons(activePlayerPos);

    if (dragon && dragon.isMounted) {
      dragon.update(delta, player, input, orbitCamera.yaw, dogs);
      moto.update(delta, player, input, dayNight);
    } else if (moto && moto.isMounted) {
      moto.update(delta, player, input, dayNight);
      dogs.update(delta);
      dragon.update(delta, player, input, orbitCamera.yaw, dogs);
    } else {
      if (!loja.shopActive) {
        const { forward, right, isRunning } = input.getMovement();
        player.setInput(forward, right, orbitCamera.yaw, isRunning);
      } else {
        player.setInput(0, 0, orbitCamera.yaw, false);
      }
      player.update(delta, elapsed);
      moto.update(delta, player, input, dayNight);

      dogs.update(delta);
      dragon.update(delta, player, input, orbitCamera.yaw, dogs);
    }

    collectibles.update(activePlayerPos, elapsed);
    gameModeManager.update(delta, elapsed);
    minimap.update(orbitCamera.yaw);

    world.update(delta);
    forestManager.update(delta);
    animals.update(delta, elapsed);

    if (player && !moto.isMounted) {
      loja.update(activePlayerPos);
    }

    orbitCamera.update(activePlayerPos, delta);
  } else if (!ui.isGameStarted) {
    orbitCamera.yaw += 0.15 * delta;

    world.update(delta);
    forestManager.update(delta);
    animals.update(delta, elapsed);
    dragon.update(delta, player, input, orbitCamera.yaw, dogs);

    orbitCamera.update(player.group.position, delta);
  }

  if (CONFIG.DEBUG && ui.isGameStarted && !ui.isPaused) {
    const { forward, right } = input.getMovement();
    debug.update(
      `forward: ${forward.toFixed(2)} | right: ${right.toFixed(2)}\n` +
      `pos: (${activePlayerPos.x.toFixed(1)}, ${activePlayerPos.z.toFixed(1)})\n` +
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

//water