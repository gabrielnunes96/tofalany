import { describe, expect, it, vi } from 'vitest';

const criadas: { silent?: boolean }[] = [];
vi.mock('electron', () => ({
  Notification: class {
    static isSupported = () => true;
    constructor(o: { silent?: boolean }) {
      criadas.push(o);
    }
    on() {}
    show() {}
  },
  app: { isPackaged: false },
}));
const { deveNotificar, criarNotificacoes } = await import('./notificacoes');

describe('deveNotificar (RF-12)', () => {
  it('conversa fechada ou app sem foco: sim; conversa aberta com foco: não', () => {
    expect(deveNotificar(false, true)).toBe(true);
    expect(deveNotificar(true, false)).toBe(true);
    expect(deveNotificar(false, false)).toBe(true);
    expect(deveNotificar(true, true)).toBe(false);
  });
});

describe('som-sistema-windows CA-8 (RN-8)', () => {
  it('com o som do sistema sendo capturado, a notificação sai sem som; sem captura, com som', () => {
    let capturando = true;
    const n = criarNotificacoes(() => undefined, () => capturando);
    const pedido = { titulo: 'ana', corpo: 'oi', chave: 'c:1', conversaAberta: false };
    n.mostrar(pedido);
    expect(criadas.at(-1)?.silent).toBe(true);
    capturando = false;
    n.mostrar(pedido);
    expect(criadas.at(-1)?.silent).toBe(process.env.TOFALANDO_E2E === '1');
  });
});
