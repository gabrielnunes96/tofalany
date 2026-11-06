import { session } from 'electron';

const LOCAIS = new Set(['file:', 'devtools:', 'data:', 'blob:', 'chrome:', 'about:']);

/**
 * RNF de privacidade (CA-46): a janela só fala com o servidor configurado (mesmo host — o LiveKit fica no
 * mesmo endereço, pela porta dele ou pelo Caddy). Exceções: arquivos do próprio app, o servidor de
 * desenvolvimento, a sondagem `/api/servidor`, que testa um endereço novo antes de ele ser salvo, e a
 * primeira execução (sem servidor salvo ainda).
 */
export function permitido(url: string, servidorUrl: string | null, urlDev?: string, opcoes: { metodo?: string; pendente?: string | null } = {}): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (LOCAIS.has(u.protocol)) return true;
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) return false;
  if (urlDev && (url === urlDev || url.startsWith(urlDev.endsWith('/') ? urlDev : `${urlDev}/`))) return true;
  // Sondagem de endereço novo: só leitura, sem parâmetros (não vira canal para mandar dados a qualquer host).
  const leitura = !opcoes.metodo || opcoes.metodo === 'GET' || opcoes.metodo === 'HEAD';
  if (u.pathname === '/api/servidor' && u.search === '' && leitura && (u.protocol === 'http:' || u.protocol === 'https:')) return true;
  // Primeira execução (ou convite num app novo): ainda não há servidor escolhido, nada a proteger.
  if (!servidorUrl) return true;
  const mesmoHost = (base: string | null | undefined) => {
    if (!base) return false;
    try {
      return u.hostname === new URL(base).hostname;
    } catch {
      return false;
    }
  };
  // O servidor do convite em andamento (já testado) vale até a pessoa entrar e ele virar o salvo.
  return mesmoHost(servidorUrl) || mesmoHost(opcoes.pendente);
}

/** Liga o filtro na sessão padrão; `registrar` recebe cada pedido (para depurar e para os testes de ponta a ponta). */
export function filtrarRede(servidorUrl: () => string | null, urlDev?: string, registrar?: (url: string, ok: boolean) => void, pendente: () => string | null = () => null) {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (detalhe, responder) => {
    const ok = permitido(detalhe.url, servidorUrl(), urlDev, { metodo: detalhe.method, pendente: pendente() });
    registrar?.(detalhe.url, ok);
    if (!ok) console.warn('Bloqueado (fora do servidor configurado):', new URL(detalhe.url).origin);
    responder({ cancel: !ok });
  });
}
