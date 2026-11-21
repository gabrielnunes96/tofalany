import { type GifDto, CONTADOR_PADRAO, type PreferenciasContador, ATIVIDADE_PADRAO, type AtividadeDto, type PreferenciasAtividade, AUDIO_PADRAO, NOTIFICACOES_PADRAO, QUALIDADES_TELA, SONS_PADRAO, TELA_PADRAO, type PreferenciasTela, type QualidadeTela, type PreferenciasAudio, type PreferenciasNotificacoes, type PreferenciasPessoas, type PreferenciasSons } from './protocolo.js';
import { SOBRE_MIM_LINHAS, SOBRE_MIM_MAX, EMOJI_MAX_BYTES, GIF_DESCRICAO_MAX, GIF_LADO_MAX, GIF_URL_MAX, TRECHO_RESPOSTA, MENSAGEM_MAX, NOME_CANAL_MAX, NOME_EXIBICAO_MAX, NOME_SOM_MAX, SENHA_MAX, SENHA_MIN, USUARIO_MAX, USUARIO_MIN } from './limites.js';

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
  // Vários servidores na mesma instalação: o caminho /c/<id> faz parte do endereço; o resto é descartado.
  const comunidade = /^\/c\/(\d{1,9})(?:\/|$)/.exec(url.pathname);
  return { ok: true, valor: comunidade && comunidade[1] !== '1' ? `${url.origin}/c/${comunidade[1]}` : url.origin };
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

/** Regras de senha nova (cadastro e troca), na ordem em que o app mostra a lista enquanto a pessoa digita. */
export const REGRAS_SENHA: readonly { id: string; texto: string; cumpre: (senha: string) => boolean }[] = [
  { id: 'tamanho', texto: `Pelo menos ${SENHA_MIN} caracteres`, cumpre: (s) => s.length >= SENHA_MIN },
  { id: 'maiuscula', texto: 'Uma letra maiúscula', cumpre: (s) => /\p{Lu}/u.test(s) },
  { id: 'minuscula', texto: 'Uma letra minúscula', cumpre: (s) => /\p{Ll}/u.test(s) },
  { id: 'numero', texto: 'Um número', cumpre: (s) => /\d/.test(s) },
];

/** Senha nova. (O login não passa por aqui: contas antigas, de antes das regras, continuam entrando.) */
export function validarSenha(senha: string): Resultado<string> {
  if (senha.length > SENHA_MAX) return { ok: false, erro: `A senha deve ter no máximo ${SENHA_MAX} caracteres.` };
  const faltam = REGRAS_SENHA.filter((r) => !r.cumpre(senha));
  if (faltam.length) return { ok: false, erro: `A senha precisa ter: ${faltam.map((r) => r.texto.toLowerCase()).join(', ')}.` };
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

/**
 * Backlog v2, item 4: o que a pessoa cola na primeira tela pode ser o link de convite da página
 * (https://servidor/convite/<código>, o que o "Copiar link de convite" gera) ou o link do app (tofalany://).
 */
export function lerQualquerConvite(texto: string): ConviteLink | undefined {
  const limpo = texto.trim();
  const doApp = lerLinkConvite(limpo);
  if (doApp) return doApp;
  let url: URL;
  try {
    url = new URL(limpo);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  // https://servidor/convite/<código> ou, num servidor criado depois, https://servidor/c/<id>/convite/<código>.
  let partes = url.pathname.split('/').filter(Boolean);
  let prefixo = '';
  if (partes[0] === 'c' && partes[1] && /^\d{1,9}$/.test(partes[1])) {
    prefixo = `/c/${partes[1]}`;
    partes = partes.slice(2);
  }
  if (partes.length !== 2 || partes[0] !== 'convite') return undefined;
  let bruto: string;
  try {
    bruto = decodeURIComponent(partes[1]!);
  } catch {
    return undefined;
  }
  const servidor = normalizarUrlServidor(`${url.origin}${prefixo}`);
  const codigo = validarCodigoConvite(bruto);
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

const grafemas = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
/** Trecho da original numa resposta (RN-9): primeira linha, até 100 caracteres, sem partir emoji nem acento. */
export function trechoDeResposta(texto: string): string {
  const linha = texto.split('\n', 1)[0]!.trim();
  const partes = [...grafemas.segment(linha)].map((g) => g.segment);
  return partes.length > TRECHO_RESPOSTA ? `${partes.slice(0, TRECHO_RESPOSTA - 1).join('')}…` : linha;
}

/** Um emoji padrão inteiro (com tom de pele, bandeira ou sequência), nada de texto. A flag `v` vai no construtor (target ES2023). */
const EMOJI_INTEIRO = new RegExp('^\\p{RGI_Emoji}$', 'v');
/** Tom de pele sozinho (U+1F3FB a U+1F3FF) casa com o padrão, mas não é uma reação. */
const SO_TOM_DE_PELE = /^[\u{1F3FB}-\u{1F3FF}]$/u;
const utf8 = new TextEncoder();
export function validarEmojiReacao(emoji: unknown): emoji is string {
  return typeof emoji === 'string' && utf8.encode(emoji).length <= EMOJI_MAX_BYTES && EMOJI_INTEIRO.test(emoji) && !SO_TOM_DE_PELE.test(emoji);
}

/**
 * Mini perfil: "sobre mim" (T-7). NFC, quebras normalizadas, até 190 caracteres e 3 linhas, sem caracteres de
 * controle, de direção (bidi), de largura zero nem separadores especiais (o ZWJ dos emojis é aceito).
 */
const PROIBIDOS_SOBRE_MIM =
  // eslint-disable-next-line no-control-regex -- recusar caracteres de controle é o objetivo
  /[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u00AD\u061C\u115F\u1160\u180E\u200B\u200C\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\u3164\uFEFF\uFFA0]/u;
export function validarSobreMim(texto: string): Resultado<string> {
  const limpo = texto.replace(/\r\n?/g, '\n').normalize('NFC').trim();
  if (PROIBIDOS_SOBRE_MIM.test(limpo)) return { ok: false, erro: 'O "sobre mim" tem caracteres que não são permitidos.' };
  if ([...limpo].length > SOBRE_MIM_MAX) return { ok: false, erro: `O "sobre mim" deve ter no máximo ${SOBRE_MIM_MAX} caracteres.` };
  if (limpo.split('\n').length > SOBRE_MIM_LINHAS) return { ok: false, erro: `O "sobre mim" deve ter no máximo ${SOBRE_MIM_LINHAS} linhas.` };
  if (/\p{M}{4,}/u.test(limpo)) return { ok: false, erro: 'O "sobre mim" tem acentos empilhados demais.' };
  return { ok: true, valor: limpo };
}

/** Mini perfil: cores do fundo (T-6), uma ou duas, cada uma #rrggbb. */
export function validarCoresFundo(cores: unknown): Resultado<[string] | [string, string]> {
  if (!Array.isArray(cores) || cores.length < 1 || cores.length > 2) return { ok: false, erro: 'Escolha uma ou duas cores para o fundo.' };
  const lidas: string[] = [];
  for (const c of cores) {
    const v = typeof c === 'string' ? validarCor(c) : null;
    if (!v?.ok) return { ok: false, erro: 'Cor do fundo inválida (use #rrggbb).' };
    lidas.push(v.valor);
  }
  return { ok: true, valor: lidas as [string] | [string, string] };
}

/** Mini perfil: só um arquivo do próprio servidor (o app não desenha endereço de fora). */
export function urlArquivoValida(url: unknown): url is string {
  return typeof url === 'string' && /^\/files\/[0-9a-f]{32}\.webp$/.test(url);
}

/** Hosts de mídia da Klipy: static.klipy.com, static1.klipy.com, static2.klipy.com… */
export const HOSTS_MIDIA_GIF = /^static\d*\.klipy\.com$/;

/**
 * GIF de uma mensagem (RN-3): só https num host de mídia da Klipy (`hosts`; os testes passam o da Klipy falsa),
 * sem credenciais nem porta, slug simples e lados inteiros. Devolve a cópia limpa ou undefined.
 */
export function validarGif(bruto: unknown, hosts: RegExp = HOSTS_MIDIA_GIF, aceitarHttp = false): GifDto | undefined {
  if (!bruto || typeof bruto !== 'object') return undefined;
  const g = bruto as Record<string, unknown>;
  const { slug, url, largura, altura, descricao } = g;
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,120}$/i.test(slug)) return undefined;
  if (typeof url !== 'string' || url.length > GIF_URL_MAX) return undefined;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  if (!(u.protocol === 'https:' || (aceitarHttp && u.protocol === 'http:')) || u.username || u.password || u.hash) return undefined;
  if (u.port && !aceitarHttp) return undefined;
  if (!hosts.test(u.hostname)) return undefined;
  // O texto tem de ser exatamente o endereço (sem espaço, quebra de linha ou outro link escondido): ele vai para o chat.
  if (u.href !== url || url.includes('#') || u.search) return undefined;
  // Mídia da Klipy: /ii/…/arquivo.webp (ou .gif). Nada de query nem outro caminho (marcaria quem vê a imagem).
  if (!/^\/ii\/[A-Za-z0-9/_-]+\.(webp|gif)$/.test(u.pathname)) return undefined;
  const lado = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= GIF_LADO_MAX;
  if (!lado(largura) || !lado(altura)) return undefined;
  const texto = typeof descricao === 'string' ? descricao.replace(/\s+/g, ' ').trim() : '';
  // Endereço exatamente como a Klipy deu (os termos pedem não reescrever).
  return { slug, url, largura: largura as number, altura: altura as number, descricao: [...texto].slice(0, GIF_DESCRICAO_MAX).join('') };
}

/** O texto que a pessoa escreveu numa mensagem com GIF (sem o endereço que o servidor põe no fim para os apps antigos). */
export function textoSemGif(texto: string, gif: GifDto | undefined): string {
  if (!gif) return texto;
  if (texto === gif.url) return '';
  return texto.endsWith(`\n${gif.url}`) ? texto.slice(0, -gif.url.length - 1) : texto;
}

/** Aplica sobre `base` só os campos de áudio válidos de `bruto` (configuração local vinda do disco ou do renderer). */
export function mesclarAudio(base: PreferenciasAudio = AUDIO_PADRAO, bruto: unknown): PreferenciasAudio {
  const r: PreferenciasAudio = { ...base };
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as Record<string, unknown>;
  const id = (v: unknown) => v === null || (typeof v === 'string' && v.length > 0 && v.length <= 256);
  if ('entradaId' in o && id(o.entradaId)) r.entradaId = o.entradaId as string | null;
  if ('saidaId' in o && id(o.saidaId)) r.saidaId = o.saidaId as string | null;
  for (const chave of ['supressaoRuido', 'cancelamentoEco', 'ganhoAutomatico', 'nivelarVoz'] as const) if (typeof o[chave] === 'boolean') r[chave] = o[chave] as boolean;
  const numero = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
  if (numero(o.ganhoMicrofone, GANHO_MIC_MIN, GANHO_MIC_MAX)) r.ganhoMicrofone = Math.round((o.ganhoMicrofone as number) * 100) / 100;
  if (numero(o.volumeChamada, 0, VOLUME_CHAMADA_MAX)) r.volumeChamada = Math.round((o.volumeChamada as number) * 100) / 100;
  const s = o.sensibilidadeDb;
  if (typeof s === 'number' && Number.isFinite(s) && s >= -100 && s <= 0) r.sensibilidadeDb = Math.round(s);
  if (o.modoMicrofone === 'deteccao' || o.modoMicrofone === 'ptt') r.modoMicrofone = o.modoMicrofone;
  return r;
}

/** Volume máximo por pessoa (200%, RF-19); também o teto do volume final (pessoa × chamada). */
export const VOLUME_PESSOA_MAX = 2;
/** volume-da-voz: ganho do microfone de 50% a 300% e volume da chamada até 200%. */
export const GANHO_MIC_MIN = 0.5;
export const GANHO_MIC_MAX = 3;
export const VOLUME_CHAMADA_MAX = 2;

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
        // Ids das pessoas e o do ToOuvini (bot-musica), cada um com o seu volume.
        if (/^(\d{1,9}|bot-musica)$/.test(id) && typeof vol === 'number' && Number.isFinite(vol) && vol >= 0 && vol <= VOLUME_PESSOA_MAX) volumes[id] = Math.round(vol * 100) / 100;
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
  for (const chave of ['telaAbrir', 'telaFechar', 'assistirComecar', 'assistirParar'] as const) if (typeof o[chave] === 'boolean') r[chave] = o[chave];
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

/** RF-28: qualidade padrão e codec (o servidor ainda confere o cargo ao transmitir). */
export function mesclarTela(base: PreferenciasTela = TELA_PADRAO, bruto: unknown): PreferenciasTela {
  const r = { ...base };
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as Record<string, unknown>;
  if (QUALIDADES_TELA.includes(o.qualidade as QualidadeTela)) r.qualidade = o.qualidade as QualidadeTela;
  if (o.codec === 'h264' || o.codec === 'vp9') r.codec = o.codec;
  if (typeof o.audio === 'boolean') r.audio = o.audio;
  return r;
}

/** Texto curto de atividade: sem controle, espaços juntados, cortado no limite; vazio = undefined. */
function textoAtividade(v: unknown, max: number): string | undefined {
  if (typeof v !== 'string') return undefined;
  // eslint-disable-next-line no-control-regex
  const limpo = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return limpo ? [...limpo].slice(0, max).join('') : undefined;
}

/** Atividade vinda do app (ou do arquivo de preferências): só jogo e música, com tamanho limitado. */
export function lerAtividade(bruto: unknown): AtividadeDto | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const o = bruto as Record<string, unknown>;
  const r: AtividadeDto = {};
  const jogo = textoAtividade(o.jogo, 100);
  if (jogo) r.jogo = jogo;
  if (o.musica && typeof o.musica === 'object') {
    const m = o.musica as Record<string, unknown>;
    const titulo = textoAtividade(m.titulo, 120);
    const artista = textoAtividade(m.artista, 120);
    if (titulo) r.musica = artista ? { titulo, artista } : { titulo };
  }
  return r.jogo || r.musica ? r : null;
}

export function mesclarAtividade(base: PreferenciasAtividade = ATIVIDADE_PADRAO, bruto: unknown): PreferenciasAtividade {
  const r = { ...base };
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as Record<string, unknown>;
  if (typeof o.jogos === 'boolean') r.jogos = o.jogos;
  if (typeof o.musica === 'boolean') r.musica = o.musica;
  return r;
}

/** Palavra que marca todo mundo do canal. */
export const MENCAO_TODOS = 'todos';

/**
 * Menções no texto: `@usuario` (o nome de usuário, sem acento nem espaço) e `@todos`. Devolve os nomes
 * normalizados (o servidor confere quem existe) e se tem @todos. Endereço de e-mail (a@b) não conta.
 */
export function extrairMencoes(texto: string): { usuarios: string[]; todos: boolean } {
  const usuarios = new Set<string>();
  let todos = false;
  for (const m of texto.matchAll(/(^|[^\w@.])@([A-Za-z0-9._-]{1,32})/g)) {
    const nome = m[2]!.replace(/[.]+$/, '').toLowerCase();
    if (!nome) continue;
    if (nome === MENCAO_TODOS) todos = true;
    else usuarios.add(nome);
  }
  return { usuarios: [...usuarios], todos };
}

/** video-teatro-cameras-e-sons (A8): cores só #rrggbb e posição de 0 a 1 finita; o resto fica no padrão. */
export function mesclarContador(base: PreferenciasContador = CONTADOR_PADRAO, bruto: unknown): PreferenciasContador {
  const r: PreferenciasContador = { cores: { ...base.cores }, posicao: { ...base.posicao } };
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as { cores?: unknown; posicao?: unknown };
  if (o.cores && typeof o.cores === 'object') {
    const c = o.cores as Record<string, unknown>;
    for (const chave of ['olho', 'fundo', 'numero', 'borda'] as const) {
      const v = c[chave];
      if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) r.cores[chave] = v.toLowerCase();
    }
  }
  if (o.posicao && typeof o.posicao === 'object') {
    const p = o.posicao as Record<string, unknown>;
    for (const eixo of ['x', 'y'] as const) {
      const v = p[eixo];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1) r.posicao[eixo] = v;
    }
  }
  return r;
}

/** Razão de contraste (WCAG 2) entre duas cores #rrggbb: de 1 (igual) a 21 (preto no branco). */
export function razaoDeContraste(a: string, b: string): number {
  const luz = (hex: string) => {
    const canal = (i: number) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5);
  };
  const [claro, escuro] = [luz(a), luz(b)].sort((x, y) => y - x) as [number, number];
  return (claro + 0.05) / (escuro + 0.05);
}
