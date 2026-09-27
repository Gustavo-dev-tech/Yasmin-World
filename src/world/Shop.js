import * as THREE from 'three';

export class Shop {
  constructor(scene) {
    this.scene = scene;
    this.shopActive = false;
    this.closedByUser = false; // Impede que a loja reabra sozinha enquanto você ainda está no círculo
    
    // Plataforma brilhante no chão
    const geometry = new THREE.CylinderGeometry(2, 2, 0.2, 32);
    const material = new THREE.MeshStandardMaterial({ 
        color: 0xffd700,
        emissive: 0xffaa00,
        emissiveIntensity: 0.5
    });
    this.pad = new THREE.Mesh(geometry, material);
    this.pad.position.set(15, 0.1, 15);
    this.scene.add(this.pad);

    // Luz da loja
    const light = new THREE.PointLight(0xffd700, 2, 10);
    light.position.set(15, 2, 15);
    this.scene.add(light);

    this.shopUI = document.getElementById('shop-ui');

    // Função global para o botão HTML "SAIR" destravar a personagem
    window.fecharLoja = () => this.close();
  }

  close() {
    this.shopActive = false;
    this.closedByUser = true; // Trava a reabertura até o jogador sair de cima do disco
    if (this.shopUI) {
        this.shopUI.classList.add('hidden');
    }
  }

  update(playerPos) {
    if (!this.shopUI) return;

    // Distância apenas no plano horizontal (X e Z) para evitar erros de altura
    const dx = playerPos.x - this.pad.position.x;
    const dz = playerPos.z - this.pad.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance < 2.5) {
        // Só abre se não estiver ativa E se o jogador não tiver acabado de clicar em "Sair"
        if (!this.shopActive && !this.closedByUser) {
            this.shopActive = true;
            this.shopUI.classList.remove('hidden');
            const firstBtn = document.querySelector('.shop-btn');
            if (firstBtn) firstBtn.focus();
        }
    } else {
        // Quando o jogador finalmente sai de cima do círculo dourado, reseta a trava
        this.closedByUser = false;
        if (this.shopActive) {
            this.shopActive = false;
            this.shopUI.classList.add('hidden');
        }
    }
  }
}