import { BACKGROUND_DOSE, NEAR_DISTANCE } from '../config/gameConfig.js';

// ==== MISSIONMANAGER ========================================================
// Texto de missão, proximidade, vitória (recolher a pastilha) e falha
// (orçamento de dose excedido).
export class MissionManager {
  constructor(hud, source, onWin, onFail) {
    this.hud = hud;
    this.source = source;
    this.onWin = onWin;
    this.onFail = onFail;
    this.ended = false;
    this.doseLimit = 40;
    this._nearAnnounced = false;
    this._doseWarningLevel = 0;
    this.unstable = false;
    this.evacuation = false;
    this._evacDoorAnnounced = false;
    this._messageToken = 0;
  }

  // Nova fase: a fonte é a mesma instância (mutada por respawn); só o estado
  // da missão precisa voltar ao zero. doseLimit é definido por _applyPhase.
  reset() {
    this.ended = false;
    this._nearAnnounced = false;
    this._doseWarningLevel = 0;
    this.unstable = false;
    this.evacuation = false;
    this._evacDoorAnnounced = false;
    this._messageToken++;
  }

  setEvacuation(active) { this.evacuation = Boolean(active); }

  start() {
    if (this.evacuation) {
      this.hud.setMission('Localize a chave de evacuação');
      this.hud.toast('Protocolo de evacuação iniciado. Localize a chave de segurança.', 4);
      return;
    }
    const token = this._messageToken;
    this.hud.setMission('Encontre a pastilha radioativa perdida.');
    this.hud.toast('Uma fonte radioativa foi perdida no laboratório.', 4);
    setTimeout(() => {
      if (!this.ended && token === this._messageToken) {
        this.hud.toast('Utilize o detector para encontrá-la. Cuidado com a dose!', 4);
      }
    }, 4200);
  }

  setSourceUnstable() {
    if (this.unstable || this.ended) return;
    this.unstable = true;
    this.hud.setMission('⚠ Fonte desestabilizada. Localize e recolha a pastilha!');
    this.hud.toast('⚠ A fonte se desestabilizou e começou a emitir mais radiação!', 6);
  }

  update(playerPos, accumulated, doseRate = BACKGROUND_DOSE) {
    if (this.ended || this.evacuation) return;

    const dist = this.source.horizontalDistanceTo(playerPos);
    if (dist < NEAR_DISTANCE && !this._nearAnnounced) {
      this._nearAnnounced = true;
      this.hud.toast('Fonte localizada.', 3);
      this.hud.setMission('Fonte localizada. Encontre a pastilha e recolha-a com F.');
    } else if (dist > NEAR_DISTANCE * 1.6 && this._nearAnnounced) {
      this._nearAnnounced = false;
      this.hud.setMission('Encontre a pastilha radioativa perdida.');
    }

    // Aviso adaptativo: porcentagem fixa chega tarde demais em taxas altas.
    // A estimativa usa a taxa atual e diz quanto tempo resta se ela não mudar.
    const remainingSeconds = Math.max(0, this.doseLimit - accumulated) * 3600 /
      Math.max(doseRate, BACKGROUND_DOSE);
    // Rearma os avisos se o jogador recuar para uma taxa segura; a histerese
    // evita spam ao oscilar exatamente em 12 ou 5 segundos.
    if (remainingSeconds > 18) this._doseWarningLevel = 0;
    else if (remainingSeconds > 8 && this._doseWarningLevel > 1) this._doseWarningLevel = 1;
    if (remainingSeconds <= 5 && this._doseWarningLevel < 2) {
      this._doseWarningLevel = 2;
      this.hud.toast('☢ CRÍTICO: menos de 5 segundos de dose nesta taxa! Recue ou recolha a fonte!', 4);
    } else if (remainingSeconds <= 12 && this._doseWarningLevel < 1) {
      this._doseWarningLevel = 1;
      this.hud.toast(`⚠ Dose: cerca de ${Math.max(1, Math.ceil(remainingSeconds))} s restantes nesta taxa.`, 4);
    }
    if (accumulated >= this.doseLimit) {
      this.ended = true;
      this.onFail();
    }
  }

  collect() {
    if (this.ended) return;
    this.ended = true;
    this.onWin();
  }

  collectEvacuationKey() {
    if (!this.evacuation || this.ended) return;
    this.hud.setMission('Chave obtida. Abra a porta de emergência com F.');
    this.hud.toast('Chave reconhecida. Porta de emergência destrancada.', 4);
  }

  // Chamado quando a porta de emergência é aberta: só então o objetivo passa
  // a apontar a saída (achar chave → abrir porta → sair).
  evacuationDoorOpened() {
    if (!this.evacuation || this.ended || this._evacDoorAnnounced) return;
    this._evacDoorAnnounced = true;
    this.hud.setMission('Porta aberta. Dirija-se à saída.');
  }
}
