# Publicação em `/game/`

Este documento prepara a implantação, mas não autoriza nem executa alterações no servidor ou no WordPress.

## Gerar o artefato

```bash
npm ci
npm run lint
npm run test
npm run build
npm run test:browser
```

O conteúdo publicável estará em `dist/`. A configuração atual gera URLs com o prefixo `/game/`.

## Estrutura esperada no servidor

```text
public_html/
└── game/
    ├── index.html
    └── assets/
        ├── index-*.js
        ├── index-*.css
        └── *.mp3
```

O endereço final deve responder em:

```text
https://radinstruments.com.br/game/
```

## Relação com o WordPress atual

Hoje `/game/` é resolvido por uma página WordPress/Elementor que inclui o jogo no documento. A opção recomendada é servir o artefato estático diretamente nesse caminho, sem carregar Elementor, WooCommerce ou os demais plugins da página principal.

Antes do corte:

1. Exporte ou faça backup da página WordPress atual.
2. Guarde uma cópia do artefato atualmente publicado.
3. Teste o novo build em um caminho temporário com uma configuração de `base` correspondente.
4. Confirme se o servidor prioriza `game/index.html` sobre as regras de reescrita do WordPress.
5. Faça a troca de maneira atômica, mantendo rollback imediato.

## Validação posterior

- `https://radinstruments.com.br/game/` retorna 200.
- JS, CSS e MP3 retornam 200 e usam `/game/assets/`.
- Não existem erros de console.
- Pointer Lock funciona após interação do usuário.
- Áudio é liberado após gesto do usuário.
- Controle Xbox é detectado.
- Saves antigos permanecem disponíveis.
- As fases 1, 8, 12 e 13 são validadas manualmente.

## Rollback

Se alguma verificação falhar, restaure o artefato anterior ou reative a página WordPress exportada. Não apague backups durante o primeiro ciclo de produção.
