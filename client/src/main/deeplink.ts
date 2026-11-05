import { app } from 'electron';
import { ESQUEMA_LINK, lerLinkConvite, type ConviteLink } from '@tofalando/shared';

/** Procura nos argumentos (Linux/Windows passam o link como argumento) um convite válido. */
export function conviteDosArgumentos(argv: readonly string[]): ConviteLink | undefined {
  for (const arg of argv) {
    if (arg.toLowerCase().startsWith(`${ESQUEMA_LINK}:`)) {
      const convite = lerLinkConvite(arg);
      if (convite) return convite;
    }
  }
  return undefined;
}

export interface Links {
  /** false quando outra instância já está aberta: esta só repassou o link e vai sair. */
  principal: boolean;
  /** Chamado pelo renderer ao montar: entrega o convite guardado e marca que ele já ouve os próximos. */
  pegarPendente(): ConviteLink | undefined;
  /** A janela fechou ou recarregou: os próximos links ficam guardados até o renderer pedir. */
  rendererSaiu(): void;
}

/**
 * RF-1a: abre o app pelo link tofalany://convite?…
 * - Só o app instalado se registra como dono do esquema (em desenvolvimento e nos testes, não mexe no sistema).
 * - Uma instância por pasta de dados: o link aberto com o app já rodando vai para a janela existente.
 * - Link que chega antes do renderer estar pronto fica guardado (não se perde).
 */
export function prepararLinks(focar: () => void, enviar: (convite: ConviteLink) => boolean): Links {
  if (!app.requestSingleInstanceLock()) {
    app.exit(0);
    return { principal: false, pegarPendente: () => undefined, rendererSaiu: () => undefined };
  }

  if (app.isPackaged) app.setAsDefaultProtocolClient(ESQUEMA_LINK);

  let pendente = conviteDosArgumentos(process.argv);
  let rendererPronto = false;

  const receber = (convite: ConviteLink | undefined) => {
    if (!convite) return;
    if (!(rendererPronto && enviar(convite))) pendente = convite;
  };

  app.on('second-instance', (_evento, argv) => {
    focar();
    receber(conviteDosArgumentos(argv));
  });

  // macOS (não é alvo, mas não custa): o link chega por open-url.
  app.on('open-url', (evento, url) => {
    evento.preventDefault();
    receber(lerLinkConvite(url));
  });

  return {
    principal: true,
    pegarPendente() {
      rendererPronto = true;
      const c = pendente;
      pendente = undefined;
      return c;
    },
    rendererSaiu() {
      rendererPronto = false;
    },
  };
}
