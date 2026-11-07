# ToFalany v2: planejamento

> Base: [00-backlog.md](00-backlog.md), com 15 itens e prioridades de P1 a P4 · Escrito em 06/11/2026, às 20h · Início: **hoje, às 22h**

## Resumo

- **No ar ainda hoje**: com o servidor na VPS e os instaladores no GitHub, os amigos conseguem instalar e entrar **por volta da 00h**, ainda com a versão atual (v1).
- **Correções do P1 publicadas**: por volta das **3h**, como v0.2.0, com colar imagem, bolinha de fala sem atraso, status manual, convite que resolve tudo e redefinir senha pelo app.
- **Resto do backlog**: mais **5 a 7 sessões** como a de hoje, divididas nas fases 2 a 5.

A estratégia é **colocar no ar primeiro e melhorar depois**. Assim o grupo já usa hoje, e o processo de release é testado logo na primeira versão. Cada melhoria depois vira uma release nova: quem já instalou baixa o instalador novo pelo GitHub.

O horário depende de duas coisas que só você consegue fazer. Comece **antes das 22h**:

1. **Criar a conta e a VM na Oracle Cloud.** A Oracle pede cartão para verificar a conta, e a criação da VM às vezes falha por falta de capacidade na região. Veja o passo a passo abaixo.
2. **Criar o repositório vazio no GitHub.** A CLI do GitHub não está instalada aqui, então eu só faço o push.

## Decisões para as 22h

**Aprovadas pelo usuário em 06/11/2026, às 20h, como recomendadas.** A VM da Oracle já está criada, com o Docker instalado, e o repositório do GitHub já existe.

| # | Decisão | Minha recomendação | Por quê |
| --- | --- | --- | --- |
| D1 | Onde hospedar | **Oracle Cloud grátis (Ampere A1), região São Paulo ou Vinhedo** | Aguenta com folga (veja a análise abaixo) e custa zero. Se a Oracle travar a conta ou não tiver capacidade, o plano B é uma VPS paga em São Paulo, de R$ 45 a R$ 80 por mês. |
| D2 | Domínio | **sslip.io**, grátis e sem cadastro (ex.: `150-230-1-2.sslip.io`) | O HTTPS funciona na hora. Dá para trocar por um domínio próprio depois sem reinstalar o app. |
| D3 | Repositório | **Público** no GitHub | Em repositório privado, só quem tem acesso baixa as releases, e os amigos precisariam de conta convidada. O código não tem segredos (o guard confere a cada commit). |
| D4 | Ordem de hoje | **No ar primeiro (v1), depois o P1 (v0.2.0)** | Se algo do P1 atrasar, o grupo já está usando. |
| D5 | Redefinir senha | **O administrador gera um código de uso único** (vale 24 h), e a pessoa usa "Esqueci a senha" no login | Não precisa de e-mail no servidor. |
| D6 | Status manual | **Online, ausente, não incomodar e invisível** | "Não incomodar" silencia as notificações; "invisível" aparece como offline para os outros. |

## A Oracle grátis aguenta?

**Sim, com folga para o tamanho do grupo**, mas com dois cuidados.

| Recurso | Oferta grátis (Ampere A1) | O que o ToFalany usa (5 pessoas, 1 tela em 1440p60 e 3 câmeras) |
| --- | --- | --- |
| CPU | 2 núcleos Arm (era 4 até 2026) | O LiveKit só repassa a mídia, sem recodificar. Algo como 10 a 20% de um núcleo. O servidor de chat usa quase nada. |
| Memória | 12 GB (era 24) | Menos de 1 GB somando servidor, LiveKit e Caddy |
| Banda | cerca de 1 Gbps por núcleo | Pior caso de cerca de 50 Mbps de saída (tela para 4 pessoas mais câmeras) |
| Tráfego de saída | 10 TB por mês | 1 h de 1440p60 para 4 pessoas gasta cerca de 18 GB. Seriam mais de 500 h de transmissão por mês. |

Os limites de CPU e memória mudaram em 2026 e as fontes divergem: confira o seu no console.

**Cuidados:**

- **Recuperação de VM ociosa.** A Oracle pode recuperar VMs grátis que passam 7 dias com uso muito baixo de CPU, rede e memória. Um servidor de chat parado a semana toda pode cair nessa regra. Para evitar, dá para converter a conta para "Pay As You Go": continua grátis dentro dos limites e sai dessa regra, mas exige cartão. Vou detalhar no roteiro.
- **Capacidade.** Às vezes a criação da VM falha com "Out of host capacity". Nesse caso, é tentar de novo mais tarde ou ir para o plano B.

**Plano B (pago, em São Paulo).** Para voz, use datacenter no Brasil: fora do país a latência passa de 150 ms. Uma VPS de 2 vCPU e 4 GB com tráfego ilimitado ou grande custa de R$ 45 a R$ 80 por mês. Exemplos: Platon (R$ 45,55 na promoção de 2 anos, R$ 75,92 na renovação), Serversp (cerca de R$ 52) e Kronich (R$ 79,90). O roteiro compara as opções com os preços do dia.

## Hoje, a partir das 22h (Fase 1)

| Horário (estimado) | Bloco | Itens do backlog | Entrega |
| --- | --- | --- | --- |
| 22h00 às 22h15 | Aprovar as decisões D1 a D6 e a especificação curta do P1 | — | — |
| 22h15 às 23h00 | **GitHub e releases** | 5 | Push do repositório, workflow que gera o .exe no Windows e o .AppImage e o .deb no Linux a cada tag e publica na página de Releases. Primeira release: v0.1.0 (a v1). |
| 23h00 às 00h00 | **Servidor na Oracle** | 6 | `docs/vps.md` com o roteiro do zero ao app conectado. Você executa os passos na VM (eu não tenho acesso a ela) e eu acompanho pelos logs que você colar. **Servidor no ar e amigos entrando por volta da 00h.** |
| 00h00 às 01h00 | Correções rápidas | 1b, aviso da voz e 1 | Colar imagem no chat (Ctrl+V), aviso claro de voz sem LiveKit (já feito, falta o commit) e bolinha de fala imediata na lista do canal |
| 01h00 às 02h00 | Status e convite | 2, 4 | Status manual; a primeira tela aceita colar o link de convite (servidor e código de uma vez), sem digitar o endereço |
| 02h00 às 02h45 | Redefinir senha | 3 | Código de uso único gerado pelo administrador, com "Esqueci a senha" no login |
| 02h45 às 03h00 | **Release v0.2.0** | — | Tag, instaladores no GitHub, servidor atualizado na VPS |

Cada item segue o ciclo de sempre (testes, revisão, validação completa e commit), com commit automático por tarefa se você autorizar de novo para esta demanda. Se a sessão precisar acabar antes, o corte natural é depois do bloco das 00h: servidor no ar e correções rápidas publicadas.

## Situação em 07/11, 0h15, e nova ordem

**No ar:** servidor na Oracle (VM micro, `https://167-234-225-58.sslip.io`), release v0.1.0 no GitHub, primeiro amigo entrou e a voz e a tela funcionaram entre duas máquinas.

Ordem a partir daqui, pelo que o uso real mostrou:

1. **v0.2.0**:
   - correções de defeitos: 0a (endereço `https://`), já feita, e 0b (formato da transmissão);
   - **1d (atualização automática)**, para todas as próximas versões chegarem sozinhas;
   - 1b (colar imagem), já feito.
2. **v0.3.0**:
   - 1c (qualidade da voz), 1 (bolinha de fala) e 1e (bandeja);
   - 2 (status), 4 (convite que resolve tudo) e 3 (redefinir senha).
3. Depois, as fases 2 a 5 abaixo, sem mudança.

## Fases seguintes

| Fase | Itens | Conteúdo | Estimativa |
| --- | --- | --- | --- |
| **2. Layout novo e vários servidores** | 7, 8, 9, 10 | Protótipo visual primeiro, para você aprovar; depois a coluna de servidores, o painel do usuário compacto, os temas (escuro, claro e o neon atual, com nomes criativos) e o ocultar ou mostrar partes da interface | 2 sessões |
| **3. Chat e cargos** | 10b, 10c | Prévia de links e do YouTube, buscada pelo servidor; cargo de moderador e cargos personalizados com cor e permissões | 1 a 2 sessões |
| **4. Câmera e tela** | 11, 11b, 12, 13 | Tela cheia, câmera flutuante e arrastável, chat recolhível, prévia da própria transmissão; prova de conceito do som do sistema no Linux | 1 a 2 sessões |
| **5. Extras** | 14, 15 | Bot de música (decidir antes os riscos com os termos do YouTube) e acesso ao banco | 1 sessão |

Ordem: a fase 2 vem antes da 3 e da 4 porque o layout novo define onde ficam a câmera flutuante, o chat recolhível e o seletor de cargos. A fase 3 e a 4 podem trocar de lugar se você preferir.

## Antes das 22h: o que você pode adiantar

1. **Oracle Cloud** (cerca de 20 min):
   - criar a conta em cloud.oracle.com e escolher a região de São Paulo ou de Vinhedo (não dá para mudar depois);
   - criar uma VM: imagem Ubuntu 24.04, forma VM.Standard.A1.Flex com 2 OCPU e 12 GB, chave SSH sua;
   - anotar o IP público.
2. **GitHub** (cerca de 2 min): criar o repositório vazio `tofalany`, público (decisão D3), sem README nem licença, e me passar a URL.
3. Se quiser, **testar a v1 no seu PC** com o LiveKit no Docker (comandos na seção "Desenvolvimento" do README), para ver a voz funcionando antes de irmos para a VPS.

## Fontes

- [Oracle: Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm)
- [Oracle Cloud Always Free (limites de 2026), Site2US](https://site2us.com/en/servers/oracle-cloud-free-tier)
- [Oracle Always Free VPS Review 2026, space-node](https://space-node.net/blog/oracle-vps-free-tier-review-2026)
- [Platon VPS](https://platon.com.br/platon-vps/)
- [Serversp Cloud VPS](https://serversp.com.br/cloud-vps/)
- [Kronich VPS Brasil](https://www.kronichostbrasil.com/vps-brasil)
