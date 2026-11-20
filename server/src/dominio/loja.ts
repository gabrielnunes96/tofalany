/**
 * Pontos e loja (docs/demandas/pontos-e-loja): saldo por conta, ganho por sessão de voz, compras de tema e vale,
 * extrato. Tudo síncrono (better-sqlite3): cada compra é uma transação só, então duas ao mesmo tempo não deixam o
 * saldo negativo (CA-11).
 */
import {
  chaveItem,
  novaValidade,
  qualidadesDosVales,
  QUALIDADES_VALE,
  type ItemLoja,
  type LojaEstadoDto,
  type MovimentoDto,
  type PrecosLoja,
  type QualidadeTela,
  type QualidadeVale,
  type TemaLoja,
  type ValeDto,
} from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { ehAdminDaInstalacao } from './comunidades.js';

const saldoDe = (banco: Banco, usuarioId: number): number =>
  (banco.prepare('SELECT saldo FROM pontos_saldos WHERE usuario_id = ?').get(usuarioId) as { saldo: number } | undefined)?.saldo ?? 0;

const valesDe = (banco: Banco, usuarioId: number): ValeDto[] =>
  (banco.prepare('SELECT qualidade, expira_em FROM loja_vales WHERE usuario_id = ? ORDER BY qualidade').all(usuarioId) as { qualidade: QualidadeVale; expira_em: number }[]).map(
    (v) => ({ qualidade: v.qualidade, expiraEm: v.expira_em }),
  );

/** Saldo, temas comprados e vales ainda válidos; o administrador da instalação tem tudo liberado (RN-11). */
export function estadoLoja(banco: Banco, usuarioId: number, agora: number = Date.now()): LojaEstadoDto {
  const temas = (banco.prepare('SELECT tema FROM loja_temas WHERE usuario_id = ? ORDER BY comprado_em').all(usuarioId) as { tema: TemaLoja }[]).map((t) => t.tema);
  return {
    saldo: saldoDe(banco, usuarioId),
    temas,
    vales: valesDe(banco, usuarioId).filter((v) => v.expiraEm > agora),
    tudoLiberado: ehAdminDaInstalacao(banco, usuarioId),
  };
}

/**
 * Qualidades extras que a conta tem pela loja agora: as dos vales ativos; o administrador da instalação tem todos os
 * vales (2K continua só pelo cargo de cada servidor, técnica seção 6).
 */
export function qualidadesDaLoja(banco: Banco, usuarioId: number, agora: number = Date.now()): QualidadeTela[] {
  if (ehAdminDaInstalacao(banco, usuarioId)) return QUALIDADES_VALE;
  return qualidadesDosVales(valesDe(banco, usuarioId), agora);
}

/**
 * Credita pontos de voz. `movimentoId`: a linha de ganho da sessão em andamento (uma por sessão de voz, RF-9);
 * sem ela, abre uma nova. Devolve o id da linha, para os próximos minutos da mesma sessão.
 */
export function creditar(banco: Banco, usuarioId: number, pontos: number, movimentoId: number | null, agora: number = Date.now()): number | null {
  // Nada a creditar (minuto incompleto): não mexe no saldo nem abre linha vazia no extrato.
  if (!Number.isInteger(pontos) || pontos <= 0) return movimentoId;
  return banco.transaction(() => {
    banco
      .prepare('INSERT INTO pontos_saldos (usuario_id, saldo, atualizado_em) VALUES (?, ?, ?) ON CONFLICT(usuario_id) DO UPDATE SET saldo = saldo + excluded.saldo, atualizado_em = excluded.atualizado_em')
      .run(usuarioId, pontos, agora);
    if (movimentoId !== null) {
      const r = banco.prepare("UPDATE pontos_movimentos SET valor = valor + ?, atualizado_em = ? WHERE id = ? AND usuario_id = ? AND tipo = 'ganho'").run(pontos, agora, movimentoId, usuarioId);
      if (r.changes === 1) return movimentoId;
    }
    return Number(
      banco.prepare("INSERT INTO pontos_movimentos (usuario_id, tipo, item, valor, criado_em, atualizado_em) VALUES (?, 'ganho', NULL, ?, ?, ?)").run(usuarioId, pontos, agora, agora).lastInsertRowid,
    );
  })();
}

/** Preço do item na configuração do servidor (RN-6). */
export const precoDe = (precos: PrecosLoja, item: ItemLoja): number => (item.tipo === 'tema' ? precos.tema : precos.vales[item.qualidade]);

/**
 * Compra (RN-5, RN-7, RN-8, RN-13): desconta o saldo e entrega o item na mesma transação. Sem saldo, nada muda.
 * Devolve o estado novo e o valor cobrado.
 */
export function comprar(banco: Banco, usuarioId: number, item: ItemLoja, precos: PrecosLoja, agora: number = Date.now()): { estado: LojaEstadoDto; valor: number } {
  if (ehAdminDaInstalacao(banco, usuarioId)) throw new ErroHttp(409, 'tudo_liberado', 'O administrador já tem tudo liberado.');
  const valor = precoDe(precos, item);
  banco.transaction(() => {
    if (item.tipo === 'tema' && banco.prepare('SELECT 1 FROM loja_temas WHERE usuario_id = ? AND tema = ?').get(usuarioId, item.tema)) {
      throw new ErroHttp(409, 'item_ja_comprado', 'Você já tem este tema.');
    }
    const r = banco.prepare('UPDATE pontos_saldos SET saldo = saldo - ?, atualizado_em = ? WHERE usuario_id = ? AND saldo >= ?').run(valor, agora, usuarioId, valor);
    if (r.changes === 0) {
      const falta = valor - saldoDe(banco, usuarioId);
      throw new ErroHttp(409, 'saldo_insuficiente', `Faltam ${falta} pontos.`);
    }
    if (item.tipo === 'tema') {
      banco.prepare('INSERT INTO loja_temas (usuario_id, tema, comprado_em) VALUES (?, ?, ?)').run(usuarioId, item.tema, agora);
    } else {
      const atual = banco.prepare('SELECT expira_em FROM loja_vales WHERE usuario_id = ? AND qualidade = ?').get(usuarioId, item.qualidade) as { expira_em: number } | undefined;
      banco
        .prepare('INSERT INTO loja_vales (usuario_id, qualidade, expira_em) VALUES (?, ?, ?) ON CONFLICT(usuario_id, qualidade) DO UPDATE SET expira_em = excluded.expira_em')
        .run(usuarioId, item.qualidade, novaValidade(atual?.expira_em, agora));
    }
    banco
      .prepare("INSERT INTO pontos_movimentos (usuario_id, tipo, item, valor, criado_em, atualizado_em) VALUES (?, 'compra', ?, ?, ?, ?)")
      .run(usuarioId, chaveItem(item), -valor, agora, agora);
  })();
  return { estado: estadoLoja(banco, usuarioId, agora), valor };
}

/** Extrato da conta, do mais novo para o mais antigo (RF-9); `antes` pagina pelo id. */
export function extrato(banco: Banco, usuarioId: number, opcoes: { antes?: number; limite?: number } = {}): MovimentoDto[] {
  const pedido = Math.trunc(Number(opcoes.limite ?? 50));
  const limite = Number.isFinite(pedido) ? Math.min(Math.max(pedido, 1), 100) : 50;
  const antes = opcoes.antes !== undefined && Number.isInteger(opcoes.antes) ? opcoes.antes : null;
  const linhas = banco
    .prepare('SELECT id, tipo, item, valor, atualizado_em FROM pontos_movimentos WHERE usuario_id = ? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT ?')
    .all(usuarioId, antes, antes, limite) as { id: number; tipo: 'ganho' | 'compra'; item: string | null; valor: number; atualizado_em: number }[];
  return linhas.map((l) => ({ id: l.id, tipo: l.tipo, item: l.item, valor: l.valor, em: l.atualizado_em }));
}
