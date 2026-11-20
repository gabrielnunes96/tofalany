# Busca de GIF — Especificação técnica

> Demanda: `busca-de-gif` · Versão 1 · 17/11/2026 · Situação: **aprovada em 17/11/2026** · Funcional: v2 (padrão Klipy)

## 1. Resumo da solução
O servidor entrega ao app de quem está logado a chave da Klipy e um código de cliente. O app consulta a Klipy direto, sem passar pelo servidor:
- `trending` e `search`, que trazem os GIFs;
- `share`, que registra o envio.

O filtro de rede do app só libera os endereços da Klipy com a busca ligada.

Ao escolher um GIF, o app manda `mensagem:enviar` com um campo `gif` (endereço, tamanho, descrição e slug). O servidor confere o host e a permissão de anexo e guarda o GIF numa coluna nova. No envio para os apps:
- o `conteudo` leva o endereço no fim, para os apps 0.16.x verem um link;
- os apps novos tiram esse endereço do texto e mostram a imagem animada.

A entrega vai na **0.16.0**, que ainda não foi publicada.

## 2. API da Klipy (lida em docs.klipy.com, 17/11)
- **Base:** `https://api.klipy.com`. A chave vai **no caminho**: `/api/v1/{app_key}/…`.
- **`GET gifs/trending`:**
  - parâmetros: `page` (1+), `per_page` (1–50, padrão 24), `customer_id`, `locale` (ISO 3166 alpha-2), `content_filter` (`off|low|medium|high`) e `format_filter` (`gif,webp,jpg,mp4,webm`).
- **`GET gifs/search`:** os mesmos parâmetros, mais `q`. Aqui `per_page` vai de 8 a 50.
- **Resposta:**
  ```
  { result: boolean, data: { data: Item[], current_page, per_page, has_next } }
  Item = { id, slug, title, file: { hd|md|sm|xs: { gif|webp|jpg|mp4|webm: { url, width, height, size } } }, tags, type, blur_preview }
  ```
  - Com anúncio ligado na chave, aparecem itens com `type: "ad"`. Os anúncios ficam **desligados** no painel da Klipy.
- **`POST gifs/share/{slug}`:** corpo `{ customer_id, q }`. O `q` vai vazio quando o GIF veio dos em alta.
- **Mídia:** `static.klipy.com`, `static1.klipy.com` e `static2.klipy.com`, todos em https.
- **Limites:**
  - chave de teste: 100 chamadas por hora;
  - chave de produção: sem limite, pedida no Partner Panel depois de cumprir a atribuição.
- **Termos que viram código:**
  - chamadas e mídia saem do app;
  - nada é guardado em cache no servidor;
  - os resultados aparecem na ordem devolvida;
  - o campo de busca mostra "Search KLIPY".

## 3. Componentes afetados

### 3.1 Servidor
| Arquivo | Mudança |
| --- | --- |
| `server/src/config.ts` | `gif: { chave, base, hostsMidia: RegExp } \| undefined`, lido de `KLIPY_API_KEY` (sem ela, `undefined`). `KLIPY_URL` existe só para os testes e aponta a base para um servidor falso. Com ela, o host dela também vale como mídia. |
| `server/src/routes/gif.ts` (novo) | `GET /api/gif/config` com `exigirSessao`. Sem chave, responde 204. Com chave, responde `{ chave, base, cliente }`, com `cache-control: no-store`. `cliente` = HMAC-SHA256(chave, `${comunidadeId}:${usuarioId}`), primeiros 32 hex: estável por pessoa, sem revelar o id. |
| `server/src/app.ts` | Registra a rota. |
| `server/src/db/migracoes.ts` | Migração **020**: `ALTER TABLE mensagens ADD COLUMN gif TEXT` (JSON de `GifDto`, nulo quando não há GIF). |
| `server/src/dominio/mensagens.ts` | `inserirMensagem(…, gif)` grava a coluna. `paraDtos` faz o `JSON.parse` e põe `gif`. No DTO, `conteudo` = `texto ? texto + "\n" + url : url` (RF-5). `editarMensagem` não mexe no GIF. |
| `server/src/realtime/mensagens.ts` | `mensagem:enviar` aceita `gif`. Aplica `validarGif(gif, config.gif)`. No canal, exige `enviar_anexos`, como os anexos, com a mesma mensagem de erro. Sem `config.gif`, o envio com GIF é recusado (`gif_indisponivel`). Texto vazio passa quando há GIF. |
| `server/src/previa/previa.ts` | Hosts `static*.klipy.com` não ganham prévia: retorna `undefined`. Assim o servidor não busca a mídia da Klipy quando um app antigo pede a prévia do link. |
| `deploy/exemplo.env` | `KLIPY_API_KEY=` comentado, com a instrução. O `docker-compose` já usa `env_file: .env`. |

### 3.2 Shared
| Arquivo | Mudança |
| --- | --- |
| `shared/src/protocolo.ts` | `GifDto { slug; url; largura; altura; descricao }`, `MensagemDto.gif?`, `mensagem:enviar` com `gif?`. `GifConfig { chave; base; cliente }`. |
| `shared/src/limites.ts` | `GIF_URL_MAX = 512`, `GIF_DESCRICAO_MAX = 200`, `GIF_LADO_MAX = 4096`, `GIF_POR_PAGINA = 24`, `GIF_FILTRO = 'medium'`. |
| `shared/src/validacao.ts` | `validarGif`: `url` com https, host que casa com `hostsMidia` (padrão `^static\d*\.klipy\.com$`), sem credenciais nem porta, até 512 caracteres; `slug` em `^[a-z0-9-]{1,120}$`; largura e altura inteiras de 1 a 4096; descrição cortada em 200. `textoSemGif(conteudo, gif)` tira o `\n?url` do fim. |
| `shared/src/novidades.ts` | Item "GIF" na 0.16.0. |

### 3.3 App
| Arquivo | Mudança |
| --- | --- |
| `client/src/main/rede.ts` | Opção `gifLigado`: libera `https://api.klipy.com` e `https://static{,1,2,…}.klipy.com` (`/^static\d*\.klipy\.com$/`), só em https. |
| `client/src/main/index.ts` + preload | IPC `rede:gif(servidor, ligado)`. O processo principal guarda as origens com a busca ligada (`criarEstadoGif` em `rede.ts`) e só libera a Klipy quando o servidor atual é uma delas. O renderer chama o IPC antes de mostrar o botão, a cada (re)conexão e com `false` ao sair da tela. |
| `client/src/renderer/servicos/gif.ts` (novo) | `emAlta(pagina)`, `buscar(q, pagina)` e `compartilhar(slug, q)`, via `fetch` com `AbortSignal.timeout(8000)`. Leva `customer_id = cliente`, `locale=br`, `content_filter=medium` e `format_filter=webp` (só o webp é usado). Converte a resposta em `{ itens: GifResultado[], temMais }`. A miniatura usa `sm.webp` (ou `xs.webp` se faltar) e o chat usa sempre `md.webp`: item sem ela é ignorado. Itens com `type` diferente de `gif` não aparecem; sem `type`, o item vale. O fundo borrado só é aceito como imagem embutida em base64. |
| `client/src/renderer/servicos/api.ts` | `configGif()` → `GET /api/gif/config`. |
| `client/src/renderer/componentes/PainelGif.tsx` (novo) | Diálogo "Escolher GIF". Busca com `placeholder="Search KLIPY"` e `aria-label="Buscar GIF"`, debounce de 300 ms. A grade de 3 colunas (o mesmo número no CSS e nas setas) usa as miniaturas `sm.webp` com `blur_preview` de fundo. Carrega a página seguinte com IntersectionObserver e guarda cache e estado (carregando, falha) por consulta enquanto o painel está aberto (RN-6). Navegação com roving tab e setas, Enter, e Esc fecha e devolve o foco. Mostra os estados "Carregando…", "Nada encontrado." e "A busca de GIF está indisponível agora.". Reaproveita o padrão de âncora e de clique fora do `SeletorEmoji`. |
| `client/src/renderer/componentes/MensagensCanal.tsx` | Botão "GIF" ao lado do "+" quando há `configGif`. Ao escolher, chama `aoEnviar(texto, { …opcoes, gif })`, limpa o compositor e a faixa de resposta, e depois `compartilhar(slug, q)`, sem esperar e sem mostrar erro. |
| `client/src/renderer/componentes/ItemMensagem.tsx` + `GifMensagem.tsx` (novo) | O texto passa por `textoSemGif`. O GIF vira `<img src=url width height alt=descricao loading="lazy">`, com lado máximo de 300 px mantendo a proporção. Se o `onError` disparar, mostra "GIF indisponível". O link da Klipy não gera `CartaoPrevia`. |
| `TelaPrincipal.tsx`, `CanalAberto.tsx`, `DmAberta.tsx`, `tempo-real.ts` | Repassam `gif` em `OpcoesEnvio` até o `mensagem:enviar`. Carregam `configGif` no login e na troca de servidor. |
| `estado/notificar.ts` | Corpo da notificação: `textoSemGif(…) \|\| 'GIF'`. |
| `estilos/base.css` | `.botao-gif`, `.painel-gif*` e `.gif-mensagem`, com a exceção do tema gibi. |

## 4. Dados
- `mensagens.gif TEXT NULL`. A coluna guarda o JSON `{"slug","url","largura","altura","descricao"}` já validado.
- Sem índice: não há consulta por essa coluna.
- O backup e o `copia-banco` não mudam.

## 5. Segurança
- **Chave:**
  - fica só no `.env` do servidor;
  - a rota de configuração exige sessão e não deixa o navegador guardar a resposta;
  - o log do Fastify registra a URL da nossa rota, que não leva a chave. A chave só vai na URL da chamada à Klipy, feita pelo app.
- **Exposição aceita:** quem está logado pode ler a chave. Se alguém abusar, troca-se a chave no painel da Klipy e no `.env`.
- **SSRF e rastreamento:** o servidor não busca nada na Klipy. O `validarGif` impede que uma mensagem faça os apps carregarem imagens de qualquer host, o que serviria para rastrear IPs. O filtro de rede do app fecha o resto.
- **XSS:** o GIF entra só como `src` de `<img>`, já validado, e a descrição só como texto.
- **Permissão:** a mesma dos anexos (`enviar_anexos` e castigo). Na DM, vale a regra atual de envio.

## 6. Estratégia de testes por critério
| CA | Teste |
| --- | --- |
| CA-1 | Unidade (rota): sem chave → 204. Unidade (rede): Klipy bloqueada com `gifLigado=false`. E2E: o botão não aparece. |
| CA-2 | `server/test/gif.test.ts`: envio com GIF de castigo ou sem `enviar_anexos` → 403. Unidade do painel: o erro do envio aparece. |
| CA-3 | Unidade do `PainelGif` com Klipy falsa: em alta sem texto, busca com texto, ordem preservada, página seguinte. E2E com Klipy falsa. |
| CA-4 | E2E com dois apps: o GIF aparece no outro app. |
| CA-5 | Unidade do `MensagensCanal`: `aoEnviar` recebe o texto, `respostaA` e `gif`. E2E: o vínculo aparece. |
| CA-6 | Unidade (`rede.test.ts`): só api/static*.klipy.com em https, só com a busca ligada; `evil-klipy.com` e `static.klipy.com.evil.io` são recusados. |
| CA-7 | Unidade (rota): sem sessão → 401; o corpo traz `cliente` sem o id. A chave não aparece no log capturado do Fastify. |
| CA-8 | Unidade (`validarGif` e servidor): http, outro host, porta, `user@`, slug inválido e tamanho fora da faixa são recusados. |
| CA-9 | Unidade do painel: o fetch falha ou estoura o tempo → mensagem de indisponível. O compositor continua funcionando. |
| CA-10 | Unidade do serviço: o POST de `share/{slug}` leva `customer_id` e `q`. |
| CA-11 | Unidade do painel: teclado, Enter envia, Esc devolve o foco. |
| CA-12 | Unidade (servidor): o `conteudo` do DTO termina com a URL. Unidade do app: `textoSemGif` tira a URL. |

**Klipy falsa no E2E:** o teste registra as rotas `/api/v1/:chave/gifs/*` na própria instância Fastify, antes do `listen`, e sobe o servidor com `KLIPY_URL` apontando para ela. As imagens são servidas do mesmo host, que o filtro de rede já libera.

**Teste manual com a chave real:** busca e envio entre duas contas, antes da tag.

## 7. Riscos
| Risco | Mitigação |
| --- | --- |
| A chave de teste dá só 100 chamadas por hora para o grupo inteiro. | Debounce, cache por painel e 24 itens por página. Pedir a chave de produção no Partner Panel logo depois do primeiro uso, com a atribuição já cumprida. |
| A Klipy remove um GIF e ele some do histórico. | Aceito (D-4). O `onError` mostra "GIF indisponível". |
| O renderer liga o `gif:ligado` sem a busca estar de fato ligada. | O efeito se limita a liberar hosts fixos da Klipy, o mesmo risco aceito no player de vídeo. |
| Mudança nos termos ou no formato da API. | A conversão fica isolada em `servicos/gif.ts`, com teste do formato documentado. |

## 8. Implantação
1. Publicar a 0.16.0 (servidor e app). A migração 020 roda sozinha.
2. No `deploy/.env` da VM, acrescentar `KLIPY_API_KEY=<chave>`, colocada pelo próprio administrador, e reiniciar o contêiner do servidor.
3. No Partner Panel da Klipy: conferir que os anúncios estão desligados, `content_filter` medium, e pedir a chave de produção. Quando ela sair, trocar a chave no `.env`.

**Reversão:** tirar a variável e reiniciar. O botão some, e as mensagens já enviadas continuam mostrando os GIFs.

## 9. Fora do código
- **Atribuição:** o texto "Search KLIPY" é exigido. A marca "Powered by KLIPY" não entra.
- **Textos novos:** em português, sem citar outros aplicativos. A exceção é a marca exigida acima.
