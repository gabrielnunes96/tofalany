import { describe, expect, it, vi } from 'vitest';
import { criarAtividade, escolherPlayer, jogoDaLinhaDeComando, playersMpris, jogoDoProcesso, lerAtividadeDoSistema, musicaDoMpris, musicaDoTituloSpotify, pastasSteam } from './atividade';
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
});
