import { session } from 'electron';

const LOCAIS = new Set(['file:', 'devtools:', 'data:', 'blob:', 'chrome:', 'about:']);

/**
 * RNF de privacidade (CA-46): a janela só fala com o servidor configurado (mesmo host — o LiveKit fica no
 * mesmo endereço, pela porta dele ou pelo Caddy). Exceções: arquivos do próprio app, o servidor de
 * desenvolvimento, a sondagem `/api/servidor`, que testa um endereço novo antes de ele ser salvo, e a
 * primeira execução (sem servidor salvo ainda).
 */
/** Backlog v2, item 10b: o player do YouTube (modo sem cookies) e o que ele carrega, só com um player aberto. */
const HOSTS_VIDEO = /(^|\.)(youtube-nocookie\.com|youtube\.com|ytimg\.com|googlevideo\.com|ggpht\.com|gstatic\.com|googleapis\.com|google\.com)$/;

/** Hosts das releases do GitHub (backlog v2, 1d): só para pedidos do processo principal, nunca da janela. */
const HOSTS_ATUALIZACAO = /^(github\.com|api\.github\.com|[a-z0-9-]+\.githubusercontent\.com)$/;

export function permitido(
  url: string,
  servidorUrl: string | null,
  urlDev?: string,
  opcoes: { metodo?: string; pendente?: string | null; doProcessoPrincipal?: boolean; videoAberto?: boolean; conhecidos?: readonly string[] } = {},
): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (LOCAIS.has(u.protocol)) return true;
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(u.protocol)) return false;
  if (opcoes.doProcessoPrincipal && u.protocol === 'https:' && HOSTS_ATUALIZACAO.test(u.hostname)) return true;
  if (opcoes.videoAberto && (u.protocol === 'https:' || u.protocol === 'wss:') && HOSTS_VIDEO.test(u.hostname)) return true;
  if (urlDev && (url === urlDev || url.startsWith(urlDev.endsWith('/') ? urlDev : `${urlDev}/`))) return true;
  // Sondagem de endereço novo: só leitura, sem parâmetros (não vira canal para mandar dados a qualquer host).
  const leitura = !opcoes.metodo || opcoes.metodo === 'GET' || opcoes.metodo === 'HEAD';
  if (/^(\/c\/\d{1,9})?\/api\/servidor$/.test(u.pathname) && u.search === '' && leitura && (u.protocol === 'http:' || u.protocol === 'https:')) return true;
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
  // Backlog v2: dos outros servidores em que a pessoa entrou, só a consulta do número de não lidas (o ícone da coluna).
  if (/^(\/c\/\d{1,9})?\/api\/nao-lidas$/.test(u.pathname) && u.search === '' && leitura && (u.protocol === 'http:' || u.protocol === 'https:') && opcoes.conhecidos?.some(mesmoHost)) return true;
  // O servidor do convite em andamento (já testado) vale até a pessoa entrar e ele virar o salvo.
  return mesmoHost(servidorUrl) || mesmoHost(opcoes.pendente);
}

/** Liga o filtro na sessão padrão; `registrar` recebe cada pedido (para depurar e para os testes de ponta a ponta). */
export function filtrarRede(
  servidorUrl: () => string | null,
  urlDev?: string,
  registrar?: (url: string, ok: boolean) => void,
  pendente: () => string | null = () => null,
  videoAberto: () => boolean = () => false,
  conhecidos: () => readonly string[] = () => [],
) {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (detalhe, responder) => {
    // Sem webContents: pedido do processo principal (a atualização automática), não da janela.
    const ok = permitido(detalhe.url, servidorUrl(), urlDev, { metodo: detalhe.method, pendente: pendente(), doProcessoPrincipal: detalhe.webContentsId === undefined, videoAberto: videoAberto(), conhecidos: conhecidos() });
    registrar?.(detalhe.url, ok);
    if (!ok) console.warn('Bloqueado (fora do servidor configurado):', new URL(detalhe.url).origin);
    responder({ cancel: !ok });
  });
  // Backlog v2, item 10b: o YouTube recusa player embutido sem Referer ("erro 153"); a janela carrega de um
  // arquivo local, que não manda. Só no player sem cookies, a referência é o endereço do servidor do grupo.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube-nocookie.com/*'] }, (detalhe, responder) => {
    const servidor = servidorUrl();
    const cabecalhos = { ...detalhe.requestHeaders };
    if (servidor && !cabecalhos.Referer) cabecalhos.Referer = `${new URL(servidor).origin}/`;
    responder({ requestHeaders: cabecalhos });
  });
}
