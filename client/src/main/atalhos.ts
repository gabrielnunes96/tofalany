import { ACOES_ATALHO, mesmoAtalho, TECLAS_ATALHO, type AcaoAtalho, type Atalhos } from '@tofalando/shared';

/** Aperto ou soltura de um atalho global (RF-15). */
export interface EventoAtalho {
  acao: AcaoAtalho;
  pressionado: boolean;
}

/** Tecla vinda do uiohook (só o que usamos). */
export interface TeclaNativa {
  keycode: number;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

export interface Modificadores {
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
}

export interface Gancho {
  on(evento: 'keydown' | 'keyup', fn: (e: TeclaNativa) => void): unknown;
  start(): void;
  stop(): void;
}

export interface ModuloGancho {
  uIOhook: Gancho;
  UiohookKey: Record<string, number>;
}

/** Carrega o módulo nativo só quando há atalho: se o binário não carregar, o app abre do mesmo jeito. */
export const carregarUiohook = async (): Promise<ModuloGancho> => (await import('uiohook-napi')) as unknown as ModuloGancho;

/**
 * Atalhos globais pelo uiohook: funcionam com o app em segundo plano e avisam aperto e soltura
 * (o push-to-talk precisa da soltura, que o globalShortcut do Electron não dá). No Wayland puro o gancho
 * não recebe teclas de outros apps (limitação R-1; vai para o README na T26).
 *
 * Se uma soltura se perder (tela bloqueada, captura exclusiva do teclado), a ação fica "apertada" até a
 * próxima soltura da mesma tecla — aceitável, e trocar atalhos ou pausar também solta tudo.
 */
export function criarAtalhos(
  enviar: (e: EventoAtalho) => void,
  carregar: () => Promise<ModuloGancho> = carregarUiohook,
  aoFalhar: (e: unknown) => void = () => undefined,
) {
  let atalhos: Atalhos | undefined;
  let modulo: ModuloGancho | undefined;
  let carregando: Promise<void> | undefined;
  let iniciado = false;
  let pausado = false;
  /** Código nativo → KeyboardEvent.code (só as teclas aceitas como atalho). */
  let porNativo = new Map<number, string>();
  const pressionados = new Set<AcaoAtalho>();

  function soltarTudo() {
    for (const acao of pressionados) enviar({ acao, pressionado: false });
    pressionados.clear();
  }

  /** Trata uma tecla pelo KeyboardEvent.code (o gancho nativo traduz; os testes chamam direto). */
  function tratarCodigo(tipo: 'down' | 'up', codigo: string, m: Modificadores = {}) {
    if (!atalhos || pausado) return;
    for (const acao of ACOES_ATALHO) {
      const a = atalhos[acao];
      if (!a || a.codigo !== codigo) continue;
      if (tipo === 'down') {
        const mods = a.ctrl === !!m.ctrl && a.alt === !!m.alt && a.shift === !!m.shift && a.meta === !!m.meta;
        // Repetição do teclado (tecla segurada) não gera novos apertos.
        if (!mods || pressionados.has(acao)) continue;
        pressionados.add(acao);
        enviar({ acao, pressionado: true });
      } else if (pressionados.delete(acao)) {
        enviar({ acao, pressionado: false });
      }
    }
  }

  function nativa(tipo: 'down' | 'up', e: TeclaNativa) {
    const codigo = porNativo.get(e.keycode);
    if (codigo) tratarCodigo(tipo, codigo, { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey });
  }

  function ligar() {
    if (iniciado || carregando) return;
    carregando = carregar()
      .then((m) => {
        modulo = m;
        porNativo = new Map(Object.entries(TECLAS_ATALHO).flatMap(([codigo, nome]) => (m.UiohookKey[nome] === undefined ? [] : [[m.UiohookKey[nome]!, codigo] as const])));
        m.uIOhook.on('keydown', (e) => nativa('down', e));
        m.uIOhook.on('keyup', (e) => nativa('up', e));
        m.uIOhook.start();
        iniciado = true;
      })
      .catch(aoFalhar);
  }

  return {
    tratarCodigo,
    /** Para os testes: espera o gancho terminar de carregar. */
    pronto: () => carregando ?? Promise.resolve(),
    definir(novos: Atalhos) {
      // Só reconfigura quando os atalhos mudaram (gravar outra configuração não solta o PTT).
      if (atalhos && ACOES_ATALHO.every((a) => mesmoAtalho(atalhos![a], novos[a]) || (!atalhos![a] && !novos[a]))) return;
      // Trocar atalhos solta o que estava apertado (ex.: PTT segurado durante a troca).
      soltarTudo();
      atalhos = novos;
      if (ACOES_ATALHO.some((a) => novos[a])) ligar();
    },
    /** Enquanto a tela captura um atalho novo, os globais não disparam. */
    pausar(sim: boolean) {
      pausado = sim;
      if (sim) soltarTudo();
    },
    parar() {
      if (!iniciado || !modulo) return;
      iniciado = false;
      modulo.uIOhook.stop();
    },
  };
}
