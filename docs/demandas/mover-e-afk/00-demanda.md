# Demanda: mover-e-afk

Itens do backlog (docs/demandas/to-falando-v2/00-backlog.md), pedidos de 20/11:

- **43. Mover membros entre salas de voz:** quem tem a permissão nova "Mover membros" (o administrador sempre pode) move alguém que está em chamada para outra sala de voz, arrastando o nome da pessoa para outra sala ou pelo clique direito → "Mover para…". Também "Desconectar da chamada". A pessoa entra na outra sala sozinha, mantendo microfone, câmera e transmissão como estavam, e vê "Fulano moveu você para a sala X". Registra na auditoria. Não dá para mover um administrador sem ser administrador; a sala de destino precisa existir e a pessoa precisa poder entrar na voz.
- **42. Sala de AFK:** o administrador marca um canal de voz como sala de AFK e escolhe o tempo. Quem fica esse tempo sem falar e sem mexer no computador vai sozinho para a sala de AFK, com aviso para a própria pessoa e um som discreto para quem continua na sala. Na sala de AFK a pessoa entra mutada e não fala até sair. Quem transmite a tela ou está com a câmera ligada não é movido. O canal de AFK tem ícone próprio na lista.

Respostas do Gabriel em 21/11:
- Quem foi para a AFK fica lá ao voltar a mexer no computador (sai quando quiser, clicando noutra sala).
- Tempo padrão da AFK: 15 minutos (opções 5, 10, 15, 30 ou 60).
- Quem está sozinho na sala também vai para a AFK.
- "Mover membros" também permite "Desconectar da chamada".
