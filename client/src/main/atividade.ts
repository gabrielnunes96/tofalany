import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { lerAtividade, type AtividadeDto, type PreferenciasAtividade } from '@tofalando/shared';
import type { Registrar } from './registro';
import { criarNomesSteam, type NomesSteam } from './steam';

/**
 * Atividade, só com o que a pessoa ligou nas configurações:
 * - jogo: um processo rodando de dentro de `steamapps/common/<Nome do jogo>/` (Windows e Linux, Proton incluído);
 * - música: o que o Spotify está tocando (Linux pelo MPRIS no D-Bus; Windows pelo título da janela do Spotify).
 * Nada sai do computador sem a pessoa ligar. O nome é o oficial, do `appmanifest` da Steam (sem ele, o da pasta),
 * sem lista de jogos; ferramentas da Steam não contam (correcoes-atividade, T-7 e T-8).
 */

/** Pastas de `steamapps/common` que não são jogos (ferramentas da Steam). */
const NAO_JOGOS = /^(proton\b|steamworks shared|steamlinuxruntime|steam linux runtime|steamvr|steam controller configs|wallpaper_engine|lossless scaling)/i;

/**
 * Pastas de jogo da Steam num caminho ou argumento (`.../steamapps/common/<pasta>/...`), na ordem em que aparecem, sem
 * as ferramentas. `steamapps` é a pasta da biblioteca (onde ficam os `appmanifest`); o `Z:\` do Proton vira `/`.
 */
export function pastasSteam(texto: string): { pasta: string; steamapps: string }[] {
  const r: { pasta: string; steamapps: string }[] = [];
  for (const m of texto.matchAll(/steamapps[\\/]common[\\/]([^\\/\0"]+)[\\/]/gi)) {
    const pasta = m[1]!.trim();
    if (!pasta || NAO_JOGOS.test(pasta)) continue;
    let steamapps = texto.slice(0, m.index + 'steamapps'.length);
    if (/^z:\\/i.test(steamapps)) steamapps = steamapps.slice(2).replace(/\\/g, '/');
    r.push({ pasta, steamapps });
  }
  return r;
}

/** Nome da pasta do jogo pela linha de comando ou caminho de um processo (undefined = não é um jogo da Steam). */
export function jogoDoProcesso(comando: string): string | undefined {
  return pastasSteam(comando)[0]?.pasta;
}

/**
 * Jogo de uma linha de comando do Linux (`/proc/<pid>/cmdline`, argumentos separados por `\0`): cada argumento é olhado
 * à parte (o runtime e o Proton vêm antes do jogo, RF-6). Devolve o nome oficial, ou undefined.
 */
export async function jogoDaLinhaDeComando(cmdline: string, nomes: NomesSteam): Promise<string | undefined> {
  for (const argumento of cmdline.split('\0')) {
    for (const { pasta, steamapps } of pastasSteam(argumento)) {
      const nome = await nomes.nomeDoJogo(steamapps, pasta);
      if (nome) return nome;
    }
  }
  return undefined;
}

/** Título da janela do Spotify no Windows ("Artista - Música" tocando; "Spotify…" pausado). */
export function musicaDoTituloSpotify(titulo: string): AtividadeDto['musica'] {
  const t = titulo.trim();
  if (!t || /^spotify( premium| free)?$/i.test(t)) return undefined;
  const i = t.indexOf(' - ');
  if (i <= 0) return undefined;
  return { artista: t.slice(0, i).trim(), titulo: t.slice(i + 3).trim() };
}

/** Saída do `dbus-send --print-reply` com o Metadata do MPRIS → título e artista. */
export function musicaDoMpris(metadata: string): AtividadeDto['musica'] {
  const titulo = /"xesam:title"\s*variant\s+string\s+"((?:[^"\\]|\\.)*)"/.exec(metadata)?.[1];
  const artistas = /"xesam:artist"\s*variant\s+array\s*\[([^\]]*)\]/.exec(metadata)?.[1];
  const artista = artistas ? [...artistas.matchAll(/string\s+"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]).join(', ') : undefined;
  if (!titulo) return undefined;
  return artista ? { titulo, artista } : { titulo };
}

const rodar = (cmd: string, args: string[], tempoMs = 5000) =>
  new Promise<string>((resolve, reject) =>
    execFile(cmd, args, { timeout: tempoMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (erro, saida) => (erro ? reject(erro) : resolve(String(saida)))),
  );

async function jogoNoLinux(nomes: NomesSteam): Promise<string | undefined> {
  const pids = (await readdir('/proc')).filter((p) => /^\d+$/.test(p));
  for (const pid of pids) {
    const cmd = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
    const jogo = cmd && (await jogoDaLinhaDeComando(cmd, nomes));
    if (jogo) return jogo;
  }
  return undefined;
}

async function musicaNoLinux(): Promise<AtividadeDto['musica']> {
  const destino = '--dest=org.mpris.MediaPlayer2.spotify';
  const ler = (prop: string) =>
    rodar(
      'dbus-send',
      [
        '--session',
        '--print-reply',
        destino,
        '/org/mpris/MediaPlayer2',
        'org.freedesktop.DBus.Properties.Get',
        'string:org.mpris.MediaPlayer2.Player',
        `string:${prop}`,
      ],
      2000,
    );
  const estado = await ler('PlaybackStatus').catch(() => '');
  if (!/"Playing"/.test(estado)) return undefined;
  return musicaDoMpris(await ler('Metadata').catch(() => ''));
}

/** Windows: um PowerShell só para os caminhos dos processos e o título da janela do Spotify. */
async function noWindows(prefs: PreferenciasAtividade): Promise<AtividadeDto> {
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    prefs.jogos ? "Get-Process | ForEach-Object { if ($_.Path) { 'P:' + $_.Path } }" : '',
    prefs.musica ? "Get-Process Spotify | Where-Object { $_.MainWindowTitle } | ForEach-Object { 'S:' + $_.MainWindowTitle }" : '',
  ]
    .filter(Boolean)
    .join('; ');
  const saida = await rodar(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${script}`],
    8000,
  ).catch(() => '');
  const r: AtividadeDto = {};
  for (const linha of saida.split(/\r?\n/)) {
    if (!r.jogo && linha.startsWith('P:')) r.jogo = jogoDoProcesso(linha.slice(2));
    else if (!r.musica && linha.startsWith('S:')) r.musica = musicaDoTituloSpotify(linha.slice(2));
  }
  return r;
}

/** O que está acontecendo agora, só do que foi ligado. */
/** Nomes da Steam guardados entre as leituras (a cada 20 s). */
const nomesPadrao = criarNomesSteam();
const naoRegistrar: Registrar = () => undefined;

export async function lerAtividadeDoSistema(
  prefs: PreferenciasAtividade,
  plataforma: NodeJS.Platform = process.platform,
  { nomes = nomesPadrao, registrar = naoRegistrar }: { nomes?: NomesSteam; registrar?: Registrar } = {},
): Promise<AtividadeDto | null> {
  if (!prefs.jogos && !prefs.musica) return null;
  if (plataforma === 'win32') return lerAtividade(await noWindows(prefs));
  if (plataforma !== 'linux') return null;
  const [jogo, musica] = await Promise.all([
    prefs.jogos
      ? jogoNoLinux(nomes).catch(() => {
          // Motivo fixo (RN-9): nada do erro, que pode trazer caminhos e nomes de processos.
          registrar('atividade', 'jogo: erro ao ler os processos');
          return undefined;
        })
      : undefined,
    prefs.musica ? musicaNoLinux().catch(() => undefined) : undefined,
  ]);
  return lerAtividade({ jogo, musica });
}

/** Confere a cada `intervaloMs` e avisa só quando muda (e na hora, quando as preferências mudam). */
export function criarAtividade(
  preferencias: () => PreferenciasAtividade,
  aoMudar: (a: AtividadeDto | null) => void,
  ler: (p: PreferenciasAtividade) => Promise<AtividadeDto | null> = (p) => lerAtividadeDoSistema(p),
  intervaloMs = 20_000,
) {
  let atual: AtividadeDto | null = null;
  let emAndamento: Promise<void> | null = null;
  let pendente = false;
  let parado = false;
  const rodada = async () => {
    const nova = await ler(preferencias()).catch(() => null);
    if (JSON.stringify(nova) === JSON.stringify(atual)) return;
    try {
      aoMudar(nova);
      atual = nova;
    } catch {
      // Avisar falhou (janela recarregando): `atual` fica como estava e a próxima rodada tenta de novo.
    }
  };
  /**
   * Pedido no meio de uma leitura (ligou uma opção, RF-9) não se perde: marca `pendente` e a leitura roda de novo logo
   * depois, com as preferências novas. Vários pedidos durante a mesma leitura viram uma releitura só.
   */
  const verificar = (): Promise<void> => {
    if (parado) return Promise.resolve();
    if (emAndamento) {
      pendente = true;
      return emAndamento;
    }
    emAndamento = (async () => {
      try {
        do {
          pendente = false;
          await rodada();
        } while (pendente && !parado);
      } finally {
        emAndamento = null;
      }
    })();
    return emAndamento;
  };
  const relogio = setInterval(() => void verificar(), intervaloMs);
  relogio.unref?.();
  void verificar();
  return {
    verificar,
    atual: () => atual,
    parar: () => {
      parado = true;
      clearInterval(relogio);
    },
  };
}
