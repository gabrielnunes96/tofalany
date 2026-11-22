# Mover membros e sala de AFK — especificação técnica

> Demanda: `mover-e-afk` · Base: funcional v2 · 21/11/2026 · Situação: **rascunho**

## 1. Visão da solução
O servidor decide e age; o app obedece só a eventos do servidor.
- **Mover / desconectar:** evento com ack `voz:mover` `{ usuarioId, canalVozId }` e `voz:desconectar` `{ usuarioId }` no socket do moderador. O servidor confere tudo (`conferirMover`), audita, manda `voz:movido` (ou `voz:desconectado`) ao app da pessoa e, se em 10 s ela ainda estiver na sala antiga (app antigo ou modificado), tira da mídia de verdade (`removeParticipant`).
- **AFK:** colunas novas em `comunidades` (`afk_canal_id`, `afk_minutos`); o app que está em voz mede a inatividade (sem falar e sem mexer) e entra na sala de AFK pelo caminho normal, com `motivo: 'afk'`; o servidor confere e audita. Na AFK, o token do LiveKit não deixa publicar nada e o servidor grava `mudo: true`.
- **Token antigo (achado da modelagem, A6):** o webhook passa a tratar `participant_joined`: quem entra numa sala de voz em que não está (pela presença) é tirado depois de 10 s de carência.

```text
MOVER  menu "Mover para…" / arrastar → socket 'voz:mover' {usuarioId, canalVozId} (ack)
         → conferirMover (permissão, admin/mover_membros, alvo em voz neste servidor, destino de voz daqui ≠ atual,
           entrar_voz do alvo, limites) → auditoria voz_movido → emit 'voz:movido' {canalVozId, porNome, canalNome}
           ao socket da presença → [10 s] ainda no canal antigo? → revogar (tira da presença + removeParticipant)
       app da pessoa: aoVozMovido → entrarVoz(destino) mantendo mudo/surdo/câmera (tela para)
AFK    app (TelaPrincipal em voz): a cada 15 s — segundos ociosos (main) ≥ N min E última fala há ≥ N min
         E sem câmera E sem tela → entrarVoz(afk, motivo 'afk')
       servidor: voz:estado {canalVozId: afk, motivo: 'afk'} → confere que é a AFK deste servidor → mudo = true,
         auditoria voz_afk; token da AFK sem fontes de publicação
```

## 2. Componentes afetados
| Repositório / projeto | Stack | O que muda | Arquivos-chave (existentes) |
| --- | --- | --- | --- |
| shared | node | `mover_membros` (não básica, em `PERMISSOES_SEM_CASTIGO`); eventos `voz:mover`, `voz:desconectar`, `voz:movido`, `voz:desconectado`; `VozEstadoPedido.motivo?`; `servidor.afk?`; auditoria `voz_movido`, `voz_desconectado`, `voz_afk`; `MINUTOS_AFK` | `shared/src/protocolo.ts:66,85,428,634,701,772,826`, `shared/src/auditoria.ts` |
| server | node | Migração 023; `conferirMover`; eventos de mover em `realtime/voz.ts`; motivo `afk` e mudo forçado; rota `PATCH /api/comunidade/afk`; token sem publicação na AFK; webhook `participant_joined`; pontos sem a AFK | `server/src/realtime/voz.ts:16-32,48,95-127,183`, `server/src/realtime/tempo-real.ts:272-282,362-367,472`, `server/src/dominio/moderacao.ts:30-52`, `server/src/routes/livekit.ts:30-69,84-110`, `server/src/routes/comunidades.ts:43,88-121`, `server/src/dominio/pontos.ts:33-36`, `server/src/db/migracoes.ts` |
| client: main | node | IPC `presenca:ocioso-segundos` (segundos ociosos, com o gancho de E2E) | `client/src/main/index.ts:279-305`, `client/src/preload/index.ts:45-51` |
| client: renderer | front | `aoVozMovido`/`aoVozDesconectado`; troca de sala que mantém a câmera; fila de troca; mudo travado na AFK; vigia de inatividade; menu "Mover para…"/"Desconectar"; arrastar na lista de voz; ícone de AFK; AFK em Editar servidor | `TelaPrincipal.tsx:767-871,1026,1084,1469-1610`, `servicos/tempo-real.ts`, `componentes/MenuPessoa.tsx:50-158`, `componentes/BarraLateral.tsx:147-271`, `componentes/Icone.tsx`, `telas/TelaEditarServidor.tsx` |

## 3. Contratos
| Contrato | Antes | Depois | Compatibilidade |
| --- | --- | --- | --- |
| Socket `voz:mover` / `voz:desconectar` (ack) | — | `{ usuarioId, canalVozId }` / `{ usuarioId }` | Novos |
| Evento `voz:movido` / `voz:desconectado` | — | `{ canalVozId, canalNome, porNome }` / `{ porNome }` (nomes do banco) | App antigo ignora; o servidor tira da mídia em 10 s |
| `VozEstadoPedido` | — | + `motivo?: 'afk'` | Opcional |
| `OlaPayload.servidor` e `servidor:atualizado` | — | + `afk?: { canalId: number; minutos: number } \| null` | Opcional |
| `PATCH /api/comunidade/afk` | — | `{ canalId: number \| null, minutos: 5\|10\|15\|30\|60 }` (admin) | Nova |
| Token do LiveKit | fontes por cargo | na AFK: `canPublish: false` | — |
| Webhook | `participant_left` | + `participant_joined` (tira quem não está naquela sala pela presença, depois de 10 s) | — |
| Auditoria | — | `voz_movido`, `voz_desconectado`, `voz_afk` | App antigo mostra rótulo vazio |

## 4. Dados
Migração 023: `ALTER TABLE comunidades ADD COLUMN afk_canal_id INTEGER REFERENCES canais(id) ON DELETE SET NULL` e `ADD COLUMN afk_minutos INTEGER NOT NULL DEFAULT 15`. Apagar o canal desliga a AFK (FK com `foreign_keys = ON`). Volume: uma linha por servidor. Rollback: backup automático antes da migração; o servidor antigo ignora as colunas.

## 5. Integrações externas
- **LiveKit (livekit-server-sdk 2.19.2):** `removeParticipant` (já usado). Não usamos `moveParticipant` (não confirmado no servidor v1.13.11; a troca pelo próprio app já existe e é testada). Com o LiveKit fora, o mover avisa o app e a remoção forçada falha em silêncio (como no castigo).

## 6. Segurança
Modelagem STRIDE de 21/11 (A1 a A15):
- **A1–A3, A14:** `conferirMover` usa a comunidade do socket do moderador; o alvo precisa ser membro e estar em voz **neste** servidor; o destino precisa ser canal de voz deste servidor e diferente do atual; o alvo precisa de `entrar_voz` (o castigo já tira); mesmo erro para "não é membro" e "não está em chamada aqui"; não move a si mesmo.
- **A4 (RN-2, RN-13):** quem não é admin não move admin, dono nem quem tem `mover_membros`.
- **A5:** o servidor audita e avisa primeiro; se em 10 s a presença ainda for a antiga, `revogar` (tira da presença e do LiveKit). Desconectar revoga na hora, depois do aviso.
- **A6:** `participant_joined` no webhook: depois de 10 s, quem está numa sala de voz que não é a da presença (ou sem `entrar_voz`) é removido.
- **A7 (RN-9):** token da AFK com `canPublish: false`; `voz:estado` na AFK grava `mudo: true`; ao mudar a AFK de sala, quem está na nova AFK é removido da mídia e reentra pelo app (o app já trata a troca).
- **A8, A9:** `motivo: 'afk'` só vale para quem manda (socket da própria presença) e para a AFK do servidor do canal atual; até 1 ida à AFK por minuto por pessoa.
- **A10:** limite de 5 mover/desconectar por 10 s por moderador e 1 por 3 s por alvo (429).
- **A12:** auditoria na mesma transação da conferência; ator = moderador (ou a própria pessoa na AFK).
- **A13:** rota da AFK com `exigirAdmin`, schema fechado, canal de voz deste servidor, minutos na lista.
- **A15:** nomes do aviso montados no servidor; o app mostra como texto.
- `mover_membros` entra em `PERMISSOES_SEM_CASTIGO` (de castigo não move ninguém).

## 7. Observabilidade
Auditoria das três ações; log do servidor quando a remoção forçada (A5, A6) acontece.

## 8. Estratégia de testes
| Critério de aceite | Teste unitário | Teste de contrato/integração | Validação no ambiente |
| --- | --- | --- | --- |
| CA-1 | MenuPessoa sem os itens | `voz:mover` sem permissão → erro | — |
| CA-2, CA-3 | `aoVozMovido` chama a troca com o destino | socket: alvo recebe `voz:movido` com nomes do banco; auditoria | E2E com dois apps (LiveKit real): menu "Mover para…" e arrastar |
| CA-4, CA-16 | — | não-admin move admin/dono/quem tem `mover_membros` → recusa | — |
| CA-5 | — | alvo de castigo → recusa | — |
| CA-6 | — | desconectar: evento e revogação | E2E |
| CA-7 | troca mantém câmera (religada) e para a tela | — | Manual (duas pessoas) |
| CA-8 | TelaEditarServidor com AFK | rota da AFK (admin, schema, canal daqui) | — |
| CA-9, CA-10, CA-11 | vigia de inatividade (relógio falso: ocioso × fala × câmera × tela × sozinho) | `motivo: 'afk'` aceito só para a AFK daqui | E2E com ociosidade simulada |
| CA-12 | botão de desmutar travado na AFK | token da AFK sem publicação; `mudo` forçado | — |
| CA-13 | voltar a mexer não sai da AFK | — | — |
| CA-14 | — | três tipos de auditoria com ator, alvo e salas | — |
| CA-15 | — | apagar o canal zera a AFK | — |
| CA-17 | — | pontos não contam na AFK | — |
| CA-18 | sair da AFK restaura o mudo de antes | — | — |
| Segurança | — | A1 (outro servidor), A2 (destino inválido), A5 (app que ignora: revogado em 10 s, relógio falso), A6 (`participant_joined` fora da presença), A10 (limites) | — |

## 9. Riscos e decisões
| # | Risco / decisão | Opções | Escolha e motivo |
| --- | --- | --- | --- |
| R-1 | App novo × antigo no mover | (a) app anuncia o recurso no handshake; (b) avisar e tirar da mídia depois de 10 s se ainda estiver na sala antiga | (b): vale para app antigo e para app modificado, sem mudar o handshake. |
| R-2 | Mover pelo LiveKit (`moveParticipant`) | usar; trocar pelo app | Trocar pelo app (`entrarVoz`, já testado); `moveParticipant` não confirmado no servidor v1.13.11. |
| R-3 | Pedidos de troca durante uma entrada | ignorar (hoje); fila | Fila de um: o último pedido vale depois que a entrada atual terminar. |
| R-4 | Câmera ao trocar | desliga (hoje); religar | Guardar antes de sair e religar depois de entrar (a luz da câmera pisca). |
| R-5 | Ociosidade no Linux com Wayland | — | Mesma limitação do "ausente" de hoje (o sistema pode não informar); registrado. |
| R-6 | Arrastar | biblioteca; HTML5 drag and drop | HTML5 nativo na lista de voz (pouco código); "Mover para…" é o caminho por teclado. |

## 10. Implantação e rollback
Servidor primeiro (migração 023), depois o app, junto da atualização grande. Rollback: versão anterior com o backup da migração.

## 11. CI/CD
Sem mudança.
