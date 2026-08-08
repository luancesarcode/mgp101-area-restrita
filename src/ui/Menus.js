import * as THREE from 'three';
import { DIFFICULTIES, MENU_DIFFICULTY_PARTICLES } from '../config/gameConfig.js';
import { deleteCampaignSlot, loadCampaignSlots } from '../storage/persistence.js';
import { EmberField } from '../effects/EmberField.js';

function xboxBadge(label, tone = 'dark') {
  return `<span class="gp-btn ${tone}"><span class="gp-glyph">${label}</span></span>`;
}

function controlsHelpHTML(gamepad) {
  if (!gamepad) {
    return '<div class="controls-grid">' +
      '<span class="control-input">WASD</span><span>Mover</span>' +
      '<span class="control-input">Mouse</span><span>Olhar</span>' +
      '<span class="control-input">Shift</span><span>Correr</span>' +
      '<span class="control-input">Espaço</span><span>Pular</span>' +
      '<span class="control-input">Ctrl</span><span>Agachar</span>' +
      '<span class="control-input">F</span><span>Interagir, pegar/soltar e retirar tampas</span>' +
      '<span class="control-input">Q</span><span>Examinar o detector</span>' +
      '<span class="control-input">Scroll ↑↓</span><span>Inclinar objeto como LB + analógico direito</span>' +
      '<span class="control-input">M1 / M2</span><span>Girar continuamente para esquerda/direita, como LT/RT</span>' +
      '<span class="control-input">Shift + Scroll</span><span>Ajustar a distância do objeto</span>' +
      '<span class="control-input">Esc</span><span>Pausar</span>' +
      '<span class="control-input">F3</span><span>Modo debug</span>' +
    '</div>';
  }
  return '<div class="controls-grid">' +
    `<span class="control-input">Analógico E</span><span>Mover · ${xboxBadge('L3')} correr</span>` +
    '<span class="control-input">Analógico D</span><span>Olhar</span>' +
    `<span class="control-input">${xboxBadge('A', 'a')}</span><span>Pular / confirmar</span>` +
    `<span class="control-input">${xboxBadge('B', 'b')}</span><span>Agachar / voltar</span>` +
    `<span class="control-input">${xboxBadge('X', 'x')}</span><span>Interagir, pegar/soltar e retirar tampas</span>` +
    `<span class="control-input">${xboxBadge('Y', 'y')}</span><span>Examinar o detector</span>` +
    `<span class="control-input">${xboxBadge('LB')}</span><span>Segure para manipular o objeto na mão</span>` +
    '<span class="control-input">LB + Analógico D</span><span>Girar objeto nos eixos X/Y</span>' +
    '<span class="control-input">LB + LT/RT</span><span>Girar objeto no eixo Z</span>' +
    '<span class="control-input">LB + Analógico E ↑↓</span><span>↑ afastar · ↓ aproximar objeto</span>' +
    `<span class="control-input">${xboxBadge('☰')}</span><span>Pausar / continuar</span>` +
  '</div>';
}

function initGamepadSettings(owner, root) {
  owner._settingsControls = Array.from(root.querySelectorAll('input, select, button'));
  owner._settingsIndex = 0;
}

function clearGamepadSettingsFocus(owner) {
  for (const el of owner._settingsControls || []) el.classList.remove('gamepad-focus');
  owner._settingsControls = null;
}

function handleGamepadSettings(owner, action) {
  const controls = owner._settingsControls;
  if (!controls?.length) return false;
  const focus = () => {
    controls.forEach((el, i) => el.classList.toggle('gamepad-focus', i === owner._settingsIndex));
    controls[owner._settingsIndex].focus({ preventScroll: true });
  };
  if (action === 'up' || action === 'down') {
    owner._settingsIndex = (owner._settingsIndex + (action === 'down' ? 1 : -1) + controls.length) % controls.length;
    focus();
    return true;
  }
  const el = controls[owner._settingsIndex];
  if (action === 'left' || action === 'right') {
    const direction = action === 'right' ? 1 : -1;
    if (el.type === 'range') {
      direction > 0 ? el.stepUp() : el.stepDown();
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el.tagName === 'SELECT') {
      el.selectedIndex = THREE.MathUtils.clamp(el.selectedIndex + direction, 0, el.options.length - 1);
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.type === 'checkbox') {
      el.checked = direction > 0;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
    focus();
    return true;
  }
  if (action === 'accept') {
    if (el.type === 'checkbox' || el.tagName === 'BUTTON') el.click();
    focus();
    return true;
  }
  return false;
}

// ==== STARTMENU =============================================================
// Tela inicial estilo "terminal RAD instruments": menu retrô navegável por
// teclado (▲▼/W/S + Enter) e mouse, seletor ▶ piscante, LCD ao vivo medindo o
// fundo, partículas de radiação e painel de informações contextual.
export class StartMenu {
  constructor(onStart, onContinue, settings, audio) {
    this.screen = document.getElementById('start-screen');
    this.listEl = document.getElementById('menu-list');
    this.infoEl = document.getElementById('menu-info');
    this.lcdEl = document.getElementById('start-lcd');
    this.onStart = onStart;
    this.onContinue = onContinue;
    this.settings = settings;
    this.audio = audio;
    this.footEl = document.getElementById('start-foot');
    this.gamepadMode = false;
    this.pages = {
      main: [
        { label: 'CONTINUAR', requiresSave: true, action: () => this._setPage('saves') },
        { label: 'NOVO JOGO', action: () => this._setPage('diff') },
        { label: 'CONFIGURAÇÕES', action: () => this._showSettings() },
        { label: 'RECORDES', action: () => this._showContent('RECORDES', () => this._recordsInfo()) },
        {
          label: 'CONTROLES',
          action: () => this._showContent('CONTROLES', controlsHelpHTML(this.gamepadMode)),
        },
        {
          label: 'SOBRE',
          action: () => this._showContent('SOBRE',
            'O MGP-101 é inspirado em um monitor de radiação real.<br>' +
            'O orçamento de dose e as dificuldades são regras próprias do jogo; não representam limites normativos nem recomendações de exposição reais.<br>' +
            'Em cada fase a fonte começa mais intensa. Se ela se desestabilizar, a emissão aumenta outra vez.<br>' +
            'Use distância, tempo e blindagem para encontrar a pastilha.'),
        },
      ],
      saves: [],
      newSlots: [],
      diff: [
        {
          label: 'TREINAMENTO',
          info: '<b>Treinamento</b>: campo visível a 7 m e orçamento de 40 µSv. ' +
                'Sem tempo de desestabilização: ideal para aprender a ler o gradiente.',
          action: () => this._chooseNewSlot(DIFFICULTIES.training),
        },
        {
          label: 'NORMAL',
          info: '<b>Normal</b>: o campo só aparece muito perto (2,8 m) e o orçamento é 10 µSv. ' +
                'A fonte começa a desestabilizar em 01:20; nas fases finais, o prazo cai até 00:36.',
          action: () => this._chooseNewSlot(DIFFICULTIES.normal),
        },
        {
          label: 'DIFÍCIL',
          info: '<b>Difícil</b>: nenhum campo visível e orçamento de 8 µSv. ' +
                'A instabilidade começa em 00:35 e nunca ocorre antes de 00:18. Só o detector guia você.',
          action: () => this._chooseNewSlot(DIFFICULTIES.hard),
        },
        { label: 'VOLTAR', info: 'Retornar ao menu principal.', isBack: true, action: () => this._setPage('main') },
      ],
    };
    this.items = [];
    this.index = 0;
    this._lcdTimer = null;

    this.pageEl = document.getElementById('menu-page');
    this.pageTitleEl = document.getElementById('menu-page-title');
    this.pageBodyEl = document.getElementById('menu-page-body');
    document.getElementById('menu-back').addEventListener('click', () => this._setPage('main'));

    this.embers = new EmberField('start-particles', 420);
    this._startLcd();
    this._setPage('main');
    // O primeiro clique no menu também libera a reprodução da música no
    // navegador; não depende de escolher uma opção específica.
    this.screen.addEventListener('pointerdown', () => this.audio.playMenuMusic());

    this._keyHandler = (e) => this._onKey(e);
    addEventListener('keydown', this._keyHandler);
  }

  _refreshSaves() {
    this.savedCampaigns = loadCampaignSlots();
    const items = [];
    this.savedCampaigns.forEach((saved, index) => {
      const slot = index + 1;
      if (!saved) {
        items.push({
          label: `SAVE ${String(slot).padStart(2, '0')} · VAZIO`,
          info: 'Slot vazio.',
          particleIntensity: 0.7,
        });
        return;
      }
      const difficulty = DIFFICULTIES[saved.difficulty];
      const date = new Date(saved.updatedAt).toLocaleString('pt-BR');
      items.push({
        label: `SAVE ${String(slot).padStart(2, '0')} · ${difficulty.label.toUpperCase()} · FASE ${saved.phase}`,
        info: `<b>Última gravação:</b> ${date}`,
        particleIntensity: MENU_DIFFICULTY_PARTICLES[saved.difficulty] ?? 1.0,
        action: () => this.onContinue(saved),
      });
    });
    items.push({ label: 'VOLTAR', info: 'Retornar ao menu principal.', isBack: true, particleIntensity: 1.2, action: () => this._setPage('main') });
    this.pages.saves = items;
  }

  _chooseNewSlot(difficulty) {
    this.pendingDifficulty = difficulty;
    this._setPage('newSlots');
  }

  _refreshNewSlots() {
    const slots = loadCampaignSlots();
    this.pages.newSlots = slots.map((saved, index) => {
      const slot = index + 1;
      const suffix = saved
        ? `${DIFFICULTIES[saved.difficulty].label.toUpperCase()} · FASE ${saved.phase}`
        : 'VAZIO';
      return {
        label: `SAVE ${String(slot).padStart(2, '0')} · ${suffix}`,
        info: saved
          ? `O slot contém ${DIFFICULTIES[saved.difficulty].label}, fase ${saved.phase}. Selecioná-lo substituirá essa campanha.`
          : `Iniciar ${this.pendingDifficulty.label} no slot vazio ${String(slot).padStart(2, '0')}.`,
        action: () => {
          // slot ocupado: confirma a substituição dentro do próprio menu
          if (saved) { this._confirmOverwrite(slot, saved); return; }
          this.onStart(this.pendingDifficulty, slot);
        },
      };
    });
    this.pages.newSlots.push({ label: 'VOLTAR', info: 'Retornar à escolha de modo.', isBack: true, action: () => this._setPage('diff') });
  }

  // Confirmação in-game (sem confirm() do navegador): iniciar uma nova campanha
  // num slot ocupado apaga o save existente. Padrão realçado é CANCELAR.
  _confirmOverwrite(slot, saved) {
    const num = String(slot).padStart(2, '0');
    const diff = DIFFICULTIES[saved.difficulty];
    const warn = `<b>Substituir o SAVE ${num}?</b><br>` +
      `A campanha ${diff.label}, fase ${saved.phase} será <b>excluída</b> para iniciar ` +
      `${this.pendingDifficulty.label} na fase 1.<br>Esta ação não pode ser desfeita.`;
    this.pages.confirm = [
      {
        label: `SIM, EXCLUIR SAVE ${num}`, info: warn,
        action: () => { deleteCampaignSlot(slot); this.onStart(this.pendingDifficulty, slot); },
      },
      { label: 'CANCELAR', info: warn, action: () => this._setPage('newSlots') },
    ];
    this._setPage('confirm');
    this._select(1); // realça CANCELAR por segurança
  }

  _setPage(name) {
    clearGamepadSettingsFocus(this);
    if (name === 'saves') this._refreshSaves();
    if (name === 'newSlots') this._refreshNewSlots();
    this.mode = 'list';
    this.page = name;
    const hasSave = loadCampaignSlots().some(Boolean);
    const pageItems = name === 'main'
      ? this.pages.main.filter((item) => !item.requiresSave || hasSave)
      : this.pages[name];
    this.items = pageItems.filter((item) => !(this.gamepadMode && item.isBack));
    this.listEl.style.display = 'block';
    this.pageEl.style.display = 'none';
    // descrição contextual para dificuldade e saves
    this.infoEl.style.display = ['diff', 'saves', 'newSlots', 'confirm'].includes(name) ? 'block' : 'none';
    this.infoEl.classList.toggle('save-summary', name === 'saves');
    if (name === 'main') this.embers.setIntensity(1.2);
    this.listEl.innerHTML = '';
    this.items.forEach((item, i) => {
      const li = document.createElement('li');
      li.textContent = item.label;
      li.classList.toggle('menu-back-option', Boolean(item.isBack));
      li.addEventListener('mouseenter', () => this._select(i));
      li.addEventListener('click', () => { this._select(i); this._activate(); });
      this.listEl.appendChild(li);
      item.el = li;
    });
    this._select(0);
  }

  // Página de conteúdo (CONTROLES / SOBRE / RECORDES) com "← VOLTAR"
  _showContent(title, html) {
    clearGamepadSettingsFocus(this);
    this.mode = 'content';
    this.listEl.style.display = 'none';
    this.infoEl.style.display = 'none';
    this.pageEl.style.display = 'block';
    this.pageTitleEl.textContent = title;
    this.pageBodyEl.innerHTML = typeof html === 'function' ? html() : html;
  }

  _showSettings() {
    const s = this.settings.state;
    const masterPercent = Math.round(s.masterVolume * 100);
    const musicPercent = Math.round(s.musicVolume * 100);
    const effectsPercent = Math.round(s.effectsVolume * 100);
    const geigerPercent = Math.round(s.geigerVolume * 100);
    this._showContent('CONFIGURAÇÕES',
      `<div class="settings-grid">
        <div class="settings-row">
          <label for="setting-master-volume">Volume geral</label><output id="setting-master-volume-value">${masterPercent}%</output>
          <input class="settings-range" id="setting-master-volume" type="range" min="0" max="100" step="1" value="${masterPercent}" aria-describedby="setting-master-volume-value">
        </div>
        <div class="settings-row">
          <label for="setting-music-volume">Música</label><output id="setting-music-volume-value">${musicPercent}%</output>
          <input class="settings-range" id="setting-music-volume" type="range" min="0" max="100" step="1" value="${musicPercent}" aria-describedby="setting-music-volume-value">
        </div>
        <div class="settings-row">
          <label for="setting-effects-volume">Efeitos sonoros</label><output id="setting-effects-volume-value">${effectsPercent}%</output>
          <input class="settings-range" id="setting-effects-volume" type="range" min="0" max="100" step="1" value="${effectsPercent}" aria-describedby="setting-effects-volume-value">
        </div>
        <div class="settings-row">
          <label for="setting-geiger-volume">Som do Geiger</label><output id="setting-geiger-volume-value">${geigerPercent}%</output>
          <input class="settings-range" id="setting-geiger-volume" type="range" min="0" max="100" step="1" value="${geigerPercent}" aria-describedby="setting-geiger-volume-value">
        </div>
        <div class="settings-row">
          <label for="setting-graphics-quality">Qualidade gráfica</label>
          <select class="settings-select" id="setting-graphics-quality">
            <option value="auto" ${s.graphicsQuality === 'auto' ? 'selected' : ''}>Automático</option>
            <option value="low" ${s.graphicsQuality === 'low' ? 'selected' : ''}>Baixo</option>
            <option value="medium" ${s.graphicsQuality === 'medium' ? 'selected' : ''}>Médio</option>
            <option value="high" ${s.graphicsQuality === 'high' ? 'selected' : ''}>Alto</option>
          </select>
        </div>
        <button class="settings-test" id="setting-test-sound" type="button">TESTAR SONS</button>
        <label class="settings-check"><input id="setting-large-text" type="checkbox" ${s.largeText ? 'checked' : ''}> Texto ampliado</label>
        <label class="settings-check"><input id="setting-high-contrast" type="checkbox" ${s.highContrast ? 'checked' : ''}> Alto contraste</label>
        <label class="settings-check"><input id="setting-reduced-motion" type="checkbox" ${s.reducedMotion ? 'checked' : ''}> Reduzir animações e efeitos</label>
        <p class="settings-note">As configurações e a fase atual são salvas em cookies neste navegador.</p>
      </div>`
    );

    const volumeControls = [
      { key: 'masterVolume', input: document.getElementById('setting-master-volume'), output: document.getElementById('setting-master-volume-value') },
      { key: 'musicVolume', input: document.getElementById('setting-music-volume'), output: document.getElementById('setting-music-volume-value') },
      { key: 'effectsVolume', input: document.getElementById('setting-effects-volume'), output: document.getElementById('setting-effects-volume-value') },
      { key: 'geigerVolume', input: document.getElementById('setting-geiger-volume'), output: document.getElementById('setting-geiger-volume-value') },
    ];
    const largeText = document.getElementById('setting-large-text');
    const highContrast = document.getElementById('setting-high-contrast');
    const reducedMotion = document.getElementById('setting-reduced-motion');
    const graphicsQuality = document.getElementById('setting-graphics-quality');
    const save = () => this.settings.update({
      masterVolume: Number(volumeControls[0].input.value) / 100,
      musicVolume: Number(volumeControls[1].input.value) / 100,
      effectsVolume: Number(volumeControls[2].input.value) / 100,
      geigerVolume: Number(volumeControls[3].input.value) / 100,
      largeText: largeText.checked,
      highContrast: highContrast.checked,
      reducedMotion: reducedMotion.checked,
      graphicsQuality: graphicsQuality.value,
    });

    volumeControls.forEach(({ input, output }) => input.addEventListener('input', () => {
      output.textContent = `${input.value}%`;
      save();
      this.audio.syncVolumes();
    }));
    [largeText, highContrast, reducedMotion].forEach((input) => input.addEventListener('change', save));
    graphicsQuality.addEventListener('change', save);
    document.getElementById('setting-test-sound').addEventListener('click', () => this.audio.test());
    initGamepadSettings(this, this.pageEl);
  }

  setGamepadMode(enabled) {
    this.gamepadMode = Boolean(enabled);
    if (this.mode === 'list' && this.page) this._setPage(this.page);
    this.footEl.innerHTML = this.gamepadMode
      ? `${xboxBadge('D-PAD')} navegar · ${xboxBadge('A', 'a')} selecionar · ${xboxBadge('B', 'b')} voltar`
      : '▲▼ navegar · Enter selecionar';
    if (this.mode === 'content' && this.pageTitleEl.textContent === 'CONTROLES') {
      this.pageBodyEl.innerHTML = controlsHelpHTML(this.gamepadMode);
    }
  }

  gamepadInput(action) {
    if (!this._isOpen()) return false;
    if (this.mode === 'content') {
      if (action === 'back') { this._setPage('main'); return true; }
      if (handleGamepadSettings(this, action)) return true;
      if (action === 'accept') { this._setPage('main'); return true; }
      return false;
    }
    if (action === 'up') this._select(this.index - 1);
    else if (action === 'down') this._select(this.index + 1);
    else if (action === 'accept') this._activate();
    else if (action === 'back') {
      if (this.page === 'confirm') this._setPage('newSlots');
      else if (this.page === 'newSlots') this._setPage('diff');
      else if (['diff', 'saves'].includes(this.page)) this._setPage('main');
      else return false;
    } else return false;
    return true;
  }

  // LCD do menu: fundo natural com ruído e "blips" ocasionais
  _startLcd() {
    if (this._lcdTimer) return;
    this._lcdTimer = setInterval(() => {
      const blip = Math.random() < 0.06;
      const v = blip
        ? 0.3 + Math.random() * 2.5
        : Math.max(0.05, 0.12 + (Math.random() - 0.5) * 0.06);
      this.lcdEl.textContent = `${v.toFixed(2)} µSv/h`;
    }, 300);
  }

  _recordsInfo() {
    const fmt = (key) => {
      const t = parseFloat(localStorage.getItem(`mgp101_best_${key}`));
      if (!t) return 'Sem registro';
      const m = Math.floor(t / 60), s = Math.floor(t % 60);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    return `<b>Melhores tempos</b><br>` +
      `Treinamento: <b>${fmt('training')}</b> · Normal: <b>${fmt('normal')}</b> · ` +
      `Difícil: <b>${fmt('hard')}</b>`;
  }

  _select(i) {
    this.index = (i + this.items.length) % this.items.length;
    this.items.forEach((item, k) => item.el.classList.toggle('sel', k === this.index));
    if (['diff', 'saves', 'newSlots', 'confirm'].includes(this.page)) {
      this.infoEl.innerHTML = this.items[this.index].info || '';
    }
    if (this.page === 'diff') {
      // o "fogo" reflete o risco: TREINAMENTO → DIFÍCIL (VOLTAR = neutro)
      const intensity = [1.0, 1.8, 3.0, 1.2][this.index] ?? 1.2;
      this.embers.setIntensity(intensity);
    } else if (this.page === 'saves') {
      this.embers.setIntensity(this.items[this.index].particleIntensity ?? 0.7);
    }
  }

  _activate() {
    const item = this.items[this.index];
    if (item.action) {
      this.audio?.uiClick();
      item.action();
    }
  }

  _isOpen() {
    return this.screen.style.display !== 'none' &&
      getComputedStyle(document.getElementById('boot-screen')).display === 'none';
  }

  _onKey(e) {
    if (!this._isOpen()) return;
    if (this.mode === 'content') { // página de conteúdo: qualquer "voltar" retorna
      if (['Escape', 'Enter', 'Backspace', 'Space'].includes(e.code)) {
        this._setPage('main');
        e.preventDefault();
      }
      return;
    }
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': this._select(this.index - 1); e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS': this._select(this.index + 1); e.preventDefault(); break;
      case 'Enter': case 'Space': case 'KeyE': this._activate(); e.preventDefault(); break;
      case 'Escape':
        if (this.page === 'confirm') this._setPage('newSlots');
        else if (this.page === 'newSlots') this._setPage('diff');
        else if (['diff', 'saves'].includes(this.page)) this._setPage('main');
        break;
    }
  }

  stop() {
    clearInterval(this._lcdTimer);
    this._lcdTimer = null;
  }

  show() {
    this._refreshSaves();
    this._setPage('main');
    this._startLcd();
    this.audio.playMenuMusic();
  }
}

// ==== PAUSEMENU =============================================================
// Menu de pausa no mesmo estilo retrô: estatísticas da missão + navegação
// por teclado (▲▼ + Enter) e mouse.
export class PauseMenu {
  constructor(onResume, onRestart, onReturnToMenu, settings, audio) {
    this.screen = document.getElementById('pause-screen');
    this.listEl = document.getElementById('pause-list');
    this.statsEl = document.getElementById('pause-stats');
    this.pageEl = document.getElementById('pause-page');
    this.pageTitleEl = document.getElementById('pause-page-title');
    this.pageBodyEl = document.getElementById('pause-page-body');
    this.footEl = document.getElementById('pause-foot');
    this.settings = settings;
    this.audio = audio;
    this.gamepadMode = false;
    this.items = [
      { label: 'CONTINUAR', action: onResume },
      { label: 'REINICIAR MISSÃO', action: onRestart },
      { label: 'CONTROLES', action: () => this._showContent('CONTROLES', controlsHelpHTML(this.gamepadMode)) },
      { label: 'CONFIGURAÇÕES', action: () => this._showSettings() },
      { label: 'VOLTAR AO MENU', action: onReturnToMenu },
    ];
    this.index = 0;
    this.items.forEach((item, i) => {
      const li = document.createElement('li');
      li.textContent = item.label;
      li.addEventListener('mouseenter', () => this._select(i));
      li.addEventListener('click', () => { this._select(i); this._activate(); });
      this.listEl.appendChild(li);
      item.el = li;
    });
    document.getElementById('pause-back').addEventListener('click', () => this._showList());
    this._showList();
    this.embers = new EmberField('pause-particles', 360);
    this.embers.setIntensity(1.6);
    addEventListener('keydown', (e) => this._onKey(e));
  }

  setStats(html) { this.statsEl.innerHTML = html; }

  open() {
    this._showList();
    this.screen.style.display = 'flex';
    // A pausa conserva a mesma faixa da gameplay e o ponto atual dela.
  }

  _showList() {
    clearGamepadSettingsFocus(this);
    this.mode = 'list';
    this.statsEl.style.display = 'block';
    this.listEl.style.display = 'block';
    this.pageEl.style.display = 'none';
    this.footEl.innerHTML = this.gamepadMode
      ? `${xboxBadge('D-PAD')} navegar · ${xboxBadge('A', 'a')} selecionar · ${xboxBadge('B', 'b')} continuar`
      : '▲▼ navegar · Enter selecionar';
    this._select(0);
  }

  _showContent(title, html) {
    clearGamepadSettingsFocus(this);
    this.mode = 'content';
    this.statsEl.style.display = 'none';
    this.listEl.style.display = 'none';
    this.pageEl.style.display = 'block';
    this.pageTitleEl.textContent = title;
    this.pageBodyEl.innerHTML = html;
    this.footEl.innerHTML = this.gamepadMode
      ? `${xboxBadge('B', 'b')} voltar`
      : 'Esc ou Backspace · voltar';
  }

  _showSettings() {
    const s = this.settings.state;
    const masterPercent = Math.round(s.masterVolume * 100);
    const musicPercent = Math.round(s.musicVolume * 100);
    const effectsPercent = Math.round(s.effectsVolume * 100);
    const geigerPercent = Math.round(s.geigerVolume * 100);
    this._showContent('CONFIGURAÇÕES',
      `<div class="settings-grid">
        <div class="settings-row">
          <label for="pause-setting-master-volume">Volume geral</label><output id="pause-setting-master-volume-value">${masterPercent}%</output>
          <input class="settings-range" id="pause-setting-master-volume" type="range" min="0" max="100" step="1" value="${masterPercent}" aria-describedby="pause-setting-master-volume-value">
        </div>
        <div class="settings-row">
          <label for="pause-setting-music-volume">Música</label><output id="pause-setting-music-volume-value">${musicPercent}%</output>
          <input class="settings-range" id="pause-setting-music-volume" type="range" min="0" max="100" step="1" value="${musicPercent}" aria-describedby="pause-setting-music-volume-value">
        </div>
        <div class="settings-row">
          <label for="pause-setting-effects-volume">Efeitos sonoros</label><output id="pause-setting-effects-volume-value">${effectsPercent}%</output>
          <input class="settings-range" id="pause-setting-effects-volume" type="range" min="0" max="100" step="1" value="${effectsPercent}" aria-describedby="pause-setting-effects-volume-value">
        </div>
        <div class="settings-row">
          <label for="pause-setting-geiger-volume">Som do Geiger</label><output id="pause-setting-geiger-volume-value">${geigerPercent}%</output>
          <input class="settings-range" id="pause-setting-geiger-volume" type="range" min="0" max="100" step="1" value="${geigerPercent}" aria-describedby="pause-setting-geiger-volume-value">
        </div>
        <div class="settings-row">
          <label for="pause-setting-graphics-quality">Qualidade gráfica</label>
          <select class="settings-select" id="pause-setting-graphics-quality">
            <option value="auto" ${s.graphicsQuality === 'auto' ? 'selected' : ''}>Automático</option>
            <option value="low" ${s.graphicsQuality === 'low' ? 'selected' : ''}>Baixo</option>
            <option value="medium" ${s.graphicsQuality === 'medium' ? 'selected' : ''}>Médio</option>
            <option value="high" ${s.graphicsQuality === 'high' ? 'selected' : ''}>Alto</option>
          </select>
        </div>
        <button class="settings-test" id="pause-setting-test-sound" type="button">TESTAR SONS</button>
        <label class="settings-check"><input id="pause-setting-large-text" type="checkbox" ${s.largeText ? 'checked' : ''}> Texto ampliado</label>
        <label class="settings-check"><input id="pause-setting-high-contrast" type="checkbox" ${s.highContrast ? 'checked' : ''}> Alto contraste</label>
        <label class="settings-check"><input id="pause-setting-reduced-motion" type="checkbox" ${s.reducedMotion ? 'checked' : ''}> Reduzir animações e efeitos</label>
        <p class="settings-note">As configurações e a fase atual são salvas em cookies neste navegador.</p>
      </div>`
    );

    const volumeControls = [
      { key: 'masterVolume', input: document.getElementById('pause-setting-master-volume'), output: document.getElementById('pause-setting-master-volume-value') },
      { key: 'musicVolume', input: document.getElementById('pause-setting-music-volume'), output: document.getElementById('pause-setting-music-volume-value') },
      { key: 'effectsVolume', input: document.getElementById('pause-setting-effects-volume'), output: document.getElementById('pause-setting-effects-volume-value') },
      { key: 'geigerVolume', input: document.getElementById('pause-setting-geiger-volume'), output: document.getElementById('pause-setting-geiger-volume-value') },
    ];
    const largeText = document.getElementById('pause-setting-large-text');
    const highContrast = document.getElementById('pause-setting-high-contrast');
    const reducedMotion = document.getElementById('pause-setting-reduced-motion');
    const graphicsQuality = document.getElementById('pause-setting-graphics-quality');
    const save = () => this.settings.update({
      masterVolume: Number(volumeControls[0].input.value) / 100,
      musicVolume: Number(volumeControls[1].input.value) / 100,
      effectsVolume: Number(volumeControls[2].input.value) / 100,
      geigerVolume: Number(volumeControls[3].input.value) / 100,
      largeText: largeText.checked,
      highContrast: highContrast.checked,
      reducedMotion: reducedMotion.checked,
      graphicsQuality: graphicsQuality.value,
    });

    volumeControls.forEach(({ input, output }) => input.addEventListener('input', () => {
      output.textContent = `${input.value}%`;
      save();
      this.audio.syncVolumes();
    }));
    [largeText, highContrast, reducedMotion].forEach((input) => input.addEventListener('change', save));
    graphicsQuality.addEventListener('change', save);
    document.getElementById('pause-setting-test-sound').addEventListener('click', () => this.audio.test());
    initGamepadSettings(this, this.pageEl);
  }

  setGamepadMode(enabled) {
    this.gamepadMode = Boolean(enabled);
    if (this.mode === 'content' && this.pageTitleEl.textContent === 'CONTROLES') {
      this.pageBodyEl.innerHTML = controlsHelpHTML(this.gamepadMode);
    }
    if (this.mode === 'content') {
      this.footEl.innerHTML = this.gamepadMode ? `${xboxBadge('B', 'b')} voltar` : 'Esc ou Backspace · voltar';
    } else {
      this.footEl.innerHTML = this.gamepadMode
        ? `${xboxBadge('D-PAD')} navegar · ${xboxBadge('A', 'a')} selecionar · ${xboxBadge('B', 'b')} continuar`
        : '▲▼ navegar · Enter selecionar';
    }
  }

  gamepadInput(action) {
    if (!this._isOpen()) return false;
    if (this.mode === 'content') {
      if (action === 'back') { this._showList(); return true; }
      return handleGamepadSettings(this, action);
    }
    if (action === 'up') this._select(this.index - 1);
    else if (action === 'down') this._select(this.index + 1);
    else if (action === 'accept') this._activate();
    else if (action === 'back') this.items[0].action();
    else return false;
    return true;
  }

  _select(i) {
    this.index = (i + this.items.length) % this.items.length;
    this.items.forEach((item, k) => item.el.classList.toggle('sel', k === this.index));
  }

  _activate() {
    this.audio?.uiClick();
    this.items[this.index].action();
  }

  _isOpen() { return this.screen.style.display === 'flex'; }

  _onKey(e) {
    if (!this._isOpen()) return;
    // A pausa mantém a trilha da fase tocando (ver open()); NÃO iniciar a
    // faixa de menu aqui, senão as duas músicas soam sobrepostas.
    if (this.mode === 'content') {
      if (['Escape', 'Backspace'].includes(e.code)) {
        this._showList();
        e.preventDefault();
      }
      return;
    }
    switch (e.code) {
      case 'ArrowUp': case 'KeyW': this._select(this.index - 1); e.preventDefault(); break;
      case 'ArrowDown': case 'KeyS': this._select(this.index + 1); e.preventDefault(); break;
      case 'Enter': case 'Space': case 'KeyE': this._activate(); e.preventDefault(); break;
    }
  }
}

// ==== XBOX GAMEPAD =========================================================
// Mapeamento "standard" da Gamepad API, usado pelos controles Xbox modernos.
// O polling acontece no mesmo frame da simulação para manter analógicos e
// botões responsivos e também cobrir navegadores que só expõem o controle após
// o primeiro botão ser pressionado.
export class XboxGamepadController {
  static BUTTON = Object.freeze({
    A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7,
    VIEW: 8, MENU: 9, L3: 10, R3: 11,
    UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
  });

  constructor(game) {
    this.game = game;
    this.connected = false;
    this.index = -1;
    this.id = '';
    this._previous = [];
    this._repeatV = { dir: 0, timer: 0 };
    this._repeatH = { dir: 0, timer: 0 };
    this._lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._context = '';
    this._actionIndex = 0;
    this._statusTimer = null;

    addEventListener('gamepadconnected', (event) => this._connect(event.gamepad));
    addEventListener('gamepaddisconnected', (event) => {
      if (event.gamepad.index === this.index) this._disconnect();
    });
  }

  _pads() {
    return typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()) : [];
  }

  _findPad() {
    const pads = this._pads();
    const current = this.index >= 0 ? pads[this.index] : null;
    if (current?.connected) return current;
    const compatible = (pad) => pad?.connected && pad.axes.length >= 4 && pad.buttons.length >= 16;
    return pads.find((pad) => compatible(pad) && pad.mapping === 'standard') || pads.find(compatible) || null;
  }

  _buttonPressed(button) {
    return Boolean(button && (button.pressed || button.value > 0.55));
  }

  _connect(pad) {
    if (!pad) return;
    const changed = !this.connected || this.index !== pad.index || this.id !== pad.id;
    this.connected = true;
    this.index = pad.index;
    this.id = pad.id || 'Controle Xbox';
    if (changed) {
      this._previous = pad.buttons.map((button) => this._buttonPressed(button));
      this._context = '';
      this._syncPresentation(true);
    }
  }

  _disconnect() {
    const wasGamepadOnly = this.game.playing && !this.game.paused && !this.game.player.controls.isLocked;
    this.connected = false;
    this.index = -1;
    this.id = '';
    this._previous = [];
    this._context = '';
    this.game.player.setGamepadInput(0, 0, false, false);
    this.game.interact.keyUpF();
    this._syncPresentation(false);
    if (wasGamepadOnly) this.game._openPauseMenu();
  }

  _syncPresentation(enabled) {
    document.body.classList.toggle('gamepad-connected', enabled);
    const name = this.id.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    document.getElementById('gamepad-name').textContent = enabled
      ? `CONTROLE CONECTADO · ${name || 'XBOX'}`
      : 'CONTROLE DESCONECTADO';
    clearTimeout(this._statusTimer);
    document.body.classList.add('gamepad-status-visible');
    this._statusTimer = setTimeout(() => {
      document.body.classList.remove('gamepad-status-visible');
      this._statusTimer = null;
    }, 3200);
    document.getElementById('boot-foot').innerHTML = enabled
      ? `${xboxBadge('A', 'a')} continuar · controle detectado`
      : 'RAD instruments · MGP-101';
    this.game.hud.setGamepadMode(enabled);
    this.game.interact.setGamepadMode(enabled);
    this.game.startMenu?.setGamepadMode(enabled);
    this.game.pauseMenu?.setGamepadMode(enabled);
  }

  _stick(x, y, deadzone = 0.16) {
    const magnitude = Math.hypot(x, y);
    if (magnitude <= deadzone) return { x: 0, y: 0 };
    const scaled = Math.min(1, (magnitude - deadzone) / (1 - deadzone)) / magnitude;
    return { x: x * scaled, y: y * scaled };
  }

  _repeat(state, direction, dt, callback) {
    if (!direction) {
      state.dir = 0;
      state.timer = 0;
      return;
    }
    if (direction !== state.dir) {
      state.dir = direction;
      state.timer = 0.32;
      callback(direction);
      return;
    }
    state.timer -= dt;
    if (state.timer <= 0) {
      state.timer = 0.12;
      callback(direction);
    }
  }

  _setContext(name) {
    if (name === this._context) return;
    this._context = name;
    this._repeatV.dir = this._repeatH.dir = 0;
    this._repeatV.timer = this._repeatH.timer = 0;
    this._actionIndex = 0;
  }

  _menuNavigation(menu, left, pressed, justPressed, dt) {
    const B = XboxGamepadController.BUTTON;
    const vertical = pressed[B.UP] ? -1 : pressed[B.DOWN] ? 1
      : left.y < -0.55 ? -1 : left.y > 0.55 ? 1 : 0;
    const horizontal = pressed[B.LEFT] ? -1 : pressed[B.RIGHT] ? 1
      : left.x < -0.62 ? -1 : left.x > 0.62 ? 1 : 0;
    this._repeat(this._repeatV, vertical, dt, (dir) => menu.gamepadInput(dir < 0 ? 'up' : 'down'));
    this._repeat(this._repeatH, horizontal, dt, (dir) => menu.gamepadInput(dir < 0 ? 'left' : 'right'));
    if (justPressed[B.A]) menu.gamepadInput('accept');
    if (justPressed[B.B]) menu.gamepadInput('back');
  }

  _screenActions(ids, left, pressed, justPressed, dt) {
    const B = XboxGamepadController.BUTTON;
    const elements = ids.map((id) => document.getElementById(id));
    const direction = pressed[B.LEFT] || pressed[B.UP] ? -1
      : pressed[B.RIGHT] || pressed[B.DOWN] ? 1
      : Math.abs(left.x) > Math.abs(left.y) && Math.abs(left.x) > 0.6 ? Math.sign(left.x)
      : Math.abs(left.y) > 0.6 ? Math.sign(left.y) : 0;
    this._repeat(this._repeatH, direction, dt, (dir) => {
      this._actionIndex = (this._actionIndex + dir + elements.length) % elements.length;
    });
    elements.forEach((element, index) => element.classList.toggle('gamepad-selected', index === this._actionIndex));
    if (justPressed[B.A]) elements[this._actionIndex].click();
  }

  _look(right, dt) {
    if (right.x === 0 && right.y === 0) return;
    const camera = this.game.sceneManager.camera;
    this._lookEuler.setFromQuaternion(camera.quaternion, 'YXZ');
    this._lookEuler.y -= right.x * 2.35 * dt;
    this._lookEuler.x -= right.y * 1.95 * dt;
    this._lookEuler.x = THREE.MathUtils.clamp(this._lookEuler.x, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02);
    camera.quaternion.setFromEuler(this._lookEuler);
  }

  update(dt) {
    const pad = this._findPad();
    if (!pad) {
      if (this.connected) this._disconnect();
      return;
    }
    if (!this.connected || pad.index !== this.index) this._connect(pad);

    const B = XboxGamepadController.BUTTON;
    const pressed = pad.buttons.map((button) => this._buttonPressed(button));
    const justPressed = pressed.map((value, index) => value && !this._previous[index]);
    const justReleased = pressed.map((value, index) => !value && this._previous[index]);
    const left = this._stick(pad.axes[0] || 0, pad.axes[1] || 0);
    const right = this._stick(pad.axes[2] || 0, pad.axes[3] || 0);

    const bootOpen = getComputedStyle(document.getElementById('boot-screen')).display !== 'none';
    const endOpen = getComputedStyle(document.getElementById('end-screen')).display !== 'none';
    const campaignOpen = getComputedStyle(document.getElementById('campaign-screen')).display !== 'none';
    const startOpen = getComputedStyle(document.getElementById('start-screen')).display !== 'none';

    if (bootOpen) {
      this._setContext('boot');
      if (justPressed[B.A]) this.game._continueBoot();
    } else if (campaignOpen) {
      this._setContext('campaign');
      this._screenActions(['btn-play-again', 'btn-campaign-menu'], left, pressed, justPressed, dt);
    } else if (endOpen) {
      this._setContext('end');
      this._screenActions(['btn-next-phase', 'btn-end-menu'], left, pressed, justPressed, dt);
    } else if (this.game.paused) {
      this._setContext('pause');
      if (justPressed[B.MENU]) this.game._requestResume();
      else this._menuNavigation(this.game.pauseMenu, left, pressed, justPressed, dt);
    } else if (startOpen || !this.game.playing) {
      this._setContext('start');
      this._menuNavigation(this.game.startMenu, left, pressed, justPressed, dt);
    } else {
      this._setContext('gameplay');
      if (justPressed[B.MENU]) {
        this.game._pauseForGamepad();
        this.game.player.setGamepadInput(0, 0, false, false);
      } else {
        const manipulating = pressed[B.LB] && Boolean(this.game.interact.heldLid);
        if (manipulating) {
          const rotateZ = (pad.buttons[B.RT]?.value || 0) - (pad.buttons[B.LT]?.value || 0);
          this.game.player.setGamepadInput(0, 0, false, pressed[B.B]);
          this.game.interact.applyGamepadManipulation(right.y, right.x, rotateZ, -left.y, dt);
        } else {
          this.game.player.setGamepadInput(left.x, left.y, pressed[B.L3], pressed[B.B]);
          this._look(right, dt);
        }
        if (justPressed[B.A]) this.game.player.jump();
        if (justPressed[B.X]) this.game._interactionDown();
        if (justReleased[B.X]) this.game._interactionUp();
        if (justPressed[B.Y]) this.game.viewmodel.inspect = !this.game.viewmodel.inspect;
      }
    }

    this._previous = pressed;
  }
}
