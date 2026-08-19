export class Input {
  constructor() {
    this.keys = new Set();
    this.joyForward = 0;
    this.joyRight = 0;
    this.joyForce = 0;
    this.joystickActive = false;

    // NOVO: Captura o ID do ponteiro (pode ser touch ou mouse id)
    this.activePointerId = null;

    // Elemento que contém o joystick
    this.joystickZone = document.getElementById('joystick-zone');

    //Listeners de Teclado (Mantidos)
    window.addEventListener('keydown', (e) => this.keys.add(e.key.toLowerCase()));
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));

    window.addEventListener('blur', () => this._resetAll());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this._resetAll();
    });

    // Melhora o cancelamento do joystick (Importante para unificar mobile/PC)
    window.addEventListener('pointerup', (e) => this._checkPointerEnd(e));
    window.addEventListener('pointercancel', (e) => this._checkPointerEnd(e));
    window.addEventListener('mouseup', () => this._resetJoystick());

    this._setupJoystick();
  }

  _resetAll() {
    this.keys.clear();
    this._resetJoystick();
  }

  // Verifica se o ponteiro que soltou é o que estava controlando o analógico
  _checkPointerEnd(e) {
      if (this.activePointerId !== null && e.pointerId === this.activePointerId) {
          this._resetJoystick();
      }
  }

  _resetJoystick() {
    this.joystickActive = false;
    this.activePointerId = null; // Libera o ID
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
    // LÓGICA DE CAPTURA ROBUSTA UNIFICADA (PointerEvents)
    // ---------------------------------------------------------
    
    // Captura o início do clique ou toque nativamente na zona INTEIRA
    this.joystickZone.addEventListener('pointerdown', (e) => {
        // Se ainda não temos um ponteiro ativo controlando
        if (this.activePointerId === null) {
            // Salva o pointerId ÚNICO.
            this.activePointerId = e.pointerId;
            this.joystickActive = true;
        }
    }, { passive: true });


    joystick.on('move', (evt, data) => {
      // ---------------------------------------------------------
      // FILTRO: Verificamos se o ponteiro movido é o nosso ID salvo
      // ---------------------------------------------------------
      const origEvent = evt.originalEvent;
      let isCorrectPointer = false;

      // Se for um PointerEvent robusto (multi-touch no mobile ou mouse id)
      if (this.activePointerId !== null && origEvent.pointerId !== undefined) {
          isCorrectPointer = (origEvent.pointerId === this.activePointerId);
      } 
      // Fallback para quando o framework nipplejs processa TouchEvent puro (Safari no iOS antigos)
      else if (this.activePointerId !== null && origEvent.changedTouches) {
          isCorrectPointer = (origEvent.changedTouches[0].identifier === this.activePointerId);
      }
      // Fallback para MouseEvent puro (Broswers PC muito antigos)
      else if (this.activePointerId === 'mouse') {
          isCorrectPointer = true; 
      }

      // Se o ID não bater, ignoramos. Isso impede que a câmera interfira no analógico.
      if (!isCorrectPointer) return;

      if (!data.angle) return;

      this.joystickActive = true;
      const max_dist = 50; 
      const angle = data.angle.radian;
      const dist = Math.min(data.distance, max_dist);
      
      this.joyForce = dist / max_dist;
      this.joyForward = Math.sin(angle) * this.joyForce;
      this.joyRight = Math.cos(angle) * this.joyForce;
    });

    // Fallback: Nipplesjs também tem seu próprio evento de 'end'
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
    const isJoystickRunning = this.joystickActive && this.joyForce > 0.85; 
    const isRunning = isShiftPressed || isJoystickRunning;

    return { forward, right, isRunning };
  }
}