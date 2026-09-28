export const PATHS = {
  characters: {
    yasmin: './assets/models/personagens/garota.glb',
    yasminWalk: './assets/models/personagens/garota_animada.glb',
    gustavo: './assets/models/personagens/gustavo.glb',
    vestidoBranco: './assets/models/vestuario/garota_vestido_branco.glb',
    garotaRosa: './assets/models/vestuario/garota_rosa.glb',
  },
  vehicles: {
    motoTwister: './assets/models/veiculos/moto_twister_300.glb',
  },
  city: {
    castle: './assets/models/city/castle.glb',
    escada: './assets/models/city/escada.glb',
    trees: './assets/models/city/trees_animated.glb',
  },
  creatures: {
    dragon: './assets/models/creatures/dragon.glb',
    rabbit: './assets/models/creatures/rabbit.glb',
    dogGolden: './assets/models/creatures/dog_golden.glb',
    dogFolder: './assets/models/creatures/',
    germanShepherdFolder: './assets/models/creatures/RSG_DogsPack_GermanShepherd_FBX/',
  },
  audio: {
    dragonFly: './assets/audio/sfx/dragon-voando.mp3',
  },
  fmv: {
    opening: './assets/fmv/fmv_01_abertura.mp4',
    plazaAmbush: './assets/fmv/fmv_02_emboscada_praca.mp4',
    dragonAwakening: './assets/fmv/fmv_03_despertar_dragao.mp4',
    finale: './assets/fmv/fmv_04_final_capital.mp4',
  }
};

export const CONFIG = {
  PATHS,

  ACTIVE_MODEL: PATHS.characters.yasmin,
  WALK_ANIMATION_URL: PATHS.characters.yasminWalk,

  // Biblioteca de Animações Organizada por Categoria
  ANIMATIONS: {
    // Locomoção
    run: './assets/animacoes/locomocao/anim_run.glb',
    idle_dwarf: './assets/animacoes/locomocao/anim_dwarf.glb',
    falling: './assets/animacoes/locomocao/anim_falling.glb',

    // Combate
    boxing: './assets/animacoes/combate/anim_boxing.glb',

    // Interações & Comemorações
    hiphop: './assets/animacoes/interacoes/anim_hiphop.glb',
    dance_macarena: './assets/animacoes/interacoes/anim_macarena.glb',
    victory: './assets/animacoes/interacoes/anim_victory.glb',
    excited: './assets/animacoes/interacoes/anim_excited.glb',
    dragonMount: './assets/animacoes/interacoes/montada_dragon.fbx',
  },

  PLAYER_SPEED: 40.5,
  PLAYER_RADIUS: 0.48,
  PLAYER_HEIGHT: 1.75,
  DEBUG: true,
};