import * as THREE from 'three';

const CRYSTAL_POSITIONS = [
  { x: 8, z: -15 }, { x: -16, z: -10 }, { x: 18, z: 12 }, { x: -18, z: 15 }, { x: 0, z: -25 },
];

const MEMORIES = [
  { photo: 'assets/photos/foto1.jpg', caption: 'Nosso primeiro encontro! 💜' },
  { photo: 'assets/photos/foto2.jpg', caption: 'Aquela viagem inesquecível ✈️' },
  { photo: 'assets/photos/foto3.jpg', caption: 'O dia mais engraçado que já tivemos 😂' },
  { photo: 'assets/photos/foto4.jpg', caption: 'Você e seu sorriso favorito 🥰' },
  { photo: 'assets/photos/foto5.jpg', caption: 'Comemorando juntos, como sempre! 🎉' },
];

export class Collectibles {
  constructor({ scene }) {
    this.scene = scene;
    this.crystals = [];
    this.score = 0;
    this.activeIndex = -1;

    this.scoreEl = document.getElementById('score');
    this.messageBox = document.getElementById('message-box');
    this.messageText = document.getElementById('message-text');
    this.btnOpen = document.getElementById('btn-open');
    this.photoModal = document.getElementById('photo-modal');
    this.photoDisplay = document.getElementById('photo-display');
    this.photoCaption = document.getElementById('photo-caption');
    this.btnClosePhoto = document.getElementById('btn-close-photo');
    this.victoryModal = document.getElementById('victory-modal');
    this.btnRestart = document.getElementById('btn-restart');

    this._buildCrystals();
    this._bindUI();
  }

  _buildCrystals() {
    const geo = new THREE.OctahedronGeometry(0.7);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x00ffff, emissive: 0x0088ff, emissiveIntensity: 0.8, roughness: 0.2,
    });

    CRYSTAL_POSITIONS.forEach((pos, index) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pos.x, 0.8, pos.z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.crystals.push({ mesh, collected: false, memory: MEMORIES[index] });
    });
  }

  _bindUI() {
    this.btnOpen.addEventListener('click', () => {
      this.messageBox.classList.add('hidden');
      const memory = this.crystals[this.activeIndex]?.memory;
      if (!memory) return;

      this.photoDisplay.src = memory.photo;
      this.photoDisplay.onerror = () => {
        this.photoDisplay.style.display = 'none';
      };
      this.photoDisplay.onload = () => {
        this.photoDisplay.style.display = 'block';
      };
      this.photoCaption.innerText = memory.caption;
      this.photoModal.classList.remove('hidden');
    });

    this.btnClosePhoto.addEventListener('click', () => {
      this.photoModal.classList.add('hidden');
      this._collectActive();
    });

    this.btnRestart.addEventListener('click', () => location.reload());
  }

  _collectActive() {
    if (this.activeIndex === -1) return;
    const crystal = this.crystals[this.activeIndex];
    if (crystal.collected) return;

    crystal.collected = true;
    crystal.mesh.visible = false;
    this.score++;
    this.scoreEl.innerText = `Memórias: ${this.score} / ${this.crystals.length}`;
    this.activeIndex = -1;

    if (this.score === this.crystals.length) {
      setTimeout(() => this.victoryModal.classList.remove('hidden'), 400);
    }
  }

  update(playerPosition, elapsedTime) {
    let nearIndex = -1;

    this.crystals.forEach((crystal, index) => {
      if (crystal.collected) return;
      crystal.mesh.rotation.y += 0.03;
      crystal.mesh.position.y = 0.8 + Math.sin(elapsedTime * 4 + index) * 0.15;

      const dist = playerPosition.distanceTo(crystal.mesh.position);
      if (dist < 2.0) nearIndex = index;
    });

    if (nearIndex !== -1 && this.activeIndex !== nearIndex && this.photoModal.classList.contains('hidden')) {
      this.activeIndex = nearIndex;
      this.messageText.innerText = 'Encontrou uma lembrança!';
      this.messageBox.classList.remove('hidden');
    } else if (nearIndex === -1 && this.activeIndex !== -1 && this.photoModal.classList.contains('hidden')) {
      this.messageBox.classList.add('hidden');
      this.activeIndex = -1;
    }
  }
}