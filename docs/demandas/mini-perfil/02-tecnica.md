# Mini perfil — Especificação técnica

> Demanda: `mini-perfil` · Versão 1 · 17/11/2026 · Situação: **aprovada em 17/11/2026** · Funcional: v2 (aprovada em 17/11/2026)
> Base: análise de impacto (fluxo:analista) e modelagem de ameaças (fluxo:seguranca) de 17/11.

## 1. Resumo da solução
- **Banco:** a migração 021 acrescenta a `usuarios` o "sobre mim", as cores do fundo e o arquivo do fundo, com uma miniatura estática.
- **Contrato:** os campos novos entram opcionais no `UsuarioDto`, e o "membro desde" vem da comunidade aberta.
- **Envio do fundo:** fica numa rota própria, com um `processarFundo` novo que mantém a animação dentro de limites estritos. O processamento do avatar não muda.
- **Em comum e data da conta:** saem de uma rota nova, `GET /api/usuarios/:id/perfil`. Ela só responde a quem "conhece" a pessoa, e para os outros devolve 404.
- **No app:**
  - um contexto `ContextoPerfil` deixa qualquer nome ou foto abrir o `CartaoPessoa`, junto do clique;
  - o cartão abre o `PerfilCompleto` (janela);
  - a edição fica na tela de perfil que já existe;
  - a lista de membros mostra a miniatura do fundo atrás da linha.
- **De passagem:** o pedido de amizade passa a exigir esse mesmo "conhecer", o que fecha uma enumeração de contas que já existe hoje.
- **Versão:** a entrega vai na **0.17.0**.

## 2. Decisões tomadas aqui (para a aprovação)
| # | Decisão | Por quê |
| --- | --- | --- |
| T-1 | A edição fica em **Configurações → Minha conta**, na tela de perfil que já existe (`TelaPerfil.tsx`), em vez de uma seção "Perfil" nova. A funcional passa a dizer "Minha conta". | O nome, a cor e a foto já moram lá: é a menor mudança. |
| T-2 | Na **lista de amigos e nas conversas diretas**, a linha inteira já é um botão que abre a conversa. Ali, a **foto** passa a ser um botão à parte, que abre o cartão. No chat, nas menções e na lista de membros, o nome e a foto abrem o cartão. | Botão dentro de botão quebra o teclado e o leitor de tela (RF-5). |
| T-3 | O fundo enviado é regravado como **webp animado** (ou estático), em até **600×240**, com recorte centralizado. O resultado tem no máximo **3 MB**. Junto sai uma **miniatura estática** de 300×40, do primeiro quadro, para a lista de membros. | Mantém a animação no cartão sem pesar na lista (ameaça 7). O sharp não faz o recorte "atenção" com animação. |
| T-4 | Limites do fundo animado: **até 150 quadros**, **até 60 Mpx somados** e cada quadro dentro de `IMAGEM_MAX_PIXELS`. A conferência vem do cabeçalho, antes de decodificar, e o processamento tem prazo de 15 s. **Um processamento de fundo por vez** no servidor, e **6 envios por pessoa a cada 10 min**. | Um GIF pequeno pode derrubar a VM (ameaças 2 e 6). |
| T-5 | Quem "conhece" o alvo: divide um servidor, é amigo aceito ou tem uma conversa direta com ele. Pedido de amizade pendente não conta (revisão da T3): o cartão de quem só mandou ou recebeu pedido usa os dados que o app já tem e não mostra o que há em comum. Sem isso, `GET /api/usuarios/:id/perfil` responde 404, igual ao de uma conta que não existe. O **pedido de amizade** passa a exigir o mesmo. | Ameaça 1. Sem isso, dava para ler o perfil de qualquer conta testando os ids. |
| T-6 | A cor do fundo é guardada como **lista de 1 ou 2 cores hex** (`#rrggbb`), nunca como CSS. O app monta o degradê. | Ameaça 8 (injeção de CSS). |
| T-7 | O "sobre mim" é validado no app e no servidor:<br>• até **190 caracteres** (code points) e **3 linhas**;<br>• sem caracteres de controle, de direção (bidi), de largura zero nem separadores de linha especiais (o ZWJ dos emojis é aceito);<br>• NFC, e `\r\n` vira `\n`.<br>Ele aparece com `dir="auto"`, e os links ficam clicáveis, sem prévia. | Ameaça 5: um link disfarçado com a direção do texto invertida. |
| T-8 | A mudança de perfil chega ao vivo também aos amigos aceitos e às conversas diretas de fora do servidor, por um evento próprio, `conhecido:atualizado`, sem cargo nem "membro desde". Quem já está num servidor da pessoa não recebe esse evento. No app, a pessoa é atualizada em `conhecidos` sem entrar na lista de membros, e os apps 0.16 ignoram o evento. | RN-8. Hoje só os membros do mesmo servidor recebem. O evento à parte evita trocar o cargo de quem está no mesmo servidor (revisão da T1). |
| T-9 | Correção da funcional §9: o `copia-banco` nunca levou imagens, nem as fotos. O backup completo (tar de `/data`) leva os fundos junto com as fotos. | Não há código a mudar no backup. |

## 3. Componentes afetados

### 3.1 Shared
| Arquivo | Mudança |
| --- | --- |
| `shared/src/protocolo.ts` | `UsuarioDto` ganha:<br>• `sobreMim?: string`;<br>• `fundo?: FundoPerfil \| null`, com `FundoPerfil = { cores?: [string] \| [string, string]; url?: string; miniUrl?: string }` (`null` = servidor novo, sem fundo);<br>• `membroDesde?: string` (`AAAA-MM-DD`).<br>`AtualizarPerfilRequest` ganha `sobreMim?` e `fundoCores?: string[] \| null`. Tipo novo `PerfilDto { emComum: { amigos: number[]; servidores: ComunidadeDto[] }; contaDesde?: string }`. |
| `shared/src/limites.ts` | `SOBRE_MIM_MAX = 190`, `SOBRE_MIM_LINHAS = 3`, `FUNDO_LARGURA = 600`, `FUNDO_ALTURA = 240`, `FUNDO_MAX_QUADROS = 150`, `FUNDO_MAX_PIXELS_ANIMACAO = 60e6`, `FUNDO_SAIDA_MAX_BYTES = 3 MB`. |
| `shared/src/validacao.ts` | `validarSobreMim` (T-7), `validarCoresFundo` (reaproveita `validarCor`) e `urlArquivoValida` (`^/files/[0-9a-f]{32}\.webp$`, para o app conferir o que desenha). |
| `shared/src/novidades.ts` | Entrada `0.17.0` com o mini perfil (RF-6). |

### 3.2 Servidor
| Arquivo | Mudança |
| --- | --- |
| `server/src/db/migracoes.ts` | Migração **021**: `ALTER TABLE usuarios ADD COLUMN sobre_mim TEXT`, `fundo_cores TEXT` (JSON), `fundo_arquivo TEXT`, `fundo_mini TEXT`. |
| `server/src/dominio/usuarios.ts` | `LinhaUsuario` e `paraDto` ganham `sobreMim` e `fundo`. `listarMembros` e `buscarNa` passam a selecionar `m.entrou_em` e o devolvem como `membroDesde`, só a data. |
| `server/src/dominio/fundo.ts` (novo) | `processarFundo(buffer)`:<br>• `metadata()`, com o formato conferido pelo conteúdo e não pela extensão;<br>• limites T-4 checados no cabeçalho;<br>• `sharp(…, { animated, limitInputPixels })` → `.resize(600, 240, { fit: 'cover', position: 'centre', withoutEnlargement: true })` → `.webp()`, com `.timeout({ seconds: 15 })`;<br>• rotação por EXIF só em imagem estática;<br>• sem metadados;<br>• saída acima de 3 MB → 413;<br>• miniatura 300×40 do primeiro quadro.<br>Um semáforo garante um processamento de fundo por vez. |
| `server/src/routes/perfil.ts` | • **PATCH `/api/eu`**: aceita `sobreMim` (`maxLength` bruto 1024 no schema e depois `validarSobreMim`) e `fundoCores` (1 ou 2 cores; `null` tira).<br>• **PUT `/api/eu/fundo`**: multipart, 8 MB, limitador de 6 a cada 10 min, sem campos extras. Grava o arquivo e a miniatura, troca na transação e apaga os anteriores depois.<br>• **DELETE `/api/eu/fundo`**: volta ao padrão e apaga os arquivos.<br>• `avisar()` também emite para `salaUsuario` dos conhecidos (T-8).<br>• Auditoria `perfil_alterado`, sem o conteúdo. |
| `server/src/routes/usuarios-perfil.ts` (novo) | **GET `/api/usuarios/:id/perfil`**, com `exigirSessao`. Aplica a regra T-5 (senão 404 uniforme). Devolve:<br>• `amigos`: ids da interseção de amizades **aceitas** dos dois, sem contas removidas nem os dois envolvidos;<br>• `servidores`: `INTERSECT` de `membros`, já sem os banimentos, com nome e ícone por `listarComunidadesDe`;<br>• `contaDesde`: só a data, e só quando há conversa direta entre os dois. |
| `server/src/dominio/amizades.ts` | `pedirAmizade` exige a regra T-5 (senão 404 "Pessoa não encontrada"). |
| `server/src/routes/admin.ts` | Remover conta zera `sobre_mim`, `fundo_cores`, `fundo_arquivo` e `fundo_mini` e apaga os arquivos depois do commit, como já faz com o avatar. |
| `server/src/app.ts` | Registra a rota nova. |

### 3.3 App
| Arquivo | Mudança |
| --- | --- |
| `client/src/renderer/componentes/CartaoPessoa.tsx` (novo) | Cartão dentro da janela, junto do ponto clicado (posicionamento como o do `MenuPessoa`).<br>• **Conteúdo:**<br>&nbsp;&nbsp;– o fundo (cores, ou `url` animada com a cor por baixo), com a foto sobreposta;<br>&nbsp;&nbsp;– o nome e o @usuario;<br>&nbsp;&nbsp;– o cargo e a função como etiquetas com bolinha de cor;<br>&nbsp;&nbsp;– o status e a atividade;<br>&nbsp;&nbsp;– o "sobre mim" (`TextoComLinks`, `dir="auto"`, sem prévia);<br>&nbsp;&nbsp;– o "membro desde";<br>&nbsp;&nbsp;– a linha "N amigos em comum · N servidores em comum", que chega depois, com o espaço já reservado.<br>• **Ações:** campo "Mensagem para @x" (Enter: `dm:abrir`, depois `enviarMensagem` e a navegação de `conversarCom`), botões "Mensagem" (`conversarCom`) e "Ver perfil". No próprio cartão: "Editar perfil", que abre Minha conta.<br>• **Teclado:** foco no campo; Esc e clique fora fecham e devolvem o foco a quem abriu.<br>• **Conta removida:** cartão mínimo, "conta removida". |
| `client/src/renderer/componentes/PerfilCompleto.tsx` (novo) | Janela no meio da tela, com o mesmo conteúdo em tamanho maior, as listas de amigos em comum (fotos e nomes, vindos de `usuarios` e `conhecidos`) e de servidores em comum, e o botão de amizade. |
| `client/src/renderer/componentes/ContextoPerfil.ts` (novo) | `abrirPerfil(usuarioId, ancora)`, provido pela `TelaPrincipal` (como o `ContextoPrevia`), para não descer a função por 4 níveis. |
| Gatilhos | • `ItemMensagem.tsx`: foto e nome do autor viram botões.<br>• `Previa.tsx`: a menção ganha o id em `MencoesDoTexto` e vira botão.<br>• `TelaPrincipal.tsx`: a lista de membros abre com clique; o clique direito continua no `MenuPessoa`.<br>• `BarraLateral.tsx`: a foto vira um botão separado na lista de amigos e nas conversas diretas (T-2).<br>• `DmAberta.tsx`: a foto e o nome do cabeçalho. |
| `client/src/renderer/telas/TelaPerfil.tsx` | Edição do fundo, com a prévia do próprio cartão:<br>• cor: uma ou duas, com o seletor de cor;<br>• imagem ou GIF: envia o arquivo;<br>• "Tirar fundo".<br>Também o "sobre mim", com contador de caracteres e de linhas. Tudo some quando o servidor é antigo (`eu.fundo === undefined`). |
| `client/src/renderer/servicos/api.ts` | `enviarFundo`, `removerFundo`, `perfilDe(id)`; `atualizarPerfil` com os campos novos. |
| `client/src/renderer/estado/loja.ts` | `atualizarUsuario` também atualiza `conhecidos`, e só mexe em `usuarios` se a pessoa já estiver lá. |
| Lista de membros (`TelaPrincipal.tsx`, `base.css`) | Camada própria atrás da linha (pseudo-elemento) com a `miniUrl` ou as cores, em opacidade baixa e com um véu do tema por cima: o contraste do nome fica ≥ 4,5:1 e o hover continua igual. |
| `client/src/renderer/estilos/base.css` | `.cartao-pessoa*`, `.perfil-completo*`, `.etiqueta-cargo` e a camada da lista. Os botões novos entram nas exceções do tema gibi. `prefers-reduced-motion` troca a animação pela miniatura estática. |

## 4. Contratos (antes → depois, compatibilidade)
- **`UsuarioDto`:** só ganha campos opcionais. Apps 0.16 ignoram. Nenhum teste compara o DTO inteiro.
- **`AtualizarPerfilRequest`:** ganha campos opcionais. O servidor 0.16 recusa os campos novos, então o app só mostra a edição com `eu.fundo !== undefined`.
- **Rotas novas:** `PUT` e `DELETE /api/eu/fundo` e `GET /api/usuarios/:id/perfil`.
- **`usuario:atualizado`:** não muda.
- **`conhecido:atualizado` (novo):** vai aos conhecidos de fora do servidor (T-8); os apps 0.16 ignoram.
- **Auditoria:** o tipo novo `perfil_alterado` aparece nos apps 0.16 sem o texto da ação (limitação aceita: só na tela de auditoria do administrador).
- **`amizade:pedir`:** fica mais restrito (T-5). Quem pede amizade a alguém com quem não divide nada recebe "Pessoa não encontrada". No app, só dá para pedir amizade pelas listas, que já mostram só quem a pessoa conhece.

## 5. Dados
- **`usuarios`:** 4 colunas novas, todas nulas. As linhas existentes ficam nulas, que é o padrão (sem fundo, sem "sobre mim"). Sem índice novo: as consultas são por id.
- **Em comum:** usa `membros` (PK, índice `membros_usuario`) e `amizades` (índice em `usuario_b`). Na escala atual, menos de 100 contas, cada consulta leva menos de 1 ms.
- **Reversão:** as colunas novas ficam sem uso numa versão anterior do servidor (o SQLite ignora colunas a mais). Não há `DROP`.

## 6. Segurança (da modelagem de ameaças de 17/11)
| Ameaça | Mitigação | Teste |
| --- | --- | --- |
| Perfil ou grafo legível por id (alta) | T-5 na rota e no pedido de amizade; 404 uniforme | id fora do contexto, inexistente ou removido dão a mesma resposta 404; o pedido de amizade é recusado |
| Bomba de descompressão no GIF (alta) | T-4 | 4096×4096×300 dá 413 antes de decodificar; cabeçalho de 30000×30000 dá 413; dois envios simultâneos rodam em série |
| Fundo órfão e público (alta) | Apagar o anterior na troca, no "Tirar fundo" e na remoção da conta | trocar 3 vezes deixa 1 arquivo; remover a conta faz o GET do fundo dar 404 |
| Em comum vazando (média) | Interseção, amizade aceita, sem removidos; os números saem da lista | CA-10, mais pedido pendente, removido e banido |
| Bidi e largura zero no "sobre mim" (média) | T-7 | U+202E, U+200B e U+2028 dão 400; emoji com ZWJ passa |
| Abuso de envio (média) | Limitador de 6 a cada 10 min; 8 MB | o 7º envio dá 429; 8 MB + 1 dá 413 |
| Peso na lista de membros (média) | Miniatura estática; saída de até 3 MB | a lista só pede `miniUrl` |
| Injeção de CSS (média) | T-6, e o app confere de novo | `["red"]` e `["#000;x"]` dão 400; cor inválida vinda do DTO cai no padrão |
| URL de fundo de fora (média) | O app só desenha `urlArquivoValida`; o filtro de rede é a 2ª camada | DTO com `https://x.io` não gera pedido |
| Metadados e arquivo falso (baixa) | Sempre regravado, sem metadados; tipo pelo conteúdo | JPEG com GPS sai sem EXIF; texto renomeado dá 415 |
| Datas demais (baixa) | "Membro desde" só da comunidade aberta; data da conta só com conversa direta; só o dia | resposta sem hora; pedido em `/c/7` de quem não está na 7 vem sem `membroDesde` |
| Sem rastro de troca (baixa) | Auditoria `perfil_alterado` | trocar o fundo gera um registro |

## 7. Estratégia de testes por critério
| CA | Teste |
| --- | --- |
| CA-1 | Unidade do `CartaoPessoa` (abre junto do clique; Esc devolve o foco). E2E: clique no autor. |
| CA-2 | Unidade de cada gatilho (menção, membros, amigos, conversas diretas). E2E: menção e lista de membros. |
| CA-3 | Unidade do cartão com DTO completo (degradê, etiquetas, "sobre mim", "Membro desde 12/10/2026"). |
| CA-4 | E2E com dois apps: Enter no campo abre a conversa direta e a mensagem chega ao beto. |
| CA-5 | Unidade: no próprio cartão aparece "Editar perfil", que abre Minha conta. |
| CA-6 | `server/test/fundo.test.ts`: 3000×2000 → até 600×240, sem EXIF, evento ao vivo. E2E: a prévia e o beto veem o fundo. |
| CA-7 | Servidor: texto renomeado dá 415; 8 MB + 1 dá 413; o fundo anterior continua. |
| CA-8 | Servidor: GIF de 2 quadros, 500×200, sai animado (webp com `pages` > 1). E2E: o cartão mostra o fundo e nenhum pedido sai do host do servidor. |
| CA-9 | `validacao.test.ts` e servidor: 191 code points ou 4 linhas dão 400; app mostra o limite. |
| CA-10 | Servidor: 2 amigos e 1 servidor em comum; o servidor só do beto não aparece; pendente e removido ficam de fora. |
| CA-11 | Unidade: autor `undefined` mostra o cartão "conta removida", sem campo. Servidor: GET do perfil removido dá 404. |
| CA-12 | Unidade: Enter no nome abre com foco no campo; Tab passa por "Mensagem" e "Ver perfil". |
| CA-13 | Servidor: o `ola` de um app 0.16 continua válido (campos opcionais); o PATCH antigo continua igual. |
| CA-14 | Unidade do item da lista com fundo (camada com `miniUrl`) e conferência de contraste no CSS. E2E: print da lista. |
| Segurança | Os testes da seção 6. |

## 8. Riscos
| Risco | Mitigação |
| --- | --- |
| CPU da VM (micro AMD) ao regravar GIF | Limites T-4, um processamento por vez, prazo de 15 s. A migração para a Ampere ajuda. |
| Tema gibi e contraste com fundos claros | Véu do tema por cima do fundo no cartão e na lista; conferir nos 6 temas no E2E de print. |
| Mudança grande no `BarraLateral` (linhas de amigos e DMs) | Só a foto vira botão (T-2); os testes de DM existentes precisam continuar passando. |
| Restrição nova no pedido de amizade | Nas listas do app só aparece quem a pessoa conhece; o teste de amizades existente continua passando. |

## 9. Implantação
- Sobe na **0.17.0**, servidor e app juntos. A migração 021 roda sozinha e não precisa de configuração nova.
- **Ordem:** o servidor novo funciona com apps 0.16, e o app novo esconde a edição com servidor antigo.
- **Reversão:** voltar a versão do servidor. As colunas novas ficam sem uso, e os arquivos de fundo ficam no armazém.
