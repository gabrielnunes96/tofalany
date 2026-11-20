import type { Ack } from '@tofalando/shared';
import { ErroHttp } from '../erros.js';

/**
 * Envolve um tratador de evento com resposta: valida que veio o ack, devolve { ok, valor } ou
 * { ok: false, erro } com a mensagem de negócio; erro inesperado vira mensagem genérica (e vai ao log).
 */
export function comAck<D, T>(registrarErro: (e: unknown) => void, fn: (dados: D) => T) {
  return (dados: D, ack: Ack<T>) => {
    if (typeof ack !== 'function') return;
    try {
      ack({ ok: true, valor: fn(dados) });
    } catch (erro) {
      if (erro instanceof ErroHttp) ack({ ok: false, erro: erro.message });
      else {
        registrarErro(erro);
        ack({ ok: false, erro: 'Erro interno no servidor.' });
      }
    }
  };
}
