/** RF-15: ações com atalho global. */
export type AcaoAtalho = 'ptt' | 'mudo' | 'surdo';

export const ACOES_ATALHO: AcaoAtalho[] = ['ptt', 'mudo', 'surdo'];

export const NOME_ACAO: Record<AcaoAtalho, string> = {
  ptt: 'Push-to-talk',
  mudo: 'Mute (microfone)',
  surdo: 'Deafen (áudio)',
};

/** Tecla (KeyboardEvent.code) com modificadores. */
export interface Atalho {
  codigo: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export type Atalhos = Record<AcaoAtalho, Atalho | null>;

const combo = (codigo: string, mods: Partial<Omit<Atalho, 'codigo'>> = {}): Atalho => ({ codigo, ctrl: false, alt: false, shift: false, meta: false, ...mods });

export const ATALHOS_PADRAO: Atalhos = {
  ptt: null,
  mudo: combo('KeyM', { ctrl: true, shift: true }),
  surdo: combo('KeyD', { ctrl: true, shift: true }),
};

/**
 * KeyboardEvent.code → nome da tecla no uiohook (o processo principal traduz para o código nativo).
 * Só teclas que funcionam como atalho global; modificadores sozinhos não entram.
 */
export const TECLAS_ATALHO: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const l of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') m[`Key${l}`] = l;
  for (let d = 0; d <= 9; d++) {
    m[`Digit${d}`] = String(d);
    m[`Numpad${d}`] = `Numpad${d}`;
  }
  for (let f = 1; f <= 24; f++) m[`F${f}`] = `F${f}`;
  for (const n of [
    'Space', 'Tab', 'Enter', 'Backspace', 'Insert', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Semicolon', 'Equal', 'Comma', 'Minus', 'Period', 'Slash',
    'Backquote', 'BracketLeft', 'Backslash', 'BracketRight', 'Quote', 'CapsLock', 'ScrollLock', 'PrintScreen',
    'NumpadMultiply', 'NumpadAdd', 'NumpadSubtract', 'NumpadDecimal', 'NumpadDivide', 'NumpadEnter',
  ]) m[n] = n;
  return m;
})();

const NOME_VISIVEL: Record<string, string> = { Space: 'Espaço', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Backquote: '`' };

/** "Ctrl+Shift+M" */
export function textoAtalho(a: Atalho | null): string {
  if (!a) return 'Nenhum';
  const tecla = NOME_VISIVEL[a.codigo] ?? TECLAS_ATALHO[a.codigo] ?? a.codigo;
  return [a.ctrl && 'Ctrl', a.alt && 'Alt', a.shift && 'Shift', a.meta && 'Super', tecla].filter(Boolean).join('+');
}

export const mesmoAtalho = (a: Atalho | null, b: Atalho | null) =>
  !!a && !!b && a.codigo === b.codigo && a.ctrl === b.ctrl && a.alt === b.alt && a.shift === b.shift && a.meta === b.meta;

/** RF-15: outra ação que já usa este atalho (o app recusa). */
export function conflitoAtalho(atalhos: Atalhos, acao: AcaoAtalho, novo: Atalho | null): AcaoAtalho | null {
  if (!novo) return null;
  return ACOES_ATALHO.find((outra) => outra !== acao && mesmoAtalho(atalhos[outra], novo)) ?? null;
}

function lerAtalho(v: unknown): Atalho | null | undefined {
  if (v === null) return null;
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  if (typeof o.codigo !== 'string' || !Object.hasOwn(TECLAS_ATALHO, o.codigo)) return undefined;
  for (const k of ['ctrl', 'alt', 'shift', 'meta']) if (typeof o[k] !== 'boolean') return undefined;
  return { codigo: o.codigo, ctrl: o.ctrl as boolean, alt: o.alt as boolean, shift: o.shift as boolean, meta: o.meta as boolean };
}

/**
 * Aplica sobre `base` os atalhos válidos de `bruto` e só depois confere conflitos no resultado final
 * (a ordem das chaves não importa). Ação alterada em conflito volta ao valor de `base` se ele não conflitar; senão fica sem atalho.
 */
export function mesclarAtalhos(base: Atalhos = ATALHOS_PADRAO, bruto: unknown): Atalhos {
  const r: Atalhos = { ...base };
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as Record<string, unknown>;
  const alteradas: AcaoAtalho[] = [];
  for (const acao of ACOES_ATALHO) {
    if (!Object.hasOwn(o, acao)) continue;
    const a = lerAtalho(o[acao]);
    if (a === undefined) continue;
    r[acao] = a;
    alteradas.push(acao);
  }
  // Quem mudou cede primeiro (volta ao anterior ou fica sem); o que sobrar em conflito fica sem atalho.
  for (const acao of [...alteradas, ...ACOES_ATALHO.filter((x) => !alteradas.includes(x))]) {
    if (!conflitoAtalho(r, acao, r[acao])) continue;
    r[acao] = alteradas.includes(acao) && !conflitoAtalho(r, acao, base[acao]) ? base[acao] : null;
  }
  return r;
}

/**
 * atalhos-de-sons: um atalho por som. Os sons do servidor guardam por servidor (chave = URL normalizada, depois o
 * `somId`); os de "Meus sons" valem em todos (chave = `audioId`) (RN-4).
 */
export interface AtalhosSons {
  globais: Record<string, Atalho>;
  porServidor: Record<string, Record<string, Atalho>>;
}

export const ATALHOS_SONS_PADRAO: AtalhosSons = { globais: {}, porServidor: {} };

/** Tetos do arquivo de configuração: servidores lembrados, sons por servidor e "Meus sons". */
// Bem acima do real (5 sons por servidor; a loja tem poucas dezenas de áudios): a tela nunca chega neles, e um
// arquivo adulterado não cresce sem limite.
const MAX_SERVIDORES_SONS = 50;
const MAX_SONS_POR_SERVIDOR = 50;
const MAX_GLOBAIS = 300;

/** Texto que identifica a combinação (é o que o processo principal manda quando ela é apertada). */
export const chaveAtalho = (a: Atalho) => textoAtalho(a);

const ehId = (k: string) => /^[1-9]\d{0,9}$/.test(k);

function lerMapa(v: unknown, max: number): Record<string, Atalho> {
  const r: Record<string, Atalho> = {};
  if (!v || typeof v !== 'object') return r;
  for (const [k, bruto] of Object.entries(v as Record<string, unknown>)) {
    if (Object.keys(r).length >= max) break;
    const a = lerAtalho(bruto);
    if (ehId(k) && a) r[k] = a;
  }
  return r;
}

/** Valida o que veio do arquivo: ids numéricos, atalhos válidos e tetos. */
export function mesclarAtalhosSons(bruto: unknown): AtalhosSons {
  const r: AtalhosSons = { globais: {}, porServidor: {} };
  if (!bruto || typeof bruto !== 'object') return r;
  const o = bruto as Record<string, unknown>;
  r.globais = lerMapa(o.globais, MAX_GLOBAIS);
  if (o.porServidor && typeof o.porServidor === 'object') {
    for (const [url, mapa] of Object.entries(o.porServidor as Record<string, unknown>)) {
      if (Object.keys(r.porServidor).length >= MAX_SERVIDORES_SONS) break;
      if (typeof url !== 'string' || url.length > 300) continue;
      const m = lerMapa(mapa, MAX_SONS_POR_SERVIDOR);
      if (Object.keys(m).length > 0) r.porServidor[url] = m;
    }
  }
  return r;
}

/** Um som: do servidor (`somId`) ou de "Meus sons" (`audioId`). */
export type AlvoAtalhoSom = { somId: number } | { audioId: number };

/**
 * RN-1: quem já usa este atalho no conjunto que vale junto (atalhos da voz, "Meus sons" e os sons deste servidor).
 * Devolve o nome para o aviso ("Push-to-talk", "outro som") ou null. O mesmo atalho em outro servidor não conflita.
 */
export function conflitoAtalhoSom(voz: Atalhos, sons: AtalhosSons, servidor: string, alvo: AlvoAtalhoSom, novo: Atalho | null): string | null {
  if (!novo) return null;
  const acao = ACOES_ATALHO.find((a) => mesmoAtalho(voz[a], novo));
  if (acao) return NOME_ACAO[acao];
  const doServidor = sons.porServidor[servidor] ?? {};
  for (const [id, a] of Object.entries(doServidor)) if (!('somId' in alvo && String(alvo.somId) === id) && mesmoAtalho(a, novo)) return 'outro som';
  for (const [id, a] of Object.entries(sons.globais)) if (!('audioId' in alvo && String(alvo.audioId) === id) && mesmoAtalho(a, novo)) return 'outro som';
  return null;
}

/** RN-4: o som deste atalho no servidor atual: primeiro os do servidor, depois "Meus sons". */
export function resolverAtalhoSom(sons: AtalhosSons, servidor: string, chave: string): AlvoAtalhoSom | null {
  for (const [id, a] of Object.entries(sons.porServidor[servidor] ?? {})) if (chaveAtalho(a) === chave) return { somId: Number(id) };
  for (const [id, a] of Object.entries(sons.globais)) if (chaveAtalho(a) === chave) return { audioId: Number(id) };
  return null;
}

/** Todas as combinações de sons (de qualquer servidor): o processo principal só escuta estas. */
export function combosSons(sons: AtalhosSons): Atalho[] {
  const todos = [...Object.values(sons.globais), ...Object.values(sons.porServidor).flatMap((m) => Object.values(m))];
  return todos.filter((a, i) => todos.findIndex((b) => mesmoAtalho(a, b)) === i);
}

/**
 * RN-5: som apagado (ou áudio que saiu de "Meus sons") perde o atalho. `somIds` são os sons que o servidor tem agora;
 * `audioIds`, os de "Meus sons" (null = ainda não se sabe, não mexe). Devolve o mesmo objeto se nada mudou.
 */
export function limparOrfaos(sons: AtalhosSons, servidor: string, somIds: number[] | null, audioIds: number[] | null): AtalhosSons {
  let mudou = false;
  const porServidor = { ...sons.porServidor };
  if (somIds && porServidor[servidor]) {
    const ficam = Object.fromEntries(Object.entries(porServidor[servidor]).filter(([id]) => somIds.includes(Number(id))));
    if (Object.keys(ficam).length !== Object.keys(porServidor[servidor]).length) {
      mudou = true;
      if (Object.keys(ficam).length > 0) porServidor[servidor] = ficam;
      else delete porServidor[servidor];
    }
  }
  let globais = sons.globais;
  if (audioIds) {
    const ficam = Object.fromEntries(Object.entries(sons.globais).filter(([id]) => audioIds.includes(Number(id))));
    if (Object.keys(ficam).length !== Object.keys(sons.globais).length) {
      mudou = true;
      globais = ficam;
    }
  }
  return mudou ? { globais, porServidor } : sons;
}

/** RN-6: sugestões ao alcance da mão esquerda (a pessoa escolhe; nenhum vem pronto). */
export const SUGESTOES_ATALHO_SOM = ['F1', 'F2', 'F3', 'F4', 'F5'];
