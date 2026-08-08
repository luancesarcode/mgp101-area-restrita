import * as THREE from 'three';
import { BACKGROUND_DOSE, DIFFICULTIES, EQUIPMENT_MAX_DOSE, EVAC_PHASE, MENU_MUSIC_FROM_PHASE, PHASE_INTENSITY_MAX, PLAYER_HEIGHT } from '../config/gameConfig.js';
import { GameSettings, deleteCampaignSlot, saveCampaignProgress } from '../storage/persistence.js';
import { GameAudio } from '../audio/GameAudio.js';
import { SceneManager } from '../rendering/SceneManager.js';
import { Player } from '../player/Player.js';
import { ShieldingModel } from '../radiation/ShieldingModel.js';
import { GeigerDetector } from '../radiation/GeigerDetector.js';
import { RadiationSource } from '../radiation/RadiationSource.js';
import { LabBuilder } from '../world/LabBuilder.js';
import { EvacuationManager } from '../world/EvacuationManager.js';
import { InteractionSystem } from '../physics/InteractionSystem.js';
import { HUD } from '../ui/HUD.js';
import { DetectorViewmodel } from '../equipment/GeigerEquipment.js';
import { RadiationField } from '../effects/RadiationField.js';
import { EpicAtmosphere } from '../effects/EpicAtmosphere.js';
import { EmberField } from '../effects/EmberField.js';
import { HealthSystem } from '../gameplay/HealthSystem.js';
import { RouteRecorder } from '../gameplay/RouteRecorder.js';
import { MissionManager } from '../gameplay/MissionManager.js';
import { PauseMenu, StartMenu, XboxGamepadController } from '../ui/Menus.js';

// ==== GAME ==================================================================
// Orquestra tudo: bootstrap, dificuldade, loop, telas, debug (F3), recordes.
export class Game {
  constructor() {
    this.sceneManager = new SceneManager();
    this.shielding = new ShieldingModel();

    const lab = new LabBuilder(this.sceneManager.scene, this.shielding).build();
    this.lab = lab;
    this._containerInitialState = lab.containers.map((container) => ({
      container,
      lidPosition: container.lid ? container.lid.position.clone() : null,
      lidRotation: container.lid ? container.lid.rotation.clone() : null,
    }));
    this.colliders = lab.colliders;
    this.source = new RadiationSource(this.sceneManager.scene, lab, this.shielding);
    this.evacuation = new EvacuationManager(this.sceneManager.scene, lab);
    this.player = new Player(this.sceneManager.camera, document.body, lab.colliders);
    this.settings = new GameSettings();
    this.settings.subscribe((state) => this._applyGraphicsQuality(state.graphicsQuality));
    this._applyGraphicsQuality(this.settings.state.graphicsQuality);
    this.audio = new GameAudio(this.settings);
    this.detector = new GeigerDetector(this.source);
    this.viewmodel = new DetectorViewmodel(this.sceneManager.vmScene, this.sceneManager.vmCamera, this.detector, this.audio);
    this.field = new RadiationField(this.sceneManager.scene, this.source);
    this.atmosphere = new EpicAtmosphere(this.sceneManager.scene, lab.mats.ceiling);
    this.hud = new HUD();
    this.interact = new InteractionSystem(lab.containers, lab.colliders, this.source, this.sceneManager.camera, this.hud, this.audio);
    // objetos soltos do cenário (caixas das estantes, teclados, mouses):
    // todos podem ser pegos e manipulados com F
    for (const m of lab.props) this.interact.registerProp(m, lab.propIgnore, lab.propSurfaces);
    if (lab.bucket) this.interact.registerBucket(lab.bucket, lab.propIgnore, lab.propSurfaces);
    this.recorder = new RouteRecorder();
    this.health = new HealthSystem();
    this.mission = new MissionManager(this.hud, this.source, () => this._end(true), () => this._end(false, 'dose'));
    this._dangerWarned = false;
    this._sourceDestabilized = false;

    this.baseDifficulty = DIFFICULTIES.training;
    this.saveSlot = 1;
    this.phase = 1;
    this.difficulty = this._makePhaseDifficulty(this.baseDifficulty, this.phase);
    this._endWon = false;
    this.startPos = this.player.position.clone();
    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.playing = false;
    this.paused = false;
    this.ended = false;
    document.body.classList.remove('gameplay-active');
    this.player.setGamepadInput(0, 0, false, false);
    this.debug = { enabled: false, sphere: null, line: null, frames: 0, fpsTimer: 0, fps: 0 };
    this._lowFpsStreak = 0;
    this._hudTimer = 0;

    this._bindUI();
    this.gamepad = new XboxGamepadController(this);
    this._bindKeys();
  }

  _makePhaseDifficulty(base, phase) {
    if (phase === EVAC_PHASE) {
      return {
        ...base,
        label: `${base.label} · Fase ${EVAC_PHASE} · Evacuação`,
        evacuation: true,
        fieldFadeStart: 0,
        doseLimit: Infinity,
        intensityMultiplier: 0,
        decoyCount: 0,
        destabilizeAfter: Infinity,
        destabilizeMultiplier: 1,
        healthDamage: false,
      };
    }
    const pressure = phase - 1;        // 0 .. EVAC_PHASE-2 (0..11)
    const span = EVAC_PHASE - 2;       // nº de degraus de escalada (11)
    return {
      ...base,
      label: `${base.label} · Fase ${phase}`,
      // O campo visível e o orçamento de dose NÃO mudam entre as fases; a
      // pressão vem da fonte, da instabilidade e dos NORMs adicionais.
      fieldFadeStart: base.fieldFadeStart,
      doseLimit: base.doseLimit,
      // A quantidade de NORMs cresce em blocos de três fases, limitada pelo
      // perfil: Treinamento 2, Normal 3 e Difícil 4.
      decoyCount: Math.min(base.maxDecoys, 1 + Math.floor(pressure / 3)),
      // A radiação da fonte cresce exponencialmente. Na fase 12, o Co-60
      // estável chega a ~9800 @1m; aproximação/instabilidade podem passar de
      // 10000, quando o monitor entra em OverLoad.
      intensityMultiplier: Math.pow(PHASE_INTENSITY_MAX, pressure / span),
      // ...e a fonte fica mais instável a cada fase, mas com pisos e tetos para
      // que o evento continue dando tempo de reação. No Treinamento não ocorre.
      destabilizeAfter: base.destabilizeAfter === Infinity
        ? Infinity
        : Math.max(base.destabilizeMin, base.destabilizeAfter - pressure * base.destabilizeStep),
      destabilizeMultiplier: Math.min(
        base.destabilizeMax,
        base.destabilizeMultiplier * (1 + pressure * base.destabilizeGrowth)
      ),
    };
  }

  _applyPhase(base, phase) {
    this.baseDifficulty = base;
    this.phase = phase;
    this.difficulty = this._makePhaseDifficulty(base, phase);
    this.field.fadeStart = this.difficulty.fieldFadeStart;
    this.mission.doseLimit = this.difficulty.doseLimit;
    this._sourceDestabilized = false;
    saveCampaignProgress(this.baseDifficulty, this.phase, this.saveSlot);
    // a intensidade da fonte/NORMs e a contagem de NORMs são aplicadas no respawn()
  }

  _updateSourceInstability() {
    if (this.difficulty.evacuation) return;
    if (this._sourceDestabilized || this.elapsed < this.difficulty.destabilizeAfter) return;
    if (!this.source.destabilize(this.difficulty.destabilizeMultiplier)) return;

    this._sourceDestabilized = true;
    this.mission.setSourceUnstable();
    // aviso apenas na HUD/missão: o LCD segue mostrando a leitura, como o
    // equipamento real (o firmware não tem tela "FONTE INSTÁVEL")
  }

  _resetContainersForPhase() {
    for (const state of this._containerInitialState) {
      const c = state.container;
      c.open = false;
      c.progress = 0;
      if ('baseLocked' in c) c.locked = c.baseLocked;
      if (c.lid && state.lidPosition && state.lidRotation) {
        c.lid.position.copy(state.lidPosition);
        c.lid.rotation.copy(state.lidRotation);
      }
      if (c.apply) c.apply(0);
      if (c.shieldEntry) c.shieldEntry.transmission = c.closedTransmission;
    }
  }

  // Nova fase NA MESMA CENA: nenhuma instância é recriada — fonte, campo,
  // detector, viewmodel, interação e missão são reutilizados e apenas o
  // estado é re-sorteado/zerado. Nada duplica na cena, nada vaza na GPU.
  _startPhaseInPlace(phase, baseDifficulty = this.baseDifficulty) {
    this._resetContainersForPhase();
    this._applyPhase(baseDifficulty, phase);
    // Clima épico verde a partir da fase 8 (mesma virada da trilha); desligado
    // nas fases iniciais e na evacuação. As partículas aceleram até a fase 12.
    this.atmosphere.setPhase(phase);
    this.atmosphere.setActive(phase >= MENU_MUSIC_FROM_PHASE && !this.difficulty.evacuation);
    this.evacuation.stop();
    if (this.difficulty.evacuation) this.source.disable();
    else this.source.respawn(this.difficulty.intensityMultiplier, this.difficulty.decoyCount);
    this.detector.reset();
    this.detector.setEvacuation(Boolean(this.difficulty.evacuation));
    this.field.reset();
    this.interact.reset();
    if (this.difficulty.evacuation) {
      this.evacuation.start();
      this.interact.setEvacuation(this.evacuation);
    }
    this.recorder.reset();
    this.health.reset();
    this.mission.reset();
    this.mission.setEvacuation(Boolean(this.difficulty.evacuation));
    this.viewmodel.resetPose();
    this.hud.setEvacuation(Boolean(this.difficulty.evacuation));

    this.player.position.copy(this.startPos);
    this.player.velocity.set(0, 0, 0);
    this.player.height = PLAYER_HEIGHT;
    this.player.onGround = true;
    this.player._syncCamera();
    this._levelCamera();

    this.elapsed = 0;
    this._hudTimer = 0;
    this.ended = false;
    this._endWon = false;
    this._dangerWarned = false;
    this._hints = [];
    document.getElementById('end-screen').style.display = 'none';
    const campaignScreen = document.getElementById('campaign-screen');
    campaignScreen.classList.remove('visible');
    campaignScreen.style.display = 'none';
    this.hud.show();
    this.detector.showTransient(`FASE-${phase}`, this.difficulty.evacuation ? 'EVACUAÇÃO' : 'INÍCIO', 1.4);
    this.mission.start();
    this._requestResume();
  }

  _bindUI() {
    const start = document.getElementById('start-screen');
    const pause = document.getElementById('pause-screen');
    const boot = document.getElementById('boot-screen');
    const bootContinue = document.getElementById('boot-continue');
    bootContinue.addEventListener('click', () => this._continueBoot());

    this.startMenu = new StartMenu(
      (diff, slot) => {
        this.saveSlot = slot;
        this._startPhaseInPlace(1, diff);
      },
      (saved) => {
        this.saveSlot = saved.slot;
        this._startPhaseInPlace(saved.phase, DIFFICULTIES[saved.difficulty] || DIFFICULTIES.training);
      },
      this.settings,
      this.audio
    );
    this.pauseMenu = new PauseMenu(
      () => this._requestResume(),
      () => this._startPhaseInPlace(this.phase),
      () => this._returnToMenu(),
      this.settings,
      this.audio
    );
    document.getElementById('btn-next-phase').addEventListener('click', () => {
      this._startPhaseInPlace(this._endWon ? this.phase + 1 : this.phase);
    });
    document.getElementById('btn-end-menu').addEventListener('click', () => {
      this.audio.uiClick();
      this._returnToMenu();
    });
    this.campaignEmbers = new EmberField('campaign-particles', 420);
    this.campaignEmbers.setIntensity(1.4);
    document.getElementById('btn-play-again').addEventListener('click', () => {
      this.audio.uiClick();
      this._startPhaseInPlace(1, this.baseDifficulty);
    });
    document.getElementById('btn-campaign-menu').addEventListener('click', () => {
      this.audio.uiClick();
      this._returnToMenu();
    });
    // se o navegador recusar o pointer lock imediato (raro), um clique na
    // cena retoma o jogo sem passar pelos menus
    this.sceneManager.renderer.domElement.addEventListener('click', () => {
      if (this.playing && !this.ended && !this.player.controls.isLocked) this.player.controls.lock();
    });

    this.player.controls.addEventListener('lock', () => this._enterGameplay());
    this.player.controls.addEventListener('unlock', () => this._openPauseMenu());

  }

  _continueBoot() {
    const boot = document.getElementById('boot-screen');
    if (getComputedStyle(boot).display === 'none') return;
    // Clique, tecla ou botão A libera o fluxo. O navegador ainda pode exigir
    // uma interação de teclado/mouse para áudio, mas nunca bloqueia o gamepad.
    this.audio.playMenuMusic();
    this.audio.uiClick();
    boot.style.display = 'none';
  }

  _enterGameplay() {
    // Se `playing` ainda é falso, a fase foi aberta pelo menu/save. Isso
    // permite reiniciar a trilha épica sem afetar a continuidade entre fases.
    const enteringFromMenu = !this.playing;
    this.paused = false;
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('pause-screen').style.display = 'none';
    document.body.classList.add('gameplay-active');
    this.audio.stopMenuMusic();
    this.audio.playPhaseMusic(this.phase, enteringFromMenu);
    this.hud.show();
    if (!this.playing) {
      this.playing = true;
      this.startMenu.stop();
      this._levelCamera();
      this.player._syncCamera();
      this.detector.showTransient('Mode-1:', 'µSv/h');
      if (this.difficulty.hints) this._queueTutorialHints();
    }
  }

  _requestResume() {
    if (this.gamepad?.connected) this._enterGameplay();
    else this.player.controls.lock();
  }

  _pauseForGamepad() {
    if (this.player.controls.isLocked) this.player.controls.unlock();
    else this._openPauseMenu();
  }

  _openPauseMenu() {
    if (this.ended || !this.playing || this.paused) return;
    this.paused = true;
    document.body.classList.remove('gameplay-active');
    this.player.setGamepadInput(0, 0, false, false);
    this.interact.keyUpF();
    this.pauseMenu.setStats(this.difficulty.evacuation
      ? `${this.difficulty.label} · <b>Protocolo de evacuação em andamento</b>`
      : `${this.difficulty.label} · Tempo <b>${this._fmtTime(this.elapsed)}</b> · ` +
        `Dose <b>${this.detector.accumulated.toFixed(3)} / ${this.mission.doseLimit} µSv</b> · ` +
        `Saúde <b>${Math.round(this.health.health)}%</b>`);
    this.pauseMenu.open();
    this.hud.hide();
  }

  _returnToMenu() {
    // A campanha continua salva, mas a simulação atual deixa de rodar.
    // Assim, voltar ao menu não permite que tempo, dose ou missão avancem.
    this.interact.cancelF();
    this.playing = false;
    this.paused = false;
    this.ended = false;
    this.atmosphere.setActive(false); // volta o cenário ao normal no menu
    document.body.classList.remove('gameplay-active');
    this.player.setGamepadInput(0, 0, false, false);
    this.audio.stopPhaseMusic();
    this.hud.hide();
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('end-screen').style.display = 'none';
    const campaignScreen = document.getElementById('campaign-screen');
    campaignScreen.classList.remove('visible');
    campaignScreen.style.display = 'none';
    if (this.evacuation.active) {
      this.evacuation.stop();
      this.lab.exitDoor.open = false;
      this.lab.exitDoor.locked = true;
      this.lab.exitDoor.apply?.(0);
    }
    document.getElementById('start-screen').style.display = 'flex';
    this.startMenu.show();
    this.player.controls.unlock();
  }

  // Zera o pitch/roll herdado da câmera orbital, mantendo só a direção (yaw),
  // para o jogador começar olhando na horizontal.
  _levelCamera() {
    const cam = this.sceneManager.camera;
    const e = new THREE.Euler(0, 0, 0, 'YXZ');
    e.setFromQuaternion(cam.quaternion);
    cam.quaternion.setFromEuler(new THREE.Euler(0, e.y, 0, 'YXZ'));
  }

  _bindKeys() {
    addEventListener('keydown', (e) => {
      if (e.code === 'F3') { e.preventDefault(); this._toggleDebug(); }
      if (e.code === 'Escape' && this.playing && !this.ended && !this.paused && !this.player.controls.isLocked) {
        this._openPauseMenu();
        return;
      }
      if (!this.playing || this.ended || this.paused) return;
      if (e.code === 'KeyF' && !e.repeat) this._interactionDown();
      if (e.code === 'KeyQ' && !e.repeat) { // examinar o MGP-101 de perto
        this.viewmodel.inspect = !this.viewmodel.inspect;
      }
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'KeyF') this._interactionUp();
    });
    addEventListener('blur', () => this.interact.cancelF());
  }

  _interactionDown() {
    if (!this.playing || this.ended || this.paused) return;
    const result = this.interact.keyDownF();
    if (result === 'collected') this.mission.collect();
    if (result === 'evacuation-key' && this.evacuation.collectKey()) {
      this.mission.collectEvacuationKey();
    }
  }

  _interactionUp() {
    this.interact.keyUpF();
  }

  // Dicas passo a passo do modo Tutorial (processadas pelo tempo de jogo)
  _queueTutorialHints() {
    const interact = this.gamepad?.connected ? 'X' : 'F';
    const inspect = this.gamepad?.connected ? 'Y' : 'Q';
    this._hints = [
      { t: 3, msg: 'O display mostra a taxa de dose: ela cresce com 1/distância².' },
      { t: 12, msg: 'Ande pelo laboratório: leitura subindo = você está mais perto.' },
      { t: 22, msg: `Aperte ${interact} para abrir armários, gavetas, barris e maletas.` },
      { t: 34, msg: 'Objetos blindam a radiação: leituras baixas podem enganar.' },
      { t: 46, msg: `Pressione ${inspect} para examinar o MGP-101 de perto.` },
      { t: 58, msg: `De perto, o campo de radiação fica visível. Recolha a pastilha com ${interact}!` },
    ];
  }

  _toggleDebug() {
    const d = this.debug;
    d.enabled = !d.enabled;
    document.getElementById('debug').style.display = d.enabled ? 'block' : 'none';
    if (d.enabled && !d.sphere) {
      d.sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff3030 })
      );
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
      d.line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xff3030 }));
      d.line.frustumCulled = false;
      this.sceneManager.scene.add(d.sphere, d.line);
    }
    if (d.sphere) d.sphere.visible = d.line.visible = d.enabled && !this.difficulty.evacuation;
  }

  _updateDebug(dt) {
    const d = this.debug;
    d.frames++; d.fpsTimer += dt;
    let refreshed = false;
    if (d.fpsTimer >= 0.5) {
      d.fps = Math.round(d.frames / d.fpsTimer);
      d.frames = 0; d.fpsTimer = 0;
      refreshed = true;
      this._adaptQuality(d.fps);
    }
    if (!d.enabled) return;

    if (this.difficulty.evacuation) {
      if (d.sphere) d.sphere.visible = d.line.visible = false;
      if (refreshed) {
        document.getElementById('debug').innerHTML =
          `FPS: ${d.fps}<br>Fase ${EVAC_PHASE} · Evacuação<br>Fonte: desativada<br>Radiação: fundo (${BACKGROUND_DOSE.toFixed(2)} µSv/h)`;
      }
      return;
    }

    const cam = this.sceneManager.camera.position;
    d.sphere.position.copy(this.source.position);
    const pos = d.line.geometry.attributes.position;
    pos.setXYZ(0, cam.x, cam.y - 0.2, cam.z);
    pos.setXYZ(1, this.source.position.x, this.source.position.y, this.source.position.z);
    pos.needsUpdate = true;

    if (!refreshed) return; // o texto do painel só é remontado 2×/s
    const dist = cam.distanceTo(this.source.position);
    document.getElementById('debug').innerHTML =
      `FPS: ${d.fps}<br>` +
      `Isótopo: ${this.source.isotope.name} (${this.source.isotope.gamma})<br>` +
      `Intensidade: ${this.source.intensity} µSv/h @1m<br>` +
      `Esconderijo: ${this.source.spotName}<br>` +
      `Distância: ${dist.toFixed(2)} m<br>` +
      `Transmissão (blindagem): ${(this.source.debugTransmission * 100).toFixed(1)}%<br>` +
      `Dose real: ${this.detector.trueDose.toFixed(2)} µSv/h<br>` +
      `Saúde: ${this.health.health.toFixed(1)} (dano ${this.health.damageRate.toFixed(2)} HP/s)`;
  }

  // FPS abaixo de 45 por ~2 s seguidos: desce um degrau de qualidade
  // (menos pixel ratio → bloom mais fraco → sem pós-processamento).
  _adaptQuality(fps) {
    if (this.settings.state.graphicsQuality !== 'auto') { this._lowFpsStreak = 0; return; }
    if (!this.playing || this.ended) { this._lowFpsStreak = 0; return; }
    if (fps < 45) {
      if (++this._lowFpsStreak >= 4) {
        this._lowFpsStreak = 0;
        this.sceneManager.setQuality(this.sceneManager.quality + 1);
      }
    } else {
      this._lowFpsStreak = 0;
    }
  }

  _applyGraphicsQuality(value) {
    if (value === 'auto') {
      this._lowFpsStreak = 0;
      this.sceneManager.setQuality(0);
      return;
    }
    const qualityLevel = { high: 0, medium: 1, low: 2 }[value];
    this._lowFpsStreak = 0;
    this.sceneManager.setQuality(qualityLevel ?? 0);
  }

  _fmtTime(t) {
    const m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  _end(won, reason = null) {
    this.ended = true;
    this._endWon = won;
    document.body.classList.remove('gameplay-active');
    this.player.setGamepadInput(0, 0, false, false);
    this.interact.keyUpF();
    this.hud.hide();
    if (won && this.phase < EVAC_PHASE) {
      // A conclusão grava imediatamente a próxima fase liberada no slot ativo.
      saveCampaignProgress(this.baseDifficulty, this.phase + 1, this.saveSlot);
    }

    const title = document.getElementById('end-title');
    const sub = document.getElementById('end-sub');
    const stats = document.getElementById('end-stats');

    // recordes por dificuldade (apenas vitórias)
    let recordLine = '';
    if (won) {
      const key = `mgp101_best_${this.baseDifficulty.key}_phase_${this.phase}`;
      const best = parseFloat(localStorage.getItem(key));
      if (!best || this.elapsed < best) {
        localStorage.setItem(key, this.elapsed.toFixed(1));
        recordLine = `<br>🏆 Novo recorde (${this.difficulty.label}): <b>${this._fmtTime(this.elapsed)}</b>`;
      } else {
        recordLine = `<br>Recorde (${this.difficulty.label}): <b>${this._fmtTime(best)}</b>`;
      }
    }

    if (won) {
      title.innerHTML = '<svg class="rad-ico" viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="12" cy="12" r="2.2"/><path d="M12 3.6 A8.4 8.4 0 0 1 19.3 7.8 L15.1 10.2 A3.6 3.6 0 0 0 12 8.4 Z"/><path d="M12 3.6 A8.4 8.4 0 0 1 19.3 7.8 L15.1 10.2 A3.6 3.6 0 0 0 12 8.4 Z" transform="rotate(120 12 12)"/><path d="M12 3.6 A8.4 8.4 0 0 1 19.3 7.8 L15.1 10.2 A3.6 3.6 0 0 0 12 8.4 Z" transform="rotate(240 12 12)"/></g></svg> <span class="rad">Fonte recolhida!</span>';
      sub.textContent = this.phase === EVAC_PHASE - 1
        ? 'Última fonte blindada e transportada em segurança. O laboratório está limpo. O protocolo de evacuação foi autorizado.'
        : `Fonte blindada e transportada em segurança. Prepare-se: na Fase ${this.phase + 1} a fonte é mais intensa e instável e pode até estourar o teto de ${EQUIPMENT_MAX_DOSE} µSv/h do monitor.`;
    } else if (reason === 'health') {
      title.innerHTML = '☠ <span style="color:#ff5252">Síndrome aguda da radiação</span>';
      sub.textContent = 'Você permaneceu tempo demais em uma área de taxa de dose altíssima. ' +
        'A barra de saúde e o orçamento de dose são regras de tensão do jogo, não uma previsão clínica.';
    } else {
      title.innerHTML = '⚠ <span style="color:#ff5252">Orçamento de dose esgotado</span>';
      sub.textContent = 'Você ultrapassou o orçamento operacional da missão. Reduza o tempo em áreas quentes, mantenha distância e use a blindagem.';
    }

    stats.innerHTML =
      `Fase: <b>${this.phase}</b> · ${this.baseDifficulty.label}<br>` +
      `Tempo: <b>${this._fmtTime(this.elapsed)}</b> · ` +
      `Dose acumulada: <b>${this.detector.accumulated.toFixed(3)} µSv</b> (orçamento ${this.mission.doseLimit} µSv) · ` +
      `Pico: <b>${this.detector.peakDose.toFixed(1)} µSv/h</b><br>` +
      `Saúde final: <b>${Math.round(this.health.health)}%</b> (mínima: ${Math.round(this.health.minHealth)}%) · ` +
      `Fonte: <b>${this.source.isotope.name}</b> (γ ${this.source.isotope.gamma}), ` +
      `${this.source.intensity} µSv/h @1m · <b>${this.source.spotName}</b>` +
      recordLine;

    document.getElementById('btn-next-phase').textContent = won
      ? (this.phase === EVAC_PHASE - 1 ? `Iniciar Fase ${EVAC_PHASE} · Evacuação` : `Iniciar Fase ${this.phase + 1}`)
      : `Repetir Fase ${this.phase}`;

    this.recorder.draw(
      document.getElementById('end-map'),
      this.colliders, this.source, this.startPos
    );

    document.getElementById('end-screen').style.display = 'flex';
    this.player.controls.unlock();
  }

  _completeCampaign() {
    if (this.ended) return;
    this.ended = true;
    this._endWon = true;
    document.body.classList.remove('gameplay-active');
    this.player.setGamepadInput(0, 0, false, false);
    this.interact.keyUpF();
    this.mission.ended = true;
    this.hud.hide();
    deleteCampaignSlot(this.saveSlot);
    const campaignScreen = document.getElementById('campaign-screen');
    campaignScreen.classList.remove('visible');
    campaignScreen.style.display = 'flex';
    requestAnimationFrame(() => campaignScreen.classList.add('visible'));
    this.player.controls.unlock();
  }

  start() {
    this.sceneManager.renderer.setAnimationLoop(() => this._tick());
  }

  _tick() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const cam = this.sceneManager.camera;
    this.gamepad.update(dt);

    // câmera cinematográfica orbitando o laboratório enquanto o menu está aberto
    if (!this.playing) {
      const t = performance.now() / 1000;
      cam.position.set(
        Math.cos(t * 0.07) * 7.5,
        2.5 + Math.sin(t * 0.045) * 0.4,
        Math.sin(t * 0.07) * 7.5
      );
      cam.lookAt(0, 1.1, 0);
    }

    if (this.playing && !this.ended && !this.paused) {
      this.elapsed += dt;
      if (!this.difficulty.evacuation) this.source.refreshPosition();
      this.player.update(dt);
      this._updateSourceInstability();
      this.detector.update(dt, cam.position);
      if (!this.difficulty.evacuation) this.field.update(dt, cam.position);
      this.atmosphere.update(dt);
      this.interact.update(dt);
      if (!this.difficulty.evacuation) this.recorder.update(dt, this.player.position, this.detector.trueDose);
      this.mission.update(cam.position, this.detector.accumulated, this.detector.trueDose);
      if (this.difficulty.evacuation) {
        if (this.lab.exitDoor.open) this.mission.evacuationDoorOpened();
        this.evacuation.update(this.player.position, () => this._completeCampaign());
      }

      // dicas do tutorial
      if (this._hints && this._hints.length && this.elapsed > this._hints[0].t) {
        this.hud.toast(this._hints.shift().msg, 5);
      }

      // dano/regeneração de saúde pela taxa de dose atual (desligado no Tutorial)
      if (this.difficulty.healthDamage !== false) this.health.update(dt, this.detector.trueDose);
      // queimaduras radioativas: a saúde baixa deixa o jogador mais lento
      this.player.healthFactor = this.health.speedFactor();
      if (this.health.damageRate > 0 && !this._dangerWarned) {
        this._dangerWarned = true;
        this.hud.toast('☢ Você está sofrendo queimaduras radioativas! Afaste-se da fonte!', 4);
      } else if (this.health.damageRate === 0) {
        this._dangerWarned = false;
      }
      if (this.health.isDead()) {
        this.mission.ended = true;
        this._end(false, 'health');
        return;
      }

      // textos/barras do HUD a 10 Hz; as vinhetas têm guarda interna própria
      if (!this.difficulty.evacuation) {
        this._hudTimer += dt;
        if (this._hudTimer >= 0.1) {
          this._hudTimer = 0;
          this.hud.update(this.elapsed, this.detector.accumulated, this.mission.doseLimit, this.health.health);
        }
        this.hud.setDoseRate(this.detector.trueDose);
        this.hud.setDamage(this.health.damageRate, this.health.health, this.elapsed);
      }
    }

    if (!this.paused) {
      this.viewmodel.update(dt, this.player.speedXZ, this.player.running, this.player.onGround);
    }
    this._updateDebug(dt);
    this.sceneManager.render();
  }
}
