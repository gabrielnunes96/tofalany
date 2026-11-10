import { describe, expect, it, vi } from 'vitest';
import { criarAtividade, jogoDoProcesso, lerAtividadeDoSistema, musicaDoMpris, musicaDoTituloSpotify } from './atividade';

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
});
