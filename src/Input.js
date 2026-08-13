export class Input {
  constructor() {
    this.keys = new Set();
    this.joyForward = 0;
    this.joyRight = 0;
    this.joyForce = 0;
    this.joystickActive = false;

    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    window.addEventListener('blur', () => this._resetAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._resetAll();
    });

    window.addEventListener('pointerup', () => this._endJoystick());
    window.addEventListener('pointercancel', () => this._endJoystick());
    window.addEventListener('mouseup', () => this._endJoystick());
    window.addEventListener('touchend', () => this._endJoystick());

    this._setupJoystick();
  }

  _resetAll() {
    this.keys.clear();
    this._endJoystick();
  }

  _endJoystick() {
    this.joystickActive = false;
    this.joyForward = 0;
    this.joyRight = 0;
    this.joyForce = 0;
  }

  _setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    if (!zone || typeof nipplejs === 'undefined') return;

    const joystick = nipplejs.create({
      zone,
      mode: 'static',
      position: { left: '80px', bottom: '80px' },
      color: 'white',
      size: 100,
    });

    joystick.on('start', () => {
      this.joystickActive = true;
    });

    joystick.on('move', (evt, data) => {
      this.joystickActive = true;
      const angle = data.angle.radian;
      this.joyForce = Math.min(data.force, 1);
      this.joyForward = Math.sin(angle) * this.joyForce;
      this.joyRight = Math.cos(angle) * this.joyForce;
    });

    joystick.on('end', () => this._endJoystick());
  }

  getMovement() {
    let forward = this.joystickActive ? this.joyForward : 0;
    let right = this.joystickActive ? this.joyRight : 0;

    if (this.keys.has('w') || this.keys.has('arrowup')) forward = 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) forward = -1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) right = -1;
    if (this.keys.has('d') || this.keys.has('arrowright')) right = 1;

    if (Math.abs(forward) < 0.05) forward = 0;
    if (Math.abs(right) < 0.05) right = 0;

    // Detecta corrida: segurar 'Shift' no teclado ou empurrar o joystick além de 75% da força
    const isShiftPressed = this.keys.has('shift');
    const isJoystickRunning = this.joystickActive && this.joyForce > 0.75;
    const isRunning = isShiftPressed || isJoystickRunning;

    return { forward, right, isRunning };
  }
}