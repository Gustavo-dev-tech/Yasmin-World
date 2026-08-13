export class DebugHelper {
  constructor(enabled) {
    this.enabled = enabled;
    this.panel = document.getElementById('debug-panel');
    if (this.enabled && this.panel) this.panel.classList.remove('hidden');
  }

  update(text) {
    if (!this.enabled || !this.panel) return;
    this.panel.innerText = text;
  }

  dumpModel(gltf, label = 'modelo') {
    if (!this.enabled) return;

    const bones = [];
    gltf.scene.traverse((child) => {
      if (child.isBone) bones.push(child.name);
    });

    console.group(`[DebugHelper] Estrutura de "${label}"`);
    console.log('Animações encontradas:', gltf.animations?.map((a) => a.name) ?? 'nenhuma');
    console.log('Total de ossos:', bones.length);
    console.log('Nomes dos ossos:', bones);
    if (bones.length === 0) {
      console.warn(`⚠️ "${label}" NÃO tem esqueleto (0 ossos). Este arquivo não pode ser animado — nem por AnimationMixer, nem pelo fallback procedural. Precisa reexportar com skin, ou testar outro arquivo.`);
    }
    console.groupEnd();
  }
}