import type { Banco } from '../db/banco.js';

export const CHAVE_CONVITE = 'codigo_convite';

export function lerConfiguracao(banco: Banco, chave: string): string | undefined {
  const linha = banco.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave) as { valor: string } | undefined;
  return linha?.valor;
}

export function gravarConfiguracao(banco: Banco, chave: string, valor: string): void {
  banco.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(chave, valor);
}

/**
 * RN-1: o código vigente fica no banco. Na primeira subida vem de CODIGO_CONVITE;
 * depois disso o banco vence (o administrador troca pelo app, T6).
 */
export function garantirCodigoConvite(banco: Banco, codigoAmbiente: string | undefined): void {
  if (lerConfiguracao(banco, CHAVE_CONVITE)) return;
  if (!codigoAmbiente) throw new Error('Defina CODIGO_CONVITE na configuração do servidor antes da primeira subida.');
  gravarConfiguracao(banco, CHAVE_CONVITE, codigoAmbiente);
}
