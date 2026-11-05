import { describe, expect, it, vi } from 'vitest';
import { conectarTempoReal, type OuvintesTempoReal, type SocketTofalando } from './tempo-real';

/** Socket falso: guarda os ouvintes para o teste disparar eventos. */
function socketFalso() {
  const ouvintes = new Map<string, (...args: unknown[]) => void>();
  const s = {
    connected: false,
    respostas: [] as unknown[],
    timeout: () => ({ emit: (_e: string, _d: unknown, cb: (erro: Error | null, r: unknown) => void) => cb(null, s.respostas.shift()) }),
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
  const ouvintes: OuvintesTempoReal = { aoEstado: vi.fn(), aoOla: vi.fn(), aoRevogada: vi.fn(), aoUsuarioCriado: vi.fn(), aoUsuarioAtualizado: vi.fn(), aoUsuarioRemovido: vi.fn(), aoConviteAtualizado: vi.fn(), aoCanalCriado: vi.fn(), aoCanalRenomeado: vi.fn(), aoCanalRemovido: vi.fn(), aoMensagemNova: vi.fn(), aoMensagemEditada: vi.fn(), aoMensagemApagada: vi.fn(), aoDigitando: vi.fn(), aoDmAtualizada: vi.fn(), aoLidoAtualizado: vi.fn(), aoSonsAtualizados: vi.fn(), aoVozEstados: vi.fn(), aoVozTirado: vi.fn() };
  const fabrica = vi.fn(() => s as unknown as SocketTofalando);
  let avisarRede: (online: boolean) => void = () => undefined;
  const pararRede = vi.fn();
  const rede = {
    aoMudar: (fn: (online: boolean) => void) => {
      avisarRede = fn;
      return pararRede;
    },
  };
  const conexao = conectarTempoReal('http://s', 'tok', ouvintes, fabrica, rede);
  const desconectar = conexao.desconectar;
  return { s, ouvintes, fabrica, desconectar, conexao, avisarRede: (o: boolean) => avisarRede(o), pararRede };
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

  it('pedir: sem conexão responde na hora; conectado devolve a resposta do servidor', async () => {
    const { s, conexao } = montar();
    expect(await conexao.pedir('canal:criar', { tipo: 'texto', nome: 'a' })).toEqual({ ok: false, erro: expect.stringContaining('Sem conexão') });
    s.connected = true;
    s.respostas.push({ ok: true, valor: { id: 3 } });
    expect(await conexao.pedir('canal:criar', { tipo: 'texto', nome: 'a' })).toEqual({ ok: true, valor: { id: 3 } });
  });

  it('eventos de canal chegam aos ouvintes', () => {
    const { s, ouvintes } = montar();
    s.disparar('canal:criado', { id: 1 });
    s.disparar('canal:renomeado', { id: 1, nome: 'b' });
    s.disparar('canal:removido', { id: 1 });
    expect(ouvintes.aoCanalCriado).toHaveBeenCalledWith({ id: 1 });
    expect(ouvintes.aoCanalRenomeado).toHaveBeenCalledWith({ id: 1, nome: 'b' });
    expect(ouvintes.aoCanalRemovido).toHaveBeenCalledWith(1);
    s.disparar('mensagem:nova', { id: 9 });
    expect(ouvintes.aoMensagemNova).toHaveBeenCalledWith({ id: 9 });
    s.disparar('mensagem:editada', { id: 9, texto: 'b' });
    s.disparar('mensagem:apagada', { id: 9, canalId: 1, dmId: null });
    s.disparar('digitando', { canalId: 1, dmId: null, usuarioId: 2 });
    s.disparar('digitando', { canalId: null, dmId: 4, usuarioId: 3 });
    s.disparar('dm:atualizada', { id: 4, outroId: 3, ultimaEm: 1 });
    expect(ouvintes.aoMensagemEditada).toHaveBeenCalledWith({ id: 9, texto: 'b' });
    expect(ouvintes.aoMensagemApagada).toHaveBeenCalledWith(9, 'c:1');
    expect(ouvintes.aoDigitando).toHaveBeenCalledWith('c:1', 2);
    expect(ouvintes.aoDigitando).toHaveBeenCalledWith('d:4', 3);
    expect(ouvintes.aoDmAtualizada).toHaveBeenCalledWith({ id: 4, outroId: 3, ultimaEm: 1 });
    s.disparar('lido:atualizado', { chave: 'd:4', ultimaMensagemId: 9 });
    s.disparar('lido:atualizado', { chave: 'lixo', ultimaMensagemId: 9 });
    expect(ouvintes.aoLidoAtualizado).toHaveBeenCalledTimes(1);
    expect(ouvintes.aoLidoAtualizado).toHaveBeenCalledWith('d:4', 9);
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
    s.disparar('convite:atualizado', { link: 'http://s/convite/novo' });
    expect(ouvintes.aoConviteAtualizado).toHaveBeenCalledWith('http://s/convite/novo');
    desconectar();
    expect(s.removeAllListeners).toHaveBeenCalled();
    expect(pararRede).toHaveBeenCalled();
    expect(s.disconnect).toHaveBeenCalled();
  });
});
