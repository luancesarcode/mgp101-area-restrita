# Arquitetura do MGP-101

O projeto mantém o desenho orientado a classes do jogo original. A modularização separa responsabilidades sem introduzir framework, event bus, ECS ou um novo motor de física.

## Fluxo principal

```text
main.js
  └─ Game
      ├─ SceneManager ── laboratório e efeitos
      ├─ Player ──────── Pointer Lock e movimento
      ├─ RadiationSource + ShieldingModel + GeigerDetector
      ├─ InteractionSystem ── física e manipulação
      ├─ MissionManager + HealthSystem + RouteRecorder
      ├─ DetectorViewmodel + GeigerDisplay
      ├─ HUD + menus + controle Xbox
      └─ GameAudio + persistência
```

`Game` continua sendo o compositor e dono do loop. A ordem dos construtores e a ordem de atualização dentro de `_tick()` são as mesmas do monólito.

## Módulos

| Área | Responsabilidade |
|---|---|
| `config/gameConfig.js` | Valores físicos, balanceamento, isótopos e dificuldades |
| `storage/persistence.js` | Cookies, fallback local, slots e configurações |
| `audio/GameAudio.js` | Trilhas, Geiger e efeitos procedurais |
| `rendering/SceneManager.js` | Renderer, câmeras, luzes, bloom e qualidade |
| `world/` | Construção do laboratório, superfícies e evacuação |
| `radiation/` | Fonte procedural, leitura e blindagem |
| `physics/InteractionSystem.js` | Interação, objetos soltos, colisões e passo fixo |
| `equipment/` | Malha do monitor e emulação do LCD |
| `effects/` | Campo visível, atmosfera e brasas |
| `gameplay/` | Missão, saúde e mapa de rota |
| `ui/` | HUD, menus, pausa e Gamepad API |
| `core/Game.js` | Progressão, estados, bindings e loop principal |

## Decisões de compatibilidade

- Three.js permanece em `0.160.0`.
- Os corpos das classes foram extraídos mecanicamente.
- O SVG do painel continua embutido em `panelSvgData.js`.
- Os MP3 originais são importados como URL pelo Vite e copiados sem recodificação.
- `window.__game` permanece disponível para depuração.
- O build usa o caminho-base `/game/`.
- O monólito permanece como referência, não como dependência de produção.

## Áreas deliberadamente não alteradas

- balanceamento;
- física e colisores;
- materiais, geometria e iluminação;
- menus e textos;
- formatos de save;
- aleatoriedade procedural;
- áudio e volumes;
- controles e mapeamento Xbox;
- qualidade adaptativa.
