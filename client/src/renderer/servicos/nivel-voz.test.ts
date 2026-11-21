import { describe, expect, it, vi } from 'vitest';
import { montarNivel, nivelInerte, parametrosNivel, type ContextoNivel } from './nivel-voz';

/** Nó falso: guarda para onde liga e os parâmetros (valor e as rampas pedidas). */
function no(nome: string) {
  const param = () => ({ value: 0, setTargetAtTime: vi.fn() });
  const n = {
    nome,
    saidas: [] as string[],
    gain: param(),
    threshold: param(),
    knee: param(),
    ratio: param(),
    attack: param(),
    release: param(),
    connect(outro: { nome: string }) {
      n.saidas.push(outro.nome);
      return outro;
    },
  };
  return n;
}

function contexto() {
  const nos: ReturnType<typeof no>[] = [];
  const criar = (tipo: string) => {
    const n = no(`${tipo}${nos.filter((x) => x.nome.startsWith(tipo)).length + 1}`);
    nos.push(n);
    return n;
  };
  const ctx = { currentTime: 3, createDynamicsCompressor: () => criar('compressor'), createGain: () => criar('ganho') };
  return { ctx: ctx as unknown as ContextoNivel, nos };
}

describe('nivelamento da voz (volume-da-voz, T-1 a T-3)', () => {
  it('parâmetros: compressor de voz, limitador em −2,5 dBFS; nivelar escolhe o ramo; o ganho passa direto', () => {
    const p = parametrosNivel({ nivelar: true, ganho: 2 });
    expect(p.compressor).toEqual({ threshold: -45, knee: 6, ratio: 4, attack: 0.003, release: 0.25 });
    expect(p.limitador).toMatchObject({ threshold: -2.5, ratio: 20, knee: 0, attack: 0 });
    expect(p.limitador.threshold).toBeLessThanOrEqual(-1);
    expect([p.nivelado, p.direto, p.ganho]).toEqual([1, 0, 2]);
    const sem = parametrosNivel({ nivelar: false, ganho: 1 });
    expect([sem.nivelado, sem.direto, sem.ganho]).toEqual([0, 1, 1]);
  });

  it('CA-5 (RN-6): a ordem é portão → (compressor | direto) → ganho → limitador → saída', () => {
    const { ctx, nos } = contexto();
    const portao = no('portao');
    const saida = no('destino');
    montarNivel(ctx, portao as unknown as AudioNode, saida as unknown as AudioNode, { nivelar: true, ganho: 1 });
    const [compressor, nivelado, direto, ganho, limitador, correcao] = nos;
    expect(portao.saidas).toEqual([compressor!.nome, direto!.nome]);
    expect(compressor!.saidas).toEqual([nivelado!.nome]);
    expect(nivelado!.saidas).toEqual([ganho!.nome]);
    expect(direto!.saidas).toEqual([ganho!.nome]);
    expect(ganho!.saidas).toEqual([limitador!.nome]);
    expect(limitador!.saidas).toEqual([correcao!.nome]);
    expect(correcao!.saidas).toEqual(['destino']);
    // Valores iniciais sem rampa: o ramo nivelado já com a compensação; a correção do limitador abaixo de 1.
    const p = parametrosNivel({ nivelar: true, ganho: 1 });
    expect([nivelado!.gain.value, direto!.gain.value, ganho!.gain.value, correcao!.gain.value]).toEqual([p.compensacao, 0, 1, p.correcao]);
    expect(p.correcao).toBeCloseTo(0.849, 2);
    expect(compressor!.threshold.value).toBe(-45);
    expect(limitador!.threshold.value).toBe(-2.5);
  });

  it('CA-3 e RF-6: desligar o nivelamento e mudar o ganho ao vivo usam rampas (sem religar nós)', () => {
    const { ctx, nos } = contexto();
    const portao = no('portao');
    const nivel = montarNivel(ctx, portao as unknown as AudioNode, no('destino') as unknown as AudioNode, { nivelar: true, ganho: 1 });
    const [, nivelado, direto, ganho] = nos;
    const p = parametrosNivel({ nivelar: true, ganho: 1 });
    const ligacoes = portao.saidas.length;
    nivel.definir({ nivelar: true, ganho: 1 });
    expect(nivelado!.gain.setTargetAtTime).toHaveBeenLastCalledWith(p.compensacao, 3, expect.any(Number));
    nivel.definir({ nivelar: false, ganho: 2 });
    expect(nivelado!.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 3, expect.any(Number));
    expect(direto!.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 3, expect.any(Number));
    expect(ganho!.gain.setTargetAtTime).toHaveBeenLastCalledWith(2, 3, expect.any(Number));
    expect(portao.saidas).toHaveLength(ligacoes);
  });

  it('reserva sem grafo: o controle existe e não faz nada', () => {
    expect(() => nivelInerte.definir({ nivelar: false, ganho: 3 })).not.toThrow();
  });
});
