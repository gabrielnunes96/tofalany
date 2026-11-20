#!/bin/sh
# Testes E2E sem incomodar quem está usando o PC: tela virtual (Xvfb) e um D-Bus próprio, para nenhuma janela,
# foco, notificação ou som chegar ao desktop. Sem xvfb-run/dbus-run-session, roda no desktop mesmo.
# Os testes de captura de tela ficam de fora aqui (no Xvfb o seletor não acha a tela com dois apps abertos):
# rode a suíte completa com "npm run test:e2e:desktop".
if command -v xvfb-run > /dev/null && command -v dbus-run-session > /dev/null; then
  export TOFALANDO_E2E_ISOLADO=1
  exec xvfb-run -a -s "-screen 0 1920x1080x24" dbus-run-session -- npx playwright test "$@"
fi
exec npx playwright test "$@"
