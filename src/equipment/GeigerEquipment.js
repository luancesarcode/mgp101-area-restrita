import * as THREE from 'three';
import { EQUIPMENT_MAX_DOSE } from '../config/gameConfig.js';
import { MGP_PANEL_SVG_DATA } from './panelSvgData.js';

// ==== DETECTORVIEWMODEL =====================================================
// ==== GEIGERDISPLAY =========================================================
// LCD 08X02 do MGP-101 emulado célula a célula (Canvas → CanvasTexture),
// imitando tudo que o firmware Monitor_GeigerPortatil_V3_10.ino escreve no
// display desde o boot:
//  - boot: exibirEmpresa() "RADinst"/"v3" por 2 s e depois
//    exibir_num_serie_start() "S/N:"/"202332" por 2 s;
//  - exibirLeitura(): números grandes de 2 linhas a partir da coluna 0
//    (BIG_NUMBERS_FONT_1_COLUMN_2_ROWS: 1 coluna por dígito, esticado na
//    vertical) com "uSvh" em (4,1) — "uSv" em (5,1) no modo dose; 2 casas
//    < 10, 1 casa < 100, inteiro até o teto do monitor (10000 µSv/h) e
//    "OverLoad" na linha de baixo somente quando ultrapassá-lo;
//  - taxas_array: média móvel de 7 leituras abaixo de 10 µSv/h;
//  - fundo verde-claro retroiluminado do simulador web (radial
//    #9fd85b → #8ec63f) com caracteres escuros.
// Só redesenha — e só reenvia a textura à GPU — quando o conteúdo muda.
export class GeigerDisplay {
  static COLS = 8;
  static ROWS = 2;
  static num_serie = 32; // S/N exibido no boot: "2023" + num_serie

  constructor(width = 524, height = 204) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width; this.canvas.height = height;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    this.taxa = 0;
    this.doseAcumulada = 0;
    this.unit = 'uSvh';     // impresso pelo firmware em (4,1)
    this.flagOperacao = 0;  // Mode-1: taxa (uSv/h) | Mode-2: dose (uSv)
    this.textScreen = null; // telas de texto de 2 linhas (lcd.print do firmware)
    this.taxas_array = [0, 0, 0, 0, 0, 0, 0];
    this._booting = false;

    // grade de caracteres 8×2 do LCD físico
    this.pad = 12;
    this.cellW = (width - 2 * this.pad) / GeigerDisplay.COLS;
    this.cellH = (height - 2 * this.pad) / GeigerDisplay.ROWS;

    this._bg = null;       // fundo verde retroiluminado, gerado uma vez
    this._lastKey = null;  // evita redesenho sem mudança visual
    // a VT323 pode chegar depois do 1º desenho; redesenha quando carregar
    document.fonts?.ready?.then(() => { this._lastKey = null; this.render(); });
    this.render();
  }

  // ---- API usada pelo jogo -------------------------------------------------
  // Sequência do setup() do firmware: exibirEmpresa() e, na sequência,
  // exibir_num_serie_start(), 2 s cada, antes de liberar as leituras.
  boot() {
    const telas = [
      ['RADinst', 'v3'],
      ['S/N:', '2023' + GeigerDisplay.num_serie],
    ];
    this._booting = true;
    const mostrar = (i) => {
      if (i >= telas.length) {
        this._booting = false;
        this.textScreen = null;
        this.render();
        return;
      }
      this.textScreen = { line1: telas[i][0], line2: telas[i][1] };
      this.render();
      setTimeout(() => mostrar(i + 1), 2000);
    };
    mostrar(0);
  }

  // Mesmo encadeamento do exibirLeitura() do firmware: a taxa nova entra no
  // fim de taxas_array e, abaixo de 10 µSv/h, exibe-se a média das 7 últimas.
  setValue(taxa) {
    this.taxas_array.shift();
    this.taxas_array.push(taxa);
    if (this.flagOperacao === 0 && taxa < 10) {
      taxa = this.taxas_array.reduce((s, v) => s + v, 0) / 7;
    }
    this.taxa = taxa;
    if (this._booting) return; // o boot tem prioridade sobre leituras
    this.textScreen = null;
    this.render();
  }
  setDose(doseAcumulada) { this.doseAcumulada = doseAcumulada; if (!this._booting) this.render(); }
  setUnit(unit) { this.unit = unit; this._lastKey = null; this.render(); }
  setMode(flagOperacao) { this.flagOperacao = flagOperacao; this._lastKey = null; this.render(); }
  showText(line1, line2) {
    if (this._booting) return; // o boot não é interrompido
    this.textScreen = { line1, line2 };
    this.render();
  }

  // Até 10000 os cinco dígitos tomam o visor e a unidade é suprimida
  // quando não sobra espaço; acima de 10000 aparece "OverLoad".
  _formatTaxa() {
    const taxa = this.taxa;
    // Teto do equipamento: passou de 10000 µSv/h, o visor entra em OverLoad.
    if (taxa > EQUIPMENT_MAX_DOSE) return { text: null, overload: true, showUnit: false };
    if (taxa < 10)   return { text: taxa.toFixed(2), overload: false, showUnit: true };
    if (taxa < 100)  return { text: taxa.toFixed(1), overload: false, showUnit: true };
    const text = Math.round(taxa).toString();
    return { text, overload: false, showUnit: text.length <= 4 };
  }

  render() {
    // monta o quadro: linhas de texto comuns e/ou números grandes + unidade
    let line1 = '', line2 = '', big = '', unit = '', unitCol = 0;
    if (this.textScreen) {
      line1 = this.textScreen.line1; line2 = this.textScreen.line2;
    } else if (this.flagOperacao === 1) {
      big = this.doseAcumulada.toFixed(2); unit = 'uSv'; unitCol = 5;
    } else {
      const f = this._formatTaxa();
      if (f.overload) line2 = 'OverLoad';
      else { big = f.text; if (f.showUnit) { unit = this.unit; unitCol = 4; } }
    }
    const key = `${big}|${unit}${unitCol}|${line1}|${line2}`;
    if (key === this._lastKey) return; // conteúdo idêntico: não toca na textura
    this._lastKey = key;

    const g = this.canvas.getContext('2d');
    this.drawBackground(g);
    if (big) {
      this.drawValue(g, big);
      if (unit) this.drawLabels(g, unit, unitCol);
    }
    if (line1) this.drawTextLine(g, line1, 0);
    if (line2) this.drawTextLine(g, line2, 1);
    this.texture.needsUpdate = true;
  }

  // ---- desenho ---------------------------------------------------------------
  // Fundo do .lcd-window do simulador: radial-gradient(circle at 35% 20%,
  // #9fd85b, #8ec63f) + anel interno rgba(16,94,67,0.16), mais as células
  // fantasmas da grade 8×2 (pixels apagados do LCD).
  drawBackground(g) {
    const w = this.canvas.width, h = this.canvas.height;
    if (!this._bg) {
      const bg = document.createElement('canvas');
      bg.width = w; bg.height = h;
      const b = bg.getContext('2d');
      const grad = b.createRadialGradient(w * 0.35, h * 0.2, h * 0.15, w * 0.35, h * 0.2, w * 0.85);
      grad.addColorStop(0, '#9fd85b');
      grad.addColorStop(1, '#8ec63f');
      b.fillStyle = grad;
      this._roundRect(b, 0, 0, w, h, 10); b.fill();
      b.fillStyle = 'rgba(26, 31, 8, 0.05)';
      for (let r = 0; r < GeigerDisplay.ROWS; r++)
        for (let c = 0; c < GeigerDisplay.COLS; c++)
          b.fillRect(this.pad + c * this.cellW + 3, this.pad + r * this.cellH + 5,
                     this.cellW - 6, this.cellH - 10);
      b.strokeStyle = 'rgba(16, 94, 67, 0.16)'; b.lineWidth = 4;
      this._roundRect(b, 2, 2, w - 4, h - 4, 8); b.stroke();
      this._bg = bg;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    g.drawImage(this._bg, 0, 0);
  }

  // Tinta dos caracteres: escura com leve sombra clara embaixo, como o
  // text-shadow do simulador.
  _setInk(g) {
    g.fillStyle = '#1a1f08';
    g.shadowColor = 'rgba(255, 255, 255, 0.15)'; g.shadowOffsetY = 2; g.shadowBlur = 0;
  }
  _clearInk(g) { g.shadowColor = 'transparent'; g.shadowOffsetY = 0; }

  // um caractere comum, centralizado na célula (col,row) da grade 8×2
  _drawChar(g, ch, col, row) {
    const size = this.cellH * 0.92;
    g.font = `${size}px "VT323", monospace`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(ch, this.pad + (col + 0.5) * this.cellW,
               this.pad + (row + 0.5) * this.cellH + size * 0.04);
  }

  // Números grandes do TwoLineNumbersLCD.print(): cada caractere ocupa
  // 1 coluna e as 2 linhas, esticado na vertical, a partir da coluna 0.
  drawValue(g, text) {
    this._setInk(g);
    const size = this.cellW * 1.55;
    const sy = (this.cellH * 2 * 0.94) / size;
    for (let i = 0; i < text.length && i < GeigerDisplay.COLS; i++) {
      g.save();
      g.translate(this.pad + (i + 0.5) * this.cellW, this.pad + this.cellH);
      g.scale(1, sy);
      g.font = `${size}px "VT323", monospace`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text[i], 0, size * 0.04);
      g.restore();
    }
    this._clearInk(g);
  }

  // Unidade em caracteres comuns na linha de baixo, a partir da coluna do
  // lcd.setCursor() correspondente (4 no modo taxa, 5 no modo dose).
  drawLabels(g, unit, col) {
    this._setInk(g);
    const chars = String(unit).slice(0, GeigerDisplay.COLS - col);
    for (let i = 0; i < chars.length; i++) this._drawChar(g, chars[i], col + i, 1);
    this._clearInk(g);
  }

  // Linha de texto comum (1 célula por caractere), para as telas de aviso.
  drawTextLine(g, text, row) {
    this._setInk(g);
    const chars = String(text).slice(0, GeigerDisplay.COLS);
    for (let i = 0; i < chars.length; i++) this._drawChar(g, chars[i], i, row);
    this._clearInk(g);
  }

  _roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
}

// O MGP-101 em 1ª pessoa (corpo extrudado + face em CanvasTexture + sway).
export class DetectorViewmodel {
  constructor(vmScene, vmCamera, detector, audio = null) {
    this.detector = detector;
    this.audio = audio;
    this.group = new THREE.Group();
    vmScene.add(vmCamera);
    vmCamera.add(this.group);

    this.restPos = new THREE.Vector3(0.235, -0.205, -0.52);
    this.restRot = new THREE.Euler(-0.28, -0.42, -0.08);
    // pose de exame (tecla Q): detector centralizado à frente da câmera
    this.inspectPos = new THREE.Vector3(0, -0.075, -0.33);
    this.inspectRot = new THREE.Euler(-0.02, 0, 0);
    this.inspect = false;
    this._blend = 0; // 0 = descanso, 1 = exame
    this.group.position.copy(this.restPos);
    this.group.rotation.copy(this.restRot);

    this._bobT = 0;
    this._amp = 0;
    this._panelAssets = new Map();
    this._panelFallback = null;
    this._buildMesh();
    // como no setup() do firmware, a média móvel parte da radiação de fundo
    this.display.taxas_array.fill(detector.displayDose);
    // sequência de boot do equipamento: RADinst/v3 e S/N antes das leituras
    this.display.boot();
    this._loadPanelSvgs();

    // A arte estática do painel vive em faceTexture e só é redesenhada
    // quando um asset termina de carregar; cada amostra atualiza apenas o
    // pequeno canvas do LCD (~5,5 Hz).
    detector.onSample = () => {
      this._drawLcd();
      if (!detector.silent) this.audio?.geigerClick(detector.trueDose);
    };
    this._drawStatic();
    this._drawLcd();
  }

  // Nova fase: volta à pose de descanso, sem exame nem balanço residual.
  resetPose() {
    this.inspect = false;
    this._blend = 0;
    this._bobT = 0;
    this._amp = 0;
    this.group.position.copy(this.restPos);
    this.group.rotation.copy(this.restRot);
  }

  // Contorno extraído do painel frontal MGP.svg.
  static SVG = { width: 1024, height: 1536, left: 132, right: 892, top: 208, bottom: 1358 };
  static OUTLINE = [
    [269, 208], [755, 208], [772, 226], [869, 260], [892, 287], [892, 540],
    [879, 575], [832, 665], [812, 781], [813, 893], [828, 1084], [828, 1262],
    [810, 1315], [778, 1358], [246, 1358], [214, 1315], [196, 1262], [196, 1084],
    [211, 893], [212, 781], [192, 665], [145, 575], [132, 540], [132, 287],
    [155, 260], [252, 226],
  ];

  _buildMesh() {
    const W = 0.15, H = 0.215, DEPTH = 0.032;
    const svg = DetectorViewmodel.SVG;

    const toXY = ([px, py]) => new THREE.Vector2(
      (px - (svg.left + svg.right) / 2) / (svg.right - svg.left) * W,
      ((svg.top + svg.bottom) / 2 - py) / (svg.bottom - svg.top) * H,
    );
    const pts = DetectorViewmodel.OUTLINE.map(toXY);
    // Topo, base e chanfros seguem o contorno original (lineTo). As duas laterais
    // usam as mesmas curvas do painel, deslocadas para o limite externo do corpo.
    // Os controles da esquerda são o espelho exato dos da direita em torno de x=512.
    const shape = new THREE.Shape();
    shape.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i <= 5; i++) shape.lineTo(pts[i].x, pts[i].y);
    const rC1 = toXY([847, 631]), rC2 = toXY([792, 759]), rWaist = toXY([792, 891]);
    const rLowerC = toXY([792, 995]), rLower = toXY([827, 1105]);
    shape.bezierCurveTo(rC1.x, rC1.y, rC2.x, rC2.y, rWaist.x, rWaist.y);
    shape.quadraticCurveTo(rLowerC.x, rLowerC.y, rLower.x, rLower.y);
    shape.lineTo(pts[11].x, pts[11].y);
    for (let i = 12; i <= 16; i++) shape.lineTo(pts[i].x, pts[i].y);
    const lLower = toXY([197, 1105]), lLowerC = toXY([232, 995]), lWaist = toXY([232, 891]);
    const lC1 = toXY([232, 759]), lC2 = toXY([177, 631]);
    shape.lineTo(lLower.x, lLower.y);
    shape.quadraticCurveTo(lLowerC.x, lLowerC.y, lWaist.x, lWaist.y);
    shape.bezierCurveTo(lC1.x, lC1.y, lC2.x, lC2.y, pts[22].x, pts[22].y);
    for (let i = 23; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
    shape.closePath();
    // Sem bevel: contorno do corpo = contorno da face. curveSegments alto = laterais
    // curvas finamente subdivididas (acabamento moldado industrial).
    const bodyGeo = new THREE.ExtrudeGeometry(shape, {
      depth: DEPTH, bevelEnabled: false, curveSegments: 48,
    });
    bodyGeo.translate(0, 0, -DEPTH);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f3577, roughness: 0.55, metalness: 0.1 });
    this.group.add(new THREE.Mesh(bodyGeo, bodyMat));

    // O painel SVG é a base visual do aparelho. O canvas acima dele é apenas
    // um overlay transparente para o visor, que continua mostrando a dose em
    // tempo real durante o jogo.
    const panelW = W * svg.width / (svg.right - svg.left);
    const panelH = H * svg.height / (svg.bottom - svg.top);
    const loader = new THREE.TextureLoader();
    const panelTexture = loader.load('SVG/MGP.svg', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
    });
    panelTexture.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(panelW, panelH),
      new THREE.MeshBasicMaterial({ map: panelTexture, transparent: true, depthWrite: false })
    );
    panel.position.z = 0.0065;
    panel.renderOrder = 2;
    this.group.add(panel);

    this.faceCanvas = document.createElement('canvas');
    // A face mantém a mesma proporção, mas usa 1/4 dos pixels da versão
    // anterior — suficiente para o viewmodel e muito mais leve na GPU.
    this.faceCanvas.width = 512; this.faceCanvas.height = 768;
    this.faceTexture = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTexture.colorSpace = THREE.SRGBColorSpace;
    this.faceTexture.anisotropy = 2;
    const faceMat = new THREE.MeshBasicMaterial({ map: this.faceTexture, transparent: true, depthWrite: false });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), faceMat);
    face.position.z = 0.0075;
    face.renderOrder = 3;
    this.group.add(face);

    // LCD em textura própria e pequena: é a única parte do painel que muda
    // durante o jogo, então só ela é redesenhada/reenviada à GPU. Todo o
    // desenho do visor vive na classe GeigerDisplay (réplica do firmware).
    const svgLcd = { x: 382, y: 532, w: 262, h: 102 };
    this.display = new GeigerDisplay();
    const lcdMat = new THREE.MeshBasicMaterial({ map: this.display.texture, transparent: true, depthWrite: false });
    const lcd = new THREE.Mesh(
      new THREE.PlaneGeometry(panelW * svgLcd.w / svg.width, panelH * svgLcd.h / svg.height),
      lcdMat
    );
    lcd.position.set(
      ((svgLcd.x + svgLcd.w / 2) - svg.width / 2) / svg.width * panelW,
      (svg.height / 2 - (svgLcd.y + svgLcd.h / 2)) / svg.height * panelH,
      0.0085
    );
    lcd.renderOrder = 4;
    this.group.add(lcd);
  }

  // Arte estática do painel (moldura, bezel do visor e símbolos vetoriais).
  // Redesenhada apenas quando um asset carrega — nunca durante o loop.
  _drawStatic() {
    const g = this.faceCanvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.faceCanvas.width, this.faceCanvas.height);
    // Todo o desenho continua nas coordenadas originais do SVG (1024×1536),
    // mas é rasterizado a 50% de escala.
    g.setTransform(0.5, 0, 0, 0.5, 0, 0);
    g.lineJoin = 'round';
    const useSvgAssets = this._panelAssets.size === 8;
    if (useSvgAssets || !this._panelFallback) this._drawSvgPanelFrame(g);
    else this._drawPanelFallback(g);

    // moldura escura do visor; o LCD em si vive em lcdTexture (dinâmico)
    g.fillStyle = '#20252c';
    this._roundRect(g, 374, 524, 278, 118, 7); g.fill();

    if (useSvgAssets) {
      // Controles e identidade visual originais da pasta SVG.
      this._drawPanelAsset(g, 'radiationMonitor', 323, 430, 380, 47);
      this._drawPanelAsset(g, 'h10', 666, 558, 90, 32);
      this._drawPanelAsset(g, 'set', 580, 690, 75, 75);
      this._drawPanelAsset(g, 'sound', 502, 883, 75, 75);
      this._drawPanelAsset(g, 'up', 635, 843, 47, 43);
      this._drawPanelAsset(g, 'down', 635, 949, 47, 43);
      this._drawPanelAsset(g, 'logo', 283, 1095, 450, 67);
      this._drawPanelAsset(g, 'model', 570, 1253, 142, 28);
    }

    this.faceTexture.needsUpdate = true;
  }

  // Encaminha o estado do detector ao GeigerDisplay, que replica o firmware
  // e só redesenha/reenvia a textura quando o conteúdo do visor muda.
  _drawLcd() {
    const t = this.detector.transient;
    if (t) this.display.showText(t.line1, t.line2);
    else this.display.setValue(this.detector.displayDose);
  }

  _loadPanelSvgs() {
    // Painel 100% embutido em MGP_PANEL_SVG_DATA — sem fallback de arquivo externo.
    for (const [name, source] of Object.entries(MGP_PANEL_SVG_DATA)) {
      const image = new Image();
      image.onload = () => {
        this._panelAssets.set(name, image);
        this._drawStatic();
      };
      image.src = source;
    }
  }

  _drawPanelAsset(g, name, x, y, w, h) {
    const image = this._panelAssets.get(name);
    if (image) g.drawImage(image, x, y, w, h);
  }

  _drawPanelFallback(g) {
    g.save();
    this._traceDeviceOutline(g);
    g.clip();
    g.drawImage(this._panelFallback, 0, 0, 1024, 1536);
    g.restore();
  }

  // Placa frontal como na foto de referência do MGP-101: a linha escura
  // mais externa NÃO é impressa — é a costura/profundidade onde a placa
  // branca encaixa no corpo azul, então ela é traçada EXATAMENTE na divisa
  // (metade sobre o branco, metade sobre o azul). A única linha impressa é
  // a moldura interna; todo o conteúdo, inclusive MGP-101, fica dentro dela.
  _drawSvgPanelFrame(g) {
    this._traceDeviceOutline(g);
    g.fillStyle = '#fdfdfc'; g.fill();

    // costura branco↔azul: vinco de profundidade na borda da placa
    this._traceDeviceOutline(g);
    g.strokeStyle = '#171a1f'; g.lineWidth = 10; g.stroke();

    // Moldura interna impressa: acompanha a placa a ~25 px da costura,
    // reduzindo a faixa branca sem apertar os elementos da interface.
    g.beginPath();
    g.moveTo(306, 278); g.lineTo(718, 278); g.lineTo(810, 311); g.lineTo(810, 540);
    g.bezierCurveTo(763, 624, 735, 755, 735, 891);
    g.quadraticCurveTo(735, 995, 766, 1105); g.lineTo(766, 1256);
    g.lineTo(732, 1292); g.lineTo(292, 1292); g.lineTo(258, 1256); g.lineTo(258, 1105);
    g.quadraticCurveTo(289, 995, 289, 891);
    g.bezierCurveTo(289, 755, 261, 624, 214, 540); g.lineTo(214, 311); g.closePath();
    g.strokeStyle = '#17191d'; g.lineWidth = 10; g.stroke();
  }

  _traceDeviceOutline(g) {
    g.beginPath();
    g.moveTo(300, 253); g.lineTo(724, 253); g.lineTo(835, 293); g.lineTo(835, 547);
    g.bezierCurveTo(788, 631, 760, 759, 760, 891);
    g.quadraticCurveTo(760, 995, 791, 1105); g.lineTo(791, 1262);
    g.lineTo(750, 1308); g.lineTo(274, 1308); g.lineTo(233, 1262); g.lineTo(233, 1105);
    g.quadraticCurveTo(264, 995, 264, 891);
    g.bezierCurveTo(264, 759, 236, 631, 189, 547); g.lineTo(189, 293); g.closePath();
  }

  _roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  update(dt, speedXZ, running, onGround) {
    const walking = speedXZ > 0.3 && onGround;
    const targetAmp = !walking ? 0.0025 : running ? 0.011 : 0.005;
    const freq = !walking ? 1.6 : running ? 11.5 : 7.5;
    this._amp += (targetAmp - this._amp) * Math.min(1, 8 * dt);
    this._bobT += dt * freq;

    // transição suave descanso ⇄ exame (Q); no exame o sway quase some
    this._blend += ((this.inspect ? 1 : 0) - this._blend) * Math.min(1, 9 * dt);
    const k = this._blend;
    // Na inspeção completa o detector fica estabilizado mesmo caminhando.
    // O balanço só atua durante a transição e na pose normal.
    const sway = 1 - k;

    const bx = Math.sin(this._bobT) * this._amp * sway;
    const by = -Math.abs(Math.cos(this._bobT)) * this._amp * 0.9 * sway;
    this.group.position.set(
      THREE.MathUtils.lerp(this.restPos.x, this.inspectPos.x, k) + bx,
      THREE.MathUtils.lerp(this.restPos.y, this.inspectPos.y, k) + by,
      THREE.MathUtils.lerp(this.restPos.z, this.inspectPos.z, k)
    );
    this.group.rotation.set(
      THREE.MathUtils.lerp(this.restRot.x, this.inspectRot.x, k) + by * 0.6,
      THREE.MathUtils.lerp(this.restRot.y, this.inspectRot.y, k),
      THREE.MathUtils.lerp(this.restRot.z, this.inspectRot.z, k) + bx * 0.5
    );
  }
}
