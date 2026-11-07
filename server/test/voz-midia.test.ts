import { describe, expect, it, vi } from 'vitest';
import { abrirBanco } from '../src/db/banco.js';
import { criarCanal } from '../src/dominio/canais.js';
import { criarVoz } from '../src/realtime/voz.js';
import type { ServidorTempoReal, SocketTofalando } from '../src/realtime/tempo-real.js';

/** Socket falso: guarda os tratadores para disparar à mão. */
function socketFalso(id: string, usuarioId: number) {
  const tratadores = new Map<string, (...a: unknown[]) => void>();
  const socket = { id, data: { usuarioId, comunidadeId: 1 }, on: (e: string, fn: (...a: unknown[]) => void) => tratadores.set(e, fn) };
  const pedir = (dados: unknown) => new Promise((r) => tratadores.get('voz:estado')!(dados, r));
  return { socket: socket as unknown as SocketTofalando, pedir, cair: () => tratadores.get('disconnect')!() };
}

function preparar() {
  const banco = abrirBanco(':memory:');
  banco.prepare("INSERT INTO usuarios (id, usuario, senha_hash, nome_exibicao, cor, cargo, criado_em) VALUES (1, 'ana', 'x', 'ana', '#00f0ff', 'membro', 0)").run();
  const papo = criarCanal(banco, 'voz', 'Papo', 1);
  const jogo = criarCanal(banco, 'voz', 'Jogo', 1);
  const emitidos: [string, string, unknown][] = [];
  const io = {
    emit: (e: string, p: unknown) => emitidos.push(['todos', e, p]),
    to: (sala: string) => ({ emit: (e: string, p: unknown) => emitidos.push([sala, e, p]) }),
    of: () => ({ adapter: { rooms: new Map([['comunidade:1', new Set()]]) } }),
  } as unknown as ServidorTempoReal;
  const removerDaMidia = vi.fn(async () => undefined);
  const voz = criarVoz(io, banco, (e) => {
    throw e;
  }, { carenciaMs: 20, removerDaMidia });
  return { voz, papo, jogo, emitidos, removerDaMidia };
}

const estado = (canalVozId: number | null) => ({ canalVozId, mudo: false, surdo: false, camera: false });

describe('voz: tirar da mídia do LiveKit', () => {
  it('outro computador em outro canal: o anterior é tirado da sala antiga e avisado', async () => {
    const { voz, papo, jogo, emitidos, removerDaMidia } = preparar();
    const a = socketFalso('A', 1);
    const b = socketFalso('B', 1);
    voz.registrar(a.socket);
    voz.registrar(b.socket);
    await a.pedir(estado(papo.id));
    await b.pedir(estado(jogo.id));
    expect(removerDaMidia).toHaveBeenCalledWith(1, papo.id);
    expect(emitidos).toContainEqual(['A', 'voz:tirado', { motivo: 'outro_computador' }]);
    // No mesmo canal o próprio LiveKit derruba a identidade repetida.
    removerDaMidia.mockClear();
    await a.pedir(estado(jogo.id));
    expect(removerDaMidia).not.toHaveBeenCalled();
  });

  it('queda sem volta, canal removido e revogação tiram da mídia', async () => {
    const { voz, papo, jogo, removerDaMidia } = preparar();
    const a = socketFalso('A', 1);
    voz.registrar(a.socket);
    await a.pedir(estado(papo.id));
    a.cair();
    expect(voz.estados()).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 60));
    expect(voz.estados()).toEqual([]);
    expect(removerDaMidia).toHaveBeenLastCalledWith(1, papo.id);

    const b = socketFalso('B', 1);
    voz.registrar(b.socket);
    await b.pedir(estado(jogo.id));
    voz.canalRemovido({ id: jogo.id, nome: 'Jogo' });
    expect(removerDaMidia).toHaveBeenLastCalledWith(1, jogo.id);

    await b.pedir(estado(papo.id));
    voz.revogar(1, 'outro-socket');
    expect(voz.estados()).toHaveLength(1);
    voz.revogar(1, 'B');
    expect(voz.estados()).toEqual([]);
    expect(removerDaMidia).toHaveBeenLastCalledWith(1, papo.id);
    voz.fechar();
  });
});
