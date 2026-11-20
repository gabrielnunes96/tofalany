# Validações pelo usuário — to-falando-v1

Testes que precisam de duas pessoas, de hardware real ou de outra máquina. Os testes automáticos cobrem o comportamento com mídia falsa e dois apps na mesma máquina; esta lista é o que só dá para conferir de verdade. Cada item cita a tarefa (card em `cards/`).

## Preparação

1. Gere os instaladores (`npm run dist:linux` e `npm run dist:win`) e suba o servidor pelo README: [Tailscale](../../../README.md#servidor-via-tailscale) ou [VPS](../../../README.md#servidor-numa-vps-com-https).
2. Duas pessoas (ou duas máquinas) com o app instalado. Para os itens de 3 pessoas, uma terceira.

## Instalação e link de convite

- [ ] **T24**: instalar o .deb (`sudo apt install ./tofalany_*.deb`) e abrir pelo menu de aplicativos.
- [ ] **T24**: rodar o AppImage e conferir que o atalho aparece no menu.
- [ ] **T24 / T7**: com o app instalado (.deb, AppImage e .exe), abrir o link de convite no navegador e clicar no botão. O app deve abrir com o cadastro preenchido.
- [ ] **T24**: instalar o .exe no Windows. O aviso do SmartScreen deve aparecer e passar por "Mais informações" e depois "Executar assim mesmo".

## Servidor

- [ ] **T25**: servidor numa VPS com domínio e HTTPS (Caddy), seguindo só o README (CA-47).
- [ ] **T25**: servidor via Tailscale, acessado de outra máquina do tailnet (CA-47).
- [ ] **T25**: CA-44 numa máquina arm64 (Oracle). Aqui o build arm64 não foi feito, porque exigiria instalar o emulador do Docker.
- [ ] **T26**: backup manual, atualização com `VERSAO` nova e volta para a anterior, como no README.

## Voz

- [ ] **T14**: conversar de verdade em duas máquinas (ouvir e ver o indicador de fala acender).
- [ ] **T14**: entrar com o mesmo usuário em dois computadores. O primeiro deve sair da voz.
- [ ] **T15**: CA-26 com ruído real (ventilador perto do microfone), com a supressão de ruído ligada e desligada.
- [ ] **T15**: trocar fone ou caixa de som durante uma chamada.
- [ ] **T16**: CA-22, push-to-talk com outro app (um jogo) em primeiro plano.
- [ ] **T16**: atalhos globais no Windows instalado.
- [ ] **T16 / T26**: atalhos numa sessão Wayland: com uma janela nativa em foco não disparam (limitação documentada); com um jogo pelo XWayland devem funcionar.
- [ ] **T17**: ouvir os sons de entrar e sair e o volume por pessoa acima de 100%.
- [ ] **T17**: CA-27 com três pessoas (o ajuste de volume vale só para quem ajustou).
- [ ] **T23**: CA-42, tirar o cabo ou o Wi-Fi por 10 s numa chamada. O app deve mostrar "reconectando" e voltar sozinho.

## Soundboard

- [ ] **T18**: cadastrar um MP3 seu e ouvir a prévia.
- [ ] **T19**: tocar um som e ouvir em outra máquina. Quem está em outro canal não deve ouvir.

## Câmera e tela

- [ ] **T20**: webcam real. A luz deve apagar ao desligar a câmera e ao sair da voz.
- [ ] **T21**: transmitir uma janela de verdade para outra máquina e assistir em tela cheia.
- [ ] **T21**: no Windows, o seletor deve mostrar as janelas abertas.
- [ ] **T22**: CA-39, transmissão 1440p60 de verdade (2560×1440, de 50 a 60 quadros, e a banda da [tabela](../../../README.md#tabela-de-banda)).
- [ ] **T22**: CA-40 no Windows, transmitir com o áudio de um vídeo. Confira também se a voz da chamada volta como eco para quem assiste. O loopback captura todo o áudio do sistema; **se houver eco, é preciso decidir uma mitigação**.
- [ ] **T22**: uma tela 16:10 em 720p30 não deve ser silenciada pelo servidor.

## Presença e notificações

- [ ] **T13 / T29**: notificação real do sistema (Linux e Windows instalado), com e sem som, e o clique nela abrindo a conversa.
- [ ] **T28**: deixar o computador parado 10 minutos. A outra pessoa deve ver o status amarelo (ausente). Ao voltar a mexer, o status atualiza em até 15 s.
- [ ] **T28 / T26**: numa sessão Wayland, conferir se o ausente funciona. Em algumas sessões, o tempo ocioso vem sempre zerado (limitação documentada).

## Desempenho

- [ ] **T23**: memória do app ocioso no Windows instalado (Gerenciador de Tarefas). A meta é menos de 300 MB. No Linux, o E2E mede pelo PSS.
