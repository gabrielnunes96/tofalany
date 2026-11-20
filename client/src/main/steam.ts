import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Nomes dos jogos da Steam (correcoes-atividade, T-7): o nome oficial vem do `appmanifest_<appid>.acf` da biblioteca,
 * casado pela pasta (`installdir`). Sem manifesto, fica o nome da pasta, como antes.
 */

/** AppIDs de programas da Steam que não são jogos (papel de parede, escala, VR, componentes). */
export const APPIDS_FERRAMENTAS = new Set(['431960', '993090', '250820', '228980', '1070560', '1391110', '1628350', '4183110', '1493710']);

type Valor = string | { [chave: string]: Valor };

/** Lê o formato KeyValues da Valve (`"chave" "valor"` e `"chave" { … }`), usado nos .acf e .vdf. */
export function lerKeyValues(texto: string): { [chave: string]: Valor } {
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  for (let m = re.exec(texto); m; m = re.exec(texto)) tokens.push(m[2] ?? m[1]!.replace(/\\(.)/g, (_t, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c)));
  let i = 0;
  const bloco = (): { [chave: string]: Valor } => {
    const r: { [chave: string]: Valor } = {};
    while (i < tokens.length && tokens[i] !== '}') {
      const chave = tokens[i++]!;
      if (tokens[i] === '{') {
        i++;
        r[chave] = bloco();
        i++;
      } else if (i < tokens.length && tokens[i] !== '}') r[chave] = tokens[i++]!;
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
