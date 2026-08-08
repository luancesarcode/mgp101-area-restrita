import * as THREE from 'three';
import radiationMonitorAudioUrl from '../../assets/radiation-monitor.mp3?url';
import phaseOneAudioUrl from '../../assets/Fase1.mp3?url';
import victoryAudioUrl from '../../assets/calm_victory.mp3?url';
import { EVAC_PHASE, MENU_MUSIC_FROM_PHASE } from '../config/gameConfig.js';

export class GameAudio {
  constructor(settings) {
    this.settings = settings;
    this.context = null;
    this._lastGeigerClick = -Infinity;
    this._lastImpact = -Infinity;
    this._menuMusicRequested = true;
    this._gameplayMusic = null;
    this.music = this._createMusicTrack(
      radiationMonitorAudioUrl,
      'https://radinstruments.com.br/wp-content/uploads/2026/07/radiation-monitor.mp3',
      () => this._menuMusicRequested
    );
    this.music.autoplay = true;
    this.phaseMusic = this._createMusicTrack(
      phaseOneAudioUrl,
      'https://radinstruments.com.br/wp-content/uploads/2026/07/Fase1.mp3',
      () => this._gameplayMusic === this.phaseMusic
    );
    this.victoryMusic = this._createMusicTrack(
      victoryAudioUrl,
      'https://radinstruments.com.br/wp-content/uploads/2026/07/calm_victory.mp3',
      () => this._gameplayMusic === this.victoryMusic
    );
    this.syncVolumes();
    // Tenta tocar já na abertura. Se o navegador tiver permissão de autoplay,
    // a trilha começa sem interação; se não tiver, o fallback abaixo a inicia
    // no primeiro clique/tecla sem exibir erro no console.
    this.music.play().catch(() => {});
  }

  _createMusicTrack(localSrc, fallbackSrc, shouldResume) {
    const track = new Audio(localSrc);
    let usingFallback = false;
    track.loop = true;
    track.preload = 'auto';
    track.volume = 0;
    track.addEventListener('error', () => {
      if (usingFallback) return;
      usingFallback = true;
      const resumePlayback = Boolean(shouldResume?.());
      console.info(`Áudio local indisponível; usando fallback remoto: ${fallbackSrc}`);
      track.src = fallbackSrc;
      track.load();
      if (resumePlayback) track.play().catch(() => {});
    });
    return track;
  }

  _contextFromGesture() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    if (!this.context) this.context = new Ctor();
    return this.context;
  }

  _channelVolume(channel) {
    const master = THREE.MathUtils.clamp(Number(this.settings.state.masterVolume) || 0, 0, 1);
    const channelVolume = THREE.MathUtils.clamp(Number(this.settings.state[`${channel}Volume`]) || 0, 0, 1);
    return master * channelVolume;
  }

  // Os tons e ruídos curtos parecem bem mais baixos que uma faixa masterizada.
  // Compensamos somente os efeitos, preservando os controles de música/Geiger.
  _outputVolume(channel) {
    return this._channelVolume(channel) * (channel === 'effects' ? 4.8 : 1);
  }

  syncVolumes() {
    // Arquivos musicais já vêm masterizados; deixamos margem para os efeitos
    // curtos permanecerem claros mesmo com os canais em valores semelhantes.
    const musicVolume = this._channelVolume('music') * 0.42;
    this.music.volume = musicVolume;
    this.phaseMusic.volume = musicVolume;
    this.victoryMusic.volume = musicVolume;
  }

  // A faixa do usuário toca apenas nas telas de menu/pausa. `play()` só é
  // disparado por uma interação (botão, tecla ou Escape), como os navegadores
  // exigem para liberar áudio.
  playMenuMusic() {
    this._menuMusicRequested = true;
    this.syncVolumes();
    this.music.play().catch(() => {});
  }

  stopMenuMusic() {
    this._menuMusicRequested = false;
    this.music.pause();
  }

  // A fase 8 marca a entrada da trilha épica e sempre a inicia do começo.
  // Carregar do menu qualquer fase 8..12 também reinicia essa faixa; ao avançar
  // normalmente entre as fases 9..12, ela segue do trecho atual.
  playPhaseMusic(phase, restartEpicTrack = false) {
    const nextTrack = phase === EVAC_PHASE
      ? this.victoryMusic
      : phase >= MENU_MUSIC_FROM_PHASE ? this.music : this.phaseMusic;
    if (phase === MENU_MUSIC_FROM_PHASE ||
        (restartEpicTrack && phase > MENU_MUSIC_FROM_PHASE && phase < EVAC_PHASE)) {
      nextTrack.currentTime = 0;
    }
    if (nextTrack === this.victoryMusic && this._gameplayMusic !== nextTrack) {
      nextTrack.currentTime = 0;
    }
    if (this._gameplayMusic && this._gameplayMusic !== nextTrack) this._gameplayMusic.pause();
    this._gameplayMusic = nextTrack;
    this.syncVolumes();
    nextTrack.play().catch(() => {});
  }

  stopPhaseMusic() {
    this._gameplayMusic?.pause();
    this._gameplayMusic = null;
  }

  _tone(frequency, duration, gain, fromGesture = false, channel = 'effects') {
    const volume = this._outputVolume(channel);
    if (volume <= 0) return;
    const ctx = fromGesture ? this._contextFromGesture() : this.context;
    if (!ctx) return;
    const start = () => {
      if (ctx.state !== 'running') return;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'square';
      osc.frequency.setValueAtTime(frequency, now);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain * volume), now + 0.006);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(amp).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.01);
    };
    if (ctx.state === 'suspended' && fromGesture) ctx.resume().then(start).catch(() => {});
    else start();
  }

  uiClick() {
    this._tone(760, 0.045, 0.055, true);
  }
  test() {
    this._tone(980, 0.12, 0.10, true, 'effects');
    setTimeout(() => this._tone(1320, 0.028, 0.06, true, 'geiger'), 160);
  }

  geigerClick(doseRate) {
    if (!this.context || this.context.state !== 'running' || this._channelVolume('geiger') <= 0) return;
    const danger = THREE.MathUtils.clamp((Math.log10(Math.max(doseRate, 0.1)) + 1) / 3.2, 0, 1);
    const now = performance.now();
    const interval = THREE.MathUtils.lerp(950, 105, danger);
    if (now - this._lastGeigerClick < interval) return;
    this._lastGeigerClick = now;
    this._tone(760 + danger * 760, 0.022, 0.022 + danger * 0.03, false, 'geiger');
  }

  // ==== Efeitos procedurais das interações ==================================
  // Ruído branco com decaimento linear + passa-baixa: a base de todos os
  // baques e deslizes. Nada de arquivos — o jogo continua num único HTML.
  _noise(duration, gain, cutoff, channel = 'effects') {
    const volume = this._outputVolume(channel);
    if (volume <= 0 || !this.context || this.context.state !== 'running') return;
    const ctx = this.context;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = cutoff;
    const amp = ctx.createGain();
    amp.gain.value = gain * volume;
    src.connect(filt).connect(amp).connect(ctx.destination);
    src.start();
  }

  // Baque de colisão. `strength` 0..1 já vem com a velocidade do impacto e a
  // atenuação por distância aplicadas pelo chamador; aqui só limitamos a
  // cadência (a física gera vários contatos por queda — vira UM baque).
  impact(strength) {
    const now = performance.now();
    if (strength <= 0.02 || now - this._lastImpact < 70) return;
    this._lastImpact = now;
    this._noise(0.05 + 0.07 * strength, 0.16 * strength, 320 + 480 * strength);
  }

  drawer() { this._noise(0.16, 0.05, 1300); }   // deslize de gaveta/porta de armário
  grab() { this._tone(540, 0.035, 0.05); }      // pegar objeto
  release() { this._tone(390, 0.035, 0.045); }  // soltar objeto

  // tampa arrancada: estalo de madeira/metal + tom grave de "pressão saindo"
  lidPop() {
    this._noise(0.12, 0.14, 900);
    this._tone(300, 0.1, 0.07);
  }

  // porta trancada: dois toques surdos, como bater numa porta pesada
  doorLocked() {
    this._tone(150, 0.09, 0.12);
    setTimeout(() => this._tone(112, 0.12, 0.1), 110);
  }
}
