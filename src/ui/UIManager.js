import * as THREE from 'three';
import GUI from 'lil-gui';
import { MainMenu } from './MainMenu.js';
import { PauseMenu } from './PauseMenu.js';

export class UIManager {
  constructor({ player, dragon, moto, dogs, loja, input, orbitCamera, water, ground, dayNight }) {
    this.player = player;
    this.dragon = dragon;
    this.moto = moto;
    this.dogs = dogs;
    this.loja = loja;
    this.input = input;
    this.orbitCamera = orbitCamera;
    this.water = water;
    this.ground = ground;
    this.dayNight = dayNight;

    this.isGameStarted = false;
    this.lastPadTime = 0;
    this.currentCharacterId = 'yasmin';

    // Elementos do DOM
    this.uiContainer = document.getElementById('ui-container');
    this.actionsPanel = document.getElementById('actions-panel');
    this.modalControls = document.getElementById('modal-controls');
    this.charSelectDiv = document.getElementById('character-select-menu');
    this.mainMenuDiv = document.getElementById('main-menu');
    this.btnMount = document.getElementById('btn-mount');
    this.btnRide = document.getElementById('btn-ride');
    this.btnHeadlight = document.getElementById('btn-headlight');

    // Cria automaticamente os botões de Chamar Dragão e Buzina se não existirem no index.html
    this._ensureExtraHUDButtons();

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
  // CRIA OS BOTÕES DE CHAMAR DRAGÃO E BUZINA DA MOTO NO HUD AUTOMATICAMENTE
  // =========================================================================
  _ensureExtraHUDButtons() {
    if (!this.actionsPanel) return;

    // 1. Botão de Chamar o Dragão (C)
    this.btnSummonDragon = document.getElementById('btn-summon-dragon');
    if (!this.btnSummonDragon) {
      this.btnSummonDragon = document.createElement('button');
      this.btnSummonDragon.id = 'btn-summon-dragon';
      this.btnSummonDragon.className = this.btnMount ? this.btnMount.className : 'action-btn hidden';
      this.btnSummonDragon.classList.add('hidden');
      this.btnSummonDragon.innerText = '🐉 Chamar Dragão (C)';
      this.actionsPanel.appendChild(this.btnSummonDragon);
    }

    // 2. Botão de Buzina da Moto (H)
    this.btnHorn = document.getElementById('btn-horn');
    if (!this.btnHorn) {
      this.btnHorn = document.createElement('button');
      this.btnHorn.id = 'btn-horn';
      this.btnHorn.className = this.btnHeadlight ? this.btnHeadlight.className : 'action-btn hidden';
      this.btnHorn.classList.add('hidden');
      this.btnHorn.innerText = '🔊 Buzinar (H)';
      this.actionsPanel.appendChild(this.btnHorn);
    }
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
    if (!this.water && !this.ground) return;
    this.waterGui = new GUI({ title: '🌍 Mundo, Oceano & Clima (Tecla G)' });
    if (this.water) this.water.attachGUI(this.waterGui, this.dayNight);
    if (this.ground) this.ground.attachGUI(this.waterGui, null, this.water);
    this.waterGui.close();
  }

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

    // Clique no botão de Chamar o Dragão
    if (this.btnSummonDragon) {
      this.btnSummonDragon.addEventListener('click', () => {
        if (this.dragon && this.dragon.isLoaded && !this.dragon.isMounted && !this.moto.isMounted) {
          this.dragon.summon(this.player.group.position, this.orbitCamera.yaw);
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

    // Botão de Buzina da Moto (Funciona segurando no mouse/celular ou dando um clique)
    if (this.btnHorn) {
      const startH = (e) => {
        e.preventDefault();
        if (this.moto && this.moto.isMounted) this.moto.startHorn();
      };
      const stopH = () => {
        if (this.moto) this.moto.stopHorn();
      };
      this.btnHorn.addEventListener('mousedown', startH);
      this.btnHorn.addEventListener('mouseup', stopH);
      this.btnHorn.addEventListener('mouseleave', stopH);
      this.btnHorn.addEventListener('touchstart', startH, { passive: false });
      this.btnHorn.addEventListener('touchend', stopH);
      this.btnHorn.addEventListener('touchcancel', stopH);
    }

    window.addEventListener('keydown', (e) => {
      const key = (e.key || '').toLowerCase();

      if (key === 'g' && this.waterGui) {
        this.waterGui._hidden ? this.waterGui.show() : this.waterGui.hide();
        return;
      }

      if (!this.isGameStarted || this.isPaused || this.loja.shopActive) return;

      // Tecla C: Chamar o Dragão
      if (key === 'c' && this.dragon && this.dragon.isLoaded && !this.dragon.isMounted && !this.moto.isMounted) {
        this.dragon.summon(this.player.group.position, this.orbitCamera.yaw);
      }

      // Tecla E: Montar/Desmontar da Moto ou do Dragão (o que estiver mais perto)
      if (key === 'e' && !e.repeat) {
        const activePos = this.moto?.isMounted
          ? this.moto.group.position
          : this.dragon?.isMounted
          ? this.dragon.group.position
          : this.player.group.position;

        if (this.moto && this.moto.isMounted) {
          this.moto.toggleMount(this.player, this.dogs);
          return;
        }
        if (this.dragon && this.dragon.isMounted) {
          this.dragon.toggleMount(this.player, this.dogs);
          return;
        }

        const distMoto = this.moto && this.moto.isLoaded ? activePos.distanceTo(this.moto.group.position) : Infinity;
        const distDragon = this.dragon && this.dragon.isLoaded ? activePos.distanceTo(this.dragon.group.position) : Infinity;

        if (distMoto <= 4.5 && distMoto <= distDragon) {
          this.moto.toggleMount(this.player, this.dogs);
        } else if (distDragon <= 12.0) {
          this.dragon.toggleMount(this.player, this.dogs);
        }
      }

      // Tecla F: Farol da Moto
      if (key === 'f' && !e.repeat && this.moto && this.moto.isLoaded && this.moto.isMounted) {
        this.moto.toggleHeadlight();
      }

      // Tecla H: Buzina da Moto (Segurar)
      if (key === 'h' && this.moto && this.moto.isLoaded && this.moto.isMounted) {
        this.moto.startHorn();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = (e.key || '').toLowerCase();
      if (key === 'h' && this.moto) {
        this.moto.stopHorn();
      }
    });

    window.selectCharacter = async (charId) => {
      const targetChar = (charId || 'yasmin').toLowerCase();

      await this._waitForPlayerReady();

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
        } else if (this.dragon && (this.dragon.isMounted || (distDragon <= 12.0 && !this.moto.isMounted))) {
          this.dragon.toggleMount(this.player, this.dogs);
        }
      }

      // Botão Y no Controle Xbox: Buzina se estiver na Moto, ou Chama o Dragão se estiver a pé!
      if (padState.btnY) {
        if (this.moto && this.moto.isMounted) {
          this.moto.triggerHornBeep(260);
        } else if (this.dragon && !this.dragon.isMounted) {
          this.dragon.summon(this.player.group.position, this.orbitCamera.yaw);
        }
      }
    }
  }

  updateHUDButtons(activePlayerPos) {
    const actionBtns = this.actionsPanel
      ? this.actionsPanel.querySelectorAll(
          'button:not(#btn-mount):not(#btn-summon-dragon):not(#btn-ride):not(#btn-headlight):not(#btn-horn):not(#btn-pause)'
        )
      : [];

    // 1. Botões do Dragão (Montar vs Chamar Dragão)
    if (this.dragon && this.dragon.isLoaded) {
      const distDragon = activePlayerPos.distanceTo(this.dragon.group.position);

      if (this.dragon.isMounted) {
        if (this.btnMount) {
          this.btnMount.classList.remove('hidden');
          this.btnMount.innerText = '🛑 Desmontar (E / X)';
        }
        if (this.btnSummonDragon) this.btnSummonDragon.classList.add('hidden');
      } else if (!this.moto.isMounted && distDragon <= 12.0) {
        if (this.btnMount) {
          this.btnMount.classList.remove('hidden');
          this.btnMount.innerText = '🐉 Montar no Dragão (E / X)';
        }
        if (this.btnSummonDragon) this.btnSummonDragon.classList.add('hidden');
      } else if (!this.moto.isMounted) {
        if (this.btnMount) this.btnMount.classList.add('hidden');
        if (this.btnSummonDragon) {
          this.btnSummonDragon.classList.remove('hidden');
          this.btnSummonDragon.innerText = this.dragon.isSummoned
            ? '🐉 Dragão descendo...'
            : '🐉 Chamar Dragão (C)';
        }
      } else {
        if (this.btnMount) this.btnMount.classList.add('hidden');
        if (this.btnSummonDragon) this.btnSummonDragon.classList.add('hidden');
      }
    }

    // 2. Botões da Moto (Pilotar, Farol e Buzina)
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
        if (this.btnHorn) {
          this.btnHorn.classList.remove('hidden');
          this.btnHorn.style.borderColor = this.moto.isHonking ? '#00f2fe' : 'rgba(255,255,255,0.25)';
        }
      } else if (!this.dragon.isMounted && distMoto <= 4.5) {
        this.btnRide.classList.remove('hidden');
        this.btnRide.innerText = '🏍️ Pilotar (E / X)';
        if (this.btnHeadlight) this.btnHeadlight.classList.add('hidden');
        if (this.btnHorn) this.btnHorn.classList.add('hidden');
      } else {
        this.btnRide.classList.add('hidden');
        if (this.btnHeadlight) this.btnHeadlight.classList.add('hidden');
        if (this.btnHorn) this.btnHorn.classList.add('hidden');
      }
    }

    if (this.dragon.isMounted || this.moto.isMounted) {
      actionBtns.forEach((btn) => btn.classList.add('hidden'));
    } else {
      actionBtns.forEach((btn) => btn.classList.remove('hidden'));
    }
  }
}