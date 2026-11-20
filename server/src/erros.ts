import type { CodigoErro, ErroApi } from '@tofalando/shared';

/** Erro de negócio que vira resposta HTTP { erro, mensagem }. */
export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: CodigoErro,
    mensagem: string,
  ) {
    super(mensagem);
  }

  corpo(): ErroApi {
    return { erro: this.codigo, mensagem: this.message };
  }
}
