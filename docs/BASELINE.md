# Baseline de equivalência

Registro criado antes da modularização do MGP-101. O objetivo é permitir a confirmação de que o código-fonte original e os assets de áudio continuam intactos.

## Arquivos originais

| Arquivo | Tamanho | SHA-256 |
|---|---:|---|
| `jogo-geiger.html` | 338.097 bytes | `1C98821AEAE5C9F5A597021D1BF66E312EB7E51E91C91DDD8FDF6840B24FEE4E` |
| `DIFICULDADE-E-PROGRESSAO.md` | 7.568 bytes | `605495C474AD5B8ADEC5F658E0EB5462B36E4C0B43F5AC76A4D60B6A56596D8A` |
| `assets/radiation-monitor.mp3` | 5.275.259 bytes | `6EEB4105A98D2E7720E308570F5D67C2FD895AD6AF9DCAB3A43B0521A119B22E` |
| `assets/Fase1.mp3` | 5.322.548 bytes | `1A50FFD17BCECE84C20605CA49FEE9717ECF75B5F0FDA779CBD3C7489638ABFA` |
| `assets/calm_victory.mp3` | 6.136.320 bytes | `3E02D5D499784319F34F8C4BF22E2B6E07046DCBEF4DFF2D060B124ACB685B0F` |

O HTML original possui 6.720 linhas, 24 classes JavaScript, um bloco de estilos e um módulo principal.

## Marco Git

- Commit original: `8d6a93e`
- Tag local: `v1.0-monolith`
- O arquivo `jogo-geiger.html` permanece no repositório sem alteração.

## Caracterização realizada

A versão original e o build modular foram executados lado a lado em HTTP, usando viewport de 1280 × 720.

Foram comparados:

- título e idioma do documento;
- ordem dos elementos visuais da interface;
- presença e dimensões dos dois canvases;
- tela de boot;
- itens e seleção do menu;
- transição do boot para o menu;
- inicialização de uma campanha de Treinamento;
- HUD, saúde, missão, fase e limite de dose;
- erros JavaScript e respostas HTTP com falha.

A tela de boot apresentou a mesma composição visual. O valor decorativo do LCD do menu varia aleatoriamente nas duas versões e, por isso, não é usado como comparação literal.

## Testes automatizados

Os testes de caracterização cobrem:

- progressão das fases 1, 12 e 13;
- intensidade, NORMs e instabilidade por dificuldade;
- transmissão e expoente de blindagem;
- lei do inverso do quadrado e distância mínima;
- dose acumulada;
- limite de OverLoad;
- dano, regeneração e lentidão por saúde;
- três slots, migração de save legado e exclusão de slot;
- inicialização WebGL e entrada numa campanha pelo navegador.

Uma passagem manual completa pelas 13 fases continua recomendada antes do corte definitivo de produção, especialmente para validar controle físico, áudio e situações procedurais raras.
