# Ajustes da 0.15.1 (pedido do usuário, 12/11/2026)

- Configurações estavam apertadas: abrir numa janela sobre o app, com as seções à esquerda.
- Autenticação em dois fatores com app de autenticação (Google ou Microsoft Authenticator): opcional, 8 códigos de recuperação, o administrador pode desligar, pedida só no login (a sessão salva continua entrando direto).
- Poder ver de novo as notas de atualização (aparecem uma vez só depois de atualizar).
- A loja não explicava como ganhar pontos.
- Sem referências a outros aplicativos em textos e legendas.
- Sai como 0.15.1 (ajustes, não versão nova).

Decisões técnicas: TOTP RFC 6238 (SHA1, 30 s, 6 dígitos, um passo de folga, sem reuso do mesmo código); segredo no banco (migração 018), códigos de recuperação só como hash; QR code gerado no app (pacote `qrcode`, MIT). Servidor sobe antes dos apps (app antigo não sabe pedir o código: quem ligar o 2FA precisa do app 0.15.1).
