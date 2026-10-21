# Modo Usina · Bloco 4

Modo avulso, fora da campanha, acessível pelo menu principal em **USINA · BLOCO 4**. A Usina Nuclear Araucária é fictícia: é a noite seguinte à explosão do reator da Unidade 4. O jogador entra com o MGP-101 e uma lanterna de capacete.

## Objetivo

1. Entre os ~26 blocos de grafite espalhados pela explosão, só alguns estão **ativos**. O MGP-101 é o que os distingue: perto de um ativo, a leitura dispara. Tentar pegar um bloco inerte apenas o marca com giz.
2. Recolher o fragmento ativo com **F** (tenaz) e levá-lo a um **contêiner blindado**: A no pátio, B na ponta oeste do salão das turbinas.
3. Carregar o fragmento irradia o jogador a cerca de 1 m de distância. Apertar **F** longe de um contêiner larga o bloco, para se recuperar atrás de concreto.
4. Com todos os ativos contidos, o farol verde acende: é hora de evacuar pela faixa do portão sul.

A partida termina em derrota quando o orçamento de dose se esgota ou a saúde chega a zero (o mesmo `HealthSystem` da campanha).

## Perfis

| | Reconhecimento | Liquidante |
|---|---|---|
| Fragmentos ativos | 3 (≥ 1 no reator) | 5 (≥ 2 no reator) |
| Orçamento de dose | 250 µSv | 200 µSv |
| Aura visível dos ativos | 6 m | 2,2 m |
| Núcleo (µSv/h @ 1 m) | 240 000 | 360 000 |
| Picos de emissão | a cada 95–135 s, ×1,6 | a cada 60–95 s, ×2,0 |

Os valores ficam em `PLANT_PROFILES` (`src/config/gameConfig.js`) e são regras de jogo, não limites normativos.

## Mapa — `src/world/PlantBuilder.js`

Pátio com cerca, tenda de descontaminação, caminhão de bombeiros, holofote e ônibus de evacuação. Salão das turbinas com o teto desabado na ponta leste. Corredor de serviço. Sala de controle com o painel de canais do núcleo e o teto furado. Sala de bombas alagada. Salão do reator a céu aberto, com o núcleo exposto (o MGP-101 entra em OverLoad perto dele), a tampa do escudo biológico tombada e a ponte rolante caída. Ao fundo, a chaminé de ventilação e as torres de resfriamento.

A planta em ASCII está no topo do arquivo. Paredes e escombros entram no `ShieldingModel`, então ficar atrás de concreto reduz de verdade a dose do núcleo. Portas e brechas não blindam.

## Radiação — `src/radiation/PlantRadiation.js`

Mesma interface de fonte que o `GeigerDetector` usa (`doseRateAt`). A dose soma:

- o fundo de contaminação de cada área;
- o núcleo, blindado com expoente 0,6 (gama duro);
- os fragmentos ativos no chão (blindados) ou na tenaz (sem blindagem);
- escombros contaminados invisíveis, que funcionam como os NORMs da campanha.

## Integração

O `Game` troca o mundo renderizado com `SceneManager.setWorld()`, a lista de colliders do jogador e a fonte do detector. O viewmodel do MGP-101 não muda. A usina só é construída na primeira partida desse modo, e voltar ao menu restaura o laboratório. Os recordes ficam em `mgp101_best_plant_<perfil>` e aparecem em RECORDES.
