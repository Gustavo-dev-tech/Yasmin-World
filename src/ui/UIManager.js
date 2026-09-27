import * as THREE from 'three';
import GUI from 'lil-gui';
import { MainMenu } from './MainMenu.js';
import { PauseMenu } from './PauseMenu.js';

export class UIManager {
  constructor({ player, dragon, moto, dogs, loja, input, orbitCamera, water, dayNight }) {
    this.player = player;
    this.dragon = dragon;
    this.moto = moto;
    this.dogs = dogs;
    this.loja = loja;
    this.input = input;
    this.orbitCamera = orbitCamera;
    this.water = water;
    this.dayNight = dayNight;

    this.isGameStarted = false;
    this.lastPadTime = 0;

    // Elementos do DOM
    this.uiContainer = document.getElementById('ui-container');
    this.actionsPanel = document.getElementById('actions-panel');
    this.modalControls = document.getElementById('modal-controls');
    this.charSelectDiv = document.getElementById('character-select-menu');
    this.mainMenuDiv = document.getElementById('main-menu');
    this.btnMount = document.getElementById('btn-mount');
    this.btnRide = document.getElementById('btn-ride');
    this.btnHeadlight = document.getElementById('btn-headlight');

    if (this.uiContainer) this.uiContainer.classList.add('hidden');
    if (this.actionsPanel) this.actionsPanel.classList.add('hidden');

    this._initMenus();
    this._initWaterGUI();
    this._bindEvents();
  }

  get isPaused() {
    return this.pauseMenu ? this.pauseMenu.isPaused : false;
  }

  _initMenus() {
    this.pauseMenu = new PauseMenu({
      onResume: () => console.log('[Game] Jogo Retomado'),
      onOpenControls: () => {
        if (this.modalControls) this.modalControls.classList.remove('hidden');
      },
      onMainMenu: () => {
        this.isGameStarted = false;
        this.pauseMenu.canPause = false;
        this.mainMenu.show();
        if (this.uiContainer) this.uiContainer.classList.add('hidden');
        if (this.actionsPanel) this.actionsPanel.classList.add('hidden');
      }
    });

    this.mainMenu = new MainMenu({
      onStartGame: () => {
        if (this.charSelectDiv) this.charSelectDiv.classList.remove('hidden');
      }
    });
  }

  _initWaterGUI() {
    if (!this.water) return;
    this.waterGui = new GUI({ title: '🌊 Oceano & Clima (Tecla G)' });
    this.water.attachGUI(this.waterGui, this.dayNight);
    this.waterGui.close();
  }

  _bindEvents() {
    // Evento de compra/equipamento na Loja
    window.addEventListener('roupaComprada', async (e) => {
      const outfit = e.detail;
      if (this.player && this.player.ready) {
        const feedback = document.getElementById('shop-feedback');
        if (feedback) feedback.innerText = 'Equipando...';

        await this.player.changeOutfit(outfit);

        if (feedback) {
          feedback.innerText = 'Item equipado!';
          setTimeout(() => { feedback.innerText = ''; }, 1500);
        }
        this.loja.close();
      }
    });

    // Botões de Montar, Pilotar e Farol
    if (this.btnMount) {
      this.btnMount.addEventListener('click', () => {
        if (this.dragon && !this.moto.isMounted) {
          this.dragon.toggleMount(this.player, this.dogs);
        }
      });
    }

    if (this.btnRide) {
      this.btnRide.addEventListener('click', () => {
        if (this.moto && !this.dragon.isMounted) {
          this.moto.toggleMount(this.player, this.dogs);
        }
      });
    }

    if (this.btnHeadlight) {
      this.btnHeadlight.addEventListener('click', () => {
        if (this.moto && this.moto.isLoaded) {
          this.moto.toggleHeadlight();
        }
      });
    }

    // Atalhos de Teclado Unificados (G = GUI da Água, E = Subir na Moto, F = Farol)
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();

      if (key === 'g' && this.waterGui) {
        this.waterGui._hidden ? this.waterGui.show() : this.waterGui.hide();
        return;
      }

      if (!this.isGameStarted || this.isPaused || this.loja.shopActive) return;

      if (key === 'e' && this.moto && this.moto.isLoaded && !this.dragon.isMounted) {
        const activePos = this.moto.isMounted ? this.moto.group.position : this.player.group.position;
        const dist = activePos.distanceTo(this.moto.group.position);
        if (this.moto.isMounted || dist <= 4.5) {
          this.moto.toggleMount(this.player, this.dogs);
        }
      }

      if (key === 'f' && this.moto && this.moto.isLoaded && this.moto.isMounted) {
        this.moto.toggleHeadlight();
      }
    });

    // Funções Globais chamadas pelo HTML (Escolha de Personagem e Botões de Dança)
    window.selectCharacter = async (charId) => {
      if (this.charSelectDiv) this.charSelectDiv.classList.add('hidden');
      if (this.mainMenuDiv) this.mainMenuDiv.classList.add('hidden');

      if (this.player && this.player.ready) {
        await this.player.changeOutfit(charId);
      }

      this.isGameStarted = true;
      this.pauseMenu.canPause = true;

      if (this.uiContainer) this.uiContainer.classList.remove('hidden');
      if (this.actionsPanel) this.actionsPanel.classList.remove('hidden');

      console.log(`[Game] Jogo Iniciado com: ${charId.toUpperCase()}!`);
    };

    window.triggerAnim = (animName) => {
      if ((this.dragon && this.dragon.isMounted) || (this.moto && this.moto.isMounted)) return;
      if (this.player && this.player.ready && !this.isPaused) {
        this.player.playTrigger(animName);
      }
    };
  }

  // Atualiza Controle Xbox (Loja, Câmera e Botões X/Y)
  updateGamepad(elapsed, activePlayerPos) {
    const padState = this.input.getGamepadState();
    if (!padState || !this.isGameStarted || this.isPaused) return;

    if (this.loja.shopActive) {
      if (elapsed - this.lastPadTime > 0.2) {
        const btns = Array.from(document.querySelectorAll('.shop-btn, #btn-close-shop'));
        let activeIdx = btns.findIndex((b) => b === document.activeElement);

        const gamepad = this.input.getGamepad();
        const yAxis = gamepad ? gamepad.axes[1] : 0;

        if (padState.camY > 0.5 || yAxis > 0.5) {
          activeIdx = (activeIdx + 1) % btns.length;
          btns[activeIdx].focus();
          this.lastPadTime = elapsed;
        } else if (padState.camY < -0.5 || yAxis < -0.5) {
          activeIdx = (activeIdx - 1 + btns.length) % btns.length;
          btns[activeIdx].focus();
          this.lastPadTime = elapsed;
        }
      }

      if (padState.btnA && document.activeElement) document.activeElement.click();
      if (padState.btnB) this.loja.close();
    } else {
      this.orbitCamera.yaw -= padState.camX * 0.05;
      this.orbitCamera.pitch = THREE.MathUtils.clamp(
        this.orbitCamera.pitch - padState.camY * 0.03,
        this.orbitCamera.minPitch,
        this.orbitCamera.maxPitch
      );

      if (padState.btnX) {
        const distMoto = this.moto && this.moto.isLoaded ? activePlayerPos.distanceTo(this.moto.group.position) : Infinity;
        const distDragon = this.dragon && this.dragon.isLoaded ? activePlayerPos.distanceTo(this.dragon.group.position) : Infinity;

        if (this.moto && (this.moto.isMounted || (distMoto <= 4.5 && !this.dragon.isMounted))) {
          this.moto.toggleMount(this.player, this.dogs);
        } else if (this.dragon && (this.dragon.isMounted || (distDragon <= 10.0 && !this.moto.isMounted))) {
          this.dragon.toggleMount(this.player, this.dogs);
        }
      }

      if (padState.btnY && this.player && !this.dragon.isMounted && !this.moto.isMounted) {
        this.player.playTrigger('dance');
      }
    }
  }

  // Atualiza visibilidade dos botões de Montar, Pilotar, Farol e Dançar
  updateHUDButtons(activePlayerPos) {
    const actionBtns = this.actionsPanel
      ? this.actionsPanel.querySelectorAll('button:not(#btn-mount):not(#btn-ride):not(#btn-headlight):not(#btn-pause)')
      : [];

    // 1. Botão do Dragão
    if (this.dragon && this.dragon.isLoaded && this.btnMount) {
      const distDragon = activePlayerPos.distanceTo(this.dragon.group.position);
      if (this.dragon.isMounted) {
        this.btnMount.classList.remove('hidden');
        this.btnMount.innerText = '🛑 Desmontar';
      } else if (!this.moto.isMounted && distDragon <= 10.0) {
        this.btnMount.classList.remove('hidden');
        this.btnMount.innerText = '🐉 Montar (Botão X)';
      } else {
        this.btnMount.classList.add('hidden');
      }
    }

    // 2. Botões da Moto (Pilotar + Farol LED)
    if (this.moto && this.moto.isLoaded && this.btnRide) {
      const distMoto = activePlayerPos.distanceTo(this.moto.group.position);
      if (this.moto.isMounted) {
        this.btnRide.classList.remove('hidden');
        this.btnRide.innerText = '🛑 Descer da Moto (E / X)';
        if (this.btnHeadlight) {
          this.btnHeadlight.classList.remove('hidden');
          this.btnHeadlight.innerText = this.moto.headlightOn ? '💡 Farol: ON (F)' : '💡 Farol: OFF (F)';
          this.btnHeadlight.style.borderColor = this.moto.headlightOn ? '#ffd700' : 'rgba(255,255,255,0.25)';
        }
      } else if (!this.dragon.isMounted && distMoto <= 4.5) {
        this.btnRide.classList.remove('hidden');
        this.btnRide.innerText = '🏍️ Pilotar (E / X)';
        if (this.btnHeadlight) this.btnHeadlight.classList.add('hidden');
      } else {
        this.btnRide.classList.add('hidden');
        if (this.btnHeadlight) this.btnHeadlight.classList.add('hidden');
      }
    }

    // 3. Botões de Dançar/Comemorar
    if (this.dragon.isMounted || this.moto.isMounted) {
      actionBtns.forEach((btn) => btn.classList.add('hidden'));
    } else {
      actionBtns.forEach((btn) => btn.classList.remove('hidden'));
    }
  }
}