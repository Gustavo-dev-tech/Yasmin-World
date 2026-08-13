import { Storage } from '../utils/Storage.js';

export class Minimap {
  constructor({ player, gameModeManager }) {
    this.player = player;
    this.gameModeManager = gameModeManager;

    this.canvas = document.getElementById('minimap-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.mapSize = 300;
  }

  update(camYaw) {
    if (!this.ctx || !this.player) return;

    // 1. Atualiza Placar de Dinheiro
    const moneyVal = Storage.getMoney();
    const moneyStr = `$${moneyVal.toString().padStart(7, '0')}`;
    const moneyEl = document.getElementById('money-display');
    if (moneyEl) moneyEl.innerText = moneyStr;

    // 2. Renderiza Radar
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const center = w / 2;
    const radius = w / 2 - 4;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();
    ctx.clip();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, center, radius * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    const pPos = this.player.group.position;
    const worldToMap = (wx, wz) => {
      const zoom = 1.6;
      const dx = (wx - pPos.x) * zoom;
      const dz = (wz - pPos.z) * zoom;
      return {
        x: center + dx,
        y: center + dz,
      };
    };

    // Ícones dos Pontos de Interesse no Mapa
    if (this.gameModeManager) {
      const hub = worldToMap(this.gameModeManager.hubPosition.x, this.gameModeManager.hubPosition.z);
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.gameModeManager && this.gameModeManager.controlPoints) {
      this.gameModeManager.controlPoints.altars.forEach((altar) => {
        const pt = worldToMap(altar.pos.x, altar.pos.z);
        ctx.fillStyle = altar.owner === 'player' ? '#3b82f6' : (altar.owner === 'rival' ? '#ef4444' : '#94a3b8');
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (this.gameModeManager && this.gameModeManager.parkour && this.gameModeManager.parkour.active) {
      const pk = this.gameModeManager.parkour;
      const activePos = pk.checkpointPositions[pk.currentCheckpoint];
      if (activePos) {
        const pt = worldToMap(activePos.x, activePos.z);
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // CORREÇÃO: Seta Alinhada à Direção Real da Personagem
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate(Math.PI - this.player.group.rotation.y);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }
}