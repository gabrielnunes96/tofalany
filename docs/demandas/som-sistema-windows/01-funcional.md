# Som do sistema sem eco da chamada — especificação funcional

> Demanda: `som-sistema-windows` · Item 31 do backlog · Versão 2 · 22/11/2026 · Situação: **v2 em revisão** (v1 aprovada em 22/11/2026)

## 1. Objetivo
Quem transmite a tela com "som do sistema" manda o som do computador (jogo, vídeo, música) sem mandar junto o som da própria chamada. Hoje, no Windows, quem está na chamada ouve a própria voz de volta.

## 2. Contexto
- Visto em 19/11 no Windows: com "som do sistema" marcado, a captura pega todo o som do computador, inclusive as vozes da chamada que o ToFalany toca. Quem fala ouve a própria voz alguns instantes depois, pela transmissão.
- Causa (19/11): no Windows, o app pede ao Chromium o som "loopback", que é tudo o que sai no alto-falante. Não há opção de tirar o próprio app desse som por esse caminho.
- O Windows permite capturar o som de todos os programas **menos** um programa e os processos dele só a partir do build 20348 — na prática, o **Windows 11**. O Windows 10 (inclusive o 22H2, build 19045) não tem esse recurso. (v2: a v1 dizia Windows 10 2004, corrigido pela pesquisa da técnica.)
- O Electron 45 diz deixar o app de fora quando o app pede, mas o eco de 19/11 foi visto num Windows 11 com o app atual: não funciona na prática (relato igual em outro projeto, 16/11).
- No Linux, o som do sistema vem por um microfone virtual (PipeWire) que já tenta deixar o app de fora; nunca foi conferido se a voz da chamada escapa.
- Os instaladores do Windows já são montados no CI (Windows Server 2025).

## 3. Atores
| Ator | Papel |
| --- | --- |
| Quem transmite | Marca "som do sistema" ao escolher a tela ou janela. |
| Quem assiste / está na chamada | Ouve o som da transmissão sem ouvir a própria voz de volta. |
| Amigo do grupo com Windows | Valida a versão de teste (validação manual). |

## 4. Escopo
**Dentro:**
- Windows 11: som do sistema sem o som do próprio ToFalany.
- Windows 10 (e mais antigo): a opção "som do sistema" fica desligada, com aviso.
- Linux: conferir se a voz da chamada entra no som do sistema e corrigir, se entrar.
- Aviso claro quando a captura falhar ou não estiver disponível.

**Fora (explícito):**
- macOS (o app não é distribuído para ele).
- Escolher programas específicos para capturar (só "tudo menos o ToFalany").
- Mudar o som da transmissão para quem assiste (volume e mudo continuam como estão).
- Capturar o som de uma janela só, quando se transmite uma janela (fica o som do sistema todo, menos o ToFalany).

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | Com "som do sistema", a transmissão leva o som do computador **sem** nenhum som tocado pelo próprio ToFalany: vozes da chamada, soundboard, sons de entrar e sair, notificações e o bot de música. | Item 31 |
| RN-2 | No Windows 11 (build 22000 ou mais novo), a captura usa o recurso do Windows que exclui o app. | Usuário, 22/11 (v2) |
| RN-3 | No Windows 10 ou mais antigo, a opção aparece desligada com o aviso "O som do sistema precisa do Windows 11 (no Windows 10, os outros ouviriam a própria voz de volta)." | Usuário, 22/11 (v2) |
| RN-4 | Se a captura não começar (falha do sistema, permissão), a transmissão segue **sem** o som do sistema e quem transmite vê "Não foi possível capturar o som do sistema; a transmissão continua sem ele." | Assistente |
| RN-5 | No Linux vale a mesma RN-1; se a voz da chamada entrar no som do sistema, isso é corrigido nesta demanda. | Usuário, 22/11 |
| RN-6 | O som do sistema nunca vai para a transmissão sem a pessoa marcar a opção (como hoje). | Assistente (privacidade) |
| RN-7 | Parar a transmissão (ou fechar o app) encerra a captura do som do sistema na hora. | Assistente |
| RN-8 | Enquanto o som do sistema estiver sendo capturado, as notificações do app saem sem som (o som delas é tocado pelo sistema, fora do app, e entraria na transmissão). | Assistente (v2, decorre da RN-1) |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Captura do som do sistema no Windows que exclui o ToFalany e todos os processos dele, entregue como o áudio da transmissão (o mesmo lugar onde o som do sistema chega hoje). | RN-1, RN-2, RN-7 |
| RF-2 | No seletor de tela, "som do sistema" desligado com o aviso da RN-3 no Windows antigo; ligado e funcionando no novo. | RN-3, RN-6 |
| RF-3 | Aviso de falha da RN-4 durante a transmissão. | RN-4 |
| RF-4 | Conferência no Linux (com PipeWire) e correção, se a voz da chamada entrar. | RN-5 |

## 7. Requisitos não funcionais
- Atraso do som do sistema na transmissão no máximo igual ao de hoje (sem piorar a sincronia com o vídeo), medido na validação manual.
- A captura não pode travar o app: se o módulo do Windows falhar ao carregar, o app abre normalmente e a opção fica desligada com aviso.
- Uso de processador da captura abaixo de 5% de um núcleo num PC comum, na validação manual.

## 8. Critérios de aceite
- **CA-1** (RN-1, RN-2): Dado um amigo no Windows 11 transmitindo um vídeo com "som do sistema", quando o Gabriel fala na chamada, então quem assiste ouve o vídeo e o Gabriel **não** ouve a própria voz de volta (validação manual).
- **CA-2** (RN-1): Dado o mesmo cenário, quando alguém toca um som do soundboard ou o bot de música toca, então esse som não chega duas vezes para quem assiste (só uma, pela chamada).
- **CA-3** (RN-3): Dado o Windows 10, quando a pessoa abre o seletor de tela, então "som do sistema" aparece desligado com o aviso da RN-3.
- **CA-4** (RN-4): Dado que a captura falha ao começar, quando a pessoa transmite com "som do sistema", então a transmissão sai só com o vídeo e o aviso da RN-4 aparece.
- **CA-5** (RN-7): Dado uma transmissão com som do sistema, quando a pessoa para de transmitir, então a captura para (o indicador de captura de áudio do sistema some e não há mais áudio saindo).
- **CA-6** (RN-5): Dado o Linux com PipeWire, quando alguém transmite com "som do sistema" e outra pessoa fala, então quem fala não ouve a própria voz de volta (conferido em E2E ou manualmente).
- **CA-8** (RN-8): Dado alguém transmitindo com som do sistema, quando chega uma mensagem que gera notificação, então a notificação aparece sem som.
- **CA-7** (RNF): Dado que o módulo de captura do Windows não carrega, quando o app abre, então ele funciona normalmente e "som do sistema" fica desligado com aviso.

## 9. Impacto em consumidores
- Só o app (Windows e, se preciso, Linux). Servidor e contratos não mudam.
- O instalador do Windows ganha um módulo nativo; o tamanho cresce um pouco.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem |
| --- | --- | --- |
| D-1 | Nome do amigo que valida no Windows e quando ele pode (a validação é a T final). | Usuário |
| D-2 | Usar um pacote pronto de captura ou escrever o módulo próprio: decisão técnica, depois de avaliar licença, manutenção e se exclui a árvore de processos. | Técnica |
