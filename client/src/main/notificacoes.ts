import { Notification, type BrowserWindow } from 'electron';

export interface PedidoNotificacao {
  titulo: string;
  corpo: string;
  /** Conversa ("c:<id>"/"d:<id>") para abrir ao clicar; "u:<id>" para avisos sobre uma pessoa (o clique só traz a janela). */
  chave: string;
  /** A conversa da mensagem está aberta na tela. */
  conversaAberta: boolean;
  /** Sem o som do sistema (ex.: aviso de entrada/saída com o som desligado). */
  silencioso?: boolean;
}

/** RF-12: avisa quando a mensagem chega numa conversa que não está aberta, ou com o app sem foco. */
export function deveNotificar(conversaAberta: boolean, janelaFocada: boolean): boolean {
  return !conversaAberta || !janelaFocada;
}

export function criarNotificacoes(obterJanela: () => BrowserWindow | undefined) {
  /** Referência viva até o clique ou o fechamento: sem ela o objeto é recolhido e o clique não chega (Windows). */
  const vivas = new Set<Notification>();
  return {
    mostrar(p: PedidoNotificacao): boolean {
      const janela = obterJanela();
      if (!deveNotificar(p.conversaAberta, !!janela?.isFocused())) return false;
      if (!Notification.isSupported()) return false;
      const n = new Notification({ title: p.titulo.slice(0, 120), body: p.corpo.slice(0, 200), silent: p.silencioso === true });
      vivas.add(n);
      n.on('close', () => vivas.delete(n));
      n.on('click', () => {
        vivas.delete(n);
        const j = obterJanela();
        if (!j) return;
        if (j.isMinimized()) j.restore();
        j.show();
        j.focus();
        j.webContents.send('notificacao:abrir', p.chave);
      });
      n.show();
      return true;
    },
  };
}
