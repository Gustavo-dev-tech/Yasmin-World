import * as THREE from 'three';
import { ParkourMode } from './ParkourMode.js';
import { ControlPointsMode } from './ControlPointsMode.js';

export class GameModeManager {
  constructor({ scene, player }) {
    this.scene = scene;
    this.player = player;

    this.parkour = new ParkourMode({ scene, player });
    this.controlPoints = new ControlPointsMode({ scene, player });

    this.currentMode = 'FREE'; // FREE, PARKOUR, CONTROL

    // Portal do HUB no Mapa (Entrada de Escolha de Jogos)
    this.hubPosition = new THREE.Vector3(0, 0, 5);
    this._createHubPedestal();

    this._bindEvents();
  }

  _createHubPedestal() {
    const geo = new THREE.CylinderGeometry(2, 2.5, 0.4, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, emissive: 0x6d28d9, emissiveIntensity: 0.5 });
    this.hubMesh = new THREE.Mesh(geo, mat);
    this.hubMesh.position.copy(this.hubPosition);
    this.scene.add(this.hubMesh);

    // Luz Vertical Flutuante
    const lightGeo = new THREE.CylinderGeometry(1.8, 1.8, 6, 16, 1, true);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
    const lightMesh = new THREE.Mesh(lightGeo, lightMat);
    lightMesh.position.set(0, 3, 0);
    this.hubMesh.add(lightMesh);
  }

  _bindEvents() {
    window.selectGameMode = (mode) => {
      document.getElementById('mode-select-modal').classList.add('hidden');

      if (mode === 'parkour') {
        this.currentMode = 'PARKOUR';
        this.controlPoints.stop();
        this.parkour.start();
      } else if (mode === 'control') {
        this.currentMode = 'CONTROL';
        this.parkour.stop();
        this.controlPoints.start();
      } else {
        this.currentMode = 'FREE';
        this.parkour.stop();
        this.controlPoints.stop();
      }
    };
  }

  update(delta, elapsed) {
    const playerPos = this.player.group.position;
    const distToHub = playerPos.distanceTo(this.hubPosition);

    // Abre o Modal de Escolha ao pisar no Portal HUB
    if (distToHub < 2.5 && this.currentMode === 'FREE') {
      document.getElementById('mode-select-modal').classList.remove('hidden');
    }

    if (this.currentMode === 'PARKOUR') {
      this.parkour.update(delta, elapsed);
    } else if (this.currentMode === 'CONTROL') {
      this.controlPoints.update(delta, elapsed);
    }
  }
}