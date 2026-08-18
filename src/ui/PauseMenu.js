export class PauseMenu {
  constructor({ onResume, onOpenControls, onMainMenu }) {
    this.onResume = onResume;
    this.onOpenControls = onOpenControls;
    this.onMainMenu = onMainMenu;

    this.pauseEl = document.getElementById('pause-menu');
    this.btnResume = document.getElementById('btn-resume');
    this.btnPauseControls = document.getElementById('btn-pause-controls');
    this.btnMainMenu = document.getElementById('btn-main-menu');
    this.btnPauseHUD = document.getElementById('btn-pause');

    this.isPaused = false;
    this.canPause = false; // Só permite pausar quando o jogo já começou

    this._bindEvents();
  }

  _bindEvents() {
    // Botão de Pause na HUD
    if (this.btnPauseHUD) {
      this.btnPauseHUD.addEventListener('click', () => this.toggle());
    }

    // Botões do Modal de Pause
    if (this.btnResume) {
      this.btnResume.addEventListener('click', () => this.resume());
    }

    if (this.btnPauseControls) {
      this.btnPauseControls.addEventListener('click', () => {
        if (this.onOpenControls) this.onOpenControls();
      });
    }

    if (this.btnMainMenu) {
      this.btnMainMenu.addEventListener('click', () => {
        this.hide();
        if (this.onMainMenu) this.onMainMenu();
      });
    }

    // Atalhos no Teclado (ESC ou P)
    window.addEventListener('keydown', (e) => {
      if (!this.canPause) return;
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        this.toggle();
      }
    });
  }

  toggle() {
    if (!this.canPause) return;
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  pause() {
    if (!this.canPause) return;
    this.isPaused = true;
    if (this.pauseEl) this.pauseEl.classList.remove('hidden');
  }

  resume() {
    this.isPaused = false;
    if (this.pauseEl) this.pauseEl.classList.add('hidden');
    if (this.onResume) this.onResume();
  }

  hide() {
    this.isPaused = false;
    if (this.pauseEl) this.pauseEl.classList.add('hidden');
  }
}