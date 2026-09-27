import * as THREE from 'three';

export class Shop {
  constructor(scene) {
    this.scene = scene;
    this.shopActive = false;
    this.closedByUser = false;
    
    const geometry = new THREE.CylinderGeometry(2, 2, 0.2, 32);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xffd700,
        emissive: 0xffaa00,
        emissiveIntensity: 0.5
    });
    this.pad = new THREE.Mesh(geometry, material);
    this.pad.position.set(15, 0.1, 15);
    this.scene.add(this.pad);

    const light = new THREE.PointLight(0xffd700, 2, 10);
    light.position.set(15, 2, 15);
    this.scene.add(light);

    this.shopUI = document.getElementById('shop-ui');
    window.fecharLoja = () => this.close();
  }

  close() {
    this.shopActive = false;
    this.closedByUser = true;
    if (document.activeElement) document.activeElement.blur(); // Remove o brilho amarelo preso no botão
    if (this.shopUI) {
        this.shopUI.classList.add('hidden');
    }
  }

  update(playerPos) {
    if (!this.shopUI) return;

    const dx = playerPos.x - this.pad.position.x;
    const dz = playerPos.z - this.pad.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance < 2.5) {
        if (!this.shopActive && !this.closedByUser) {
            this.shopActive = true;
            this.shopUI.classList.remove('hidden');
            // Não forçamos mais .focus() no primeiro botão ao abrir!
        }
    } else {
        this.closedByUser = false;
        if (this.shopActive) {
            this.shopActive = false;
            this.shopUI.classList.add('hidden');
        }
    }
  }
}