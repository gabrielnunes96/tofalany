/**
 * Autenticação em dois fatores (opcional, por conta): o segredo do app de autenticação e 8 códigos de recuperação de
 * uso único (só o hash fica no banco). Pedida só no login; a sessão salva continua entrando direto.
 */
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { hashToken } from '../auth/tokens.js';
import { conferirCodigo, gerarCodigoRecuperacao, gerarSegredo, normalizarRecuperacao } from '../auth/totp.js';

export const QUANTOS_CODIGOS = 8;

interface Linha {
  segredo: string;
  ativado_em: number | null;
  ultimo_passo: number;
}

const linhaDe = (banco: Banco, usuarioId: number) =>
  banco.prepare('SELECT segredo, ativado_em, ultimo_passo FROM dois_fatores WHERE usuario_id = ?').get(usuarioId) as Linha | undefined;

export const temDoisFatores = (banco: Banco, usuarioId: number): boolean => !!linhaDe(banco, usuarioId)?.ativado_em;

export function situacaoDoisFatores(banco: Banco, usuarioId: number): { ativo: boolean; codigosRestantes: number } {
  const ativo = temDoisFatores(banco, usuarioId);
  const restantes = ativo
    ? (banco.prepare('SELECT COUNT(*) AS n FROM codigos_recuperacao WHERE usuario_id = ? AND usado_em IS NULL').get(usuarioId) as { n: number }).n
    : 0;
  return { ativo, codigosRestantes: restantes };
}

/** Começa a configurar: segredo novo, ainda desligado até a pessoa confirmar um código do app. */
export function iniciarDoisFatores(banco: Banco, usuarioId: number, agora: number = Date.now()): string {
  if (temDoisFatores(banco, usuarioId)) throw new ErroHttp(409, 'dados_invalidos', 'A autenticação em dois fatores já está ligada.');
  const segredo = gerarSegredo();
  banco
    .prepare('INSERT INTO dois_fatores (usuario_id, segredo, ativado_em, ultimo_passo, criado_em) VALUES (?, ?, NULL, 0, ?) ON CONFLICT(usuario_id) DO UPDATE SET segredo = excluded.segredo, ativado_em = NULL, ultimo_passo = 0, criado_em = excluded.criado_em')
    .run(usuarioId, segredo, agora);
  return segredo;
}

/** Confirma com um código do app: liga e devolve os 8 códigos de recuperação (mostrados uma vez só). */
export function ativarDoisFatores(banco: Banco, usuarioId: number, codigo: string, agora: number = Date.now()): string[] {
  const linha = linhaDe(banco, usuarioId);
  if (!linha || linha.ativado_em) throw new ErroHttp(409, 'dados_invalidos', 'Comece a configuração de novo.');
  const passo = conferirCodigo(linha.segredo, codigo, agora, linha.ultimo_passo);
  if (passo === null) throw new ErroHttp(400, 'codigo_2fa_invalido', 'Código incorreto. Confira o relógio do celular e digite o código atual do app.');
  const codigos = Array.from({ length: QUANTOS_CODIGOS }, gerarCodigoRecuperacao);
  banco.transaction(() => {
    banco.prepare('UPDATE dois_fatores SET ativado_em = ?, ultimo_passo = ? WHERE usuario_id = ?').run(agora, passo, usuarioId);
    banco.prepare('DELETE FROM codigos_recuperacao WHERE usuario_id = ?').run(usuarioId);
    const inserir = banco.prepare('INSERT INTO codigos_recuperacao (usuario_id, hash, usado_em) VALUES (?, ?, NULL)');
    for (const c of codigos) inserir.run(usuarioId, hashToken(normalizarRecuperacao(c)));
  })();
  return codigos;
}

/**
 * Segundo fator no login: código do app (não repete um já usado) ou um código de recuperação (gasta o código).
 * Devolve como passou, ou null se não confere.
 */
export function conferirSegundoFator(banco: Banco, usuarioId: number, codigo: string, agora: number = Date.now()): 'app' | 'recuperacao' | null {
  const linha = linhaDe(banco, usuarioId);
  if (!linha?.ativado_em) return null;
  const passo = conferirCodigo(linha.segredo, codigo, agora, linha.ultimo_passo);
  if (passo !== null) {
    banco.prepare('UPDATE dois_fatores SET ultimo_passo = ? WHERE usuario_id = ?').run(passo, usuarioId);
    return 'app';
  }
  const normal = normalizarRecuperacao(codigo);
  if (normal.length !== 8) return null;
  const r = banco.prepare('UPDATE codigos_recuperacao SET usado_em = ? WHERE usuario_id = ? AND hash = ? AND usado_em IS NULL').run(agora, usuarioId, hashToken(normal));
  return r.changes === 1 ? 'recuperacao' : null;
}

export function desligarDoisFatores(banco: Banco, usuarioId: number): boolean {
  return banco.transaction(() => {
    banco.prepare('DELETE FROM codigos_recuperacao WHERE usuario_id = ?').run(usuarioId);
    return banco.prepare('DELETE FROM dois_fatores WHERE usuario_id = ?').run(usuarioId).changes === 1;
  })();
}
