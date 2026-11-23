# ToFalany no celular (Android) — especificação funcional

> Demanda: `celular` · Item 40 do backlog · Versão 1 · 23/11/2026 · Situação: **aprovada em 23/11/2026**

## 1. Objetivo
Levar o ToFalany para o celular Android, com a mesma conta e os mesmos servidores do computador: conversar, ficar na voz com a tela apagada, assistir às transmissões e receber notificações com o app fechado, sem que o conteúdo das conversas passe por serviços de fora.

## 2. Contexto
- Hoje o ToFalany é só para computador (Windows e Linux), distribuído pelas releases do GitHub, com atualização pelo próprio app.
- O servidor e os contratos (`shared`) já atendem qualquer cliente: conta da instalação, vários servidores, chat, voz e vídeo pelo LiveKit, loja, soundboard.
- Regra do projeto: o app só fala com o próprio servidor (e hosts já liberados, como o da busca de GIF). A notificação com o app fechado no Android só existe pelo serviço de push do Google; a decisão (23/11) é usá-lo **sem conteúdo**.
- iOS fica para uma etapa seguinte: exige a conta de desenvolvedor da Apple (paga todo ano) e revisão da loja ou TestFlight.

## 3. Atores
| Ator | Papel |
| --- | --- |
| Pessoa do grupo | Usa o app no celular com a mesma conta do computador. |
| Administrador | O mesmo do computador; no celular faz o que a tela pequena comporta (ver escopo). |
| Servidor do ToFalany | Atende o app do celular como o do computador e manda o aviso de push sem conteúdo. |
| Serviço de push do Google | Só entrega "tem novidade" ao celular; não vê texto, nome de canal nem de pessoa. |

## 4. Escopo
**Dentro (primeira versão, Android):**
- Entrar com a conta (com os 2 fatores), trocar de servidor, sair; entrar por link de convite.
- Chat em canais e conversas diretas: ler, enviar, responder, reagir, apagar, editar, fixadas, busca, anexos (foto da galeria e da câmera), GIF, menções, não lidas.
- Voz: entrar e sair, mudo e surdo, indicador de quem fala, volume por pessoa, continua com a tela apagada ou em outro app, fone com e sem fio, alto-falante.
- Assistir às transmissões de tela (tela cheia e virada), com o volume do som da transmissão.
- Câmera na chamada (frontal e traseira) e ver as câmeras dos outros.
- Mini perfil, perfil completo, status (online, ausente, não incomodar, invisível), amigos.
- Loja (saldo, temas, vales, áudios), soundboard com "Meus sons", temas do app.
- Notificações: mensagem nova (canal com menção, conversa direta) e chamado para a voz, inclusive com o app fechado.
- Atualização: o app avisa a versão nova e baixa o APK.

**Fora (explícito):**
- iOS (etapa seguinte).
- Transmitir a tela do celular; a atividade de jogos e música; atalhos globais e push-to-talk por tecla (no celular, botão de mudo).
- Telas de administração pesadas (auditoria, cargos, membros, ToOuvini, áudios da loja, editar servidor): ficam no computador. A moderação rápida pelo menu da pessoa (mover, desconectar, castigo) entra.
- Play Store (só APK nas releases nesta etapa).
- Layout próprio para tablet (funciona, mas com o layout do celular).

## 5. Regras de negócio
| ID | Regra | Origem |
| --- | --- | --- |
| RN-1 | A conta, os servidores, o saldo, as compras e as preferências da conta são os mesmos do computador; nada novo é exigido no servidor para entrar. | Item 40 |
| RN-2 | O app só fala com o servidor do ToFalany, com os hosts já liberados (busca de GIF) e com o serviço de push do Google. | Regra do projeto; usuário, 23/11 |
| RN-3 | O aviso de push não leva conteúdo: nem texto, nem nome de pessoa, canal ou servidor. O app acorda, busca no servidor e monta a notificação no próprio celular. | Usuário, 23/11 |
| RN-4 | A pessoa pode desligar as notificações no app (por tipo: mensagens, chamados) e o sistema também pode; com as do app desligadas, o servidor para de mandar push para aquele celular. | Assistente |
| RN-5 | Sair da conta no celular, trocar a senha ou revogar a sessão apaga o registro de push daquele celular no servidor. | Assistente (segurança) |
| RN-6 | Na voz com a tela apagada, o Android mostra a notificação fixa "Na voz em <sala>" com os botões de mudo e de sair; a chamada não cai por o app ir para segundo plano. | Item 40 |
| RN-7 | Uma voz por conta, como hoje: entrar na voz no celular tira a voz do computador (e o contrário), com o aviso que já existe. | Regra atual |
| RN-8 | A atualização baixa o APK só das releases oficiais do projeto e confere a assinatura antes de instalar; o Android pede a confirmação da pessoa. | Assistente (segurança) |
| RN-9 | O que exige computador (transmitir, atividade) não aparece no celular; quem está no computador vê a pessoa do celular normalmente (sem marca especial). | Assistente |
| RN-10 | Dados do app (sessão, mensagens em cache) ficam só no armazenamento privado do app; a sessão é guardada cifrada pelo sistema. | Assistente (segurança) |

## 6. Requisitos funcionais
| ID | Requisito | Regras |
| --- | --- | --- |
| RF-1 | Entrar, 2 fatores, lista de servidores, trocar de servidor, link de convite (abrir o link no celular abre o app). | RN-1 |
| RF-2 | Chat completo (lista do escopo) adaptado a tela pequena e toque (lista de canais e de membros como gavetas). | RN-1 |
| RF-3 | Voz com tela apagada, notificação fixa, troca de saída de áudio (fone, Bluetooth, alto-falante). | RN-6, RN-7 |
| RF-4 | Assistir transmissões e câmeras; câmera própria. | RN-9 |
| RF-5 | Loja, soundboard, perfil, status, amigos, temas. | RN-1 |
| RF-6 | Push sem conteúdo com o app fechado; notificação montada no celular; preferências por tipo. | RN-2, RN-3, RN-4, RN-5 |
| RF-7 | Atualização pelo próprio app a partir das releases. | RN-8 |
| RF-8 | APK assinado nas releases do GitHub, gerado no CI como os instaladores de hoje. | RN-8 |

## 7. Requisitos não funcionais
- Android 10 ou mais novo (ver D-1).
- Abrir o app já logado e mostrar o último canal em até 3 s num celular intermediário.
- Voz de 1 hora com a tela apagada sem cair, com consumo de bateria medido na validação manual (meta: até 10% por hora de voz).
- Toda ação usável com uma mão (o polegar alcança mudo, sair da voz e enviar mensagem).
- Acessibilidade: TalkBack lê os controles principais; textos respeitam o tamanho de fonte do sistema.

## 8. Critérios de aceite
- **CA-1** (RF-1): Dado um celular sem o app, quando a pessoa instala o APK, entra com a conta e os 2 fatores, então vê os mesmos servidores e canais do computador.
- **CA-2** (RF-1): Dado um link de convite aberto no celular, quando a pessoa toca, então o app abre na tela de entrar no servidor.
- **CA-3** (RF-2): Dado o chat aberto, quando a pessoa envia texto, foto da câmera e um GIF, então o computador recebe os três na hora; reações, respostas e fixadas aparecem nos dois.
- **CA-4** (RF-3, RN-6): Dado a pessoa na voz pelo celular, quando apaga a tela ou abre outro app por 10 minutos, então continua ouvindo e sendo ouvida, e a notificação fixa permite mutar e sair.
- **CA-5** (RN-7): Dado a pessoa na voz pelo computador, quando entra na voz pelo celular, então o computador sai da voz com o aviso de outro aparelho.
- **CA-6** (RF-3): Dado um fone Bluetooth conectado durante a chamada, quando a pessoa troca para o alto-falante e volta, então o som muda sem cair a chamada.
- **CA-7** (RF-4): Dado alguém transmitindo no computador, quando a pessoa no celular toca em Assistir e vira o celular, então vê a tela em tela cheia, com som.
- **CA-8** (RF-6, RN-3): Dado o app fechado, quando chega uma menção ou mensagem direta, então o celular mostra a notificação com quem mandou e o começo do texto em até 15 s; o aviso que passou pelo Google não contém nada além de um identificador sem significado (conferido no servidor pelo que é enviado).
- **CA-9** (RN-4, RN-5): Dado as notificações de mensagem desligadas no app, ou a pessoa saiu da conta, quando chega uma mensagem, então o servidor não manda push para aquele celular.
- **CA-10** (RN-2): Dado o app em uso por 10 minutos (chat, voz, GIF, loja), quando se olha o tráfego do celular, então só aparecem o servidor do ToFalany, o host da busca de GIF e o serviço de push do Google.
- **CA-11** (RF-7, RN-8): Dado uma versão nova publicada, quando a pessoa abre o app, então vê o aviso, baixa e o Android pede para instalar; um APK de outra assinatura é recusado.
- **CA-12** (RF-5): Dado saldo suficiente, quando a pessoa compra um áudio na loja pelo celular e toca no soundboard numa chamada, então quem está no computador ouve.
- **CA-13** (RNF): Dado o celular de teste, quando se mede, então o app abre logado em até 3 s e a voz de 1 hora com tela apagada não cai.

## 9. Impacto em consumidores
- **Servidor:** ganha o registro do aparelho para push (criar, apagar) e o envio do aviso sem conteúdo; o resto é igual. Precisa de uma credencial do serviço de push guardada no servidor (fica na configuração da VM, mudança só com o seu OK).
- **App do computador:** não muda (a não ser o que for comum e for extraído para ser usado pelos dois).
- **CI:** novo job que gera e assina o APK; uma chave de assinatura nova guardada como segredo do repositório.

## 10. Dúvidas em aberto
| # | Dúvida | Para quem |
| --- | --- | --- |
| D-1 | Versão mínima do Android: proposta Android 10 (cobre quase todos os celulares em uso). Algum celular do grupo é mais antigo? | Usuário |
| D-2 | Conta do serviço de push do Google (Firebase, gratuita): quem cria e guarda (a técnica diz o passo a passo; a credencial nunca passa por mim). | Usuário |
| D-3 | Quem valida no celular (precisa de pelo menos dois aparelhos: o seu e o de alguém do grupo). | Usuário |
| D-4 | Como montar o app (aproveitar a interface atual num invólucro de celular ou telas novas): decisão técnica. | Técnica |
