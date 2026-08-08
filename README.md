# MGP-101 — Área Restrita

Jogo em primeira pessoa de exploração e detecção de radiação, desenvolvido em JavaScript e [Three.js](https://threejs.org/). O jogador investiga um laboratório, interpreta o monitor MGP-101, usa distância e blindagem para reduzir a exposição e localiza fontes radioativas procedurais.

Produção: [radinstruments.com.br/game/](https://radinstruments.com.br/game/)

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

## Tecnologias

- JavaScript com ES Modules
- Three.js `0.160.0`
- Vite
- Vitest
- Playwright
- ESLint

O Three.js está fixado na mesma versão do jogo original para evitar mudanças de renderização ou comportamento.

## Executar localmente

Requisitos: Node.js 24 ou uma versão compatível com o Vite 8.

```bash
npm install
npm run dev
```

O endereço mostrado pelo Vite deve ser aberto por HTTP. A aplicação modular não deve ser iniciada por duplo clique em `index.html`, pois navegadores restringem módulos carregados por `file://`.

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
