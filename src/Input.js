export class Input {
  constructor() {
    this.keys = { w: false, a: false, s: false, d: false, shift: false };
    this.joystick = { x: 0, y: 0 };
    this.prevButtons = [];

    // Estado inteligente: Descobre o que o jogador está usando ('touch', 'keyboard' ou 'gamepad')
    this.currentMode = null;

    // Captura a zona do joystick no HTML
    this.joystickZone = document.getElementById('joystick-zone');

    this._initKeyboard();
    this._initTouchJoystick();
  }

  // ==========================================
  // TROCA DINÂMICA DE CONTROLES
  // ==========================================
  setMode(mode) {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    console.log('[Input] Dispositivo detectado:', mode);

    if (this.joystickZone) {
      if (mode === 'touch') {
        this.joystickZone.style.opacity = '1';
        this.joystickZone.style.pointerEvents = 'auto';
      } else {
        this.joystickZone.style.opacity = '0';
        this.joystickZone.style.pointerEvents = 'none';
      }
    }
  }

  // ==========================================
  // TECLADO (NATURAL + SUPORTE A SETAS E BLOQUEIO DE ATALHOS CHROME)
  // ==========================================
  _normalizeKey(e) {
    const k = (e.key || '').toLowerCase();
    const c = (e.code || '').toLowerCase();

    if (k === 'w' || c === 'keyw' || k === 'arrowup' || c === 'arrowup') return 'w';
    if (k === 's' || c === 'keys' || k === 'arrowdown' || c === 'arrowdown') return 's';
    if (k === 'a' || c === 'keya' || k === 'arrowleft' || c === 'arrowleft') return 'a';
    if (k === 'd' || c === 'keyd' || k === 'arrowright' || c === 'arrowright') return 'd';
    if (k === 'shift' || c.includes('shift')) return 'shift';
    return null;
  }

  _initKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.setMode('keyboard');
      const mapped = this._normalizeKey(e);

      if (mapped) {
        this.keys[mapped] = true;
        // Impede que Setas rolem a página ou que Ctrl/Alt + A/S/D abram atalhos do Chrome
        if (e.ctrlKey || e.altKey || e.key.startsWith('Arrow')) {
          e.preventDefault();
        }
      }

      // Bloqueia atalhos do Chrome também nas teclas de ação do jogo (E, F, G)
      const k = (e.key || '').toLowerCase();
      if ((e.ctrlKey || e.altKey) && (k === 'e' || k === 'f' || k === 'g')) {
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener('keyup', (e) => {
      const mapped = this._normalizeKey(e);
      if (mapped) {
        this.keys[mapped] = false;
      }
    });

    // Se trocar de janela, limpa as teclas para o boneco não ficar andando sozinho
    window.addEventListener('blur', () => {
      this.keys.w = false;
      this.keys.a = false;
      this.keys.s = false;
      this.keys.d = false;
      this.keys.shift = false;
    });
  }

  // ==========================================
  // JOYSTICK VIRTUAL (MOBILE)
  // ==========================================
  _initTouchJoystick() {
    if (!this.joystickZone) return;

    let knob = this.joystickZone.querySelector('.knob');
    if (!knob) {
      knob = document.createElement('div');
      knob.className = 'knob';
      knob.style.width = '50px';
      knob.style.height = '50px';
      knob.style.backgroundColor = 'rgba(255, 255, 255, 0.7)';
      knob.style.borderRadius = '50%';
      knob.style.position = 'absolute';
      knob.style.top = '50%';
      knob.style.left = '50%';
      knob.style.transform = 'translate(-50%, -50%)';
      knob.style.pointerEvents = 'none';

      this.joystickZone.style.position = 'relative';
      this.joystickZone.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
      this.joystickZone.style.borderRadius = '50%';
      this.joystickZone.appendChild(knob);
    }

    let isDragging = false;
    let maxRadius = 0;
    let centerX = 0, centerY = 0;

    const updateCenter = () => {
      const rect = this.joystickZone.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      maxRadius = (rect.width / 2) || 60;
    };

    const onStart = (e) => {
      this.setMode('touch');
      isDragging = true;
      updateCenter();
      onMove(e);
    };

    const onMove = (e) => {
      if (!isDragging) return;
      if (e.cancelable) e.preventDefault();

      knob.style.transition = 'none';
      const touch = e.touches[0];

      let dx = touch.clientX - centerX;
      let dy = touch.clientY - centerY;
      const distance = Math.hypot(dx, dy);

      if (distance > maxRadius) {
        dx = (dx / distance) * maxRadius;
        dy = (dy / distance) * maxRadius;
      }

      this.joystick.x = dx / maxRadius;
      this.joystick.y = dy / maxRadius;

      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };

    const onEnd = () => {
      isDragging = false;
      this.joystick.x = 0;
      this.joystick.y = 0;

      knob.style.transition = 'transform 0.2s ease-out';
      knob.style.transform = 'translate(-50%, -50%)';
    };

    document.addEventListener('touchstart', (e) => {
      if (e.touches && e.touches.length > 0) this.setMode('touch');
    }, { passive: true });

    this.joystickZone.addEventListener('touchstart', onStart, { passive: false });
    this.joystickZone.addEventListener('touchmove', onMove, { passive: false });
    this.joystickZone.addEventListener('touchend', onEnd);
    this.joystickZone.addEventListener('touchcancel', onEnd);
  }

  // ==========================================
  // CONTROLE DO XBOX (GAMEPAD)
  // ==========================================
  getGamepad() {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i] && gamepads[i].connected) return gamepads[i];
    }
    return null;
  }

  getMovement() {
    let forward = 0;
    let right = 0;
    let isRunning = this.keys.shift;

    // 1. Processa Teclado (W/A/S/D ou Setas ↑/↓/←/→)
    if (this.keys.w) forward += 1;
    if (this.keys.s) forward -= 1;
    if (this.keys.a) right -= 1;
    if (this.keys.d) right += 1;

    // 2. Processa Celular (Joystick Virtual)
    if (this.joystick.y !== 0) forward = -this.joystick.y;
    if (this.joystick.x !== 0) right = this.joystick.x;

    // 3. Processa Controle de Xbox
    const pad = this.getGamepad();
    if (pad) {
      if (Math.abs(pad.axes[0]) > 0.1 || Math.abs(pad.axes[1]) > 0.1 || pad.buttons.some((b) => b.pressed)) {
        this.setMode('gamepad');
      }

      if (Math.abs(pad.axes[1]) > 0.1) forward -= pad.axes[1];
      if (Math.abs(pad.axes[0]) > 0.1) right += pad.axes[0];

      if (pad.buttons[7]?.pressed || pad.buttons[6]?.pressed || pad.buttons[10]?.pressed) {
        isRunning = true;
      }
    }

    // Normaliza a caminhada na diagonal para não andar o dobro da velocidade
    const len = Math.hypot(forward, right);
    if (len > 1.0) {
      forward /= len;
      right /= len;
    }

    return { forward, right, isRunning };
  }

  getGamepadState() {
    const pad = this.getGamepad();
    if (!pad) return null;

    const state = {
      camX: Math.abs(pad.axes[2]) > 0.1 ? pad.axes[2] : 0,
      camY: Math.abs(pad.axes[3]) > 0.1 ? pad.axes[3] : 0,
      btnA: this._isButtonPressed(pad, 0),
      btnB: this._isButtonPressed(pad, 1),
      btnX: this._isButtonPressed(pad, 2),
      btnY: this._isButtonPressed(pad, 3),
      btnStart: this._isButtonPressed(pad, 9)
    };

    this.prevButtons = pad.buttons.map((b) => b.pressed);
    return state;
  }

  _isButtonPressed(pad, index) {
    if (!pad.buttons[index]) return false;
    const isPressed = pad.buttons[index].pressed;
    const wasPressed = this.prevButtons[index] || false;
    return isPressed && !wasPressed;
  }
}