import { describe, expect, it } from 'vitest';
import { LogicaPortao } from './portao-voz.worklet.js';

const TAXA = 48_000;
const bloco = (amplitude: number) => new Float32Array(128).fill(amplitude);
/** Roda `ms` milissegundos de um sinal constante; devolve se terminou aberto e o último ganho. */
function rodar(p: LogicaPortao, amplitude: number, ms: number) {
  const saida = new Float32Array(128);
  let aberto = false;
  for (let i = 0; i < Math.ceil((ms / 1000) * TAXA / 128); i++) aberto = p.processar(bloco(amplitude), saida);
  return { aberto, saida: saida[127]! };
}

describe('portão de voz (RF-14, RF-16)', () => {
  it('CA-21: abaixo da sensibilidade não transmite; baixar a sensibilidade passa a transmitir', () => {
    const p = new LogicaPortao(TAXA);
    p.definir({ limiarDb: -20 });
    // 0,01 ≈ -40 dBFS (fala baixa)
    expect(rodar(p, 0.01, 100)).toEqual({ aberto: false, saida: 0 });
    p.definir({ limiarDb: -50 });
    const r = rodar(p, 0.01, 100);
    expect(r.aberto).toBe(true);
    expect(r.saida).toBeCloseTo(0.01, 5);
  });

  it('segura aberto 300 ms depois do fim da fala e fecha com rampa', () => {
    const p = new LogicaPortao(TAXA);
    rodar(p, 0.1, 50);
    expect(rodar(p, 0, 250).aberto).toBe(true);
    expect(rodar(p, 0.0001, 100).aberto).toBe(false);
  });

  it('CA-22: push-to-talk só com o atalho; mudo sempre fecha', () => {
    const p = new LogicaPortao(TAXA);
    p.definir({ modo: 'ptt', limiarDb: -100 });
    expect(rodar(p, 0.1, 50).aberto).toBe(false);
    p.definir({ ptt: true });
    expect(rodar(p, 0.1, 50)).toEqual({ aberto: true, saida: expect.closeTo(0.1, 5) });
    p.definir({ mudo: true });
    expect(rodar(p, 0.1, 50)).toEqual({ aberto: false, saida: 0 });
  });

  it('olhar à frente: o começo da palavra sai inteiro (a saída vem 20 ms atrasada e o portão já está aberto)', () => {
    const p = new LogicaPortao(TAXA);
    rodar(p, 0, 100);
    // Uma palavra que começa forte já no primeiro bloco: com o atraso, a primeira amostra dela sai com ganho alto.
    const saida = new Float32Array(128);
    const atrasoAmostras = Math.round(0.02 * TAXA);
    const fala = new Float32Array(128).fill(0.1);
    const blocos: number[] = [];
    for (let i = 0; i < Math.ceil(atrasoAmostras / 128) + 1; i++) {
      p.processar(fala, saida);
      blocos.push(...saida);
    }
    const primeira = blocos.findIndex((v) => v !== 0);
    expect(primeira).toBe(atrasoAmostras);
    // Sem o atraso, a primeira amostra sairia com ganho ~1/480 (rampa começando); agora sai quase inteira.
    expect(blocos[primeira]!).toBeGreaterThan(0.09);
  });
});
