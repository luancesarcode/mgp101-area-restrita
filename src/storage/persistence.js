import * as THREE from 'three';
import { CAMPAIGN_SLOT_COUNT, COOKIE_MAX_AGE, DIFFICULTIES, PROGRESS_COOKIE, SETTINGS_COOKIE, STORAGE_FALLBACK_PREFIX, TOTAL_PHASES } from '../config/gameConfig.js';

// ==== PROGRESSO / CONFIGURAÇÕES LOCAIS =====================================
// Cada slot guarda somente dificuldade, fase e data: ao continuar, a fase
// recomeça limpa, sem restaurar uma física/posição intermediária inconsistente.
function _readCookie(name) {
  const key = `${encodeURIComponent(name)}=`;
  const entry = document.cookie.split('; ').find((part) => part.startsWith(key));
  return entry ? entry.slice(key.length) : null;
}

function _readCookieJson(name) {
  try {
    const value = _readCookie(name);
    if (value) return JSON.parse(decodeURIComponent(value));
  } catch (_) {
    // tenta o espelho local abaixo
  }
  // Alguns hosts locais bloqueiam cookies (por exemplo, file://). Mantemos um
  // espelho somente para que a campanha não se perca nesses casos.
  try { return JSON.parse(localStorage.getItem(`${STORAGE_FALLBACK_PREFIX}${name}`) || 'null'); }
  catch (_) { return null; }
}

function _writeCookieJson(name, value) {
  const json = JSON.stringify(value);
  try {
    document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(json)}; Max-Age=${COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
  } catch (_) {
    // O espelho local abaixo cobre hosts que não oferecem cookies.
  }
  try { localStorage.setItem(`${STORAGE_FALLBACK_PREFIX}${name}`, json); }
  catch (_) { /* armazenamento indisponível: o jogo segue sem persistência */ }
}

function _validCampaignSlot(value, fallbackSlot) {
  if (!value || !DIFFICULTIES[value.difficulty]) return null;
  const phase = Number(value.phase);
  if (!Number.isFinite(phase) || phase < 1) return null;
  const slot = THREE.MathUtils.clamp(Math.floor(Number(fallbackSlot) || 1), 1, CAMPAIGN_SLOT_COUNT);
  const updatedAt = Number(value.updatedAt);
  return {
    slot,
    difficulty: value.difficulty,
    phase: THREE.MathUtils.clamp(Math.floor(phase), 1, TOTAL_PHASES),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
  };
}

export function loadCampaignSlots() {
  const saved = _readCookieJson(PROGRESS_COOKIE);
  let slots = Array(CAMPAIGN_SLOT_COUNT).fill(null);

  if (saved?.version >= 2 && Array.isArray(saved.slots)) {
    slots = slots.map((_, index) => _validCampaignSlot(saved.slots[index], index + 1));
  } else {
    // Migração automática do save antigo { difficulty, phase } para o slot 1.
    slots[0] = _validCampaignSlot(saved, 1);
    if (slots[0]) _writeCookieJson(PROGRESS_COOKIE, { version: 2, slots });
  }
  return slots;
}

export function saveCampaignProgress(difficulty, phase, slot = 1) {
  if (!difficulty?.key || !DIFFICULTIES[difficulty.key]) return;
  const slotIndex = THREE.MathUtils.clamp(Math.floor(Number(slot) || 1), 1, CAMPAIGN_SLOT_COUNT) - 1;
  const slots = loadCampaignSlots();
  slots[slotIndex] = {
    slot: slotIndex + 1,
    difficulty: difficulty.key,
    phase: THREE.MathUtils.clamp(Math.floor(phase), 1, TOTAL_PHASES),
    updatedAt: Date.now(),
  };
  _writeCookieJson(PROGRESS_COOKIE, { version: 2, slots });
}

export function deleteCampaignSlot(slot) {
  const slotIndex = THREE.MathUtils.clamp(Math.floor(Number(slot) || 1), 1, CAMPAIGN_SLOT_COUNT) - 1;
  const slots = loadCampaignSlots();
  slots[slotIndex] = null;
  _writeCookieJson(PROGRESS_COOKIE, { version: 2, slots });
}

export function loadCampaignProgress() {
  return loadCampaignSlots().filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;
}

const DEFAULT_SETTINGS = Object.freeze({
  masterVolume: 1,
  musicVolume: 0.45,
  effectsVolume: 0.65,
  geigerVolume: 0.65,
  largeText: false,
  highContrast: false,
  reducedMotion: false,
  graphicsQuality: 'auto',
});

export class GameSettings {
  constructor() {
    const saved = _readCookieJson(SETTINGS_COOKIE) || {};
    this._listeners = [];
    // Migra a configuração antiga de volume único para os três canais sem
    // alterar a preferência de quem já jogou antes desta atualização.
    const legacyVolume = Number(saved.volume);
    const savedMasterVolume = Number(saved.masterVolume);
    const savedOrLegacy = (key, fallback) => {
      const value = Number(saved[key]);
      if (Number.isFinite(value)) return THREE.MathUtils.clamp(value, 0, 1);
      if (Number.isFinite(legacyVolume)) return THREE.MathUtils.clamp(legacyVolume, 0, 1);
      return fallback;
    };
    this.state = {
      // O volume antigo vira o valor de cada canal; o mestre permanece 100%
      // para não aplicar o mesmo valor duas vezes durante a migração.
      masterVolume: Number.isFinite(savedMasterVolume)
        ? THREE.MathUtils.clamp(savedMasterVolume, 0, 1)
        : DEFAULT_SETTINGS.masterVolume,
      musicVolume: savedOrLegacy('musicVolume', DEFAULT_SETTINGS.musicVolume),
      effectsVolume: savedOrLegacy('effectsVolume', DEFAULT_SETTINGS.effectsVolume),
      geigerVolume: savedOrLegacy('geigerVolume', DEFAULT_SETTINGS.geigerVolume),
      largeText: Boolean(saved.largeText),
      highContrast: Boolean(saved.highContrast),
      reducedMotion: Boolean(saved.reducedMotion),
      graphicsQuality: ['auto', 'low', 'medium', 'high'].includes(saved.graphicsQuality)
        ? saved.graphicsQuality
        : DEFAULT_SETTINGS.graphicsQuality,
    };
    this.apply();
  }

  update(changes) {
    const previousGraphicsQuality = this.state.graphicsQuality;
    Object.assign(this.state, changes);
    for (const key of ['masterVolume', 'musicVolume', 'effectsVolume', 'geigerVolume']) {
      const value = Number(this.state[key]);
      this.state[key] = Number.isFinite(value)
        ? THREE.MathUtils.clamp(value, 0, 1)
        : DEFAULT_SETTINGS[key];
    }
    this.state.largeText = Boolean(this.state.largeText);
    this.state.highContrast = Boolean(this.state.highContrast);
    this.state.reducedMotion = Boolean(this.state.reducedMotion);
    if (!['auto', 'low', 'medium', 'high'].includes(this.state.graphicsQuality)) {
      this.state.graphicsQuality = DEFAULT_SETTINGS.graphicsQuality;
    }
    this.apply();
    _writeCookieJson(SETTINGS_COOKIE, this.state);
    if (previousGraphicsQuality !== this.state.graphicsQuality) {
      for (const listener of this._listeners) listener(this.state);
    }
  }

  subscribe(listener) {
    if (typeof listener === 'function') this._listeners.push(listener);
  }

  apply() {
    document.body.classList.toggle('a11y-large-text', this.state.largeText);
    document.body.classList.toggle('a11y-high-contrast', this.state.highContrast);
    document.body.classList.toggle('a11y-reduced-motion', this.state.reducedMotion);
  }
}

// Sons leves do menu e do Geiger. O contexto de áudio só é ativado após uma
// ação do usuário, para obedecer às regras dos navegadores.
