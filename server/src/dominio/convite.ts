import type { Config } from '../config.js';

/** Primeiro valor de um cabeçalho que pode vir repetido ou separado por vírgula ("a, b"). */
function primeiro(valor: string | string[] | undefined): string | undefined {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return v?.split(',')[0]?.trim() || undefined;
}

/**
 * Endereço do servidor como a pessoa o vê, para montar links: URL_PUBLICA; senão, atrás do proxy,
 * os cabeçalhos X-Forwarded-*; senão, o host da conexão.
 */
export function baseDoServidor(
  config: Config,
  cabecalhos: Record<string, string | string[] | undefined>,
  seguro: boolean,
): string {
  if (config.urlPublica) return config.urlPublica;
  const protocolo = (config.atrasDeProxy && primeiro(cabecalhos['x-forwarded-proto'])) || (seguro ? 'https' : 'http');
  const host = (config.atrasDeProxy && primeiro(cabecalhos['x-forwarded-host'])) || primeiro(cabecalhos.host) || 'localhost';
  return `${protocolo}://${host}`;
}

export const montarLinkConvite = (base: string, codigo: string): string => `${base}/convite/${encodeURIComponent(codigo)}`;
