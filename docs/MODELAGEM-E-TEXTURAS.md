# Modelagem e texturas do laboratório

## Objetivo

Elevar a fidelidade visual do laboratório sem alterar o detector MGP-101 (modelo e LCD), o HUD, os menus, a física, os colliders, a blindagem, os recipientes nem o balanceamento.

## Texturas procedurais — `src/world/LabTextures.js`

Todas geradas em canvas no carregamento (nenhum arquivo novo), com cor, normal map e mapa de rugosidade. Um gerador com semente fixa deixa o visual sempre igual e não consome `Math.random`, que continua reservado aos sorteios do jogo.

| Conjunto | Uso |
|---|---|
| Piso vinílico 60 cm | piso, com flocos, desgaste e rejunte |
| Painel pintado 1,2 m | paredes e divisória |
| Forro modular 60 cm | teto (o `EpicAtmosphere` continua tingindo o material) |
| Metal escovado | estruturas, faixa de proteção e prateleiras |
| Pintura eletrostática | armários, gabinetes e portas |
| Tampo fenólico | bancadas |
| Madeira com veios e nós | caixotes |
| Aço pintado gasto | barris |
| Borracha texturizada | peças escuras, rodapé e maletas |

As superfícies grandes usam `worldBoxGeometry`, com UV em metros, para a textura não esticar.

## Remodelagem

- Luminárias com caixa, difusor e aletas.
- Bancadas com friso de borda, pernas com sapatas e travessas, e gabinete pintado.
- Gavetas com puxador em barra e porta-etiqueta.
- Monitores com carcaça traseira, coluna, LED e teclado com teclas. A tela do monitor não mudou.
- Armários com almofadas, venezianas, fechadura, dobradiças, segunda prateleira e placa de identificação.
- Estantes com abas de reforço, contraventamento em X e sapatas.
- Barris com perfil torneado (frisos de rolagem) e bujões na tampa.
- Caixotes com sarrafos e estêncil.
- Maletas com cantoneiras, travas, alça e selo de radiação.
- Porta de saída com visor aramado, chapa de chute, fechadura aérea e dobradiças.

## Objetos novos — `src/world/LabDecor.js`

- Rodapé, sinal de SAÍDA iluminado, placas de radiação, cartaz ALARA, quadro branco e planta de rota de fuga (desenhada a partir dos próprios colliders).
- Relógio com a hora real, extintor, kit de primeiros socorros, quadro elétrico, chuveiro de emergência com lava-olhos, cabideiro com jalecos, tomadas e interruptor.
- Eletrocalha com cabos, tubulações com registro, difusores de ar, detectores de fumaça e sprinklers.
- Faixas zebradas, hachurados "mantenha livre" e ralo.
- Objetos soltos com física: três banquetas, uma lixeira de rejeito e uma prateleira com três frascos na bancada noroeste.

Nenhum collider, blindagem ou recipiente novo: o que está na parede sai no máximo 0,30 m da face (o jogador para a 0,32 m), e a fonte e a chave continuam sorteadas só nos lugares de antes.

## Desempenho

`LabBuilder._mergeStatic()` junta por material as malhas que nunca se movem. `_mergeLocal()` faz o mesmo dentro de cada grupo móvel (gavetas, portas, objetos soltos). Com todos os objetos novos, a cena faz menos chamadas de desenho do que fazia antes da mudança.
