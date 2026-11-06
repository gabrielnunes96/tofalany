import { AUDIO_PADRAO, NOTIFICACOES_PADRAO, SONS_PADRAO, type PreferenciasAudio, type PreferenciasNotificacoes, type PreferenciasPessoas, type PreferenciasSons } from './protocolo.js';
import { MENSAGEM_MAX, NOME_CANAL_MAX, NOME_EXIBICAO_MAX, NOME_SOM_MAX, SENHA_MAX, SENHA_MIN, USUARIO_MAX, USUARIO_MIN } from './limites.js';

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

/** Nome de som do soundboard: 1 a NOME_SOM_MAX caracteres visíveis. */
export function validarNomeSom(texto: string): Resultado<string> {
  const nome = texto.trim().replace(/\s+/g, ' ');
  if (!nome) return { ok: false, erro: 'Informe o nome do som.' };
  if ([...nome].length > NOME_SOM_MAX) return { ok: false, erro: `O nome do som deve ter no máximo ${NOME_SOM_MAX} caracteres.` };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(nome)) return { ok: false, erro: 'O nome do som tem caracteres inválidos.' };
  return { ok: true, valor: nome };
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

/** Aplica sobre `base` só os campos de áudio válidos de `bruto` (configuração local vinda do disco ou do renderer). */
export function mesclarAudio(base: PreferenciasAudio = AUDIO_PADRAO, bruto: unknown): PreferenciasAudio {
  const r: PreferenciasAudio = { ...base };
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as Record<string, unknown>;
  const id = (v: unknown) => v === null || (typeof v === 'string' && v.length > 0 && v.length <= 256);
  if ('entradaId' in o && id(o.entradaId)) r.entradaId = o.entradaId as string | null;
  if ('saidaId' in o && id(o.saidaId)) r.saidaId = o.saidaId as string | null;
  for (const chave of ['supressaoRuido', 'cancelamentoEco', 'ganhoAutomatico'] as const) if (typeof o[chave] === 'boolean') r[chave] = o[chave] as boolean;
  const s = o.sensibilidadeDb;
  if (typeof s === 'number' && Number.isFinite(s) && s >= -100 && s <= 0) r.sensibilidadeDb = Math.round(s);
  if (o.modoMicrofone === 'deteccao' || o.modoMicrofone === 'ptt') r.modoMicrofone = o.modoMicrofone;
  return r;
}

/** Volume máximo por pessoa (200%, RF-19). */
export const VOLUME_PESSOA_MAX = 2;

/** Valida volume e silêncio por servidor (no máximo 20 servidores e 200 pessoas cada, para o arquivo não crescer sem fim). */
export function mesclarPessoas(base: Record<string, PreferenciasPessoas>, bruto: unknown): Record<string, PreferenciasPessoas> {
  const r: Record<string, PreferenciasPessoas> = { ...base };
  if (!bruto || typeof bruto !== 'object') return r;
  for (const [chave, valor] of Object.entries(bruto as Record<string, unknown>).slice(0, 20)) {
    const url = normalizarUrlServidor(chave);
    if (!url.ok || !valor || typeof valor !== 'object') continue;
    const servidor = url.valor;
    const v = valor as Record<string, unknown>;
    const volumes: Record<string, number> = {};
    if (v.volumes && typeof v.volumes === 'object') {
      for (const [id, vol] of Object.entries(v.volumes as Record<string, unknown>).slice(0, 200)) {
        if (/^\d{1,9}$/.test(id) && typeof vol === 'number' && Number.isFinite(vol) && vol >= 0 && vol <= VOLUME_PESSOA_MAX) volumes[id] = Math.round(vol * 100) / 100;
      }
    }
    const silenciados = Array.isArray(v.silenciados) ? [...new Set(v.silenciados.filter((id): id is number => Number.isInteger(id) && id > 0))].slice(0, 200) : [];
    // O servidor mexido por último vai para o fim; acima de 20 servidores, os mais antigos saem.
    delete r[servidor];
    r[servidor] = { volumes, silenciados };
  }
  const chaves = Object.keys(r);
  for (const velho of chaves.slice(0, Math.max(0, chaves.length - 20))) delete r[velho];
  return r;
}

export function mesclarSons(base: PreferenciasSons = SONS_PADRAO, bruto: unknown): PreferenciasSons {
  const r = { ...base };
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as Record<string, unknown>;
  if (typeof o.voz === 'boolean') r.voz = o.voz;
  if (typeof o.soundboard === 'number' && Number.isFinite(o.soundboard) && o.soundboard >= 0 && o.soundboard <= 1) r.soundboard = Math.round(o.soundboard * 100) / 100;
  return r;
}

/** RF-39 a RF-41: valida as preferências de notificação (conversas silenciadas por servidor, até 20 servidores e 500 conversas). */
export function mesclarNotificacoes(base: PreferenciasNotificacoes = NOTIFICACOES_PADRAO, bruto: unknown): PreferenciasNotificacoes {
  const r: PreferenciasNotificacoes = { ...base, silenciadas: { ...base.silenciadas } };
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as Record<string, unknown>;
  for (const k of ['mensagens', 'entradaSaidaSom', 'entradaSaidaAviso'] as const) if (typeof o[k] === 'boolean') r[k] = o[k] as boolean;
  if (o.silenciadas && typeof o.silenciadas === 'object' && !Array.isArray(o.silenciadas)) {
    for (const [chave, lista] of Object.entries(o.silenciadas as Record<string, unknown>).slice(0, 20)) {
      const url = normalizarUrlServidor(chave);
      if (!url.ok || !Array.isArray(lista)) continue;
      delete r.silenciadas[url.valor];
      r.silenciadas[url.valor] = [...new Set(lista.filter((c): c is string => typeof c === 'string' && /^[cd]:\d{1,9}$/.test(c)))].slice(0, 500);
    }
    const chaves = Object.keys(r.silenciadas);
    for (const velho of chaves.slice(0, Math.max(0, chaves.length - 20))) delete r.silenciadas[velho];
  }
  return r;
}
