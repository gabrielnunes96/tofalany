import { execFile } from 'node:child_process';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { lerAtividade, type AtividadeDto, type PreferenciasAtividade } from '@tofalando/shared';
import type { Registrar } from './registro';
import { bibliotecasDaSteam, criarNomesSteam, type NomesSteam } from './steam';

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
  // A biblioteca começa no início absoluto do próprio caminho (`/` ou `C:\`), não no começo do texto: argumentos como
  // `--filesystem=/…` ou um caminho entre aspas não entram nela.
  for (const m of texto.matchAll(/((?:[a-z]:\\|\/)[^\0"=]*?steamapps)[\\/]common[\\/]([^\\/\0"]+)[\\/]/gi)) {
    const pasta = m[2]!.trim();
    if (!pasta || NAO_JOGOS.test(pasta)) continue;
    let steamapps = m[1]!;
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
export async function jogoDaLinhaDeComando(
  cmdline: string,
  nomes: NomesSteam,
  permitida: (steamapps: string) => Promise<boolean> = async () => true,
): Promise<string | undefined> {
  for (const argumento of cmdline.split('\0')) {
    for (const { pasta, steamapps } of pastasSteam(argumento)) {
      // Só bibliotecas da Steam desta pessoa: a linha de comando de outro processo não escolhe que pasta é lida.
      if (!(await permitida(steamapps))) continue;
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

/**
 * Valor de texto de uma chave na saída do `dbus-send --print-reply`. O valor vai até o fim da linha: o `dbus-send` não
 * escapa aspas (`string "Song "Live""`), então casar até a próxima aspa cortaria o título.
 */
function textoDbus(saida: string, chave: string): string | undefined {
  const re = new RegExp(`"${chave.replace(/[.:]/g, '\\$&')}"\\s*\\n\\s*variant\\s+string "(.*)"$`, 'm');
  return re.exec(saida)?.[1];
}

/** Saída do `dbus-send --print-reply` com o Metadata do MPRIS → título e artista. */
export function musicaDoMpris(metadata: string): AtividadeDto['musica'] {
  const titulo = textoDbus(metadata, 'xesam:title');
  const bloco = /"xesam:artist"\s*\n\s*variant\s+array \[\n((?:[ \t]*string ".*"\n)*)/.exec(metadata)?.[1];
  const artista = bloco ? [...bloco.matchAll(/^\s*string "(.*)"$/gm)].map((m) => m[1]).join(', ') : undefined;
  if (!titulo) return undefined;
  return artista ? { titulo, artista } : { titulo };
}

const rodar = (cmd: string, args: string[], tempoMs = 5000) =>
  new Promise<string>((resolve, reject) =>
    execFile(cmd, args, { timeout: tempoMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (erro, saida) => (erro ? reject(erro) : resolve(String(saida)))),
  );

/** Pastas da Steam no Linux (instalação comum, o atalho `~/.steam/steam` e o Flatpak). */
const PASTAS_STEAM_LINUX = ['.local/share/Steam', '.steam/steam', '.var/app/com.valvesoftware.Steam/.local/share/Steam'];

/** Bibliotecas da Steam desta pessoa no Linux, com o caminho real (o `~/.steam/steam` costuma ser um atalho). */
async function bibliotecasNoLinux(): Promise<Set<string>> {
  const r = new Set<string>();
  for (const pasta of PASTAS_STEAM_LINUX) {
    const raiz = await realpath(join(homedir(), pasta)).catch(() => undefined);
    if (!raiz) continue;
    for (const b of await bibliotecasDaSteam(raiz)) r.add(await realpath(b).catch(() => b));
  }
  return r;
}

async function jogoNoLinux(nomes: NomesSteam): Promise<string | undefined> {
  const pids = (await readdir('/proc')).filter((p) => /^\d+$/.test(p));
  const conhecidas = await bibliotecasNoLinux();
  const permitida = async (steamapps: string) => conhecidas.has(await realpath(steamapps).catch(() => steamapps));
  for (const pid of pids) {
    const cmd = await readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '');
    const jogo = cmd && (await jogoDaLinhaDeComando(cmd, nomes, permitida));
    if (jogo) return jogo;
  }
  return undefined;
}

/** `xesam:url` do Metadata do MPRIS (o endereço da página, nos players de navegador). */
export function urlDoMpris(metadata: string): string | undefined {
  return textoDbus(metadata, 'xesam:url');
}

/** Nomes `org.mpris.MediaPlayer2.*` na saída do `ListNames` do D-Bus. */
export function playersMpris(saida: string): string[] {
  return [...saida.matchAll(/string\s+"(org\.mpris\.MediaPlayer2\.[^"]+)"/g)].map((m) => m[1]!);
}

/**
 * Música entre os players que estão tocando (RN-4): o app do Spotify, ou um navegador numa faixa do open.spotify.com.
 * Qualquer outra mídia (um vídeo no navegador) não vira "Ouvindo". Vale o primeiro com título (um player sem Metadata,
 * ou o Spotify num anúncio, não esconde outro).
 */
export function escolherPlayer(tocando: { nome: string; metadata: string }[]): AtividadeDto['musica'] {
  for (const p of tocando) {
    if (p.nome !== 'org.mpris.MediaPlayer2.spotify' && !(urlDoMpris(p.metadata) ?? '').startsWith('https://open.spotify.com/')) continue;
    const musica = musicaDoMpris(p.metadata);
    if (musica) return musica;
  }
  return undefined;
}

/** Motivo fixo para o log a partir de um erro do `execFile` (RN-9: nada da mensagem, que traz o comando e a saída). */
export function motivoDoErro(e: unknown): string {
  const erro = e as { code?: unknown; killed?: boolean } | null;
  if (erro?.code === 'ENOENT') return 'programa ausente';
  if (erro?.killed) return 'tempo esgotado';
  return typeof erro?.code === 'number' ? `erro ${erro.code}` : 'erro';
}

type Dbus = (args: string[]) => Promise<string>;
const dbusSend: Dbus = (args) => rodar('dbus-send', ['--session', '--print-reply', ...args], 2000);

/**
 * Linux: os players do MPRIS (`ListNames`), cada um lido com um `GetAll` só (estado e Metadata juntos), todos ao mesmo
 * tempo: um player travado custa no máximo o prazo de 2 s, não 2 s por player.
 */
export async function musicaNoLinux(registrar: Registrar, dbus: Dbus = dbusSend): Promise<AtividadeDto['musica']> {
  let lista: string;
  try {
    lista = await dbus(['--dest=org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.ListNames']);
  } catch (e) {
    registrar('atividade', `musica: D-Bus ${motivoDoErro(e)}`);
    return undefined;
  }
  const falhas: string[] = [];
  const leituras = await Promise.all(
    playersMpris(lista).map((nome) =>
      dbus([`--dest=${nome}`, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties.GetAll', 'string:org.mpris.MediaPlayer2.Player']).then(
        (saida) => ({ nome, saida }),
        (e: unknown) => {
          falhas.push(motivoDoErro(e));
          return null;
        },
      ),
    ),
  );
  // Sem o nome do player (RN-9): só que um deles não respondeu e por quê.
  if (falhas.length) registrar('atividade', `musica: player ${falhas[0]}`);
  const tocando = leituras.filter((l): l is { nome: string; saida: string } => !!l && textoDbus(l.saida, 'PlaybackStatus') === 'Playing');
  return escolherPlayer(tocando.map((l) => ({ nome: l.nome, metadata: l.saida })));
}

/**
 * Windows (correcoes-atividade, T-4, T-5, T-9): um PowerShell só, com cada parte num try/catch e linhas marcadas, do
 * mais barato ao mais caro (se o prazo estourar, o que já saiu vale, RN-7):
 * - `A:` RunningAppID e `D:` SteamPath (registro da Steam, sem privilégio);
 * - `W:` títulos de janela do Spotify e dos navegadores (processo e título);
 * - `M:` sessões de mídia do sistema tocando (app, título, artista, separados por tab), com prazo total de 2,5 s;
 * - `P:` caminhos de processos em `steamapps\common`, só quando nenhum jogo está marcado como rodando (o mais lento);
 * - `E:<parte>:<motivo>` quando uma parte falha (motivos fixos, RN-9).
 * Todo valor sai sem quebra de linha nem tab (um título não forja outra linha). Termina com `exit 0`: um `Get-Process`
 * de um nome que não está aberto deixa `$?` falso, e o PowerShell sairia com código 1 sem ter falhado.
 */
export function scriptWindows(prefs: PreferenciasAtividade): string {
  const partes = [
    "$ErrorActionPreference='SilentlyContinue'",
    '[Console]::OutputEncoding=New-Object System.Text.UTF8Encoding $false',
    "function Limpo($v) { ([string]$v) -replace '[\\t\\r\\n]', ' ' }",
  ];
  if (prefs.jogos)
    partes.push(
      "$appid = ''",
      "try { $k = Get-ItemProperty -Path 'HKCU:\\Software\\Valve\\Steam' -ErrorAction Stop; $appid = Limpo $k.RunningAppID; 'A:' + $appid; 'D:' + (Limpo $k.SteamPath) } catch { }",
    );
  if (prefs.musica)
    partes.push(
      "try { Get-Process Spotify,chrome,msedge,firefox,brave,opera,vivaldi | Where-Object { $_.MainWindowTitle } | ForEach-Object { 'W:' + (Limpo $_.ProcessName) + \"`t\" + (Limpo $_.MainWindowTitle) } } catch { }",
      [
        'try {',
        '$relogio = [Diagnostics.Stopwatch]::StartNew()',
        'Add-Type -AssemblyName System.Runtime.WindowsRuntime',
        "$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]",
        'function Esperar($op, $tipo) { $resta = 2500 - $relogio.ElapsedMilliseconds; if ($resta -le 0) { throw "tempo" }; $t = $asTask.MakeGenericMethod($tipo).Invoke($null, @($op)); if (-not $t.Wait([int]$resta)) { throw "tempo" }; $t.Result }',
        '$tipoGerente = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]',
        '$tipoProps = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]',
        '$gerente = Esperar ($tipoGerente::RequestAsync()) $tipoGerente',
        'foreach ($s in $gerente.GetSessions()) {',
        "  if ([string]$s.GetPlaybackInfo().PlaybackStatus -ne 'Playing') { continue }",
        '  $p = Esperar ($s.TryGetMediaPropertiesAsync()) $tipoProps',
        "  'M:' + (Limpo $s.SourceAppUserModelId) + \"`t\" + (Limpo $p.Title) + \"`t\" + (Limpo $p.Artist)",
        '}',
        "} catch { if ($_.Exception.Message -eq 'tempo' -or $_.Exception.InnerException.Message -eq 'tempo') { 'E:musica:tempo esgotado' } else { 'E:musica:sessoes de midia indisponiveis' } }",
      ].join('\n'),
    );
  if (prefs.jogos)
    partes.push(
      "if (-not $appid -or $appid -eq '0') { try { Get-Process | ForEach-Object { if ($_.Path -match 'steamapps\\\\common') { 'P:' + (Limpo $_.Path) } } } catch { 'E:jogo:processos' } }",
    );
  partes.push('exit 0');
  return partes.join('\n');
}

export type LeituraWindows = {
  appid?: string;
  pastaSteam?: string;
  caminhos: string[];
  sessoes: { app: string; titulo: string; artista: string }[];
  janelas: { processo: string; titulo: string }[];
  erros: string[];
};

/** Motivos que o script pode emitir em `E:` (RN-9: qualquer outra coisa vira um motivo genérico, sem o texto). */
const ERROS_CONHECIDOS = new Set(['jogo: processos', 'musica: tempo esgotado', 'musica: sessoes de midia indisponiveis']);

/** Caminho local do Windows (`C:\…`), sem `..`: nada de caminho de rede (UNC), que dispararia autenticação SMB. */
export function caminhoLocalWindows(p: string): boolean {
  return /^[a-z]:[\\/]/i.test(p) && !/(^|[\\/])\.\.([\\/]|$)/.test(p);
}

/** Interpreta a saída de `scriptWindows`. Só o primeiro `A:` e `D:` valem (o script os emite antes de tudo). */
export function lerSaidaWindows(saida: string): LeituraWindows {
  const r: LeituraWindows = { caminhos: [], sessoes: [], janelas: [], erros: [] };
  for (const linha of saida.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const valor = linha.slice(2);
    if (linha.startsWith('A:')) r.appid ??= valor.trim();
    else if (linha.startsWith('D:')) r.pastaSteam ??= valor.trim();
    else if (linha.startsWith('P:')) {
      if (caminhoLocalWindows(valor)) r.caminhos.push(valor);
    } else if (linha.startsWith('M:')) {
      const [app = '', titulo = '', artista = ''] = valor.split('\t');
      if (titulo.trim()) r.sessoes.push({ app, titulo: titulo.trim(), artista: artista.trim() });
    } else if (linha.startsWith('W:')) {
      const t = valor.indexOf('\t');
      if (t > 0) r.janelas.push({ processo: valor.slice(0, t), titulo: valor.slice(t + 1) });
    } else if (linha.startsWith('E:')) {
      const e = valor.replace(':', ': ');
      r.erros.push(ERROS_CONHECIDOS.has(e) ? e : `${e.startsWith('jogo') ? 'jogo' : 'musica'}: erro`);
    }
  }
  if (r.pastaSteam !== undefined && !caminhoLocalWindows(r.pastaSteam)) delete r.pastaSteam;
  return r;
}

const NAVEGADORES = /^(chrome|msedge|firefox|brave|opera|vivaldi)$/i;

/**
 * Música no Windows (RN-4, RF-11): a sessão de mídia do app do Spotify; ou a de um navegador quando o título de uma
 * janela dele começa com "título • artista" (o título da aba do open.spotify.com tocando; a sessão não traz o
 * endereço da página, R-3). Se nenhuma sessão casar (ou o WinRT faltar), o título da janela do Spotify, como antes.
 */
export function musicaDoWindows(l: LeituraWindows): AtividadeDto['musica'] {
  const doApp = l.sessoes.find((s) => /spotify/i.test(s.app));
  if (doApp) return doApp.artista ? { titulo: doApp.titulo, artista: doApp.artista } : { titulo: doApp.titulo };
  const abas = l.janelas.filter((j) => NAVEGADORES.test(j.processo)).map((j) => j.titulo);
  for (const s of l.sessoes) {
    if (!s.artista) continue;
    if (abas.some((t) => t.startsWith(`${s.titulo} • ${s.artista}`))) return { titulo: s.titulo, artista: s.artista };
  }
  for (const j of l.janelas) {
    if (!/^spotify$/i.test(j.processo)) continue;
    const m = musicaDoTituloSpotify(j.titulo);
    if (m) return m;
  }
  return undefined;
}

const chaveWindows = (p: string) => p.toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '');

/**
 * Jogo no Windows: pelo RunningAppID (nome do appmanifest); sem ele, pelos caminhos dos processos, só dentro das
 * bibliotecas da Steam desta máquina. Com RunningAppID e sem manifesto achado, fica sem jogo (os caminhos só são
 * listados quando não há RunningAppID, que é a parte lenta).
 */
export async function jogoDoWindows(l: LeituraWindows, nomes: NomesSteam, ler?: (arquivo: string) => Promise<string>): Promise<string | undefined> {
  const bibliotecas = l.pastaSteam ? await bibliotecasDaSteam(l.pastaSteam, ler) : [];
  if (l.appid && l.appid !== '0' && /^\d+$/.test(l.appid) && bibliotecas.length) {
    const nome = await nomes.nomeDoAppid(bibliotecas.filter(caminhoLocalWindows), l.appid);
    if (nome !== undefined) return nome ?? undefined;
  }
  const permitidas = new Set(bibliotecas.map(chaveWindows));
  for (const caminho of l.caminhos) {
    for (const { pasta, steamapps } of pastasSteam(caminho)) {
      if (!permitidas.has(chaveWindows(steamapps))) continue;
      const nome = await nomes.nomeDoJogo(steamapps, pasta);
      if (nome) return nome;
    }
  }
  return undefined;
}

type Executar = (script: string) => Promise<{ saida: string; erro?: { killed?: boolean } | null }>;
const executarPowerShell: Executar = (script) =>
  new Promise((resolve) =>
    execFile(
      'powershell.exe',
      // Codificado (UTF-16LE em base64): aspas e quebras de linha do script não passam pelas regras da linha de comando.
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { timeout: 6000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      // Com erro ou tempo esgotado, o que já saiu ainda vale (a parte que terminou não se perde, RN-7).
      (erro, saida) => resolve({ saida: String(saida ?? ''), erro }),
    ),
  );

export async function noWindows(prefs: PreferenciasAtividade, nomes: NomesSteam, registrar: Registrar, executar: Executar = executarPowerShell): Promise<AtividadeDto> {
  const { saida, erro } = await executar(scriptWindows(prefs));
  const l = lerSaidaWindows(saida);
  // Uma linha por parte a cada rodada, com os motivos juntos (sem linhas alternadas no log).
  const motivos: Record<'jogo' | 'musica', string[]> = { jogo: [], musica: [] };
  for (const e of l.erros) motivos[e.startsWith('jogo') ? 'jogo' : 'musica'].push(e.slice(e.indexOf(':') + 2));
  if (erro) {
    const motivo = erro.killed ? 'tempo esgotado' : 'erro ao rodar o PowerShell';
    if (prefs.jogos) motivos.jogo.push(motivo);
    if (prefs.musica) motivos.musica.push(motivo);
  }
  const r: AtividadeDto = {};
  if (prefs.jogos) {
    const jogo = await jogoDoWindows(l, nomes).catch(() => {
      motivos.jogo.push('erro ao ler a biblioteca da Steam');
      return undefined;
    });
    if (jogo) r.jogo = jogo;
  }
  if (prefs.musica) {
    const musica = musicaDoWindows(l);
    if (musica) r.musica = musica;
  }
  for (const parte of ['jogo', 'musica'] as const) if (motivos[parte].length) registrar('atividade', `${parte}: ${[...new Set(motivos[parte])].join('; ')}`);
  return r;
}

/** Nomes da Steam guardados entre as leituras (a cada 20 s). */
const nomesPadrao = criarNomesSteam();
const naoRegistrar: Registrar = () => undefined;

/** O que está acontecendo agora, só do que foi ligado. */
export async function lerAtividadeDoSistema(
  prefs: PreferenciasAtividade,
  plataforma: NodeJS.Platform = process.platform,
  { nomes = nomesPadrao, registrar = naoRegistrar }: { nomes?: NomesSteam; registrar?: Registrar } = {},
): Promise<AtividadeDto | null> {
  if (!prefs.jogos && !prefs.musica) return null;
  if (plataforma === 'win32') return lerAtividade(await noWindows(prefs, nomes, registrar));
  if (plataforma !== 'linux') return null;
  const [jogo, musica] = await Promise.all([
    prefs.jogos
      ? jogoNoLinux(nomes).catch(() => {
          // Motivo fixo (RN-9): nada do erro, que pode trazer caminhos e nomes de processos.
          registrar('atividade', 'jogo: erro ao ler os processos');
          return undefined;
        })
      : undefined,
    prefs.musica ? musicaNoLinux(registrar).catch(() => undefined) : undefined,
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
