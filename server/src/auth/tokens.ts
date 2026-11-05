import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Token de sessão de 256 bits; só o hash vai para o banco. */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Comparação em tempo constante para segredos curtos (ex.: código de convite). */
export function iguaisSeguro(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}
