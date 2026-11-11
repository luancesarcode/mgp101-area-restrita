# Desempenho

Registro das otimizações de novembro de 2026 e de como repetir as medições.

## Como medir

```bash
npm run build -- --base=/
npm run preview -- --port 4173 --base=/
npm run bench                       # qualidade alta, sem limite de quadros
npm run bench -- --quality=auto --vsync
npm run bench -- https://game.radinstruments.com.br/
```

`tools/bench.mjs` abre um Chromium com a GPU real, fixa a semente de `Math.random` (mesma cena em toda execução) e mede oito cenas: menu, início da fase, quatro vistas do centro do laboratório, a diagonal inteira (vista mais carregada) e a interação com o campo de radiação visível. Para cada cena registra FPS, tempo de quadro médio, p95 e p99, chamadas de desenho e triângulos. No fim reinicia a fase três vezes e confere se geometrias e texturas não cresceram.

Sem `--vsync` o limite de quadros do navegador é desligado: o número mostra o custo real da cena. Com `--vsync` o resultado é o que o jogador vê em um monitor de 60 Hz.

## Resultado

Notebook com Intel UHD Graphics 620 (GPU integrada, 4 threads), Chromium, 1280 × 720, escala de pixel 1. Mediana de três execuções intercaladas (versão antiga, versão nova, antiga, nova…), com outros programas abertos na máquina — os valores absolutos variam de uma execução para outra; a comparação é o que importa.

Qualidade **Alta**, sem limite de quadros:

| Cena | FPS antes | FPS depois | p95 antes (ms) | p95 depois (ms) | Chamadas antes → depois |
|---|---:|---:|---:|---:|---:|
| Menu | 9,3 | 42,9 | 140 | 36 | 945 → 348 |
| Início da fase | 23,1 | 56,0 | 77 | 32 | 895 → 324 |
| Centro, norte | 26,3 | 63,9 | 80 | 31 | 721 → 222 |
| Centro, leste | 24,3 | 60,9 | 84 | 35 | 785 → 256 |
| Centro, sul | 53,8 | 73,5 | 34 | 29 | 503 → 158 |
| Centro, oeste | 26,2 | 62,5 | 83 | 33 | 685 → 196 |
| Diagonal | 20,4 | 47,5 | 86 | 33 | 1271 → 528 |
| Interação | 46,8 | 72,2 | 37 | 40 | 499 → 66 |

Qualidade **Automática** com vsync (uma execução de cada): a versão antiga ficou entre 17 e 24 FPS nas cenas de exploração; a nova estabiliza em 60 FPS (p95 de 18 a 22 ms; 55,6 FPS na diagonal) depois de o ajuste automático baixar a resolução interna para 80%.

Travadas (maior intervalo entre dois quadros): chegar perto da fonte pela primeira vez caiu de ~700 ms para ~60–75 ms.

Reiniciar a fase não aumenta geometrias nem texturas na GPU, antes e depois.

## O que mudou

| Mudança | Onde | Por quê |
|---|---|---|
| Vidro sem `transmission` | `LabBuilder` (`mats.glass`) | Com `MeshPhysicalMaterial.transmission` o Three.js desenha a cena opaca inteira uma segunda vez sempre que um frasco aparece. Era ~40% do tempo de quadro. |
| Sombras do sol sob demanda | `SceneManager.requestShadowUpdate`, `InteractionSystem.moved` | O sol é fixo e o laboratório quase todo estático. O mapa de sombras só é refeito quando porta, gaveta, tampa ou objeto solto se move, na troca de fase, ao recolher algo e, por segurança, a cada 2 s. |
| Brasas dos menus em canvas | `EmberField` | Centenas de `<span>` animados com sombras desfocadas sobre o WebGL custavam mais que a cena 3D. Agora é um único canvas 2D. |
| Luz do campo sempre na cena | `RadiationField` | A luz aparecia e sumia com o grupo; o número de luzes mudava e todos os shaders eram recompilados no meio da busca. |
| Pré-aquecimento | `Game._prewarm` | Um quadro desenhado atrás da tela de abertura compila os shaders do campo de radiação. |
| Níveis 3 e 4 de qualidade automática | `SceneManager.setQuality`, `Game._adaptQuality` | Em GPU integrada o gargalo é o preenchimento de pixels. O modo automático agora pode reduzir a resolução interna para 80% e 65%. O limiar passou de 45 para 50 FPS e a pausa não conta. |
| Texturas procedurais mais rápidas | `LabTextures` (`valueNoise`, `normalFromHeight`) | Mesmo resultado visual com menos trabalho por pixel no carregamento. Anisotropia 8 → 4. |

## Limites conhecidos

- Só foi medido em uma GPU (Intel UHD 620). Placas dedicadas e outros navegadores não foram testados.
- Em qualidade Alta fixa, a UHD 620 fica entre ~45 e ~70 FPS a 720p; em resoluções maiores, use Automático.
- O modo automático só desce de nível; para voltar à qualidade máxima, escolha Alta nas configurações.
- Enquanto um objeto está na mão ou em movimento, as sombras voltam a ser refeitas a cada quadro.
- O carregamento ainda gasta ~2 s gerando texturas e ~1,4 s compilando shaders na UHD 620 (~4,5–5,5 s até poder jogar).
