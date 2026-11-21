import { ENDERECOS_MOVIDOS, caminhoComunidade, separarComunidade, type ConfiguracoesLocais, type ServidorConhecido } from '@tofalando/shared';

/**
 * infra-e-atualizacao, RF-4 (T-6): para onde foi um servidor salvo num endereço que mudou (só os do mapa fixo, com o
 * host exato e https). Devolve o endereço novo com o mesmo /c/<id>, ou undefined.
 */
export function destinoMovido(url: string, mapa: Readonly<Record<string, string>> = ENDERECOS_MOVIDOS): string | undefined {
  const { base, comunidade } = separarComunidade(url);
  const novo = Object.prototype.hasOwnProperty.call(mapa, base) ? mapa[base] : undefined;
  if (!novo || !base.startsWith('https://') || !novo.startsWith('https://')) return undefined;
  return `${novo}${caminhoComunidade(comunidade)}`;
}

/** Troca a base `de` por `para` num endereço (os de outras bases ficam como estão). */
const mover = (url: string, de: string, para: string) => {
  const { base, comunidade } = separarComunidade(url);
  return base === de ? `${para}${caminhoComunidade(comunidade)}` : url;
};

const moverChaves = <T>(registro: Record<string, T> | undefined, de: string, para: string): Record<string, T> | undefined => {
  if (!registro) return registro;
  const r: Record<string, T> = {};
  for (const [url, valor] of Object.entries(registro)) {
    const novo = mover(url, de, para);
    // O que já existia no endereço novo vale (não é sobrescrito pelo antigo).
    if (!(novo in r) || novo === url) r[novo] = valor;
  }
  return r;
};

/**
 * O que muda nas configurações locais (as preferências por pessoa do endereço antigo podem continuar no arquivo, porque
 * o armazém mescla; ficam sem uso e saem pelo limite de servidores guardados): servidores (inclusive /c/<id>, sem repetir e sem a imagem, que é do host antigo),
 * o servidor aberto, o status escolhido e as preferências por pessoa de cada servidor.
 */
export function moverConfiguracoes(c: ConfiguracoesLocais, de: string, para: string): Partial<ConfiguracoesLocais> {
  // O que já está no endereço novo vale (com o nome e a imagem dele); a entrada antiga equivalente sai.
  const noDestino = new Set((c.servidores ?? []).filter((s) => mover(s.url, de, para) === s.url).map((s) => s.url));
  const vistos = new Set<string>();
  const servidores: ServidorConhecido[] = [];
  for (const s of c.servidores ?? []) {
    const url = mover(s.url, de, para);
    if (vistos.has(url) || (url !== s.url && noDestino.has(url))) continue;
    vistos.add(url);
    servidores.push(url === s.url ? s : { url, ...(s.nome ? { nome: s.nome } : {}) });
  }
  return {
    servidores,
    servidorUrl: c.servidorUrl ? mover(c.servidorUrl, de, para) : c.servidorUrl,
    statusEscolhido: moverChaves(c.statusEscolhido, de, para),
    pessoas: moverChaves(c.pessoas, de, para) ?? {},
  };
}
