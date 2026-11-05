export type Resultado<T> = { ok: true; valor: T } | { ok: false; erro: string };

/**
 * Normaliza o endereço digitado pelo usuário para a origem do servidor.
 * Sem esquema, assume http:// (cenário Tailscale); aceita só http e https.
 */
export function normalizarUrlServidor(texto: string): Resultado<string> {
  const limpo = texto.trim();
  if (!limpo) return { ok: false, erro: 'Informe o endereço do servidor.' };
  const comEsquema = /^[a-z][a-z0-9+.-]*:\/\//i.test(limpo) ? limpo : `http://${limpo}`;
  let url: URL;
  try {
    url = new URL(comEsquema);
  } catch {
    return { ok: false, erro: 'Endereço inválido.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, erro: 'Use um endereço http:// ou https://.' };
  }
  if (!url.hostname) return { ok: false, erro: 'Endereço inválido.' };
  return { ok: true, valor: url.origin };
}
