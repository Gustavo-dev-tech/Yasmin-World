import * as THREE from 'three';

export class OrbitCameraRig {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.yaw = 0;
    this.pitch = THREE.MathUtils.degToRad(20);
    this.distance = 8.0;
    this.minPitch = THREE.MathUtils.degToRad(-45);
    this.maxPitch = THREE.MathUtils.degToRad(85);
    this.minDistance = 1.0;
    this.maxDistance = 48.0;
    this.yawSpeed = 0.006;
    this.pitchSpeed = 0.006;
    this.pinchZoomSpeed = 0.05;
    this.target = new THREE.Vector3();
    this.pointers = [];
    this.prevPinchDistance = null;
    this._lastX = 0;
    this._lastY = 0;
    this._bindEvents();
  }

  _isOverJoystick(target) {
    return !!(target && target.closest && target.closest('#joystick-zone'));
  }

  _bindEvents() {
    const onDown = (e) => {
      if (this._isOverJoystick(e.target)) return;
      const existingPointer = this.pointers.find((p) => p.id === e.pointerId);
      if (!existingPointer) {
        this.pointers.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
      }
      if (this.pointers.length === 1) {
        this._lastX = e.clientX;
        this._lastY = e.clientY;
      } else if (this.pointers.length === 2) {
        const dx = this.pointers[0].x - this.pointers[1].x;
        const dy = this.pointers[0].y - this.pointers[1].y;
        this.prevPinchDistance = Math.hypot(dx, dy);
      }
    };

    const onMove = (e) => {
      const pointer = this.pointers.find((p) => p.id === e.pointerId);
      if (!pointer) return;
      pointer.x = e.clientX;
      pointer.y = e.clientY;

      if (this.pointers.length === 1) {
        const deltaX = e.clientX - this._lastX;
        const deltaY = e.clientY - this._lastY;
        this._lastX = e.clientX;
        this._lastY = e.clientY;

        this.yaw -= deltaX * this.yawSpeed;
        this.pitch = THREE.MathUtils.clamp(
          this.pitch - deltaY * this.pitchSpeed,
          this.minPitch,
          this.maxPitch
        );
      } else if (this.pointers.length === 2) {
        const dx = this.pointers[0].x - this.pointers[1].x;
        const dy = this.pointers[0].y - this.pointers[1].y;
        const currentPinchDistance = Math.hypot(dx, dy);

        if (this.prevPinchDistance !== null) {
          const pinchDelta = this.prevPinchDistance - currentPinchDistance;
          this.distance = THREE.MathUtils.clamp(
            this.distance + pinchDelta * this.pinchZoomSpeed,
            this.minDistance,
            this.maxDistance
          );
        }
        this.prevPinchDistance = currentPinchDistance;
      }
    };

    const onUp = (e) => {
      this.pointers = this.pointers.filter((p) => p.id !== e.pointerId);
      if (this.pointers.length === 1) {
        this._lastX = this.pointers[0].x;
        this._lastY = this.pointers[0].y;
      } else if (this.pointers.length < 2) {
        this.prevPinchDistance = null;
      }
    };

    this.domElement.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    this.domElement.addEventListener('wheel', (e) => {
      this.distance = THREE.MathUtils.clamp(
        this.distance + e.deltaY * 0.012,
        this.minDistance,
        this.maxDistance
      );
    }, { passive: true });
  }

  update(playerPosition, delta) {
    const zoomFactor = 1 - THREE.MathUtils.clamp((this.distance - this.minDistance) / (this.maxDistance - this.minDistance), 0, 1);
    
    // Foco na altura do peito (1.05m a 1.18m) para não cortar a cabeça no zoom máximo
    const targetHeight = THREE.MathUtils.lerp(1.05, 1.18, zoomFactor);

    const focusPoint = playerPosition.clone().add(new THREE.Vector3(0, targetHeight, 0));
    const lerpAlpha = 1 - Math.pow(0.001, delta);
    this.target.lerp(focusPoint, lerpAlpha);

    const horizontalR = this.distance * Math.cos(this.pitch);
    const x = this.target.x + horizontalR * Math.sin(this.yaw);
    const z = this.target.z + horizontalR * Math.cos(this.yaw);

    let y = this.target.y + this.distance * Math.sin(this.pitch);
    y = Math.max(0.4, y);

    this.camera.position.set(x, y, z);
    this.camera.lookAt(this.target);
  }
}