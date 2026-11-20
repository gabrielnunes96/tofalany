import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const PARAMETROS = { N: 2 ** 15, r: 8, p: 1 } as const;
const TAMANHO_CHAVE = 64;

function derivar(senha: string, sal: Buffer, opcoes: ScryptOptions): Promise<Buffer> {
  return new Promise((resolver, rejeitar) => {
    scrypt(senha.normalize('NFKC'), sal, TAMANHO_CHAVE, { ...opcoes, maxmem: 128 * 1024 * 1024 }, (erro, chave) =>
      erro ? rejeitar(erro) : resolver(chave),
    );
  });
}

/** Formato: scrypt$N$r$p$sal(base64)$hash(base64). */
export async function gerarHashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await derivar(senha, sal, PARAMETROS);
  return ['scrypt', PARAMETROS.N, PARAMETROS.r, PARAMETROS.p, sal.toString('base64'), chave.toString('base64')].join('$');
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, n, r, p, sal, hash] = partes as [string, string, string, string, string, string];
  const esperado = Buffer.from(hash, 'base64');
  const chave = await derivar(senha, Buffer.from(sal, 'base64'), { N: Number(n), r: Number(r), p: Number(p) });
  return chave.length === esperado.length && timingSafeEqual(chave, esperado);
}
