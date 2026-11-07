import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { CARENCIA_OFFLINE_MS_PADRAO, LIMITE_CONTAS_PADRAO, PRAZO_AUDITORIA_DIAS_PADRAO } from '@tofalando/shared';

export interface Config {
  porta: number;
  host: string;
  nomeServidor: string;
  limiteContas: number;
  versao: string;
  log: boolean;
  /** Arquivo do SQLite (":memory:" nos testes). */
  caminhoBanco: string;
  /** Código de convite inicial (RN-1); depois da primeira subida vale o do banco. */
  codigoConvite: string | undefined;
  /** Tentativas de cadastro/login por IP por minuto. */
  tentativasPorMinuto: number;
  /** Atrás do Caddy (VPS): usa o IP real do cabeçalho X-Forwarded-For. */
  atrasDeProxy: boolean;
  /** De quanto em quanto tempo as conexões em tempo real reconferem a sessão no banco. */
  intervaloSessaoMs: number;
  /** RN-23: dias que a auditoria guarda. */
  prazoAuditoriaDias: number;
  /** RN-24: carência antes de registrar "offline". */
  carenciaOfflineMs: number;
  /**
   * Pasta dos arquivos enviados (avatares, anexos, sons). Sem ARQUIVOS: "arquivos" ao lado do banco;
   * com banco em memória (testes), uma pasta temporária.
   */
  pastaArquivos: string | undefined;
  /** Endereço público do servidor para montar o link de convite (sem ele, usa o endereço da requisição). */
  urlPublica: string | undefined;
  /** Pasta com os instaladores oferecidos na página do convite (DOWNLOADS; padrão: "downloads" ao lado do banco). */
  pastaDownloads: string | undefined;
  /**
   * LiveKit (voz, vídeo e tela). `url` é o endereço que o app usa (ws:// ou wss://); sem url, chave e
   * segredo, a voz fica indisponível (503 voz_indisponivel) e o resto do servidor funciona.
   */
  livekit: { url: string; urlInterna: string; chave: string; segredo: string } | undefined;
  /**
   * Backlog v2, item 14: bot de música (precisa do LiveKit, do yt-dlp e do ffmpeg). MUSICA=false desliga;
   * MUSICA_YTDLP_ARGS são argumentos a mais do yt-dlp (na imagem: o runtime de JavaScript).
   */
  musica: { ligada: boolean; ytdlp: string; ffmpeg: string; extras: string[]; cookies: string | undefined };
}

type Ambiente = Record<string, string | undefined>;

function inteiro(nome: string, valor: string | undefined, padrao: number, minimo: number, maximo = Number.MAX_SAFE_INTEGER): number {
  if (valor === undefined || valor === '') return padrao;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < minimo || n > maximo) {
    throw new Error(`${nome} deve ser um inteiro entre ${minimo} e ${maximo} (recebido: ${valor}).`);
  }
  return n;
}

function lerVersao(): string {
  const pacote = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  return pacote.version;
}

/** Lê a configuração das variáveis de ambiente (arquivo de ambiente do docker-compose). */
export function lerConfig(ambiente: Ambiente = process.env): Config {
  return {
    porta: inteiro('PORTA', ambiente.PORTA, 3000, 1, 65535),
    host: ambiente.HOST || '0.0.0.0',
    nomeServidor: ambiente.NOME_SERVIDOR || 'ToFalany',
    limiteContas: inteiro('LIMITE_CONTAS', ambiente.LIMITE_CONTAS, LIMITE_CONTAS_PADRAO, 1),
    versao: lerVersao(),
    log: ambiente.LOG !== 'false',
    caminhoBanco: ambiente.BANCO || 'data/tofalando.db',
    codigoConvite: ambiente.CODIGO_CONVITE?.trim() || undefined,
    tentativasPorMinuto: inteiro('TENTATIVAS_POR_MINUTO', ambiente.TENTATIVAS_POR_MINUTO, 10, 1),
    atrasDeProxy: ambiente.ATRAS_DE_PROXY === 'true',
    intervaloSessaoMs: inteiro('INTERVALO_SESSAO_MS', ambiente.INTERVALO_SESSAO_MS, 30_000, 50),
    prazoAuditoriaDias: inteiro('AUDITORIA_DIAS', ambiente.AUDITORIA_DIAS, PRAZO_AUDITORIA_DIAS_PADRAO, 1),
    pastaArquivos: ambiente.ARQUIVOS || undefined,
    urlPublica: ambiente.URL_PUBLICA?.trim().replace(/\/+$/, '') || undefined,
    pastaDownloads: ambiente.DOWNLOADS || undefined,
    carenciaOfflineMs: inteiro('CARENCIA_OFFLINE_MS', ambiente.CARENCIA_OFFLINE_MS, CARENCIA_OFFLINE_MS_PADRAO, 0),
    livekit: lerLivekit(ambiente),
    musica: {
      ligada: ambiente.MUSICA !== 'false',
      ytdlp: ambiente.MUSICA_YTDLP || 'yt-dlp',
      ffmpeg: ambiente.MUSICA_FFMPEG || 'ffmpeg',
      extras: (ambiente.MUSICA_YTDLP_ARGS ?? '').split(/\s+/).filter(Boolean),
      // Cookies de uma conta do YouTube (o YouTube recusa IP de datacenter sem login). O administrador envia pelo app.
      cookies: ambiente.MUSICA_COOKIES || ((ambiente.BANCO || 'data/tofalando.db') === ':memory:' ? undefined : join(dirname(ambiente.BANCO || 'data/tofalando.db'), 'musica-cookies.txt')),
    },
  };
}

function lerLivekit(ambiente: Ambiente): Config['livekit'] {
  const url = ambiente.LIVEKIT_URL?.trim().replace(/\/+$/, '');
  const chave = ambiente.LIVEKIT_API_KEY?.trim();
  const segredo = ambiente.LIVEKIT_API_SECRET?.trim();
  if (!url && !chave && !segredo) return undefined;
  if (!url || !chave || !segredo) throw new Error('Para a voz, defina LIVEKIT_URL, LIVEKIT_API_KEY e LIVEKIT_API_SECRET juntos.');
  if (!/^wss?:\/\//.test(url)) throw new Error(`LIVEKIT_URL deve começar com ws:// ou wss:// (recebido: ${url}).`);
  // Endereço que o servidor usa para falar com o LiveKit (ex.: http://livekit:7880 no docker-compose).
  const urlInterna = ambiente.LIVEKIT_URL_INTERNA?.trim().replace(/\/+$/, '') || url;
  if (!/^(wss?|https?):\/\//.test(urlInterna)) throw new Error(`LIVEKIT_URL_INTERNA deve começar com http(s):// ou ws(s):// (recebido: ${urlInterna}).`);
  return { url, urlInterna, chave, segredo };
}
