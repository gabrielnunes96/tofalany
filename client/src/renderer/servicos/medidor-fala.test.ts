import { describe, expect, it, vi } from 'vitest';
import { criarMedidorFala, LIMIAR_FALA_DB, SEGURAR_MS } from './medidor-fala';

function fonte(nivel: { db: number }) {
  return { nivelDb: () => nivel.db, parar: vi.fn() };
}

describe('medidor de fala (backlog v2, item 1)', () => {
  it('acende na hora em que o áudio passa do limiar e apaga depois do tempo de segurar', () => {
    let t = 0;
    const mudou = vi.fn();
    const m = criarMedidorFala(mudou, () => t);
    const nivel = { db: -100 };
    m.adicionar('2', fonte(nivel));
    m.medir();
    expect(mudou).not.toHaveBeenCalled();
    nivel.db = LIMIAR_FALA_DB + 10;
    m.medir();
    expect(mudou).toHaveBeenLastCalledWith(['2']);
    nivel.db = -100;
    t += SEGURAR_MS - 10;
    m.medir();
    expect(mudou).toHaveBeenCalledTimes(1);
    t += 20;
    m.medir();
    expect(mudou).toHaveBeenLastCalledWith([]);
    m.parar();
  });

  it('o meu microfone conta pelo portão; sair da sala apaga tudo e para as fontes', () => {
    const mudou = vi.fn();
    const m = criarMedidorFala(mudou, () => 0);
    const f = fonte({ db: 0 });
    m.adicionar('3', f);
    m.definirEu('1', true);
    expect(mudou).toHaveBeenLastCalledWith(['1', '3']);
    m.definirEu('1', false);
    expect(mudou).toHaveBeenLastCalledWith(['3']);
    m.remover('3');
    expect(f.parar).toHaveBeenCalled();
    expect(mudou).toHaveBeenLastCalledWith([]);
    m.adicionar('4', fonte({ db: 0 }));
    m.medir();
    m.parar();
    expect(mudou).toHaveBeenLastCalledWith([]);
  });
});
