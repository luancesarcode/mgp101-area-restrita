import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = await readFile(path.join(root, 'jogo-geiger.html'), 'utf8');
const match = html.match(/<script type="module">\r?\n?([\s\S]*?)\r?\n?<\/script>/);
if (!match) throw new Error('Bloco JavaScript original não encontrado.');

let source = match[1]
  .replace(
    "import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';",
    [
      "import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';",
      "import radiationMonitorAudioUrl from '../assets/radiation-monitor.mp3?url';",
      "import phaseOneAudioUrl from '../assets/Fase1.mp3?url';",
      "import victoryAudioUrl from '../assets/calm_victory.mp3?url';",
    ].join('\n'),
  )
  .replace("'assets/radiation-monitor.mp3'", 'radiationMonitorAudioUrl')
  .replace("'assets/Fase1.mp3'", 'phaseOneAudioUrl')
  .replace("'assets/calm_victory.mp3'", 'victoryAudioUrl');

const lines = source.split(/\r?\n/);
const take = (start, end) => lines.slice(start - 1, end).join('\n').trimEnd() + '\n';
const exported = (code, names) => names.reduce(
  (result, name) => result
    .replace(new RegExp(`^class ${name}\\b`, 'm'), `export class ${name}`)
    .replace(new RegExp(`^function ${name}\\b`, 'm'), `export function ${name}`),
  code,
);
const compose = (...parts) => parts.filter(Boolean).join('\n');

const files = new Map();

files.set('src/config/gameConfig.js', take(11, 98).replace(/^const /gm, 'export const '));

files.set('src/storage/persistence.js', compose(
  "import * as THREE from 'three';\nimport { CAMPAIGN_SLOT_COUNT, COOKIE_MAX_AGE, DIFFICULTIES, PROGRESS_COOKIE, SETTINGS_COOKIE, STORAGE_FALLBACK_PREFIX, TOTAL_PHASES } from '../config/gameConfig.js';\n",
  exported(take(91, 93) + take(100, 260), [
    'loadCampaignSlots', 'saveCampaignProgress', 'deleteCampaignSlot',
    'loadCampaignProgress', 'GameSettings',
  ]),
));

files.set('src/audio/GameAudio.js', compose(
  "import * as THREE from 'three';\nimport radiationMonitorAudioUrl from '../../assets/radiation-monitor.mp3?url';\nimport phaseOneAudioUrl from '../../assets/Fase1.mp3?url';\nimport victoryAudioUrl from '../../assets/calm_victory.mp3?url';\nimport { EVAC_PHASE, MENU_MUSIC_FROM_PHASE } from '../config/gameConfig.js';\n",
  exported(take(261, 465), ['GameAudio']),
));

files.set('src/rendering/SceneManager.js', compose(
  "import * as THREE from 'three';\nimport { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';\nimport { RenderPass } from 'three/addons/postprocessing/RenderPass.js';\nimport { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';\nimport { OutputPass } from 'three/addons/postprocessing/OutputPass.js';\n",
  exported(take(466, 557), ['SceneManager']),
));

files.set('src/player/Player.js', compose(
  "import * as THREE from 'three';\nimport { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';\nimport { CROUCH_HEIGHT, CROUCH_SPEED_FACTOR, EYE_OFFSET, GRAVITY, JUMP_SPEED, PLAYER_HALF, PLAYER_HEIGHT, RUN_SPEED, WALK_SPEED } from '../config/gameConfig.js';\n",
  exported(take(558, 712), ['Player']),
));

files.set('src/radiation/ShieldingModel.js', compose(
  "import * as THREE from 'three';\n",
  exported(take(713, 748), ['ShieldingModel']),
));

files.set('src/radiation/GeigerDetector.js', compose(
  "import { BACKGROUND_DOSE, EQUIPMENT_MAX_DOSE } from '../config/gameConfig.js';\n",
  exported(take(749, 832), ['GeigerDetector']),
));

files.set('src/world/SurfaceSampler.js', compose(
  "import * as THREE from 'three';\n",
  exported(take(833, 891), ['SurfaceSampler']),
));

files.set('src/radiation/RadiationSource.js', compose(
  "import * as THREE from 'three';\nimport { BACKGROUND_DOSE, DECOY_COUNT, ISOTOPES, SOURCE_MIN_DIST } from '../config/gameConfig.js';\nimport { SurfaceSampler } from '../world/SurfaceSampler.js';\n",
  exported(take(892, 1039), ['RadiationSource']),
));

files.set('src/world/LabBuilder.js', compose(
  "import * as THREE from 'three';\n",
  exported(take(1040, 1965), ['LabBuilder']),
));

files.set('src/world/EvacuationManager.js', compose(
  "import * as THREE from 'three';\n",
  exported(take(1966, 2183), ['EvacuationManager']),
));

files.set('src/physics/InteractionSystem.js', compose(
  "import * as THREE from 'three';\nimport { INTERACT_DIST, PELLET_AIM_RADIUS, PELLET_GRAB_DIST } from '../config/gameConfig.js';\n",
  exported(take(2185, 2241) + take(2253, 3375), ['InteractionSystem']),
));

files.set('src/ui/HUD.js', compose(
  "import * as THREE from 'three';\nimport { HEALTH_MAX } from '../config/gameConfig.js';\n",
  exported(take(3376, 3510), ['HUD']),
));

files.set('src/equipment/panelSvgData.js', take(2240, 2251).replace(
  'const MGP_PANEL_SVG_DATA',
  'export const MGP_PANEL_SVG_DATA',
));

files.set('src/equipment/GeigerEquipment.js', compose(
  "import * as THREE from 'three';\nimport { EQUIPMENT_MAX_DOSE } from '../config/gameConfig.js';\nimport { MGP_PANEL_SVG_DATA } from './panelSvgData.js';\n",
  exported(take(3512, 4024), ['GeigerDisplay', 'DetectorViewmodel']),
));

files.set('src/effects/RadiationField.js', compose(
  "import * as THREE from 'three';\n",
  exported(take(4025, 4157), ['RadiationField']),
));

files.set('src/effects/EpicAtmosphere.js', compose(
  "import * as THREE from 'three';\nimport { EVAC_PHASE, MENU_MUSIC_FROM_PHASE } from '../config/gameConfig.js';\n",
  exported(take(4158, 4275), ['EpicAtmosphere']),
));

files.set('src/gameplay/HealthSystem.js', compose(
  "import { HEALTH_DAMAGE_DIVISOR, HEALTH_DAMAGE_MAX, HEALTH_DAMAGE_THRESHOLD, HEALTH_MAX, HEALTH_REGEN_RATE, HEALTH_SLOW_MIN, HEALTH_SLOW_START } from '../config/gameConfig.js';\n",
  exported(take(4276, 4322), ['HealthSystem']),
));

files.set('src/gameplay/RouteRecorder.js', compose(
  "import * as THREE from 'three';\n",
  exported(take(4323, 4389), ['RouteRecorder']),
));

files.set('src/gameplay/MissionManager.js', compose(
  "import { BACKGROUND_DOSE, NEAR_DISTANCE } from '../config/gameConfig.js';\n",
  exported(take(4390, 4500), ['MissionManager']),
));

files.set('src/effects/EmberField.js', compose(
  "import * as THREE from 'three';\n",
  exported(take(4501, 4540), ['EmberField']),
));

files.set('src/ui/Menus.js', compose(
  "import * as THREE from 'three';\nimport { DIFFICULTIES, MENU_DIFFICULTY_PARTICLES } from '../config/gameConfig.js';\nimport { deleteCampaignSlot, loadCampaignSlots } from '../storage/persistence.js';\nimport { EmberField } from '../effects/EmberField.js';\n",
  exported(take(4541, 5433), ['StartMenu', 'PauseMenu', 'XboxGamepadController']),
));

const gameModule = exported(take(5434, 6066), ['Game']).replace(
  "    if (getComputedStyle(boot).display === 'none') return;\n",
  [
    "    if (getComputedStyle(boot).display === 'none') return;",
    "    // O clique em CONTINUAR possui a ativação de usuário exigida pela",
    "    // Fullscreen API. Se o host bloquear a solicitação, o menu continua",
    "    // normalmente e o jogador ainda pode usar o navegador em modo janela.",
    "    const fullscreenTarget = document.documentElement;",
    "    const requestFullscreen = fullscreenTarget.requestFullscreen || fullscreenTarget.webkitRequestFullscreen;",
    "    if (!document.fullscreenElement && !document.webkitFullscreenElement && requestFullscreen) {",
    "      try {",
    "        const request = requestFullscreen.call(fullscreenTarget, { navigationUI: 'hide' });",
    "        if (request?.catch) request.catch(() => {});",
    "      } catch (_) {",
    "        // Fullscreen é um aprimoramento: nunca deve bloquear o início do jogo.",
    "      }",
    "    }",
  ].join('\n') + '\n',
);

files.set('src/core/Game.js', compose(
  [
    "import * as THREE from 'three';",
    "import { BACKGROUND_DOSE, DIFFICULTIES, EQUIPMENT_MAX_DOSE, EVAC_PHASE, MENU_MUSIC_FROM_PHASE, PHASE_INTENSITY_MAX, PLAYER_HEIGHT } from '../config/gameConfig.js';",
    "import { GameSettings, deleteCampaignSlot, saveCampaignProgress } from '../storage/persistence.js';",
    "import { GameAudio } from '../audio/GameAudio.js';",
    "import { SceneManager } from '../rendering/SceneManager.js';",
    "import { Player } from '../player/Player.js';",
    "import { ShieldingModel } from '../radiation/ShieldingModel.js';",
    "import { GeigerDetector } from '../radiation/GeigerDetector.js';",
    "import { RadiationSource } from '../radiation/RadiationSource.js';",
    "import { LabBuilder } from '../world/LabBuilder.js';",
    "import { EvacuationManager } from '../world/EvacuationManager.js';",
    "import { InteractionSystem } from '../physics/InteractionSystem.js';",
    "import { HUD } from '../ui/HUD.js';",
    "import { DetectorViewmodel } from '../equipment/GeigerEquipment.js';",
    "import { RadiationField } from '../effects/RadiationField.js';",
    "import { EpicAtmosphere } from '../effects/EpicAtmosphere.js';",
    "import { EmberField } from '../effects/EmberField.js';",
    "import { HealthSystem } from '../gameplay/HealthSystem.js';",
    "import { RouteRecorder } from '../gameplay/RouteRecorder.js';",
    "import { MissionManager } from '../gameplay/MissionManager.js';",
    "import { PauseMenu, StartMenu, XboxGamepadController } from '../ui/Menus.js';",
    '',
  ].join('\n'),
  gameModule,
));

files.set('src/main.js', [
  "import { Game } from './core/Game.js';",
  '',
  '// ==== BOOTSTRAP =============================================================',
  'const game = new Game();',
  'game.start();',
  'window.__game = game; // acesso via console para depuração',
  '',
].join('\n'));

for (const [relative, content] of files) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

console.log(`${files.size} módulos gravados a partir do monólito original.`);
