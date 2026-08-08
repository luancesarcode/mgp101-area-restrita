// ============================================================================
// CONSTANTES DE JOGO
// ============================================================================
export const PLAYER_HALF = { x: 0.32, z: 0.32 };
export const PLAYER_HEIGHT = 1.8;
export const CROUCH_HEIGHT = 1.05;      // altura agachado (Ctrl)
export const EYE_OFFSET = 0.12;         // olhos ficam a (altura − offset)
export const CROUCH_SPEED_FACTOR = 0.5;
export const WALK_SPEED = 3.4;
export const RUN_SPEED = 6.2;
export const JUMP_SPEED = 6.5;
export const GRAVITY = 17;

export const SOURCE_MIN_DIST = 0.4;   // distância mínima da lei 1/d²
export const BACKGROUND_DOSE = 0.12;  // radiação de fundo (µSv/h)
export const NEAR_DISTANCE = 1.9;     // m — mensagem "Fonte localizada."
export const INTERACT_DIST = 2.4;     // m — alcance da tecla F
export const DECOY_COUNT = 2;         // fallback; a campanha usa 1..4 NORMs conforme fase/dificuldade
export const PELLET_GRAB_DIST = 3.2;  // m — alcance para recolher a pastilha
export const PELLET_AIM_RADIUS = 0.16;// m — o raio da mira precisa passar a ≤ este raio da pastilha (olhar para ela);
                               // ~= o marcador de debug (0,12 m) e bem menor que a borda do barril (~0,29 m)

// Campanha: 13 fases. As fases 1..12 são de busca (a fonte fica cada vez mais
// forte e instável); a fase 13 é a evacuação (sem fonte). A dificuldade NÃO
// vem mais de encolher o campo visível ou o orçamento de dose — esses ficam
// constantes — e sim da radiação da fonte. Na fase 12 a fonte chega perto de
// 10000 µSv/h @1m; somente valores ACIMA desse teto viram OverLoad no visor.
export const TOTAL_PHASES = 13;               // total de fases da campanha
export const EVAC_PHASE = TOTAL_PHASES;       // última fase: evacuação
export const EQUIPMENT_MAX_DOSE = 10000;      // µSv/h — teto do monitor; acima disso: OverLoad
export const PHASE_INTENSITY_MAX = 14;        // fase 12: fontes chegam a no máximo ~9800 µSv/h @1m antes da instabilidade
export const MENU_MUSIC_FROM_PHASE = 8;       // da fase 8 em diante a trilha do menu toca no gameplay

// --- Saúde (efeitos determinísticos, escala dramatizada) -------------------
// Referências reais (ICRP 103 / CNEN NN-3.01): público 1 mSv/ano; ocupacional
// 20 mSv/ano; efeitos determinísticos a partir de ~100 mSv AGUDOS; ~1 Sv causa
// síndrome aguda da radiação. Nessa escala uma barra de vida jamais se moveria
// com µSv — então o jogo dramatiza: taxas acima do limiar abaixo causam dano
// contínuo, e longe de áreas quentes o corpo "repara" lentamente.
export const HEALTH_MAX = 100;
export const HEALTH_DAMAGE_THRESHOLD = 100; // µSv/h — acima disso a saúde cai
export const HEALTH_DAMAGE_DIVISOR = 600;   // dano/s = (taxa − limiar) / divisor (maior = cai mais devagar)
export const HEALTH_DAMAGE_MAX = 5;         // HP/s — teto do dano: mesmo em overload dá tempo de reagir
export const HEALTH_REGEN_RATE = 1.2;       // HP/s quando a taxa está < 10 µSv/h
// Queimaduras radioativas: com a saúde baixa o jogador fica mais lento.
export const HEALTH_SLOW_START = 70;        // % de saúde abaixo do qual a lentidão começa
export const HEALTH_SLOW_MIN = 0.45;        // fator mínimo de velocidade (na saúde zero)

// Isótopos: faixas de intensidade sobrepostas reduzem a loteria entre partidas;
// shieldExp preserva a identidade física de cada um diante da blindagem.
// Com PHASE_INTENSITY_MAX=14, o maior valor base (Co-60: 700) chega a 9800 @1m.
export const ISOTOPES = [
  { name: 'Cs-137', gamma: '662 keV',        intensity: [280, 580], shieldExp: 1.0 },
  { name: 'Co-60',  gamma: '1,17/1,33 MeV',  intensity: [400, 700], shieldExp: 0.55 },
  { name: 'Ir-192', gamma: '~317 keV',       intensity: [300, 600], shieldExp: 1.3 },
  { name: 'Am-241', gamma: '60 keV',         intensity: [220, 500], shieldExp: 2.2 },
];

export const DIFFICULTIES = {
  training: { key: 'training', label: 'Treinamento', fieldFadeStart: 7.0, doseLimit: 40, maxDecoys: 2 },
  normal:   { key: 'normal',   label: 'Normal',      fieldFadeStart: 2.8, doseLimit: 10, maxDecoys: 3 },
  hard:     { key: 'hard',     label: 'Difícil',     fieldFadeStart: 0,   doseLimit: 8,  maxDecoys: 4 },
};
export const MENU_DIFFICULTY_PARTICLES = Object.freeze({ training: 1.0, normal: 1.8, hard: 3.0 });

// Dificuldades do jogo: estes valores não representam normas reais de dose.
// A fonte fica instável uma vez por fase, exceto no treinamento.
Object.assign(DIFFICULTIES.training, {
  destabilizeAfter: Infinity, destabilizeMultiplier: 1,
  destabilizeMin: Infinity, destabilizeStep: 0, destabilizeGrowth: 0, destabilizeMax: 1,
});
Object.assign(DIFFICULTIES.normal, {
  destabilizeAfter: 80, destabilizeMultiplier: 1.7,
  destabilizeMin: 35, destabilizeStep: 4, destabilizeGrowth: 0.04, destabilizeMax: 2.2,
});
Object.assign(DIFFICULTIES.hard, {
  destabilizeAfter: 35, destabilizeMultiplier: 2.0,
  destabilizeMin: 18, destabilizeStep: 2, destabilizeGrowth: 0.05, destabilizeMax: 2.6,
});

// ==== PROGRESSO / CONFIGURAÇÕES LOCAIS =====================================
// Cada slot guarda somente dificuldade, fase e data: ao continuar, a fase
// recomeça limpa, sem restaurar uma física/posição intermediária inconsistente.
export const PROGRESS_COOKIE = 'mgp101_campaign';
export const SETTINGS_COOKIE = 'mgp101_settings';
export const CAMPAIGN_SLOT_COUNT = 3;
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const STORAGE_FALLBACK_PREFIX = 'cookie_backup_';
