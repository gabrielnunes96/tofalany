# Qualidade de vida: especificação técnica

> Demanda: `qualidade-de-vida` · Base: funcional v2 (aprovada em 20/11/2026) · 20/11/2026 · Situação: **aprovada em 20/11/2026**
> Base: análise de impacto (fluxo:analista) de 20/11.

## 1. Visão da solução
- **ToOuvini (RF-1):** o App já sabe quem é administrador da instalação (`podeCriar`, `App.tsx:340-345`). Ele passa isso à `TelaPrincipal`, e a tela do ToOuvini usa a API do endereço base (principal) com o mesmo token: a sessão é da conta, não do servidor.
- **Convite (RF-2, RF-3):** duas rotas novas no servidor calculam para quem dá para convidar e mandam o convite como DM, do lado do servidor. As regras ficam todas lá (permissão, membro, banido), e a entrega em tempo real reaproveita a da DM.
- **Link clicável (RF-4):** dentro do app, um link de convite do mesmo endereço abre a confirmação de entrar no servidor, em vez do navegador.
- **Atualizar o app (RF-5):** um IPC novo "atualizar agora" no processo principal, com progresso do download. O App mostra o progresso numa instância só e decide o reinício (pergunta só em chamada de voz).
- **Status (RF-6, RF-7):** o status segue a regra da atividade (`podeVerAtividade`). A reemissão de atividade e status passa a acontecer em toda mudança de quem pode ver quem: amizade, entrar, sair, ser tirado, servidor excluído.

```text
[App] podeCriar (admin do principal) ──► TelaPrincipal.adminDaInstalacao ──► menu "Bot de música" + TelaToOuvini(api da base)
[Cartão/Menu da pessoa] ──GET /api/usuarios/:id/convites──► [server] servidores convidáveis
                        ──POST /api/usuarios/:id/convites {comunidadeId}──► abrirDm + inserirMensagem ──► tempoReal.entregarMensagemDm
[ItemMensagem] TextoComLinks ── link de convite da mesma base ──► ContextoConvite ──► confirmação ──► App.abrirConvite
[Menu do usuário] "Atualizar o app" ──IPC atualizacao:agora──► [main] procurar + download-progress ──► [App] progresso; pronta ──► (em voz? pergunta) ──► instalar
[server] presenca:atualizada ──► só podeVer(s, id); reenviarVisibilidade(a, b) em amizade/entrar/sair/tirar/excluir
```

## 2. Decisões tomadas aqui (para a aprovação)
| # | Decisão | Por quê |
| --- | --- | --- |
| T-1 | **RF-1:** prop `adminDaInstalacao` na `TelaPrincipal` (de `podeCriar === base`), que mostra o item "Bot de música (ToOuvini)" e o grupo "Administração" do menu. `TelaToOuvini` recebe `criarApi(separarComunidade(servidorUrl).base, token)`. As rotas do servidor não mudam. | O mesmo token vale na base (`exigirSessao` não olha a comunidade). O servidor continua exigindo administrador do principal. |
| T-2 | **Convite pelo servidor:** `GET /api/usuarios/:id/convites` → `ComunidadeDto[]`, e `POST /api/usuarios/:id/convites { comunidadeId }` → `{ ok }`. As duas exigem sessão e que os dois **dividam um servidor ou sejam amigos** (senão 404, como a rota de perfil). A lista são os servidores em que eu sou membro com `gerenciar_convite` (o administrador tem todas) e em que o alvo não é membro nem está banido, com código de convite. O POST repete as checagens, monta o link do servidor escolhido, abre a DM, grava a mensagem `Convite para o servidor <nome>: <link>` numa transação e entrega em tempo real. | Montar no app exigiria uma chamada por servidor e não saberia de banimento. Só "conhecer por DM" não basta: a DM não chega a quem não divide servidor nem é amigo (a mensagem ficaria invisível). **Ajuste da segurança (21/11):** banido e servidor sem código respondem igual (`409 nao_convidavel`), o limite conta também as recusas, e a auditoria entra na transação. |
| T-3 | **Entrega da DM fora do socket:** `conexoesDaConversa` e `avisarDm` (`realtime/mensagens.ts:91-110`) saem do closure por socket para o nível do módulo. O `TempoReal` ganha `entregarMensagemDm(mensagem)`, usado pela rota. | Reaproveita a regra de quem recebe a DM, sem copiar. |
| T-4 | **Limite do convite:** `criarLimitador` com 10 convites por pessoa a cada 10 min no POST. | A rota cria DM e mensagem a pedido (abuso e spam). |
| T-5 | **RF-4:** contexto novo `ContextoConvite` (como `ContextoPerfil`). Em `TextoComLinks`, um link que `lerQualquerConvite` reconhece e que é da **mesma base** do servidor aberto vira um botão de link. O clique pede confirmação ("Entrar no servidor por este convite?") e chama `abrirConvite` do App. Link de convite de outro endereço segue abrindo no navegador, como hoje. | A confirmação evita entrar num servidor com um clique sem querer. Restringir à mesma base evita que um link numa mensagem faça o app conversar com outro host. **Ajuste da segurança (21/11):** a confirmação saiu do `TextoComLinks` para o App, que busca o nome do servidor (`/api/servidor` do endereço do convite) e pergunta "Entrar no servidor «Nome»? Os membros de lá vão ver seu status e sua atividade."; um convite para o próprio servidor aberto segue como link comum; falha mostra o motivo sem trocar de tela. |
| T-6 | **RF-5, processo principal:** IPC `atualizacao:agora` marca `pedido = true` e chama `procurar()`. Um ouvinte de `download-progress` envia `atualizacao:progresso` (percentual). `EstadoAtualizacao` ganha `pedido`: com ele, o aviso do canto não aparece, porque quem conduz é o App. Resultados: `indisponivel` → CA-10; `atualizado` → CA-9; `nova` (pacote que não se instala sozinho) → abre a página de download, como o aviso faz hoje. | O `electron-updater` 6.8.11 já emite `download-progress` no NSIS, AppImage e .deb (conferido no pacote). |
| T-7 | **RF-5, tela:** um componente `AtualizarAgora` montado **uma vez, no App** (não na `TelaPrincipal`, que pode estar montada duas vezes com a voz viva em outro servidor). Ele mostra o progresso num aviso fixo. Ao ficar pronta: sem chamada (`vozViva === null`), instala na hora; em chamada, pergunta "Reiniciar agora? Você vai sair da chamada." e, se a pessoa recusar, volta o aviso do canto (`pedido = false`). O botão "Atualizar o app" fica no menu do usuário (`#menu-usuario`), perto de "Novidades", e só dispara o pedido (o menu fecha ao clicar). | Uma instância só evita instalar ou perguntar duas vezes. |
| T-8 | **RF-6:** `podeVerAtividade` vira `podeVer` (mesma regra), e os dois `io.emit('presenca:atualizada')` (`tempo-real.ts:243,249`) passam a emitir só para quem pode ver. | Mesma regra de atividade e status (RN-6). |
| T-9 | **RF-7 e regressões:** `reenviarAtividades(a, b)` vira `reenviarVisibilidade(a, b)`, que manda a atividade **e o status** de cada um ao outro (ou `null`/`offline` se não pode ver). É chamada:<br>• na amizade aceita ou desfeita (como hoje);<br>• em `tirarDaComunidade` (sair, expulsar, banir, tirar), para o par "quem saiu × cada membro que ficou";<br>• ao entrar num servidor por convite (método novo `TempoReal.entrouNaComunidade(usuario, comunidade)`), para o par "quem entrou × cada membro";<br>• ~~em `fecharComunidade` (servidor excluído)~~: tirado na T1. Cada conexão é de um servidor, e a exclusão derruba todas as conexões daquele servidor; nas conexões de outros servidores, quem via continua vendo pela mesma regra. Não há a quem reemitir. | Sem isso, filtrar o status quebra amizade nova e entrada por convite (a pessoa apareceria offline até mudar de status). |
| T-10 | **Fora:** "Copiar link de convite" do menu do servidor continua para todos os membros, como hoje. A RN-2 vale só para o convite pelo cartão. | Decidido na D-1; mudar o menu é outra coisa. Fica registrado. |

## 3. Componentes afetados
| Projeto | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- |
| server | rotas de convite (T-2, T-4); entrega da DM exposta (T-3); status filtrado e reemissão (T-8, T-9) | `server/src/routes/usuarios-perfil.ts` (padrão), `routes/comunidades.ts:58-84,140`, `routes/admin.ts:22-25,88-99`, `routes/moderacao.ts:70-86`, `realtime/mensagens.ts:91-110`, `realtime/tempo-real.ts:178-224,243,249,444-456`, `dominio/conhecer.ts`, `dominio/funcoes.ts:70`, `dominio/moderacao.ts:50`, `dominio/dms.ts:40`, `dominio/mensagens.ts:100`, `auth/limitador.ts` |
| shared | `ComunidadeDto` reaproveitado; tipos das rotas novas | `shared/src/protocolo.ts` |
| client/main | IPC `atualizacao:agora`, progresso, `pedido` | `client/src/main/atualizacao.ts:30-98` |
| client/preload | `atualizacao.agora()`, `aoProgresso` | `client/src/preload/index.ts:73-83`, `preload/api.ts:82-89` |
| client/renderer | prop `adminDaInstalacao`; convite no cartão e no menu; `ContextoConvite`; `AtualizarAgora` no App | `app/App.tsx:69-79,134-172,310-345,494-520`, `telas/TelaPrincipal.tsx:1369,1426,1637-1757,1852`, `componentes/CartaoPessoa.tsx:196-204`, `componentes/MenuPessoa.tsx:103`, `componentes/Previa.tsx:7,72`, `servicos/api.ts:167-184`, `componentes/AvisoAtualizacao.tsx` |

## 4. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `GET /api/usuarios/:id/convites` | — | `ComunidadeDto[]` (404 se não se conhecem) | nova |
| `POST /api/usuarios/:id/convites` | — | corpo `{ comunidadeId }` → `{ ok: true }`; 404, 403 (sem permissão), 409 (`ja_membro`, ou `nao_convidavel` para banido e sem código), 429 | nova |
| Evento `presenca:atualizada` | todas as conexões | só quem pode ver; também emitido na reemissão (T-9) | formato igual |
| Evento `atividade:atualizada` | quem pode ver | também emitido ao sair, entrar e excluir servidor | formato igual |
| IPC `atualizacao:agora` / `atualizacao:progresso` | — | novos | interno |
| `EstadoAtualizacao` | `{ versao, modo }` | `+ pedido?: boolean` | interno |
| `TempoReal` | — | `+ entregarMensagemDm`, `+ entrouNaComunidade` | interno do servidor |

## 5. Dados
Não se aplica: sem tabela nova nem migração. O convite é uma mensagem de DM comum (`mensagens`).

## 6. Segurança
- **Convite:** os dois têm de se conhecer de verdade (servidor em comum ou amizade), senão 404 uniforme. Permissão conferida no servidor escolhido. Banido e membro recusados. Limite de 10 a cada 10 min. O link é montado pelo servidor, nunca vem do app.
- **Link clicável:** só links da mesma base viram ação no app, e com confirmação. Os outros seguem para o navegador, como hoje.
- **Status:** mesma regra de privacidade da atividade (RN-6).
- **ToOuvini:** o servidor continua exigindo administrador do principal.
- Passada do `fluxo:seguranca` no fim da demanda, como na `correcoes-atividade`.

## 7. Observabilidade
- Auditoria: `convite_enviado` (quem, para quem, qual servidor), no padrão de `registrarAuditoria`.
- Falha de download da atualização vai para o `tofalany.log` (registro da `correcoes-atividade`) com motivo fixo.

## 8. Estratégia de testes
| Critério | Teste unitário / componente | Integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1, CA-2 | `App.test.tsx` / `TelaPrincipal`: com `adminDaInstalacao`, o item aparece fora do principal e a `TelaToOuvini` recebe a API da base; sem ela, não aparece | `musica-cookies.test.ts` continua | abrir pelo app num servidor que não é o principal |
| CA-3, CA-4, CA-6 | `CartaoPessoa.test.tsx` e `moderacao.test.tsx` (menu): lista vinda da API; vazia esconde o item | `server/test/convites-pessoa.test.ts`: lista por permissão, membro, banido, sem código; 404 sem se conhecer | — |
| CA-5 | cartão mostra "Convite enviado" | POST cria a DM e a mensagem, entrega `mensagem:nova` ao alvo; 403, 409, 429 | dois apps |
| CA-7 | `ItemMensagem.test.tsx`/`Previa`: link de convite da mesma base vira ação com confirmação; de outro host, link comum | — | clicar no convite recebido |
| CA-8, CA-8b, CA-9, CA-10 | `AtualizarAgora.test.tsx` (ponte falsa): progresso, pronta sem voz → instalar; pronta em voz → pergunta; recusar → aviso do canto; `atualizado` e `indisponivel` com os textos | `atualizacao.test.ts`: `pedido` esconde o aviso; progresso repassado | **manual:** atualização real no Windows, AppImage e .deb, e em chamada |
| CA-11 | — | `presenca-status.test.ts`/`atividade.test.ts`: conta sem relação não recebe status; `dms.test.ts` sem o filtro de "status é público" | — |
| CA-12 | — | sair de B: os dois recebem `null` e `offline`; entrar por convite e aceitar amizade reemitem o status | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | `podeCriar` só é recalculado ao trocar servidor ou token: se o cargo mudar no principal, o item do ToOuvini fica velho | recalcular por evento | Aceito: o servidor barra com 403, e trocar de servidor recalcula. |
| R-2 | .deb: "reinicia sozinho" depende da senha do sistema (pkexec); se a pessoa cancelar, não instala | — | Aceito: já é assim. O aviso do canto volta na próxima conferência. |
| R-3 | Consulta ao banco por conexão a cada mudança de status (`presenca:ausente` é frequente) | cache | Desprezível com até 4 pessoas (mesmo custo da atividade). |
| R-4 | Reemissão em servidor excluído é O(membros²) | — | Desprezível no tamanho do grupo. |

## 10. Implantação e rollback
- Servidor e app em qualquer ordem: o app novo com servidor antigo não mostra o convite (404 na rota nova, item escondido), e o resto funciona.
- Vai na atualização grande. Rollback: voltar a versão (sem dados novos).

## 11. CI/CD
Não se aplica.

> Aprovação: o plano só começa com esta especificação aprovada (registrada no topo).
