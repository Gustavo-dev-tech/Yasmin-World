import * as THREE from 'three';
import { Storage } from '../utils/Storage.js';

export class ControlPointsMode {
  constructor({ scene, player }) {
    this.scene = scene;
    this.player = player;
    this.active = false;

    this.playerScore = 0;
    this.rivalScore = 0;
    this.targetScore = 1000;

    this.altars = [
      { name: 'Vila', pos: new THREE.Vector3(-40, 0, 30), owner: 'none', progress: 0 },
      { name: 'Floresta', pos: new THREE.Vector3(60, 0, 40), owner: 'none', progress: 0 },
      { name: 'Cachoeira', pos: new THREE.Vector3(-70, 0, -60), owner: 'none', progress: 0 },
      { name: 'Castelo', pos: new THREE.Vector3(0, 0, -120), owner: 'none', progress: 0 },
    ];

    this.altarMeshes = [];
    this._createAltars();
  }

  _createAltars() {
    const geo = new THREE.CylinderGeometry(5, 5, 0.3, 16);

    this.altars.forEach((altar) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(altar.pos);
      mesh.visible = false;
      this.scene.add(mesh);
      this.altarMeshes.push(mesh);
    });
  }

  start() {
    this.active = true;
    this.playerScore = 0;
    this.rivalScore = 0;

    this.altars.forEach((a) => {
      a.owner = 'none';
      a.progress = 0;
    });

    this.altarMeshes.forEach((m) => {
      m.visible = true;
      m.material.color.setHex(0x94a3b8);
    });

    document.getElementById('cp-hud').classList.remove('hidden');
    this._updateHUD();
  }

  stop() {
    this.active = false;
    this.altarMeshes.forEach((m) => (m.visible = false));
    document.getElementById('cp-hud').classList.add('hidden');
  }

  update(delta) {
    if (!this.active) return;

    const playerPos = this.player.group.position;

    this.altars.forEach((altar, idx) => {
      const mesh = this.altarMeshes[idx];
      const dist = playerPos.distanceTo(altar.pos);

      // Progresso do Jogador
      if (dist < 5.0) {
        altar.progress = Math.min(altar.progress + delta * 30, 100);
        if (altar.progress >= 100 && altar.owner !== 'player') {
          altar.owner = 'player';
          mesh.material.color.setHex(0x3b82f6);
        }
      }

      // IA Simulado de Invasão de Inimigos (Rival)
      if (dist > 15.0 && Math.random() < 0.002 && altar.owner === 'player') {
        altar.owner = 'rival';
        mesh.material.color.setHex(0xef4444);
      }

      if (altar.owner === 'player') {
        this.playerScore += delta * 18;
        Storage.addMoney(Math.floor(delta * 2)); // Dinheiro por manter o altar
      } else if (altar.owner === 'rival') {
        this.rivalScore += delta * 18;
      }
    });

    this._updateHUD();

    if (this.playerScore >= this.targetScore) {
      Storage.addControlWin();
      Storage.addMoney(1000); // +$1000 por vitória
      this._finishGame(true);
    } else if (this.rivalScore >= this.targetScore) {
      this._finishGame(false);
    }
  }

  _updateHUD() {
    document.getElementById('cp-score-player').innerText = Math.floor(this.playerScore);
    document.getElementById('cp-score-rival').innerText = Math.floor(this.rivalScore);
    document.getElementById('cp-wins').innerText = Storage.getControlWins();
  }

  _finishGame(playerWon) {
    const modal = document.getElementById('victory-modal');
    document.getElementById('victory-modal-title').innerText = playerWon ? '🏆 VITÓRIA DOMINANTE! 🏆' : '💀 DERROTA! 💀';
    document.getElementById('victory-modal-desc').innerText = playerWon ? 'Recompensa: +$1000' : 'O oponente capturou os altares primeiro.';
    modal.classList.remove('hidden');

    this.stop();
  }
}