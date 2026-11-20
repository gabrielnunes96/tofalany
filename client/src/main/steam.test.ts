import { describe, expect, it, vi } from 'vitest';
import { criarNomesSteam, lerKeyValues, lerManifesto } from './steam';

const manifesto = (appid: string, nome: string, pasta: string) => `"AppState"
{
\t"appid"\t\t"${appid}"
\t"Universe"\t\t"1"
\t"name"\t\t"${nome}"
\t"StateFlags"\t\t"4"
\t"installdir"\t\t"${pasta}"
\t"UserConfig"
\t{
\t\t"language"\t\t"brazilian"
\t}
}
`;

/** Disco falso: pasta → arquivos (nome → conteúdo). */
function disco(pastas: Record<string, Record<string, string>>) {
  const listar = vi.fn(async (p: string) => {
    if (!pastas[p]) throw new Error('não existe');
    return Object.keys(pastas[p]);
  });
  const ler = vi.fn(async (a: string) => {
    const i = Math.max(a.lastIndexOf('/'), a.lastIndexOf('\\'));
    const conteudo = pastas[a.slice(0, i)]?.[a.slice(i + 1)];
    if (conteudo === undefined) throw new Error('não existe');
    return conteudo;
  });
  return { listar, ler };
}

describe('Steam: KeyValues e appmanifest (correcoes-atividade, T-7)', () => {
  it('lê chaves, blocos aninhados e escapes', () => {
    expect(lerKeyValues('"a" { "b" "1" "c" { "d" "x \\"y\\"" } } "e" "2"')).toEqual({ a: { b: '1', c: { d: 'x "y"' } }, e: '2' });
    expect(lerKeyValues('')).toEqual({});
    expect(lerKeyValues('"a" {')).toEqual({ a: {} });
  });

  it('appmanifest → appid, nome e pasta; inválido → undefined', () => {
    expect(lerManifesto(manifesto('570', 'Dota 2', 'dota 2 beta'))).toEqual({ appid: '570', nome: 'Dota 2', pasta: 'dota 2 beta' });
    expect(lerManifesto('"AppState" { "appid" "1" }')).toBeUndefined();
    expect(lerManifesto('lixo')).toBeUndefined();
  });

  it('CA-6/CA-7: nome oficial pela pasta (sem diferença de maiúsculas); sem manifesto, o nome da pasta', async () => {
    const steamapps = '/jogos/SteamLibrary/steamapps';
    const nomes = criarNomesSteam(disco({ [steamapps]: { 'appmanifest_570.acf': manifesto('570', 'Dota 2', 'dota 2 beta'), 'libraryfolders.vdf': '' } }));
    expect(await nomes.nomeDoJogo(steamapps, 'dota 2 beta')).toBe('Dota 2');
    expect(await nomes.nomeDoJogo(steamapps, 'Dota 2 Beta')).toBe('Dota 2');
    expect(await nomes.nomeDoJogo(steamapps, 'Jogo Sem Manifesto')).toBe('Jogo Sem Manifesto');
    expect(await nomes.nomeDoJogo('/nao/existe/steamapps', 'Hades')).toBe('Hades');
  });

  it('CA-8: ferramenta da Steam pelo AppID não conta como jogo (null)', async () => {
    const steamapps = 'C:\\Steam\\steamapps';
    const nomes = criarNomesSteam(disco({ [steamapps]: { 'appmanifest_431960.acf': manifesto('431960', 'Wallpaper Engine', 'wallpaper_engine_v2') } }));
    expect(await nomes.nomeDoJogo(steamapps, 'wallpaper_engine_v2')).toBeNull();
    expect(await nomes.nomeDoAppid([steamapps], '431960')).toBeNull();
  });

  it('cache por biblioteca: relê só quando a pasta é nova e passou o intervalo', async () => {
    const steamapps = '/s/steamapps';
    const pastas: Record<string, Record<string, string>> = { [steamapps]: {} };
    const d = disco(pastas);
    let agora = 0;
    const nomes = criarNomesSteam(d, { agora: () => agora, releituraMs: 1000 });
    expect(await nomes.nomeDoJogo(steamapps, 'Hades')).toBe('Hades');
    pastas[steamapps]!['appmanifest_1145360.acf'] = manifesto('1145360', 'Hades', 'Hades');
    pastas[steamapps]!['appmanifest_367520.acf'] = manifesto('367520', 'Hollow Knight', 'Hollow Knight');
    await nomes.nomeDoJogo(steamapps, 'Hollow Knight');
    expect(d.listar).toHaveBeenCalledTimes(1);
    agora = 1000;
    expect(await nomes.nomeDoJogo(steamapps, 'Hollow Knight')).toBe('Hollow Knight');
    expect(d.listar).toHaveBeenCalledTimes(2);
  });

  it('nome pelo AppID nas bibliotecas (Windows, RunningAppID); sem manifesto em nenhuma → undefined', async () => {
    const nomes = criarNomesSteam(disco({ 'C:\\Steam\\steamapps': {}, 'D:\\SteamLibrary\\steamapps': { 'appmanifest_570.acf': manifesto('570', 'Dota 2', 'dota 2 beta') } }));
    expect(await nomes.nomeDoAppid(['C:\\Steam\\steamapps', 'D:\\SteamLibrary\\steamapps'], '570')).toBe('Dota 2');
    expect(await nomes.nomeDoAppid(['C:\\Steam\\steamapps'], '570')).toBeUndefined();
  });
});
