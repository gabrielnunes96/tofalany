import { MENSAGEM_MAX, NOME_CANAL_MAX, NOME_EXIBICAO_MAX, SENHA_MAX, SENHA_MIN, USUARIO_MAX, USUARIO_MIN } from './limites.js';

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

const PADRAO_USUARIO = /^[a-zA-Z0-9_.-]+$/;

/** RN-3: login único sem diferenciar maiúsculas; letras sem acento, números, ponto, hífen e sublinhado. */
export function validarUsuario(texto: string): Resultado<string> {
  const usuario = texto.trim();
  if (usuario.length < USUARIO_MIN || usuario.length > USUARIO_MAX) {
    return { ok: false, erro: `O nome de usuário deve ter de ${USUARIO_MIN} a ${USUARIO_MAX} caracteres.` };
  }
  if (!PADRAO_USUARIO.test(usuario)) {
    return { ok: false, erro: 'Use só letras sem acento, números, ponto, hífen ou sublinhado no nome de usuário.' };
  }
  return { ok: true, valor: usuario };
}

/** Forma usada para comparar logins (RN-3). */
export function normalizarUsuario(usuario: string): string {
  return usuario.trim().toLowerCase();
}

export function validarSenha(senha: string): Resultado<string> {
  if (senha.length < SENHA_MIN) return { ok: false, erro: `A senha deve ter pelo menos ${SENHA_MIN} caracteres.` };
  if (senha.length > SENHA_MAX) return { ok: false, erro: `A senha deve ter no máximo ${SENHA_MAX} caracteres.` };
  return { ok: true, valor: senha };
}

/** Nome de exibição: 1 a 32 caracteres visíveis, sem quebras de linha nem caracteres de controle. */
export function validarNomeExibicao(texto: string): Resultado<string> {
  const nome = texto.trim().replace(/\s+/g, ' ');
  if (!nome) return { ok: false, erro: 'Informe o nome de exibição.' };
  if ([...nome].length > NOME_EXIBICAO_MAX) return { ok: false, erro: `O nome de exibição deve ter no máximo ${NOME_EXIBICAO_MAX} caracteres.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(nome)) return { ok: false, erro: 'O nome de exibição tem caracteres inválidos.' };
  return { ok: true, valor: nome };
}

/** RN-1: código de convite trocado pelo administrador — 6 a 64 caracteres, letras sem acento, números, hífen e sublinhado. */
export function validarCodigoConvite(texto: string): Resultado<string> {
  const codigo = texto.trim();
  if (codigo.length < 6 || codigo.length > 64) return { ok: false, erro: 'O código deve ter de 6 a 64 caracteres.' };
  if (!/^[A-Za-z0-9_-]+$/.test(codigo)) return { ok: false, erro: 'Use só letras sem acento, números, hífen ou sublinhado no código.' };
  return { ok: true, valor: codigo };
}

/** Cor do perfil no formato #rrggbb (minúsculas). */
export function validarCor(texto: string): Resultado<string> {
  const cor = texto.trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(cor) ? { ok: true, valor: cor } : { ok: false, erro: 'Cor inválida.' };
}

export interface ConviteLink {
  servidor: string;
  codigo: string;
}

/** Lê tofalany://convite?servidor=…&codigo=… (vindo do sistema operacional, então tudo é conferido). */
export function lerLinkConvite(texto: string): ConviteLink | undefined {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'tofalany:') return undefined;
  // "tofalany://convite?…" tem host "convite"; aceita também "tofalany:convite?…".
  const destino = (url.host || url.pathname).replace(/^\/+|\/+$/g, '');
  if (destino !== 'convite') return undefined;
  const servidor = normalizarUrlServidor(url.searchParams.get('servidor') ?? '');
  const codigo = validarCodigoConvite(url.searchParams.get('codigo') ?? '');
  if (!servidor.ok || !codigo.ok) return undefined;
  return { servidor: servidor.valor, codigo: codigo.valor };
}

/** Monta o link que abre o app a partir do servidor e do código. */
export function montarLinkApp(servidor: string, codigo: string): string {
  return `tofalany://convite?servidor=${encodeURIComponent(servidor)}&codigo=${encodeURIComponent(codigo)}`;
}

/** Nome de canal: 1 a 32 caracteres visíveis, espaços normalizados. */
export function validarNomeCanal(texto: string): Resultado<string> {
  const nome = texto.trim().replace(/\s+/g, ' ');
  if (!nome) return { ok: false, erro: 'Informe o nome do canal.' };
  if ([...nome].length > NOME_CANAL_MAX) return { ok: false, erro: `O nome do canal deve ter no máximo ${NOME_CANAL_MAX} caracteres.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(nome)) return { ok: false, erro: 'O nome do canal tem caracteres inválidos.' };
  return { ok: true, valor: nome };
}

/** Texto de mensagem: sem espaços nas pontas, não vazio, até 4000 caracteres. */
export function validarTextoMensagem(texto: string): Resultado<string> {
  const limpo = texto.replace(/^\s+|\s+$/g, '');
  if (!limpo) return { ok: false, erro: 'A mensagem está vazia.' };
  if ([...limpo].length > MENSAGEM_MAX) return { ok: false, erro: `A mensagem deve ter no máximo ${MENSAGEM_MAX} caracteres.` };
  return { ok: true, valor: limpo };
}
