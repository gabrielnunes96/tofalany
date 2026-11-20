import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Nomes dos jogos da Steam (correcoes-atividade, T-7): o nome oficial vem do `appmanifest_<appid>.acf` da biblioteca,
 * casado pela pasta (`installdir`). Sem manifesto, fica o nome da pasta, como antes.
 */

/**
 * AppIDs de programas da Steam que não são jogos. Os de componentes foram conferidos nos appmanifest de uma instalação
 * real (20/11/2026).
 */
export const APPIDS_FERRAMENTAS = new Set([
  '431960', // Wallpaper Engine
  '993090', // Lossless Scaling
  '250820', // SteamVR
  '228980', // Steamworks Common Redistributables
  '1070560', // Steam Linux Runtime 1.0 (scout)
  '1391110', // Steam Linux Runtime 2.0 (soldier)
  '1628350', // Steam Linux Runtime 3.0 (sniper)
  '4183110', // Steam Linux Runtime 4.0
  '1493710', // Proton Experimental
]);

type Valor = string | { [chave: string]: Valor };

/** Lê o formato KeyValues da Valve (`"chave" "valor"` e `"chave" { … }`), usado nos .acf e .vdf. */
export function lerKeyValues(texto: string): { [chave: string]: Valor } {
  // Chaves de bloco e textos entre aspas são tokens diferentes: um valor "}" não fecha o bloco.
  const tokens: { tipo: 'texto' | 'abre' | 'fecha'; v: string }[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  for (let m = re.exec(texto); m; m = re.exec(texto))
    tokens.push(
      m[2] === '{'
        ? { tipo: 'abre', v: '' }
        : m[2] === '}'
          ? { tipo: 'fecha', v: '' }
          : { tipo: 'texto', v: m[1]!.replace(/\\(.)/g, (_t, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c)) },
    );
  let i = 0;
  const bloco = (): { [chave: string]: Valor } => {
    const r: { [chave: string]: Valor } = {};
    while (i < tokens.length && tokens[i]!.tipo !== 'fecha') {
      const chave = tokens[i++]!;
      if (chave.tipo !== 'texto') continue;
      if (tokens[i]?.tipo === 'abre') {
        i++;
        r[chave.v] = bloco();
        i++;
      } else if (tokens[i]?.tipo === 'texto') r[chave.v] = tokens[i++]!.v;
    }
    return r;
  };
  return bloco();
}

/** O que importa de um appmanifest: appid, nome e pasta. */
export function lerManifesto(texto: string): { appid: string; nome: string; pasta: string } | undefined {
  const estado = lerKeyValues(texto).AppState;
  if (!estado || typeof estado === 'string') return undefined;
  const { appid, name, installdir } = estado;
  if (typeof appid !== 'string' || typeof name !== 'string' || typeof installdir !== 'string' || !name.trim()) return undefined;
  return { appid, nome: name.trim(), pasta: installdir };
}

type Arquivos = { listar: (pasta: string) => Promise<string[]>; ler: (arquivo: string) => Promise<string> };
const arquivosDoDisco: Arquivos = { listar: (p) => readdir(p), ler: (a) => readFile(a, 'utf8') };

/**
 * Nome do jogo pela pasta, com cache por biblioteca (`steamapps`). Uma pasta que não está no cache faz reler a
 * biblioteca, no máximo uma vez a cada `releituraMs` (jogo instalado com o app aberto).
 * Devolve `null` quando é uma ferramenta da Steam (não conta como jogo).
 */
export function criarNomesSteam(arquivos: Arquivos = arquivosDoDisco, { agora = () => Date.now(), releituraMs = 5 * 60_000 } = {}) {
  const bibliotecas = new Map<string, { lida: number; porPasta: Map<string, { appid: string; nome: string }> }>();
  async function ler(steamapps: string) {
    const porPasta = new Map<string, { appid: string; nome: string }>();
    const nomes = await arquivos.listar(steamapps).catch(() => [] as string[]);
    for (const n of nomes.filter((x) => /^appmanifest_\d+\.acf$/i.test(x))) {
      const m = lerManifesto(await arquivos.ler(join(steamapps, n)).catch(() => ''));
      if (m) porPasta.set(m.pasta.toLowerCase(), { appid: m.appid, nome: m.nome });
    }
    const b = { lida: agora(), porPasta };
    bibliotecas.set(steamapps, b);
    return b;
  }
  async function porPasta(steamapps: string, pasta: string) {
    let b = bibliotecas.get(steamapps) ?? (await ler(steamapps));
    if (!b.porPasta.has(pasta.toLowerCase()) && agora() - b.lida >= releituraMs) b = await ler(steamapps);
    return b.porPasta.get(pasta.toLowerCase());
  }
  return {
    async nomeDoJogo(steamapps: string, pasta: string): Promise<string | null> {
      const m = await porPasta(steamapps, pasta);
      if (m && APPIDS_FERRAMENTAS.has(m.appid)) return null;
      return m?.nome ?? pasta;
    },
    /** Pelo AppID (Windows, `RunningAppID`): procura o manifesto nas bibliotecas dadas. */
    async nomeDoAppid(bibliotecas: string[], appid: string): Promise<string | null | undefined> {
      if (APPIDS_FERRAMENTAS.has(appid)) return null;
      for (const steamapps of bibliotecas) {
        const m = lerManifesto(await arquivos.ler(join(steamapps, `appmanifest_${appid}.acf`)).catch(() => ''));
        if (m) return m.nome;
      }
      return undefined;
    },
  };
}
export type NomesSteam = ReturnType<typeof criarNomesSteam>;

/**
 * Bibliotecas da Steam (pastas `steamapps`) a partir da pasta da Steam (`SteamPath` no Windows): a própria e as de
 * `steamapps/libraryfolders.vdf` (jogos em outro disco). Sem o arquivo, só a da Steam.
 */
export async function bibliotecasDaSteam(pastaSteam: string, ler: (arquivo: string) => Promise<string> = (a) => readFile(a, 'utf8')): Promise<string[]> {
  const raiz = pastaSteam.replace(/[\\/]+$/, '');
  const pastas = [raiz];
  const vdf = lerKeyValues(await ler(join(raiz, 'steamapps', 'libraryfolders.vdf')).catch(() => '')).libraryfolders;
  if (vdf && typeof vdf !== 'string') {
    for (const b of Object.values(vdf)) {
      const caminho = typeof b === 'string' ? b : b.path;
      if (typeof caminho === 'string' && caminho.trim()) pastas.push(caminho.trim().replace(/[\\/]+$/, ''));
    }
  }
  // Sem repetir a mesma pasta (no Windows o caso das letras varia entre o registro e o vdf).
  const vistas = new Set<string>();
  return pastas.filter((p) => !vistas.has(p.toLowerCase().replace(/\\/g, '/')) && vistas.add(p.toLowerCase().replace(/\\/g, '/'))).map((p) => join(p, 'steamapps'));
}
