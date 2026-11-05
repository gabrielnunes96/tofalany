import { describe, expect, it, vi } from 'vitest';
import { conectarTempoReal, type OuvintesTempoReal, type SocketTofalando } from './tempo-real';

/** Socket falso: guarda os ouvintes para o teste disparar eventos. */
function socketFalso() {
  const ouvintes = new Map<string, (...args: unknown[]) => void>();
  const s = {
    connected: false,
    on: (ev: string, fn: (...args: unknown[]) => void) => (ouvintes.set(ev, fn), s),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    disparar: (ev: string, ...args: unknown[]) => ouvintes.get(ev)?.(...args),
  };
  return s;
}

function montar() {
  const s = socketFalso();
  const ouvintes: OuvintesTempoReal = { aoEstado: vi.fn(), aoOla: vi.fn(), aoRevogada: vi.fn(), aoUsuarioCriado: vi.fn(), aoUsuarioAtualizado: vi.fn(), aoUsuarioRemovido: vi.fn() };
  const fabrica = vi.fn(() => s as unknown as SocketTofalando);
  let avisarRede: (online: boolean) => void = () => undefined;
  const pararRede = vi.fn();
  const rede = {
    aoMudar: (fn: (online: boolean) => void) => {
      avisarRede = fn;
      return pararRede;
    },
  };
  const desconectar = conectarTempoReal('http://s', 'tok', ouvintes, fabrica, rede);
  return { s, ouvintes, fabrica, desconectar, avisarRede: (o: boolean) => avisarRede(o), pararRede };
}

describe('conectarTempoReal', () => {
  it('conecta com o token e reconexão automática', () => {
    const { fabrica, ouvintes, s } = montar();
    expect(fabrica).toHaveBeenCalledWith('http://s', expect.objectContaining({ auth: { token: 'tok' }, reconnection: true }));
    expect(ouvintes.aoEstado).toHaveBeenLastCalledWith('conectando');
    s.disparar('connect');
    expect(ouvintes.aoEstado).toHaveBeenLastCalledWith('conectado');
  });

  it('queda de rede vira "reconectando" e volta a "conectado"', () => {
    const { s, ouvintes } = montar();
    s.disparar('connect');
    s.disparar('disconnect', 'transport close');
    expect(ouvintes.aoEstado).toHaveBeenLastCalledWith('reconectando');
    s.disparar('connect_error', new Error('xhr poll error'));
    expect(ouvintes.aoEstado).toHaveBeenLastCalledWith('reconectando');
    s.disparar('connect');
    expect(ouvintes.aoEstado).toHaveBeenLastCalledWith('conectado');
    expect(ouvintes.aoRevogada).not.toHaveBeenCalled();
  });

  it('sessão revogada pelo servidor para de tentar e avisa uma vez', () => {
    const { s, ouvintes } = montar();
    s.disparar('sessao:revogada', { motivo: 'saiu' });
    s.disparar('disconnect', 'io server disconnect');
    expect(ouvintes.aoRevogada).toHaveBeenCalledTimes(1);
    expect(ouvintes.aoRevogada).toHaveBeenCalledWith('saiu');
    expect(s.disconnect).toHaveBeenCalled();
    expect(s.connect).not.toHaveBeenCalled();
  });

  it('token recusado no handshake conta como sessão inválida', () => {
    const { s, ouvintes } = montar();
    s.disparar('connect_error', new Error('nao_autenticado'));
    expect(ouvintes.aoRevogada).toHaveBeenCalledWith('sessao_invalida');
  });

  it('servidor encerrando sem revogar: reconecta', () => {
    const { s } = montar();
    s.disparar('disconnect', 'io server disconnect');
    expect(s.connect).toHaveBeenCalled();
  });

  it('aviso de sem rede do sistema mostra "reconectando" na hora; volta se o socket seguiu conectado', () => {
    const { s, ouvintes, avisarRede } = montar();
    s.disparar('connect');
    s.connected = true;
    avisarRede(false);
    expect(ouvintes.aoEstado).toHaveBeenLastCalledWith('reconectando');
    avisarRede(true);
    expect(ouvintes.aoEstado).toHaveBeenLastCalledWith('conectado');
  });

  it('o ola chega ao ouvinte; desconectar remove os ouvintes', () => {
    const { s, ouvintes, desconectar, pararRede } = montar();
    const ola = { servidor: { nome: 'T' }, eu: {}, usuarios: [] };
    s.disparar('ola', ola);
    expect(ouvintes.aoOla).toHaveBeenCalledWith(ola);
    s.disparar('usuario:criado', { id: 2 });
    expect(ouvintes.aoUsuarioCriado).toHaveBeenCalledWith({ id: 2 });
    s.disparar('usuario:atualizado', { id: 2, cor: '#000000' });
    expect(ouvintes.aoUsuarioAtualizado).toHaveBeenCalledWith({ id: 2, cor: '#000000' });
    s.disparar('usuario:removido', { id: 2 });
    expect(ouvintes.aoUsuarioRemovido).toHaveBeenCalledWith(2);
    desconectar();
    expect(s.removeAllListeners).toHaveBeenCalled();
    expect(pararRede).toHaveBeenCalled();
    expect(s.disconnect).toHaveBeenCalled();
  });
});
