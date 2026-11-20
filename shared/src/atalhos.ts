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
