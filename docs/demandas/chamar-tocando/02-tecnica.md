# Chamar para a voz como um telefone — especificação técnica

> Demanda: `chamar-tocando` · Base: funcional v1 · 23/11/2026 · Situação: **aprovada em 23/11/2026**

## 1. Visão da solução
O chamado passa a existir no servidor, só em memória: um mapa `abertos` em `criarChamar` (`server/src/realtime/chamar.ts:22`), indexado por quem é chamado, com `{ id, porId, comunidadeId, canalVozId, timer }`.

**Como o chamado acaba.** Uma função `encerrar(alvoId, motivo)` tira o chamado do mapa e emite `voz:chamado:fim` para os dois lados. Ela é idempotente: se o chamado já saiu do mapa, não faz nada. Ela é chamada em seis casos:
- tempo de 15 s;
- `voz:responder` de quem é chamado;
- `voz:cancelar` de quem chama;
- quem chama sai da voz ou troca de sala (`aoSair` já existe em `tempo-real.ts:305-308`);
- quem é chamado entra na sala de quem chamou (atendido);
- quem é chamado entra em outra sala (não atendeu).

**Regras de quem pode ser chamado.**
- **Offline ou invisível (RN-1):** o servidor consulta o status visível (`status`, `tempo-real.ts:175`) no lugar das escolhas, e responde com o mesmo 404 de "não pode ser chamada", para não revelar a invisibilidade.
- **Não incomodar:** o chamado é aceito e fica aberto, mas não é entregue. Quem chama vê "não atendeu" depois de 15 s, como hoje, e não descobre o status.
- **CA-8:** a regra "já está sendo chamada" (409) vale antes do limitador.

**No app:**
- **Toque:** novo som `chamado` em `sons-voz.ts`, que repete a cada 2 s até parar. Ele respeita o surdo e a preferência local `notificacoes.chamados`. No surdo, o aviso aparece sem som.
- **Tela "Chamando <nome>…":** tem Cancelar.
- **Avisos que somem:** os resultados do chamado usam `avisoTemporario(texto)`, que some em 6 s. Os outros avisos da voz (castigo, desconexão, movido) não mudam.
- **Menu:** `podeChamar` passa a exigir `presencas[alvo]` em `online` ou `ausente`.

**Versões misturadas.** O `ola.recursos` ganha `chamadoV2: true`:
- **App novo com servidor 0.18.x:** sem o recurso, o app volta ao comportamento atual.
- **App 0.18.x com servidor novo:** recebe o `voz:chamado` de sempre (o `id` a mais é ignorado), sem toque e sem fim.

```text
Ana: voz:chamar {usuarioId:Bia} ──ack {id}──► servidor: confere (voz, permissão, status visível, já chamada? 409, limitador)
     abertos.set(Bia, {id, Ana, canal, timer 15 s}) ── emit voz:chamado {id, porId, porNome, canalVozId, canalNome, segundos:15} ─► Bia (toque)
                                                    └─ push tipo chamado (ttl 15 s) para aparelhos desconectados
Bia: voz:responder {id, aceitar}  ─► encerrar(Bia, aceitar ? 'atendido' : 'recusado') ─► voz:chamado:fim {id, motivo, nome} ─► Ana e Bia
Ana: voz:cancelar {id} / sai da voz ─► encerrar(Bia, 'cancelado')
timer 15 s                         ─► encerrar(Bia, 'tempo')     ─► Ana vê "Bia não atendeu" (6 s)
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| shared | node | `ChamadoVozDto` ganha `id` e `segundos`; eventos `voz:responder`, `voz:cancelar` (com ack) e `voz:chamado:fim`; `CHAMADO_DURACAO_MS = 15_000`; `recursos.chamadoV2` | `shared/src/protocolo.ts:843,896`, `shared/src/limites.ts` |
| server | node | Estado `abertos`; `encerrar`; status visível; 409; ganchos de sair e entrar na voz; push do chamado com ttl e validade de 15 s | `server/src/realtime/chamar.ts:19-50`, `server/src/realtime/tempo-real.ts:46,175,305-308,330,412`, `server/src/realtime/voz.ts` (opção `aoEntrar` em `criarVoz`, chamada no `voz:estado`), `server/src/dominio/push.ts:88-98,121-140,155-170` |
| client: renderer | front | Listeners novos; `chamado` com `id`; `chamando`; toque; Recusar no lugar de "Agora não"; `avisoTemporario`; `podeChamar` com presença | `servicos/tempo-real.ts:63,210`, `servicos/sons-voz.ts:5-80`, `telas/TelaPrincipal.tsx:322,807,1175-1184,1739-1747,2181-2212` |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| `voz:chamar` (ack) | `{usuarioId}` → `ok` | → `{ id }`; erros novos: 404 para offline/invisível (mesma mensagem de hoje), 409 "<nome> já está sendo chamada" | App antigo ignora o `id` |
| `voz:chamado` | `{porId, porNome, canalVozId, canalNome}` | + `id`, `segundos` | Campos a mais, tolerados |
| `voz:responder` (novo, ack) | — | `{ id, aceitar: boolean }`; chamado desconhecido dá ok silencioso | Só com `chamadoV2` |
| `voz:cancelar` (novo, ack) | — | `{ id }` | Só com `chamadoV2` |
| `voz:chamado:fim` (novo) | — | `{ id, motivo: 'atendido'\|'recusado'\|'cancelado'\|'tempo', nome }` aos dois lados | App antigo ignora |
| `ola.recursos` | `{fixar, busca, push, chamar}` | + `chamadoV2` | Opcional |
| Push `chamado` | ttl 60 s, pendente válido por 10 min | ttl 15 s, pendente válido por 15 s | Só servidor |

## 4. Dados
Nada persistido. Um reinício do servidor perde os chamados abertos: o app de quem é chamado para o toque depois de `segundos` sozinho, e responder um chamado desconhecido não dá erro.

## 5. Integrações externas
FCM HTTP v1 (`server/src/dominio/fcm.ts:58-70`): `android.ttl = 15s` para o chamado. Não há como recolher um push já entregue; o app do celular, quando existir, usa o `segundos` do dado para sumir.

## 6. Segurança
- Presença é dado pessoal. Offline, invisível e "não pode" devolvem o mesmo 404. O não incomodar é aceito em silêncio.
- O 409 de CA-8 revela só que há um chamado aberto, e a funcional pede isso.
- `voz:responder` e `voz:cancelar` conferem o dono: só quem é chamado responde e só quem chama cancela. Fora disso, ok silencioso, sem efeito.
- Os limitadores atuais continuam (1/min por par, 5/min por quem chama).

## 7. Observabilidade
A auditoria `voz_chamou` continua. Nada novo: o resultado do chamado é efêmero.

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | `podeChamar` com presença (função extraída para `estado/chamar.ts`) | `chamar.test.ts`: offline e invisível dão 404 com a mesma mensagem | — |
| CA-2 | `sons-voz.test.ts`: toque repete e para | `chamar.test.ts`: responder aceitar, fim `atendido` aos dois; entrar na sala de quem chamou encerra | Usuário com um amigo: chamar, ouvir, entrar |
| CA-3 | — | `chamar.test.ts`: recusar, fim `recusado` | idem |
| CA-4 | — | `chamar.test.ts` com fake timers: 15 s, fim `tempo`; push com ttl 15 | idem |
| CA-5 | — | `chamar.test.ts`: cancelar e sair da voz dão fim `cancelado` | idem |
| CA-6 | `sons-voz`/`deveTocar`: surdo e preferência desligada não tocam | — | — |
| CA-7 | `aviso-temporario.test.ts` (novo): some em 6 s | — | — |
| CA-8 | — | `chamar.test.ts`: segundo chamador recebe 409 antes do limitador | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | Não incomodar: chamável? | esconder do menu; aceitar em silêncio | **Aceitar em silêncio**: RN-1 diz que continua sem receber, e esconder revelaria o status |
| R-2 | Quem é chamado entra em outra sala | continua tocando; encerra | **Encerra** com `tempo` ("não atendeu"): a pessoa escolheu outra sala |
| R-3 | Preferência que corta o toque | local (`notificacoes.chamados`); a do servidor | **Local**: é por computador; a do servidor rege o push |
| R-4 | Um chamado aberto por alvo: global ou por servidor | global; por servidor | **Por servidor** (o mapa vive em cada servidor); uma pessoa em dois servidores pode receber dois, o que é raro |
| R-5 | Corridas (aceitar, cancelar e tempo juntos) | trava; idempotência | **`encerrar` idempotente**: o primeiro vence, os outros não fazem nada |
| R-6 | 27 pontos de `setAvisoVoz` | timer em todos; só nos do chamado | **Só nos do chamado** (RN-7 lista esses); castigo e desconexão são estado e ficam |

## 10. Implantação e rollback
Servidor primeiro, ou junto. App novo com servidor antigo cai no fluxo atual (sem `chamadoV2`). Rollback: imagem anterior; nada persistido.

## 11. CI/CD
Sem mudança.
