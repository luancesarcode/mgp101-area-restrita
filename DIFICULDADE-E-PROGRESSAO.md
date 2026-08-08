# MGP‑101 — Dificuldade e Progressão

Documento de referência do sistema de dificuldade, objetivo e progressão do
`jogo-geiger.html`. A curva parte de centenas de µSv/h, chega perto de
**10.000 µSv/h @1m** na fase 12 e usa **OverLoad somente acima de 10.000**.

---

## 1. Visão geral

- A campanha tem **13 fases**.
- **Fases 1 a 12 — busca:** encontre a pastilha radioativa, abra o recipiente
  quando necessário e recolha-a com **F** sem esgotar a dose ou a saúde.
- **Fase 13 — evacuação:** encontre a chave nas gavetas ou na maleta vermelha,
  destranque a saída e atravesse a câmara branca.
- O campo visível e o orçamento de dose ficam constantes durante a campanha.
- A fonte fica mais forte e instável; a quantidade de NORMs cresce em blocos,
  limitada pelo perfil escolhido.

---

## 2. Dificuldade base

| Perfil | Campo visível | Dose | Instabilidade inicial | Salto inicial | Máx. NORMs |
|---|:---:|:---:|:---:|:---:|:---:|
| **Treinamento** | 7,0 m | 40 µSv | nunca | ×1 | 2 |
| **Normal** | 2,8 m | 10 µSv | 80 s | ×1,7 | 3 |
| **Difícil** | sem campo | 8 µSv | 35 s | ×2,0 | 4 |

- `fieldFadeStart`: distância em que o campo visual começa a aparecer.
- `doseLimit`: dose acumulada máxima da missão.
- `destabilizeAfter`: prazo até a fonte aumentar sua emissão uma vez.
- `maxDecoys`: limite de fontes falsas NORM do perfil.

O campo e a dose não apertam a cada fase. A instabilidade chega mais cedo até
um piso seguro, e seu multiplicador para de crescer ao atingir o teto do perfil.

---

## 3. Fonte, isótopos e esconderijos

A fonte fica dentro de um recipiente em aproximadamente **93%** das partidas e
à mostra em aproximadamente **7%**. Gavetas têm peso individual menor para não
dominarem o sorteio.

| Isótopo | Energia | Intensidade base @1m | Comportamento na blindagem |
|---|---|:---:|---|
| Cs‑137 | 662 keV | 280–580 | média |
| Co‑60 | 1,17/1,33 MeV | 400–700 | penetra mais |
| Ir‑192 | ~317 keV | 300–600 | atenua mais que Cs‑137 |
| Am‑241 | 60 keV | 220–500 | atenua facilmente |

As faixas se sobrepõem. A diferença bruta entre o menor e o maior sorteio é
aproximadamente **3,2×**; antes do rebalanceamento era 30×. A identidade dos
isótopos continua principalmente na resposta à blindagem.

Os NORMs emitem de 12 a 32 µSv/h @1m na fase 1 e crescem pela raiz do
multiplicador da fase. Assim continuam confundindo sem acompanhar 1:1 a fonte
real nem se tornarem o principal perigo.

---

## 4. Progressão por fase

Para as fases 1–12, com `pressure = fase − 1` e `span = 11`:

```text
fieldFadeStart = base
doseLimit = base
intensityMultiplier = 14 ^ (pressure / 11)
decoyCount = min(maxDecoys, 1 + floor(pressure / 3))
destabilizeAfter = max(min, base − pressure * step)
destabilizeMultiplier = min(max, base * (1 + pressure * growth))
```

O multiplicador de intensidade vai de **×1** a **×14**. Como o maior sorteio
é 700 µSv/h @1m, a fonte estável mais forte chega a aproximadamente
**9.800 µSv/h @1m** na fase 12.

Ao iniciar a **fase 8**, a trilha épica começa obrigatoriamente do início. Ao
carregar diretamente do menu qualquer fase entre **8 e 12**, ela também reinicia.
No avanço normal da fase 8 para 9 e entre as fases 9–12, a faixa continua do
ponto em que estiver tocando.

As partículas verdes do laboratório também aceleram progressivamente: ×1 na
fase 8, ×1,35 na 9, ×1,70 na 10, ×2,05 na 11 e **×2,40 na fase 12**.

### Radiação estável por fase

| Fase | Mult. | Fonte média @1m | Perto (~0,4 m) | Co‑60 máx. @1m |
|:---:|:---:|---:|---:|---:|
| 1 | ×1,0 | 448 | 2.797 | 700 |
| 2 | ×1,3 | 569 | 3.555 | 890 |
| 3 | ×1,6 | 723 | 4.519 | 1.131 |
| 4 | ×2,1 | 919 | 5.745 | 1.438 |
| 5 | ×2,6 | 1.168 | 7.302 | 1.828 |
| 6 | ×3,3 | 1.485 | 9.282 | 2.323 |
| 7 | ×4,2 | 1.888 | **11.799** ⚠ | 2.953 |
| 8 | ×5,4 | 2.400 | 14.998 | 3.754 |
| 9 | ×6,8 | 3.050 | 19.064 | 4.771 |
| 10 | ×8,7 | 3.877 | 24.233 | 6.065 |
| 11 | ×11,0 | 4.929 | 30.804 | 7.710 |
| 12 | ×14,0 | 6.265 | 39.156 | **9.800** |
| 13 | — | Evacuação | — | — |

⚠ Acima de 10.000, o visor mostra **OverLoad**.

A distância de 0,4 m é o piso matemático da lei do inverso do quadrado.
Fontes no chão normalmente ficam mais longe dos olhos do jogador por causa da
diferença de altura. Por isso, a coluna de 0,4 m representa um pior caso teórico.

---

## 5. Instabilidade

| Perfil | Fase 1 | Fase 12 | Multiplicador máximo |
|---|:---:|:---:|:---:|
| Treinamento | nunca | nunca | ×1 |
| Normal | 80 s | 36 s | ×2,2 |
| Difícil | 35 s | 18 s | ×2,6 |

Os pisos de 36/18 segundos evitam que a instabilidade seja um multiplicador
praticamente permanente desde o começo. Depois do evento, a leitura ainda pode
passar de 10.000 µSv/h, especialmente perto da fonte.

---

## 6. Visor e OverLoad

`EQUIPMENT_MAX_DOSE = 10000`.

- A leitura numérica vai até e incluindo **10.000 µSv/h**.
- Em cinco dígitos, a unidade é escondida para caber no LCD.
- Somente valores **maiores que 10.000** exibem **"OverLoad"**.
- A dose e o dano continuam sendo calculados com o valor real durante OverLoad.

---

## 7. Dose, saúde e avisos

A dose acumulada usa:

```text
dose += taxaAtual * deltaSegundos / 3600
```

A saúde cai acima de 100 µSv/h. O dano é `(taxa − 100) / 600`, limitado a
5 HP/s. Abaixo do limiar, a saúde regenera até 1,2 HP/s. Abaixo de 70% de
saúde, a velocidade cai gradualmente até ×0,45.

O aviso não usa mais uma porcentagem fixa. O jogo estima:

```text
segundosRestantes = (limite − acumulada) * 3600 / taxaAtual
```

Ele avisa por volta de **12 segundos restantes** e novamente abaixo de
**5 segundos**, o que continua útil mesmo quando a taxa aumenta rapidamente.

---

## 8. Fase 13 — Evacuação

- Sem fonte, NORMs, limite de dose ou dano de radiação.
- A chave aparece somente nas gavetas ou na maleta vermelha.
- Abra o recipiente, recolha a chave com **F**, abra a porta e atravesse a
  câmara branca.
- Ao concluir, a campanha termina e o slot utilizado é apagado.

---

## 9. Saves e recordes

- Existem 3 slots com `{dificuldade, fase, data}`.
- Vencer grava a fase seguinte; perder reinicia a fase atual.
- O melhor tempo é guardado por dificuldade e fase.
- Esconderijo, intensidade e isótopo continuam procedurais, mas as novas faixas
  sobrepostas reduzem bastante a influência da sorte nos recordes.

---

## 10. Controles principais de balanceamento

| Constante/campo | Valor | Efeito |
|---|:---:|---|
| `PHASE_INTENSITY_MAX` | 14 | Multiplicador da fonte na fase 12. |
| `EQUIPMENT_MAX_DOSE` | 10000 | Último valor numérico antes do OverLoad. |
| `HEALTH_DAMAGE_THRESHOLD` | 100 | Taxa a partir da qual a saúde cai. |
| `HEALTH_DAMAGE_DIVISOR` | 600 | Maior = dano mais lento. |
| `HEALTH_DAMAGE_MAX` | 5 | Teto de dano em HP/s. |
| `HEALTH_SLOW_START` | 70 | Início da lentidão por queimadura. |
| `HEALTH_SLOW_MIN` | 0,45 | Velocidade mínima. |
| `doseLimit` | 40 / 10 / 8 | Dose por perfil. |
| `fieldFadeStart` | 7 / 2,8 / 0 | Campo visível por perfil. |
| `maxDecoys` | 2 / 3 / 4 | Máximo de NORMs por perfil. |
| `destabilizeMin` | ∞ / 35 / 18 s | Piso configurado; no Normal a curva termina em 36 s. |
| `destabilizeMax` | 1 / 2,2 / 2,6 | Teto do salto de intensidade. |

---

## 11. Resumo

A campanha começa com leituras na casa de centenas de µSv/h @1m, avança de
forma exponencial até uma fonte estável máxima de aproximadamente 9.800 µSv/h
@1m e reserva o **OverLoad** para leituras que realmente ultrapassem 10.000.
