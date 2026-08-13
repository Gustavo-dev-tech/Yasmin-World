import * as THREE from 'three';
import { Storage } from '../utils/Storage.js';

export class ParkourMode {
  constructor({ scene, player }) {
    this.scene = scene;
    this.player = player;
    this.active = false;

    this.timer = 0;
    this.currentCheckpoint = 0;

    this.checkpointPositions = [
      new THREE.Vector3(0, 1.5, 20),
      new THREE.Vector3(45, 2, -15),
      new THREE.Vector3(70, 2, -80),
      new THREE.Vector3(-50, 2, -90),
      new THREE.Vector3(-10, 15, -120),
    ];

    this.rings = [];
    this.dashPads = [];
    this.coins = [];
    this._createMeshes();
  }

  _createMeshes() {
    const ringGeo = new THREE.TorusGeometry(2.5, 0.3, 12, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: true });

    this.checkpointPositions.forEach((pos) => {
      const ring = new THREE.Mesh(ringGeo, ringMat.clone());
      ring.position.copy(pos);
      ring.visible = false;
      this.scene.add(ring);
      this.rings.push(ring);
    });

    // Moedas de Dinheiro no Caminho
    const coinGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.15, 12);
    const coinMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.8, roughness: 0.2 });

    for (let i = 0; i < 15; i++) {
      const coin = new THREE.Mesh(coinGeo, coinMat);
      coin.rotation.x = Math.PI / 2;
      coin.visible = false;
      this.scene.add(coin);
      this.coins.push({ mesh: coin, collected: false });
    }
  }

  start() {
    this.active = true;
    this.timer = 0;
    this.currentCheckpoint = 0;

    this.rings.forEach((r, idx) => {
      r.visible = idx === 0;
      r.material.color.setHex(idx === 0 ? 0x22c55e : 0xfacc15);
    });

    // Reposiciona Moedas
    this.coins.forEach((c, idx) => {
      c.collected = false;
      c.mesh.visible = true;
      const t = idx / this.coins.length;
      c.mesh.position.set((Math.sin(t * 10) * 30), 1.2, (t * -100));
    });

    document.getElementById('parkour-hud').classList.remove('hidden');
    this._updateHUD();
  }

  stop() {
    this.active = false;
    this.rings.forEach((r) => (r.visible = false));
    this.coins.forEach((c) => (c.mesh.visible = false));
    document.getElementById('parkour-hud').classList.add('hidden');
  }

  update(delta, elapsed) {
    if (!this.active) return;

    this.timer += delta;
    this._updateHUD();

    const playerPos = this.player.group.position;

    // Animação e Coleta de Moedas
    this.coins.forEach((c) => {
      if (!c.collected) {
        c.mesh.rotation.z = elapsed * 3;
        if (playerPos.distanceTo(c.mesh.position) < 1.8) {
          c.collected = true;
          c.mesh.visible = false;
          Storage.addMoney(25); // +$25 por moeda
        }
      }
    });

    const activeRing = this.rings[this.currentCheckpoint];
    if (activeRing) {
      activeRing.rotation.y = elapsed * 2;

      if (playerPos.distanceTo(activeRing.position) < 3.5) {
        this.currentCheckpoint++;

        if (this.currentCheckpoint >= this.checkpointPositions.length) {
          this._finishGame();
        } else {
          activeRing.visible = false;
          const nextRing = this.rings[this.currentCheckpoint];
          if (nextRing) {
            nextRing.visible = true;
            nextRing.material.color.setHex(0x22c55e);
          }
        }
      }
    }
  }

  _updateHUD() {
    const minutes = Math.floor(this.timer / 60);
    const seconds = (this.timer % 60).toFixed(2);
    document.getElementById('pk-timer').innerText = `${minutes.toString().padStart(2, '0')}:${seconds.padStart(5, '0')}`;
    document.getElementById('pk-progress').innerText = `${this.currentCheckpoint} / ${this.checkpointPositions.length}`;
    const best = Storage.getParkourBestTime();
    document.getElementById('pk-best').innerText = best ? `${best}s` : '--';
  }

  _finishGame() {
    const isNewRecord = Storage.saveParkourTime(this.timer);
    const rewardMoney = isNewRecord ? 500 : 200;
    Storage.addMoney(rewardMoney);

    const modal = document.getElementById('victory-modal');
    document.getElementById('victory-modal-title').innerText = isNewRecord ? '🏆 NOVO RECORDE! 🏆' : '🎉 PERCURSO CONCLUÍDO! 🎉';
    document.getElementById('victory-modal-desc').innerText = `Tempo: ${this.timer.toFixed(2)}s | Recompensa: +$${rewardMoney}`;
    modal.classList.remove('hidden');

    this.stop();
  }
}