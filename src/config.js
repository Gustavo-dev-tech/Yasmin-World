const MODELS = {
  padrao: 'assets/garota.glb',
};

export const CONFIG = {
  ACTIVE_MODEL: MODELS.padrao,
  WALK_ANIMATION_URL: 'assets/garota_animada.glb',

  // Biblioteca de Animações Carregadas em Lote
  ANIMATIONS: {
    run: 'assets/anim_run.glb',
    idle_dwarf: 'assets/anim_dwarf.glb',
    hiphop: 'assets/anim_hiphop.glb',
    dance_macarena: 'assets/anim_macarena.glb',
    victory: 'assets/anim_victory.glb',
    excited: 'assets/anim_excited.glb',
    //punch: 'assets/anim_punch.glb',
    //kick: 'assets/anim_kick.glb',
    falling: 'assets/anim_falling.glb',
    //kiss: 'assets/anim_kiss.glb',
    //jump: 'assets/anim_jump.glb',
  },

  PLAYER_SPEED: 40.5,
  PLAYER_RADIUS: 0.48,
  PLAYER_HEIGHT: 1.75,
  DEBUG: true,
};