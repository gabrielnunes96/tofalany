import { separarComunidade, type ServidorConhecido } from '@tofalando/shared';

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * Backlog v2, item 41: hosts da lista que parecem o endereço antigo do servidor aberto — algum servidor com o
 * mesmo nome e o mesmo caminho (/c/<id>) noutro host (a instalação mudou de VM e de endereço).
 */
export function hostsParecidos(servidores: readonly ServidorConhecido[], atualUrl: string): string[] {
  const nome = servidores.find((s) => s.url === atualUrl)?.nome?.trim();
  const host = hostDe(atualUrl);
  if (!nome || !host) return [];
  const { comunidade } = separarComunidade(atualUrl);
  const hosts = servidores
    .filter((s) => s.nome?.trim() === nome && separarComunidade(s.url).comunidade === comunidade)
    .map((s) => hostDe(s.url))
    .filter((h) => h && h !== host);
  return [...new Set(hosts)];
}

export interface EnderecoAntigo {
  host: string;
  /** Todos os servidores da lista nesse host (o endereço inteiro saiu do ar). */
  urls: string[];
}

/**
 * Procura, entre os hosts parecidos, um que não responde mais. Quem decide tirar da lista é a pessoa (o servidor
 * pode estar só fora do ar por um tempo).
 */
export async function procurarEnderecoAntigo(
  servidores: readonly ServidorConhecido[],
  atualUrl: string,
  responde: (url: string) => Promise<boolean>,
  ignorar: ReadonlySet<string> = new Set(),
): Promise<EnderecoAntigo | null> {
  for (const host of hostsParecidos(servidores, atualUrl)) {
    if (ignorar.has(host)) continue;
    const urls = servidores.filter((s) => hostDe(s.url) === host).map((s) => s.url);
    const base = separarComunidade(urls[0]!).base;
    if (!(await responde(base).catch(() => false))) return { host, urls };
  }
  return null;
}
