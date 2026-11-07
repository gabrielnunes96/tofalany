import { COMUNIDADE_PRINCIPAL, PERMISSOES, permissoesDe, type FuncaoDto, type Permissao } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { buscarPorId } from './usuarios.js';
import { membroDe } from './comunidades.js';

/** Backlog v2, item 10c: cargos personalizados (nome, cor e permissões). */
interface LinhaFuncao {
  id: number;
  nome: string;
  cor: string;
  permissoes: string;
}

const validas = new Set<string>(PERMISSOES.map((p) => p.id));

function paraDto(l: LinhaFuncao): FuncaoDto {
  let lista: unknown;
  try {
    lista = JSON.parse(l.permissoes);
  } catch {
    lista = [];
  }
  return { id: l.id, nome: l.nome, cor: l.cor, permissoes: (Array.isArray(lista) ? lista : []).filter((p): p is Permissao => typeof p === 'string' && validas.has(p)) };
}

export function listarFuncoes(banco: Banco, comunidadeId: number = COMUNIDADE_PRINCIPAL): FuncaoDto[] {
  return (banco.prepare('SELECT * FROM funcoes WHERE comunidade_id = ? ORDER BY id').all(comunidadeId) as LinhaFuncao[]).map(paraDto);
}

/** Cargo personalizado do servidor (um id de outro servidor não vale aqui). */
export function buscarFuncao(banco: Banco, id: number, comunidadeId: number = COMUNIDADE_PRINCIPAL): FuncaoDto | undefined {
  const l = banco.prepare('SELECT * FROM funcoes WHERE id = ? AND comunidade_id = ?').get(id, comunidadeId) as LinhaFuncao | undefined;
  return l ? paraDto(l) : undefined;
}

/** Nome (1 a 32), cor #rrggbb e permissões conhecidas; devolve o erro em texto ou os valores limpos. */
export function validarFuncao(dados: unknown): { erro: string } | { nome: string; cor: string; permissoes: Permissao[] } {
  const o = (typeof dados === 'object' && dados !== null ? dados : {}) as { nome?: unknown; cor?: unknown; permissoes?: unknown };
  const nome = typeof o.nome === 'string' ? o.nome.trim().replace(/\s+/g, ' ') : '';
  if (!nome || nome.length > 32) return { erro: 'O nome do cargo deve ter de 1 a 32 caracteres.' };
  const cor = typeof o.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.cor) ? o.cor.toLowerCase() : undefined;
  if (!cor) return { erro: 'Cor inválida.' };
  if (!Array.isArray(o.permissoes) || !o.permissoes.every((p) => typeof p === 'string' && validas.has(p))) return { erro: 'Permissão desconhecida.' };
  return { nome, cor, permissoes: [...new Set(o.permissoes as Permissao[])] };
}

export function criarFuncao(banco: Banco, f: { nome: string; cor: string; permissoes: Permissao[] }, comunidadeId: number = COMUNIDADE_PRINCIPAL): FuncaoDto {
  const r = banco
    .prepare('INSERT INTO funcoes (nome, cor, permissoes, criado_em, comunidade_id) VALUES (?, ?, ?, ?, ?)')
    .run(f.nome, f.cor, JSON.stringify(f.permissoes), Date.now(), comunidadeId);
  return buscarFuncao(banco, Number(r.lastInsertRowid), comunidadeId)!;
}

export function editarFuncao(banco: Banco, id: number, f: { nome: string; cor: string; permissoes: Permissao[] }, comunidadeId: number = COMUNIDADE_PRINCIPAL): FuncaoDto | undefined {
  const r = banco.prepare('UPDATE funcoes SET nome = ?, cor = ?, permissoes = ? WHERE id = ? AND comunidade_id = ?').run(f.nome, f.cor, JSON.stringify(f.permissoes), id, comunidadeId);
  return r.changes ? buscarFuncao(banco, id, comunidadeId) : undefined;
}

/** Remove o cargo; quem o tinha fica sem cargo personalizado. Devolve os afetados. */
export function removerFuncao(banco: Banco, id: number, comunidadeId: number = COMUNIDADE_PRINCIPAL): number[] | undefined {
  if (!buscarFuncao(banco, id, comunidadeId)) return undefined;
  const afetados = (banco.prepare('SELECT usuario_id FROM membros WHERE funcao_id = ?').all(id) as { usuario_id: number }[]).map((u) => u.usuario_id);
  banco.prepare('UPDATE membros SET funcao_id = NULL WHERE funcao_id = ?').run(id);
  const r = banco.prepare('DELETE FROM funcoes WHERE id = ?').run(id);
  return r.changes ? afetados : undefined;
}

/** O usuário pode? (administrador sempre; os outros pelo cargo personalizado). */
/** Permissão da pessoa no servidor: administrador de lá tudo; senão, o que o cargo personalizado de lá libera. */
export function temPermissao(banco: Banco, usuarioId: number, permissao: Permissao, comunidadeId: number = COMUNIDADE_PRINCIPAL): boolean {
  if (!buscarPorId(banco, usuarioId)) return false;
  const m = membroDe(banco, comunidadeId, usuarioId);
  if (!m) return false;
  const funcao = m.funcao_id ? buscarFuncao(banco, m.funcao_id, comunidadeId) : undefined;
  return permissoesDe({ cargo: m.cargo, funcaoId: m.funcao_id }, funcao ? [funcao] : []).has(permissao);
}
