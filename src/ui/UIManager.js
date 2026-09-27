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
    this.currentCharacterId = 'yasmin'; // Yasmin já é carregada por padrão no boot

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

    this._initTopLoadingBar();
    this._initMenus();
    this._initWaterGUI();
    this._bindEvents();
  }

  get isPaused() {
    return this.pauseMenu ? this.pauseMenu.isPaused : false;
  }

  // =========================================================================
  // BARRA DE CARREGAMENTO SUPERIOR (SEM DESCRIÇÃO / APENAS VISUAL)
  // =========================================================================
  _initTopLoadingBar() {
    const barContainer = document.createElement('div');
    barContainer.id = 'top-loading-bar-container';
    barContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 5px;
      background: rgba(255, 255, 255, 0.08);
      z-index: 99999;
      pointer-events: none;
      transition: opacity 0.5s ease;
      opacity: 1;
    `;

    const barFill = document.createElement('div');
    barFill.id = 'top-loading-bar-fill';
    barFill.style.cssText = `
      width: 5%;
      height: 100%;
      background: linear-gradient(90deg, #00f2fe 0%, #4facfe 50%, #ffd700 100%);
      box-shadow: 0 0 12px rgba(79, 172, 254, 0.9), 0 0 6px rgba(255, 215, 0, 0.8);
      transition: width 0.25s ease-out;
    `;

    barContainer.appendChild(barFill);
    document.body.appendChild(barContainer);

    this.loadingBarContainer = barContainer;
    this.loadingBarFill = barFill;
    this.isWorldLoaded = false;

    // Monitora automaticamente todos os modelos GLB, FBX e texturas do Three.js
    THREE.DefaultLoadingManager.onStart = () => {
      this.showLoadingBar(15);
    };

    THREE.DefaultLoadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      if (itemsTotal > 0) {
        const pct = Math.min(100, Math.max(8, (itemsLoaded / itemsTotal) * 100));
        this.showLoadingBar(pct);
      }
    };

    THREE.DefaultLoadingManager.onLoad = () => {
      this.isWorldLoaded = true;
      this.showLoadingBar(100);
      setTimeout(() => {
        if (this.loadingBarContainer) {
          this.loadingBarContainer.style.opacity = '0';
        }
      }, 450);
    };
  }

  showLoadingBar(percent) {
    if (!this.loadingBarContainer || !this.loadingBarFill) return;
    this.loadingBarContainer.style.opacity = '1';
    this.loadingBarFill.style.width = `${percent}%`;
  }

  hideLoadingBar() {
    if (!this.loadingBarContainer || !this.loadingBarFill) return;
    this.loadingBarFill.style.width = '100%';
    setTimeout(() => {
      this.loadingBarContainer.style.opacity = '0';
    }, 350);
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

  // Aguarda o modelo base terminar de carregar caso o usuário clique muito rápido no menu
  async _waitForPlayerReady() {
    if (this.player && this.player.ready) return;
    this.showLoadingBar(65);
    await new Promise((resolve) => {
      const check = setInterval(() => {
        if (this.player && this.player.ready) {
          clearInterval(check);
          resolve();
        }
      }, 60);
    });
  }

  _bindEvents() {
    window.addEventListener('roupaComprada', async (e) => {
      const outfit = e.detail;
      if (this.player && this.player.ready) {
        const feedback = document.getElementById('shop-feedback');
        if (feedback) feedback.innerText = 'Equipando...';

        this.showLoadingBar(40);
        await this.player.changeOutfit(outfit);
        this.hideLoadingBar();

        if (feedback) {
          feedback.innerText = 'Item equipado!';
          setTimeout(() => { feedback.innerText = ''; }, 1500);
        }
        this.loja.close();
      }
    });

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

    window.addEventListener('keydown', (e) => {
      const key = (e.key || '').toLowerCase();

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

    // Seleção de Personagem Otimizada (Sem recarregar a Yasmin duas vezes!)
    window.selectCharacter = async (charId) => {
      const targetChar = (charId || 'yasmin').toLowerCase();

      // Garante que o carregamento inicial em segundo plano terminou
      await this._waitForPlayerReady();

      // Só chama changeOutfit se o jogador escolheu um personagem DIFERENTE do que já está na cena
      if (targetChar !== this.currentCharacterId) {
        this.showLoadingBar(50);
        await this.player.changeOutfit(targetChar);
        this.currentCharacterId = targetChar;
        this.hideLoadingBar();
      } else {
        this.hideLoadingBar();
      }

      if (this.charSelectDiv) this.charSelectDiv.classList.add('hidden');
      if (this.mainMenuDiv) this.mainMenuDiv.classList.add('hidden');

      this.isGameStarted = true;
      this.pauseMenu.canPause = true;

      if (this.uiContainer) this.uiContainer.classList.remove('hidden');
      if (this.actionsPanel) this.actionsPanel.classList.remove('hidden');

      // Garante o foco da janela para receber comandos de teclado (especialmente via AnyDesk)
      window.focus();
      console.log(`[Game] Jogo Iniciado com: ${targetChar.toUpperCase()}!`);
    };

    window.triggerAnim = (animName) => {
      if ((this.dragon && this.dragon.isMounted) || (this.moto && this.moto.isMounted)) return;
      if (this.player && this.player.ready && !this.isPaused) {
        this.player.playTrigger(animName);
      }
    };
  }

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

  updateHUDButtons(activePlayerPos) {
    const actionBtns = this.actionsPanel
      ? this.actionsPanel.querySelectorAll('button:not(#btn-mount):not(#btn-ride):not(#btn-headlight):not(#btn-pause)')
      : [];

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

    if (this.dragon.isMounted || this.moto.isMounted) {
      actionBtns.forEach((btn) => btn.classList.add('hidden'));
    } else {
      actionBtns.forEach((btn) => btn.classList.remove('hidden'));
    }
  }
}