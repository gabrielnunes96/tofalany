# Redesenho visual — direção e sistema de temas

> Demanda: `redesenho-visual` · Versão 2 · 12/11/2026 · Situação: **aprovada em 12/11/2026**; temas grátis aplicados no app (os de loja entram com `pontos-e-loja`)
> Protótipo navegável: [prototipo-temas.html](prototipo-temas.html) (abrir num navegador; troca os 6 temas na mesma tela).

## 1. Auditoria do que existe (11/11)

| Gravidade | Onde | Problema | Correção |
| --- | --- | --- | --- |
| médio | `base.css` inteiro | Um nível só de variáveis (`--destaque`, `--magenta`…) com nome de cor, não de papel. O magenta faz cinco coisas: borda do título, selo, não lidas, canal ativo e foco. | Tokens semânticos por papel (`--cor-acento`, `--cor-destaque`, `--cor-foco`…); cada cor com um papel só. |
| médio | `base.css` | ~40 cores soltas fora dos temas (`#000`, `#fff`, `#ff8800`, `#5865f2`, `#7c8cff`…) e 7 cores em `style={{}}`. Num tema novo, essas partes ficam com a cor errada. | Todas viram tokens; o tema de loja só funciona se 100% da cor vier do tema. |
| médio | `base.css` | 25 medidas diferentes (6, 10, 14, 18, 22, 30, 9, 7, 5px…) e ~20 tamanhos de fonte. O ritmo fica irregular. | Espaço em base 4 (4, 8, 12, 16, 24, 32, 48) e 6 tamanhos de texto (11–24px). |
| médio | lista de canais, chat | Emoji como ícone (🔊, 🔔, 📌, 🎵) misturado com os SVG do `Icone.tsx`. Cada sistema operacional desenha o emoji de um jeito. | Só SVG do `Icone.tsx`, com `currentColor`. |
| médio | botões | "Enviar" usa um ciano escuro diferente do acento de "Novo cargo"; secundários são todos iguais e ninguém sabe qual é a ação principal. | Três tipos de botão: primário (acento), secundário (contorno) e perigo, com os estados hover, pressionado, foco e desligado. |
| polimento | rótulos | Caixa alta em quase todo rótulo (`label`, `.subtitulo`, `.nome-servidor`) cansa a leitura. | Caixa alta só nos títulos de grupo pequenos (11px). |
| polimento | movimento | Transições soltas, sem durações nem curvas comuns, e sem `prefers-reduced-motion`. | Tokens de movimento (120/200/320 ms, curvas de entrada, saída e padrão) e redução de movimento respeitada. |
| polimento | fonte | `system-ui`: o app fica diferente no Windows e no Linux. | Inter embutida no app (OFL), mesma cara nos dois. |

O que está bom e fica: o layout em 4 colunas (servidores, canais, chat, membros), o painel de voz embaixo, o contraste dos textos e a variedade de temas.

## 2. Direção

**"Sala de estar à noite", viva e refinada** (versão 2, 12/11, depois do "está muito quadrado"):
- **Painéis flutuando** sobre um fundo vivo: canais, chat e membros viram cartões com cantos de 14–20px, separados por 10px de respiro, com um leve vidro (desfoque) deixando passar a luz do fundo. Nada de colunas grudadas por bordas.
- **Fundo com luz**: manchas de cor do tema que "respiram" devagar (14 s, só `transform`); some com "reduzir movimento".
- **Gradientes com papel**: servidor ativo, botão principal e a borda do cartão da loja usam acento → acento-2. O resto fica calmo.
- **Vida nos detalhes**: anel de quem fala pulsa; o ponto de "voz conectada" pulsa; servidores viram de círculo para quadrado arredondado no hover (mola); canais deslizam 2px; botões sobem 1px e afundam ao clicar; mensagens entram em cascata curta; a amostra do tema na loja tem um brilho passando.
- **Hierarquia**: o acento marca a ação principal e o que está ativo; o destaque só avisa (menções, não lidas). Inter no texto; o título é a assinatura de cada tema. Avatares em gradiente, status no canto do avatar, selos em pílula.
- Movimento curto (140–220 ms) com curvas de entrada e mola; tudo some com `prefers-reduced-motion`.

## 3. Sistema de temas (base da loja)

Duas camadas:

1. **Comum a todos** (não muda com o tema): espaço, tamanhos de texto, pesos, durações e curvas.
2. **Tema** = cores semânticas + **assinatura**:
   - Cores: `fundo`, `superficie`, `superficie-2`, `sutil`, `borda`, `borda-forte`, `texto`, `texto-suave`, `acento`, `acento-hover`, `sobre-acento`, `acento-suave`, `destaque`, `sobre-destaque`, `foco`, `sucesso`, `perigo`, `aviso`, `falando`.
   - Assinatura: `acento-2` (par do gradiente), `fonte-titulo`, `caixa-titulo`, `espaco-titulo`, `raio-p/m/g/painel`, `vidro` (opacidade dos painéis), `sombra-painel`, `sombra-cartao`, `brilho-acento`, `arte-fundo` (luz e textura feitas em CSS, sem imagem).

Os componentes usam **só** esses nomes. Um tema novo é um bloco `[data-tema='x'] { … }` e nada mais; é isso que permite a prévia na loja (troca o atributo, volta ao sair). As fontes de título (Cinzel, Marcellus SC, Bangers, todas OFL) vão embutidas no app, carregadas só quando o tema é usado.

## 4. Os 6 temas

| Tema | Tipo | Clima | Assinatura |
| --- | --- | --- | --- |
| Neon da Madrugada | grátis (padrão) | noite arroxeada, ciano e rosa | brilho no acento, névoa colorida no fundo |
| Breu | grátis | escuro neutro, calmo | sem brilho nem arte |
| Aurora | grátis | céu polar escuro: faixas de luz verde e violeta | luz da aurora no topo do fundo, acento verde, destaque rosa |
| **Cinzas do Trono** | loja | fantasia sombria: ouro gasto, brasa, pedra | título Cinzel, cantos mais justos (6–14px), brasa subindo do rodapé |
| **Arcano Dourado** | loja | arena arcana: azul profundo, ouro e ciano mágico | título Marcellus SC, filete dourado no topo dos painéis, luz ciano no canto |
| **Gibi** | loja | HQ de super-herói à noite (escuro): tinta azul-escura, amarelo de balão, vermelho de impacto | título Bangers em caixa alta, sombra chapada vermelha no cartão e no botão (afunda ao clicar), retícula clara |

Nenhum usa nome, logo, arte, personagem, fonte ou som oficial de franquia (RN-12 da loja). Contraste AA conferido no protótipo para texto/fundo, texto suave/superfícies e texto sobre acento e destaque, nos 6.

## 5. Como aplicar (depois da aprovação)

1. Trocar as variáveis de `base.css` pelos tokens novos, mantendo os 3 temas grátis com os valores refinados, e tirar as cores soltas (de `base.css` e dos `style={{}}`).
2. Normalizar espaço e tipografia nos tokens, trocar emoji por SVG e unificar os botões.
3. Tokens de movimento e `prefers-reduced-motion`.
4. Conferir no app (E2E de prints) os 3 temas grátis, desktop e janela estreita.
5. Os 3 temas de loja entram com a demanda `pontos-e-loja`, que já tem a prévia e o cadeado.

Os passos 1 a 4 não mudam comportamento, só a aparência; viram uma versão sozinhos se você quiser soltar antes da loja.

Observação de desempenho: o desfoque dos painéis (`backdrop-filter`) é leve no Electron, mas se pesar em PC fraco o tema troca o vidro por superfície sólida (`--vidro: 1`) sem mudar mais nada.
