export class MainMenu {
  constructor({ onStartGame }) {
    this.onStartGame = onStartGame;

    this.menuEl = document.getElementById('main-menu');
    this.btnStart = document.getElementById('btn-start');
    this.btnControls = document.getElementById('btn-controls');
    this.btnCredits = document.getElementById('btn-credits');

    this.modalControls = document.getElementById('modal-controls');
    this.modalCredits = document.getElementById('modal-credits');
    this.btnCloseControls = document.getElementById('btn-close-controls');
    this.btnCloseCredits = document.getElementById('btn-close-credits');

    this.isOpen = true;

    this._bindEvents();
  }

  _bindEvents() {
    // Iniciar o jogo
    this.btnStart.addEventListener('click', () => {
      this.hide();
      if (this.onStartGame) this.onStartGame();
    });

    // Modais
    this.btnControls.addEventListener('click', () => {
      this.modalControls.classList.remove('hidden');
    });

    this.btnCloseControls.addEventListener('click', () => {
      this.modalControls.classList.add('hidden');
    });

    this.btnCredits.addEventListener('click', () => {
      this.modalCredits.classList.remove('hidden');
    });

    this.btnCloseCredits.addEventListener('click', () => {
      this.modalCredits.classList.add('hidden');
    });
  }

  hide() {
    this.menuEl.classList.add('hidden');
    this.isOpen = false;
  }

  show() {
    this.menuEl.classList.remove('hidden');
    this.isOpen = true;
  }
}