import * as THREE from 'three';
import { CONFIG } from './config.js';
import { PhysicsWorld } from './physics/Physics.js';
import { CharacterController } from './player/CharacterController.js';
import { OrbitCameraRig } from './player/OrbitCameraRig.js';
import { DayNightCycle } from './world/DayNightCycle.js';
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
import { MainMenu } from './ui/MainMenu.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { Shop } from './world/Shop.js';

// ==========================================
// CENA, CÂMERA, RENDERER E CICLO DIA/NOITE
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

const dayNight = new DayNightCycle(scene);
const orbitCamera = new OrbitCameraRig(camera, renderer.domElement);
const clock = new THREE.Clock();

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

// Instancia a Honda Twister 300 próxima ao ponto inicial do jogador e da Loja
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

// ==========================================
// INTERFACE E MENUS
// ==========================================
const uiContainer = document.getElementById('ui-container');
const actionsPanel = document.getElementById('actions-panel');
const modalControls = document.getElementById('modal-controls');
const charSelectDiv = document.getElementById('character-select-menu');
const mainMenuDiv = document.getElementById('main-menu');
const btnMount = document.getElementById('btn-mount');
const btnRide = document.getElementById('btn-ride');

if (uiContainer) uiContainer.classList.add('hidden');
if (actionsPanel) actionsPanel.classList.add('hidden');

let isGameStarted = false;

window.addEventListener('roupaComprada', async (e) => {
  const outfit = e.detail;
  if (player && player.ready) {
    const feedback = document.getElementById('shop-feedback');
    if (feedback) feedback.innerText = "Equipando...";

    await player.changeOutfit(outfit);

    if (feedback) {
      feedback.innerText = "Item equipado!";
      setTimeout(() => { feedback.innerText = ""; }, 1500);
    }
    loja.close();
  }
});

if (btnMount) {
  btnMount.addEventListener('click', () => {
    if (dragon && !moto.isMounted) dragon.toggleMount(player, dogs);
  });
}

if (btnRide) {
  btnRide.addEventListener('click', () => {
    if (moto && !dragon.isMounted) moto.toggleMount(player, dogs);
  });
}

// Atalho Tecla E no teclado para subir/descer da moto rapidamente
window.addEventListener('keydown', (e) => {
  if (!isGameStarted || pauseMenu.isPaused || loja.shopActive) return;
  if (e.key.toLowerCase() === 'e' && moto && moto.isLoaded && !dragon.isMounted) {
    const activePos = moto.isMounted ? moto.group.position : player.group.position;
    const dist = activePos.distanceTo(moto.group.position);
    if (moto.isMounted || dist <= 4.5) {
      moto.toggleMount(player, dogs);
    }
  }
});

const pauseMenu = new PauseMenu({
  onResume: () => console.log('[Game] Jogo Retomado'),
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
    if (charSelectDiv) charSelectDiv.classList.remove('hidden');
  }
});

window.selectCharacter = async function(charId) {
  if (charSelectDiv) charSelectDiv.classList.add('hidden');
  if (mainMenuDiv) mainMenuDiv.classList.add('hidden');

  if (player && player.ready) {
    await player.changeOutfit(charId);
  }

  isGameStarted = true;
  pauseMenu.canPause = true;

  if (uiContainer) uiContainer.classList.remove('hidden');
  if (actionsPanel) actionsPanel.classList.remove('hidden');

  console.log(`[Game] Jogo Iniciado com: ${charId.toUpperCase()}!`);
};

// ==========================================
// LOOP DE EXECUÇÃO DO JOGO
// ==========================================
function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  dayNight.update(delta);

  // Posição ativa do jogador no mundo (a pé ou sobre a moto)
  const activePlayerPos = (moto && moto.isMounted) ? moto.group.position : player.group.position;

  // Controles do Gamepad (Xbox)
  const padState = input.getGamepadState();
  if (padState && isGameStarted && !pauseMenu.isPaused) {
    if (loja.shopActive) {
      if (!window.lastPadTime) window.lastPadTime = 0;

      if (elapsed - window.lastPadTime > 0.2) {
        const btns = Array.from(document.querySelectorAll('.shop-btn, #btn-close-shop'));
        let activeIdx = btns.findIndex((b) => b === document.activeElement);

        const gamepad = input.getGamepad();
        const yAxis = gamepad ? gamepad.axes[1] : 0;

        if (padState.camY > 0.5 || yAxis > 0.5) {
          activeIdx = (activeIdx + 1) % btns.length;
          btns[activeIdx].focus();
          window.lastPadTime = elapsed;
        } else if (padState.camY < -0.5 || yAxis < -0.5) {
          activeIdx = (activeIdx - 1 + btns.length) % btns.length;
          btns[activeIdx].focus();
          window.lastPadTime = elapsed;
        }
      }

      if (padState.btnA && document.activeElement) document.activeElement.click();
      if (padState.btnB) loja.close();
    } else {
      orbitCamera.yaw -= padState.camX * 0.05;
      orbitCamera.pitch = THREE.MathUtils.clamp(
        orbitCamera.pitch - padState.camY * 0.03,
        orbitCamera.minPitch,
        orbitCamera.maxPitch
      );

      if (padState.btnX) {
        const distMoto = moto && moto.isLoaded ? activePlayerPos.distanceTo(moto.group.position) : Infinity;
        const distDragon = dragon && dragon.isLoaded ? activePlayerPos.distanceTo(dragon.group.position) : Infinity;

        if (moto && (moto.isMounted || (distMoto <= 4.5 && !dragon.isMounted))) {
          moto.toggleMount(player, dogs);
        } else if (dragon && (dragon.isMounted || (distDragon <= 10.0 && !moto.isMounted))) {
          dragon.toggleMount(player, dogs);
        }
      }

      if (padState.btnY && player && !dragon.isMounted && !moto.isMounted) {
        player.playTrigger('dance');
      }
    }
  }

  if (isGameStarted && !pauseMenu.isPaused) {
    physics.step(delta);

    const actionBtns = actionsPanel ? actionsPanel.querySelectorAll('button:not(#btn-mount):not(#btn-ride):not(#btn-pause)') : [];

    // Atualiza botão de Montar no Dragão
    if (dragon && dragon.isLoaded && btnMount) {
      const distDragon = activePlayerPos.distanceTo(dragon.group.position);
      if (dragon.isMounted) {
        btnMount.classList.remove('hidden');
        btnMount.innerText = '🛑 Desmontar';
      } else if (!moto.isMounted && distDragon <= 10.0) {
        btnMount.classList.remove('hidden');
        btnMount.innerText = '🐉 Montar (Botão X)';
      } else {
        btnMount.classList.add('hidden');
      }
    }

    // Atualiza botão de Pilotar a Moto
    if (moto && moto.isLoaded && btnRide) {
      const distMoto = activePlayerPos.distanceTo(moto.group.position);
      if (moto.isMounted) {
        btnRide.classList.remove('hidden');
        btnRide.innerText = '🛑 Descer da Moto (E / X)';
      } else if (!dragon.isMounted && distMoto <= 4.5) {
        btnRide.classList.remove('hidden');
        btnRide.innerText = '🏍️ Pilotar (E / X)';
      } else {
        btnRide.classList.add('hidden');
      }
    }

    // Esconde botões de Dançar/Comemorar quando estiver voando ou pilotando
    if (dragon.isMounted || moto.isMounted) {
      actionBtns.forEach((btn) => btn.classList.add('hidden'));
    } else {
      actionBtns.forEach((btn) => btn.classList.remove('hidden'));
    }

    // Atualização de Movimento (Dragão vs Moto vs A Pé)
    if (dragon && dragon.isMounted) {
      dragon.update(delta, player, input, orbitCamera.yaw, dogs);
      moto.update(delta, player, input);
    } else if (moto && moto.isMounted) {
      moto.update(delta, player, input);
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
      moto.update(delta, player, input);

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

window.triggerAnim = (animName) => {
  if ((dragon && dragon.isMounted) || (moto && moto.isMounted)) return;
  if (player && player.ready && !pauseMenu.isPaused) {
    player.playTrigger(animName);
  }
};