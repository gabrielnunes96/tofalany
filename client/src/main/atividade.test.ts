import { describe, expect, it, vi } from 'vitest';
import {
  criarAtividade,
  escolherPlayer,
  jogoDaLinhaDeComando,
  caminhoLocalWindows,
  lerSaidaWindows,
  musicaDoWindows,
  musicaNoLinux,
  noWindows,
  playersMpris,
  scriptWindows, jogoDoProcesso, lerAtividadeDoSistema, musicaDoMpris, musicaDoTituloSpotify, pastasSteam } from './atividade';
import { criarNomesSteam } from './steam';

describe('atividade', () => {
  it('jogo pela pasta da Steam (Linux, Proton e Windows); ferramentas da Steam não contam', () => {
    expect(jogoDoProcesso('/home/a/.local/share/Steam/steamapps/common/Hollow Knight/hollow_knight.x86_64')).toBe('Hollow Knight');
    expect(jogoDoProcesso('Z:\\home\\a\\.steam\\steam\\steamapps\\common\\Elden Ring\\Game\\eldenring.exe')).toBe('Elden Ring');
    expect(jogoDoProcesso('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Counter-Strike Global Offensive\\game\\bin\\win64\\cs2.exe')).toBe('Counter-Strike Global Offensive');
    expect(jogoDoProcesso('/home/a/.steam/steam/steamapps/common/Proton 9.0/files/bin/wine64 x')).toBeUndefined();
    expect(jogoDoProcesso('/home/a/.steam/steam/steamapps/common/SteamLinuxRuntime_sniper/run')).toBeUndefined();
    expect(jogoDoProcesso('/usr/bin/firefox')).toBeUndefined();
  });

  it('Spotify: título da janela no Windows e MPRIS no Linux', () => {
    expect(musicaDoTituloSpotify('Legião Urbana - Tempo Perdido')).toEqual({ artista: 'Legião Urbana', titulo: 'Tempo Perdido' });
    expect(musicaDoTituloSpotify('Spotify Premium')).toBeUndefined();
    expect(musicaDoTituloSpotify('Spotify')).toBeUndefined();
    const saida = `method return
   array [
      dict entry(
         string "xesam:artist"
         variant             array [
               string "Djavan"
               string "Gal Costa"
            ]
      )
      dict entry(
         string "xesam:title"
         variant             string "Oceano"
      )
   ]`;
    expect(musicaDoMpris(saida)).toEqual({ titulo: 'Oceano', artista: 'Djavan, Gal Costa' });
    expect(musicaDoMpris('')).toBeUndefined();
  });

  it('nada ligado: não lê o sistema; avisa só quando muda', async () => {
    expect(await lerAtividadeDoSistema({ jogos: false, musica: false })).toBeNull();
    let valor: { jogo?: string } | null = { jogo: 'A' };
    const ler = vi.fn(async () => valor);
    const aoMudar = vi.fn();
    const a = criarAtividade(() => ({ jogos: true, musica: false }), aoMudar, ler, 60_000);
    await a.verificar();
    await a.verificar();
    expect(aoMudar).toHaveBeenCalledTimes(1);
    expect(aoMudar).toHaveBeenLastCalledWith({ jogo: 'A' });
    valor = null;
    await a.verificar();
    expect(aoMudar).toHaveBeenLastCalledWith(null);
    a.parar();
  });

  it('CA-12: pedido durante uma leitura não se perde: roda de novo logo depois, com as preferências novas; rajada vira uma só', async () => {
    let prefs = { jogos: true, musica: false };
    const soltar: (() => void)[] = [];
    const vistas: { jogos: boolean; musica: boolean }[] = [];
    const ler = vi.fn(async (p: { jogos: boolean; musica: boolean }) => {
      vistas.push(p);
      await new Promise<void>((r) => soltar.push(r));
      return p.musica ? { musica: { titulo: 'Oceano' } } : { jogo: 'A' };
    });
    const aoMudar = vi.fn();
    const a = criarAtividade(() => prefs, aoMudar, ler, 60_000);
    // A primeira leitura (do início) está em andamento; a pessoa liga a música e salva três vezes seguidas.
    prefs = { jogos: true, musica: true };
    const pedidos = [a.verificar(), a.verificar(), a.verificar()];
    soltar.shift()!();
    await vi.waitFor(() => expect(soltar).toHaveLength(1));
    soltar.shift()!();
    await Promise.all(pedidos);
    expect(ler).toHaveBeenCalledTimes(2);
    expect(vistas[1]).toEqual({ jogos: true, musica: true });
    expect(aoMudar).toHaveBeenLastCalledWith({ musica: { titulo: 'Oceano' } });
    a.parar();
  });

  it('aviso que falha não perde a mudança (tenta de novo na próxima); depois de parar, não lê mais', async () => {
    const ler = vi.fn(async () => ({ jogo: 'A' }));
    let falhar = true;
    const aoMudar = vi.fn(() => {
      if (falhar) throw new Error('janela recarregando');
    });
    const a = criarAtividade(() => ({ jogos: true, musica: false }), aoMudar, ler, 60_000);
    await a.verificar();
    expect(a.atual()).toBeNull();
    falhar = false;
    await a.verificar();
    expect(aoMudar).toHaveBeenLastCalledWith({ jogo: 'A' });
    expect(a.atual()).toEqual({ jogo: 'A' });
    a.parar();
    const leituras = ler.mock.calls.length;
    await a.verificar();
    expect(ler).toHaveBeenCalledTimes(leituras);
  });

  it('CA-8: Wallpaper Engine e Lossless Scaling não são jogos', () => {
    expect(jogoDoProcesso('C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe')).toBeUndefined();
    expect(jogoDoProcesso('D:\\SteamLibrary\\steamapps\\common\\Lossless Scaling\\LosslessScaling.exe')).toBeUndefined();
  });

  it('pasta da biblioteca: Windows em outro disco, Linux e o Z:\\ do Proton', () => {
    expect(pastasSteam('D:\\SteamLibrary\\steamapps\\common\\dota 2 beta\\game\\bin\\win64\\dota2.exe')).toEqual([
      { pasta: 'dota 2 beta', steamapps: 'D:\\SteamLibrary\\steamapps' },
    ]);
    expect(pastasSteam('Z:\\home\\a\\.steam\\steam\\steamapps\\common\\Hades\\Hades.exe')).toEqual([{ pasta: 'Hades', steamapps: '/home/a/.steam/steam/steamapps' }]);
  });

  it('CA-9: linha de comando com runtime, Proton e o jogo → o jogo, com o nome oficial', async () => {
    const cmdline = [
      '/home/a/.steam/steam/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point',
      '--verb=waitforexitandrun',
      '--',
      '/home/a/.steam/steam/steamapps/common/Proton 9.0/proton',
      'waitforexitandrun',
      'Z:\\home\\a\\.steam\\steam\\steamapps\\common\\Hades\\Hades.exe',
      '',
    ].join('\0');
    const ler = vi.fn(async () => '"AppState" { "appid" "1145360" "name" "Hades" "installdir" "Hades" }');
    const nomes = criarNomesSteam({ listar: async () => ['appmanifest_1145360.acf'], ler });
    expect(await jogoDaLinhaDeComando(cmdline, nomes)).toBe('Hades');
    expect(await jogoDaLinhaDeComando('/usr/bin/firefox\0', nomes)).toBeUndefined();
  });

  it('CA-6: o nome oficial vem do appmanifest (Dota 2, não "dota 2 beta")', async () => {
    const nomes = criarNomesSteam({ listar: async () => ['appmanifest_570.acf'], ler: async () => '"AppState" { "appid" "570" "name" "Dota 2" "installdir" "dota 2 beta" }' });
    expect(await jogoDaLinhaDeComando('/home/a/.steam/steam/steamapps/common/dota 2 beta/game/dota.sh\0', nomes)).toBe('Dota 2');
  });

  const metadata = (titulo: string, artista: string, url?: string) => `method return time=1 sender=:1.9 -> destination=:1.10 serial=8 reply_serial=2
   variant       array [
         dict entry(
            string "mpris:trackid"
            variant                object path "/org/mpris/MediaPlayer2/firefox"
         )
         dict entry(
            string "xesam:title"
            variant                string "${titulo}"
         )
         dict entry(
            string "xesam:artist"
            variant                array [
                  string "${artista}"
               ]
         )${
           url
             ? `
         dict entry(
            string "xesam:url"
            variant                string "${url}"
         )`
             : ''
         }
      ]`;

  it('players do MPRIS na saída do ListNames', () => {
    const saida = `method return
   array [
      string "org.freedesktop.DBus"
      string ":1.7"
      string "org.mpris.MediaPlayer2.firefox.instance_1_123"
      string "org.mpris.MediaPlayer2.spotify"
      string "org.gnome.Shell"
   ]`;
    expect(playersMpris(saida)).toEqual(['org.mpris.MediaPlayer2.firefox.instance_1_123', 'org.mpris.MediaPlayer2.spotify']);
  });

  it('CA-3: navegador tocando no open.spotify.com → Ouvindo', () => {
    const firefox = { nome: 'org.mpris.MediaPlayer2.firefox.instance_1_123', metadata: metadata('Song', 'Band', 'https://open.spotify.com/track/abc') };
    expect(escolherPlayer([firefox])).toEqual({ titulo: 'Song', artista: 'Band' });
  });

  it('CA-4: vídeo do YouTube no navegador não é música; o app do Spotify continua valendo', () => {
    const youtube = { nome: 'org.mpris.MediaPlayer2.firefox.instance_1_123', metadata: metadata('Vídeo', 'Canal', 'https://www.youtube.com/watch?v=x') };
    const semUrl = { nome: 'org.mpris.MediaPlayer2.chromium.instance9', metadata: metadata('Vídeo', 'Canal') };
    expect(escolherPlayer([youtube, semUrl])).toBeUndefined();
    const spotify = { nome: 'org.mpris.MediaPlayer2.spotify', metadata: metadata('Oceano', 'Djavan') };
    expect(escolherPlayer([youtube, spotify])).toEqual({ titulo: 'Oceano', artista: 'Djavan' });
  });

  it('CA-5: nada tocando → sem música', () => {
    expect(escolherPlayer([])).toBeUndefined();
  });

  /** Saída do GetAll de um player: o estado e o Metadata juntos. */
  const getAll = (estado: string, meta: string) => `method return
   array [
      dict entry(
         string "PlaybackStatus"
         variant             string "${estado}"
      )
      dict entry(
         string "Metadata"
${meta.split('\n').slice(1).join('\n')}
      )
   ]`;
  const listNames = (...nomes: string[]) => `method return\n   array [\n${nomes.map((n) => `      string "${n}"`).join('\n')}\n   ]`;
  const firefox = 'org.mpris.MediaPlayer2.firefox.instance_1_123';

  it('CA-5: Linux, a aba do open.spotify.com pausada não conta; tocando, conta', async () => {
    const registrar = vi.fn();
    const dbus = (estado: string) => async (args: string[]) =>
      args.includes('org.freedesktop.DBus.ListNames') ? listNames(firefox) : getAll(estado, metadata('Song', 'Band', 'https://open.spotify.com/track/abc'));
    expect(await musicaNoLinux(registrar, dbus('Paused'))).toBeUndefined();
    expect(await musicaNoLinux(registrar, dbus('Playing'))).toEqual({ titulo: 'Song', artista: 'Band' });
    expect(registrar).not.toHaveBeenCalled();
  });

  it('Linux: um player que não responde não derruba os outros; o log diz o motivo sem o nome do player', async () => {
    const registrar = vi.fn();
    const dbus = async (args: string[]) => {
      if (args.includes('org.freedesktop.DBus.ListNames')) return listNames('org.mpris.MediaPlayer2.vlc', firefox);
      if (args.some((a) => a.includes('vlc'))) throw Object.assign(new Error('Command failed: dbus-send ... vlc'), { killed: true });
      return getAll('Playing', metadata('Song', 'Band', 'https://open.spotify.com/track/abc'));
    };
    expect(await musicaNoLinux(registrar, dbus)).toEqual({ titulo: 'Song', artista: 'Band' });
    expect(registrar).toHaveBeenCalledWith('atividade', 'musica: player tempo esgotado');
  });

  it('Linux: sem dbus-send → log "programa ausente", sem música', async () => {
    const registrar = vi.fn();
    const dbus = async () => {
      throw Object.assign(new Error('spawn dbus-send ENOENT'), { code: 'ENOENT' });
    };
    expect(await musicaNoLinux(registrar, dbus)).toBeUndefined();
    expect(registrar).toHaveBeenCalledWith('atividade', 'musica: D-Bus programa ausente');
  });

  it('título com aspas e barra (o dbus-send não escapa) e Spotify sem título não esconde a aba', () => {
    expect(escolherPlayer([{ nome: firefox, metadata: metadata('Song "Live" \\', 'Band', 'https://open.spotify.com/track/abc') }])).toEqual({
      titulo: 'Song "Live" \\',
      artista: 'Band',
    });
    const anuncio = { nome: 'org.mpris.MediaPlayer2.spotify', metadata: 'method return\n   array [\n   ]' };
    const aba = { nome: firefox, metadata: metadata('Song', 'Band', 'https://open.spotify.com/track/abc') };
    expect(escolherPlayer([anuncio, aba])).toEqual({ titulo: 'Song', artista: 'Band' });
  });

  it('pasta da biblioteca sem o que vem antes do caminho: prefixo de argumento, aspas e dois caminhos', () => {
    expect(pastasSteam('--filesystem=/home/a/.steam/steam/steamapps/common/Hades/')).toEqual([{ pasta: 'Hades', steamapps: '/home/a/.steam/steam/steamapps' }]);
    expect(pastasSteam('"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hades\\Hades.exe" -x')).toEqual([
      { pasta: 'Hades', steamapps: 'C:\\Program Files (x86)\\Steam\\steamapps' },
    ]);
    expect(pastasSteam('/a/steamapps/common/Proton 9.0/proton /b/steamapps/common/Hades/Hades.exe')).toEqual([{ pasta: 'Hades', steamapps: '/b/steamapps' }]);
  });

  describe('Windows (T-4, T-5, T-9)', () => {
    const vazia = { caminhos: [], sessoes: [], janelas: [], erros: [] };
    const nomesFalsos = (manifestos: Record<string, string> = {}) =>
      criarNomesSteam({
        listar: async () => Object.keys(manifestos),
        ler: async (a) => {
          const nome = a.split(/[\\/]/).pop()!;
          if (manifestos[nome] === undefined) throw new Error('não existe');
          return manifestos[nome]!;
        },
      });

    it('script: só as partes ligadas, cada uma no seu try/catch', () => {
      const soJogo = scriptWindows({ jogos: true, musica: false });
      expect(soJogo).toContain('RunningAppID');
      expect(soJogo).not.toContain('GlobalSystemMediaTransportControlsSessionManager');
      const soMusica = scriptWindows({ jogos: false, musica: true });
      expect(soMusica).toContain('GlobalSystemMediaTransportControlsSessionManager');
      expect(soMusica).not.toContain('RunningAppID');
      expect(soMusica.match(/try \{/g)?.length).toBe(2);
    });

    it('lê a saída marcada', () => {
      const l = lerSaidaWindows(
        ['A:570', 'D:c:/program files (x86)/steam', 'M:Spotify.exe\tOceano\tDjavan', 'W:chrome\tSong • Band - Google Chrome', 'E:musica:sessoes de midia indisponiveis', 'lixo'].join('\r\n'),
      );
      expect(l).toEqual({
        appid: '570',
        pastaSteam: 'c:/program files (x86)/steam',
        caminhos: [],
        sessoes: [{ app: 'Spotify.exe', titulo: 'Oceano', artista: 'Djavan' }],
        janelas: [{ processo: 'chrome', titulo: 'Song • Band - Google Chrome' }],
        erros: ['musica: sessoes de midia indisponiveis'],
      });
    });

    it('CA-14b: aba do open.spotify.com no navegador vira música; YouTube não; o app do Spotify vale primeiro', () => {
      const spotifyWeb = { ...vazia, sessoes: [{ app: 'Chrome', titulo: 'Song', artista: 'Band' }], janelas: [{ processo: 'chrome', titulo: 'Song • Band - Google Chrome' }] };
      expect(musicaDoWindows(spotifyWeb)).toEqual({ titulo: 'Song', artista: 'Band' });
      const youtube = { ...vazia, sessoes: [{ app: 'Chrome', titulo: 'Vídeo', artista: 'Canal' }], janelas: [{ processo: 'chrome', titulo: 'Vídeo - YouTube - Google Chrome' }] };
      expect(musicaDoWindows(youtube)).toBeUndefined();
      // Título parecido numa janela que não é de navegador não conta.
      expect(musicaDoWindows({ ...youtube, janelas: [{ processo: 'notepad', titulo: 'Vídeo • Canal' }] })).toBeUndefined();
      expect(musicaDoWindows({ ...spotifyWeb, sessoes: [{ app: 'Spotify.exe', titulo: 'Oceano', artista: 'Djavan' }, ...spotifyWeb.sessoes] })).toEqual({ titulo: 'Oceano', artista: 'Djavan' });
      // Sem sessões de mídia (WinRT indisponível): o título da janela do Spotify, como antes.
      expect(musicaDoWindows({ ...vazia, janelas: [{ processo: 'Spotify', titulo: 'Legião Urbana - Tempo Perdido' }] })).toEqual({ artista: 'Legião Urbana', titulo: 'Tempo Perdido' });
    });

    it('jogo pelo RunningAppID com o nome oficial; ferramenta não conta; sem AppID, pelos caminhos dos processos', async () => {
      const manifestos = {
        'libraryfolders.vdf': '"libraryfolders" { "0" { "path" "C:\\\\Steam" } }',
        'appmanifest_570.acf': '"AppState" { "appid" "570" "name" "Dota 2" "installdir" "dota 2 beta" }',
        'appmanifest_431960.acf': '"AppState" { "appid" "431960" "name" "Wallpaper Engine" "installdir" "wallpaper_engine" }',
      };
      const executar = (saida: string) => async () => ({ saida });
      const registrar = vi.fn();
      const comAppid = await noWindows({ jogos: true, musica: false }, nomesFalsos(manifestos), registrar, executar('A:570\nD:C:\\Steam'));
      expect(comAppid).toEqual({ jogo: 'Dota 2' });
      expect(await noWindows({ jogos: true, musica: false }, nomesFalsos(manifestos), registrar, executar('A:431960\nD:C:\\Steam'))).toEqual({});
      const peloCaminho = await noWindows(
        { jogos: true, musica: false },
        nomesFalsos(manifestos),
        registrar,
        executar('A:0\nD:C:\\Steam\nP:C:\\Steam\\steamapps\\common\\dota 2 beta\\game\\bin\\win64\\dota2.exe'),
      );
      expect(peloCaminho).toEqual({ jogo: 'Dota 2' });
      expect(registrar).not.toHaveBeenCalled();
    });

    it('script: do mais barato ao mais caro (registro, janelas, sessões, processos) e termina com exit 0', () => {
      const script = scriptWindows({ jogos: true, musica: true });
      const pos = ["'A:'", "'W:'", "'M:'", "'P:'"].map((m) => script.indexOf(m));
      expect(pos.every((p) => p >= 0)).toBe(true);
      expect([...pos].sort((a, b) => a - b)).toEqual(pos);
      expect(script.trimEnd().endsWith('exit 0')).toBe(true);
      expect(script).toContain("'E:musica:tempo esgotado'");
    });

    it('segurança: título forjado não troca a pasta da Steam; caminho de rede (UNC) e motivo desconhecido são recusados', () => {
      const forjado = lerSaidaWindows(['A:0', 'D:C:\\Steam', 'M:Chrome\tx', 'D:\\\\host\\share', 'A:570', 'E:musica:Oceano de Djavan'].join('\n'));
      expect(forjado.pastaSteam).toBe('C:\\Steam');
      expect(forjado.appid).toBe('0');
      expect(forjado.erros).toEqual(['musica: erro']);
      expect(lerSaidaWindows('D:\\\\host\\share').pastaSteam).toBeUndefined();
      expect(lerSaidaWindows('P:\\\\host\\share\\steamapps\\common\\x\\x.exe').caminhos).toEqual([]);
      expect(lerSaidaWindows('\uFEFFA:570').appid).toBe('570');
      expect(caminhoLocalWindows('C:\\Steam\\..\\x')).toBe(false);
      expect(caminhoLocalWindows('D:\\SteamLibrary')).toBe(true);
    });

    it('processo fora das bibliotecas da Steam desta máquina não conta', async () => {
      const manifestos = { 'libraryfolders.vdf': '"libraryfolders" { "0" { "path" "C:\\\\Steam" } }' };
      const r = await noWindows({ jogos: true, musica: false }, nomesFalsos(manifestos), vi.fn(), async () => ({
        saida: 'A:0\nD:C:\\Steam\nP:E:\\Outro\\steamapps\\common\\Falso\\f.exe',
      }));
      expect(r).toEqual({});
    });

    it('log: uma linha por parte a cada rodada, com os motivos juntos', async () => {
      const registrar = vi.fn();
      await noWindows({ jogos: false, musica: true }, nomesFalsos(), registrar, async () => ({ saida: 'E:musica:sessoes de midia indisponiveis', erro: { killed: false } }));
      expect(registrar.mock.calls).toEqual([['atividade', 'musica: sessoes de midia indisponiveis; erro ao rodar o PowerShell']]);
    });

    it('CA-10/CA-11: a parte que falha não apaga a outra; o log recebe a parte e um motivo fixo, sem nomes', async () => {
      const registrar = vi.fn();
      const r = await noWindows({ jogos: true, musica: true }, nomesFalsos(), registrar, async () => ({
        saida: 'E:jogo:processos\nW:Spotify\tLegião Urbana - Tempo Perdido\n',
      }));
      expect(r).toEqual({ musica: { artista: 'Legião Urbana', titulo: 'Tempo Perdido' } });
      expect(registrar).toHaveBeenCalledWith('atividade', 'jogo: processos');

      // Tempo esgotado: o que já saiu vale; as duas partes ligadas vão para o log.
      registrar.mockClear();
      const parcial = await noWindows({ jogos: true, musica: true }, nomesFalsos(), registrar, async () => ({
        saida: 'W:Spotify\tLegião Urbana - Tempo Perdido\n',
        erro: { killed: true },
      }));
      expect(parcial.musica).toEqual({ artista: 'Legião Urbana', titulo: 'Tempo Perdido' });
      expect(registrar.mock.calls).toEqual([
        ['atividade', 'jogo: tempo esgotado'],
        ['atividade', 'musica: tempo esgotado'],
      ]);
      for (const [, motivo] of registrar.mock.calls) expect(motivo).not.toMatch(/Legião|Spotify|steamapps/);
    });
  });
});
