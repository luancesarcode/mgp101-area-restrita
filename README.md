<div align="center">

# ☢ MGP-101 — ÁREA RESTRITA

**Jogo em primeira pessoa de exploração e detecção de radiação, desenvolvido em JavaScript e Three.js.**

[![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=for-the-badge&logo=javascript&logoColor=111111)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Three.js](https://img.shields.io/badge/Three.js-0.160.0-000000?style=for-the-badge&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Checks](https://img.shields.io/github/actions/workflow/status/luancesarcode/mgp101-area-restrita/checks.yml?style=for-the-badge&label=checks)](https://github.com/luancesarcode/mgp101-area-restrita/actions/workflows/checks.yml)

### [▶ JOGAR AGORA](https://radinstruments.com.br/game/)

[Sobre](#sobre-o-jogo) · [Demonstração](#demonstração) · [Instalação](#instalação-e-execução-local) · [Controles](#controles) · [Arquitetura](#arquitetura)

</div>

---

## Sobre o jogo

O jogador investiga um laboratório, interpreta o monitor MGP-101, usa distância e blindagem para reduzir a exposição e localiza fontes radioativas procedurais antes de ultrapassar os limites da missão.

O jogo pode ser acessado diretamente em **[https://radinstruments.com.br/game/](https://radinstruments.com.br/game/)**.

> O repositório modulariza o jogo original sem alterar regras, visual, física, áudio, controles, progressão ou persistência. O monólito intacto permanece em `jogo-geiger.html` e na tag Git `v1.0-monolith`.

## Características

- Campanha com 13 fases, incluindo evacuação final.
- Quatro isótopos com respostas diferentes à blindagem.
- Campo de radiação e dose baseados em distância, intensidade e transmissão.
- Objetos interativos e física em passo fixo de 1/120 s.
- Monitor MGP-101 em primeira pessoa com LCD emulado.
- Teclado, mouse e controles Xbox pela Gamepad API.
- Três slots de campanha, configurações e recordes locais.
- Qualidade gráfica adaptativa e pós-processamento com bloom.

## Demonstração

### Capturas de tela

> 📷 Espaço reservado para as imagens oficiais do jogo.

<!--
Quando as imagens estiverem prontas, coloque-as em docs/media/screenshots/ e substitua este comentário por algo como:

<p align="center">
  <img src="docs/media/screenshots/menu-principal.png" width="48%" alt="Menu principal do MGP-101">
  <img src="docs/media/screenshots/gameplay-laboratorio.png" width="48%" alt="Gameplay no laboratório">
</p>
-->

### Vídeo de gameplay

> 🎥 Espaço reservado para o trailer ou vídeo de gameplay.

<!--
Recomendação: publique o vídeo no YouTube e use uma imagem clicável para evitar armazenar vídeos grandes no GitHub:

[![Assistir ao gameplay](docs/media/screenshots/video-cover.png)](https://www.youtube.com/watch?v=SEU_VIDEO)
-->

## Estado do projeto

| Item | Situação |
|---|---|
| Versão jogável no navegador | Disponível |
| Campanha com 13 fases | Implementada |
| Teclado, mouse e controle Xbox | Implementados |
| Refatoração modular | Concluída |
| Screenshots e trailer | Em preparação |

## Tecnologias

- JavaScript com ES Modules
- Three.js `0.160.0`
- Vite
- Vitest
- Playwright
- ESLint

O Three.js está fixado na mesma versão do jogo original para evitar mudanças de renderização ou comportamento.

Ao selecionar **CONTINUAR** na tela de boot, o jogo solicita o modo de tela cheia. Se o navegador ou o host bloquear essa permissão, o menu abre normalmente em modo janela.

## Instalação e execução local

### Pré-requisitos

- [Git](https://git-scm.com/)
- Node.js 24 ou uma versão compatível com o Vite 8
- Navegador com suporte a WebGL e ES Modules

### Instalação

```bash
git clone https://github.com/luancesarcode/mgp101-area-restrita.git
cd mgp101-area-restrita
npm install
```

### Iniciar o jogo

```bash
npm run dev
```

Abra o endereço exibido pelo Vite no terminal. O projeto deve ser executado por HTTP; não abra `index.html` por duplo clique, pois navegadores restringem módulos carregados por `file://`.

### Visualizar o build de produção

```bash
npm run build
npm run preview
```

## Comandos

```bash
npm run dev           # servidor de desenvolvimento
npm run build         # gera dist/ para /game/
npm run preview       # visualiza o build de produção
npm run lint          # verifica referências JavaScript
npm run test          # testes unitários de caracterização
npm run test:browser  # teste do fluxo real em Chromium
npm run check         # lint, testes unitários e build
```

Na primeira execução dos testes de navegador:

```bash
npx playwright install chromium
```

## Controles

| Ação | Teclado e mouse | Controle Xbox |
|---|---|---|
| Movimento | `WASD` | Analógico esquerdo |
| Câmera | Mouse | Analógico direito |
| Correr | `Shift` | Clique no analógico esquerdo |
| Pular | `Espaço` | `A` |
| Agachar | `Ctrl` | `B` |
| Interagir/manipular | `F` | `X` |
| Pausar | `Esc` | Menu |

Os controles completos de manipulação de objetos continuam disponíveis dentro do próprio jogo.

## Arquitetura

```text
src/
├── audio/       reprodução e mixagem das trilhas e efeitos
├── config/      constantes, dificuldades e isótopos
├── core/        composição do jogo e loop principal
├── effects/     campo visual, atmosfera e partículas
├── equipment/   viewmodel e LCD do monitor MGP-101
├── gameplay/    missão, saúde e registro de rota
├── physics/     interação e corpos rígidos manipuláveis
├── player/      movimento, câmera e Pointer Lock
├── radiation/   fonte, detector e blindagem
├── rendering/   cena, renderer e pós-processamento
├── storage/     saves, configurações e migração de dados
├── styles/      apresentação original extraída do HTML
├── ui/          HUD, menus, pausa e entrada Xbox
└── world/       laboratório, superfícies e evacuação
```

Detalhes e dependências estão em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Compatibilidade de saves

A versão modular preserva as chaves e formatos originais:

- `mgp101_campaign`
- `mgp101_settings`
- `mgp101_best_*`
- espelhos locais prefixados por `cookie_backup_`

Como a produção permanece na mesma origem `radinstruments.com.br`, campanhas, preferências e recordes existentes continuam acessíveis.

## Build para `/game/`

O `vite.config.js` usa `base: '/game/'`. Para gerar o pacote:

```bash
npm ci
npm run check
npm run test:browser
npm run build
```

O diretório `dist/` resultante é o artefato estático. Consulte [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) antes de substituir a página atual.

## Preservação do original

O arquivo `jogo-geiger.html` não é gerado pelo Vite e não deve ser modificado. Ele serve como referência de equivalência e pode ser executado separadamente por um servidor HTTP.

Os hashes e as verificações da migração estão em [docs/BASELINE.md](docs/BASELINE.md). A lógica de dificuldade e progressão permanece documentada em [docs/DIFICULDADE-E-PROGRESSAO.md](docs/DIFICULDADE-E-PROGRESSAO.md).

## Licenciamento

Nenhuma licença pública foi definida. Antes de tornar o repositório público, confirme os direitos de redistribuição das músicas, efeitos sonoros, logotipos e demais elementos da marca RAD Instruments.

---

<div align="center">

Desenvolvido com JavaScript e Three.js para a **RAD Instruments**.

[Jogar online](https://radinstruments.com.br/game/) · [Reportar problema](https://github.com/luancesarcode/mgp101-area-restrita/issues)

</div>
