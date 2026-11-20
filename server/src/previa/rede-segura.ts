import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

/**
 * Backlog v2, item 10b: o servidor busca páginas que as pessoas colam no chat. Sem cuidado, um link para
 * http://127.0.0.1:7880 ou para a rede da VPS faria o servidor acessar o que não deve (SSRF). Aqui só passam
 * endereços públicos, por HTTP(S), em portas web, com limite de tempo, de tamanho e de redirecionamentos.
 */
const PRIVADOS = new BlockList();
for (const [rede, prefixo] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  PRIVADOS.addSubnet(rede, prefixo, 'ipv4');
for (const [rede, prefixo] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const)
  PRIVADOS.addSubnet(rede, prefixo, 'ipv6');

export function ipPrivado(ip: string): boolean {
  const tipo = isIP(ip);
  if (tipo === 4) return PRIVADOS.check(ip, 'ipv4');
  if (tipo === 6) {
    const mapeado = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapeado) return PRIVADOS.check(mapeado[1]!, 'ipv4');
    return PRIVADOS.check(ip, 'ipv6');
  }
  return true;
}

export type Resolver = (host: string) => Promise<string[]>;
const resolverPadrao: Resolver = async (host) => (await lookup(host, { all: true })).map((r) => r.address);

/** O endereço pode ser buscado pelo servidor? (HTTP(S), porta web, host público). */
export async function urlPublica(texto: string, resolver: Resolver = resolverPadrao): Promise<URL | undefined> {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (url.username || url.password) return undefined;
  if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) return undefined;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return undefined;
  let ips: string[];
  try {
    ips = isIP(host) ? [host] : await resolver(host);
  } catch {
    return undefined;
  }
  if (ips.length === 0 || ips.some(ipPrivado)) return undefined;
  return url;
}

export interface Resposta {
  url: string;
  tipo: string;
  corpo: Buffer;
}

/**
 * GET com as travas: cada redirecionamento é conferido de novo; para de ler ao passar de `limite` bytes.
 * Devolve undefined se não der (erro, tempo, tamanho, host proibido, status ruim).
 */
export async function buscarSeguro(
  texto: string,
  opcoes: { limite: number; tempoMs?: number; aceitar?: string; resolver?: Resolver; buscar?: typeof fetch } = { limite: 512 * 1024 },
): Promise<Resposta | undefined> {
  const buscar = opcoes.buscar ?? fetch;
  let atual = texto;
  const sinal = AbortSignal.timeout(opcoes.tempoMs ?? 5000);
  for (let salto = 0; salto < 4; salto++) {
    const url = await urlPublica(atual, opcoes.resolver);
    if (!url) return undefined;
    let r: Response;
    try {
      r = await buscar(url, {
        redirect: 'manual',
        signal: sinal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; ToFalanyPrevia/1.0)', accept: opcoes.aceitar ?? 'text/html,*/*;q=0.5', 'accept-language': 'pt-BR,pt;q=0.9' },
      });
    } catch {
      return undefined;
    }
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get('location');
      await r.body?.cancel().catch(() => undefined);
      if (!destino) return undefined;
      atual = new URL(destino, url).toString();
      continue;
    }
    if (!r.ok || !r.body) return undefined;
    const tamanho = Number(r.headers.get('content-length') ?? 0);
    if (tamanho > opcoes.limite) {
      await r.body.cancel().catch(() => undefined);
      return undefined;
    }
    const partes: Buffer[] = [];
    let total = 0;
    const leitor = r.body.getReader();
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        total += value.byteLength;
        if (total > opcoes.limite) {
          // HTML grande: o <head> já veio; imagem grande: desiste.
          if ((r.headers.get('content-type') ?? '').includes('text/html')) {
            partes.push(Buffer.from(value));
            break;
          }
          return undefined;
        }
        partes.push(Buffer.from(value));
      }
    } catch {
      return undefined;
    } finally {
      await leitor.cancel().catch(() => undefined);
    }
    return { url: url.toString(), tipo: r.headers.get('content-type') ?? '', corpo: Buffer.concat(partes) };
  }
  return undefined;
}
