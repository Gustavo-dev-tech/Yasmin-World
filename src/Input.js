export class Input {
  constructor() {
    this.keys = new Set();
    this.joyForward = 0;
    this.joyRight = 0;
    this.joyForce = 0;
    this.joystickActive = false;

    // Novo: Captura o ID do toque para garantir multi-touch robusto
    this.activeTouchId = null;

    // Elemento que contém o joystick
    this.joystickZone = document.getElementById('joystick-zone');

    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    window.addEventListener('blur', () => this._resetAll());

    // Corrigido: Uso correto de arrow function para não perder o escopo do 'this'
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._resetAll();
    });

    // Melhora o cancelamento do joystick com múltiplos métodos
    window.addEventListener('pointerup', () => this._resetJoystick());
    window.addEventListener('pointercancel', () => this._resetJoystick());
    window.addEventListener('mouseup', () => this._resetJoystick());

    // No mobile, o touchend na janela deve resetar se o ID bater
    window.addEventListener('touchend', (e) => {
        if (this.activeTouchId !== null && e.changedTouches[0].identifier === this.activeTouchId) {
            this._resetJoystick();
        }
    });

    this._setupJoystick();
  }

  _resetAll() {
    this.keys.clear();
    this._resetJoystick();
  }

  // Novo: Método dedicado para resetar apenas o estado do analógico
  _resetJoystick() {
    this.joystickActive = false;
    this.activeTouchId = null; // Libera o ID do toque
    this.joyForward = 0;
    this.joyRight = 0;
    this.joyForce = 0;
  }

  _setupJoystick() {
    if (!this.joystickZone || typeof nipplejs === 'undefined') return;

    const joystick = nipplejs.create({
      zone: this.joystickZone,
      mode: 'static',
      position: { left: '80px', bottom: '80px' },
      color: 'white',
      size: 100,
    });

    // ---------------------------------------------------------
    // LÓGICA DE CAPTURA ROBUSTA DO TOUCH ID
    // ---------------------------------------------------------
    
    // Antes que o nipplejs processe o movimento, capturamos o ID do toque na área
    this.joystickZone.addEventListener('touchstart', (e) => {
        // Se ainda não temos um toque ativo no analógico
        if (this.activeTouchId === null) {
            // Salva o identifier do primeiro dedo que tocou na zona
            this.activeTouchId = e.changedTouches[0].identifier;
            this.joystickActive = true;
        }
    }, { passive: true });


    joystick.on('move', (evt, data) => {
      // ---------------------------------------------------------
      // FILTRO: Verificamos se o toque movido é o nosso ID salvo
      // ---------------------------------------------------------
      const touches = evt.originalEvent.touches;
      let foundActiveTouch = false;

      // Iteramos pelos toques ativos para garantir que o nipplejs não esteja lendo noise de outro dedo
      if (touches && this.activeTouchId !== null) {
          for (let i = 0; i < touches.length; i++) {
              if (touches[i].identifier === this.activeTouchId) {
                  foundActiveTouch = true;
                  break;
              }
          }
      }

      // Se o toque que está movendo o analógico não for o ID que capturamos no 'touchstart', ignoramos.
      if (!foundActiveTouch) return;

      if (!data.angle) return;

      this.joystickActive = true;
      const max_dist = 50; // Tamanho/2 do joystick (size: 100)
      const angle = data.angle.radian;
      const dist = Math.min(data.distance, max_dist);
      
      // Mapeia força e ângulo para o nosso sistema de -1 a 1
      this.joyForce = dist / max_dist;
      this.joyForward = Math.sin(angle) * this.joyForce;
      this.joyRight = Math.cos(angle) * this.joyForce;
    });

    // Quando o dedo solta a área do analógico
    this.joystickZone.addEventListener('touchend', (e) => {
        // Se soltou o toque que estávamos rastreando
        if (this.activeTouchId !== null && e.changedTouches[0].identifier === this.activeTouchId) {
            this._resetJoystick();
        }
    });

    // Nipplesjs também tem seu próprio evento de 'end', usamos como fallback
    joystick.on('end', () => this._resetJoystick());
  }

  getMovement() {
    let forward = this.joystickActive ? this.joyForward : 0;
    let right = this.joystickActive ? this.joyRight : 0;

    // Lógica de Teclado (Mantida e combinada)
    if (this.keys.has('w') || this.keys.has('arrowup')) forward = 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) forward = -1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) right = -1;
    if (this.keys.has('d') || this.keys.has('arrowright')) right = 1;

    // Normalização básica de Deadzone
    if (Math.abs(forward) < 0.05) forward = 0;
    if (Math.abs(right) < 0.05) right = 0;

    // Detecta corrida: segurar 'Shift' no teclado ou empurrar o joystick além de 85% da força
    const isShiftPressed = this.keys.has('shift');
    const isJoystickRunning = this.joystickActive && this.joyForce > 0.85; // Aumentado ligeiramente para 85%
    const isRunning = isShiftPressed || isJoystickRunning;

    return { forward, right, isRunning };
  }
}