import { PERMISSOES, permissoesDe, type FuncaoDto, type Permissao } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { buscarPorId } from './usuarios.js';

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

export function listarFuncoes(banco: Banco): FuncaoDto[] {
  return (banco.prepare('SELECT * FROM funcoes ORDER BY id').all() as LinhaFuncao[]).map(paraDto);
}

export function buscarFuncao(banco: Banco, id: number): FuncaoDto | undefined {
  const l = banco.prepare('SELECT * FROM funcoes WHERE id = ?').get(id) as LinhaFuncao | undefined;
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

export function criarFuncao(banco: Banco, f: { nome: string; cor: string; permissoes: Permissao[] }): FuncaoDto {
  const r = banco.prepare('INSERT INTO funcoes (nome, cor, permissoes, criado_em) VALUES (?, ?, ?, ?)').run(f.nome, f.cor, JSON.stringify(f.permissoes), Date.now());
  return buscarFuncao(banco, Number(r.lastInsertRowid))!;
}

export function editarFuncao(banco: Banco, id: number, f: { nome: string; cor: string; permissoes: Permissao[] }): FuncaoDto | undefined {
  const r = banco.prepare('UPDATE funcoes SET nome = ?, cor = ?, permissoes = ? WHERE id = ?').run(f.nome, f.cor, JSON.stringify(f.permissoes), id);
  return r.changes ? buscarFuncao(banco, id) : undefined;
}

/** Remove o cargo; quem o tinha fica sem cargo personalizado. Devolve os afetados. */
export function removerFuncao(banco: Banco, id: number): number[] | undefined {
  const afetados = (banco.prepare('SELECT id FROM usuarios WHERE funcao_id = ?').all(id) as { id: number }[]).map((u) => u.id);
  banco.prepare('UPDATE usuarios SET funcao_id = NULL WHERE funcao_id = ?').run(id);
  const r = banco.prepare('DELETE FROM funcoes WHERE id = ?').run(id);
  return r.changes ? afetados : undefined;
}

/** O usuário pode? (administrador sempre; os outros pelo cargo personalizado). */
export function temPermissao(banco: Banco, usuarioId: number, permissao: Permissao): boolean {
  const u = buscarPorId(banco, usuarioId);
  if (!u) return false;
  return permissoesDe({ cargo: u.cargo, funcaoId: u.funcao_id }, u.funcao_id ? [buscarFuncao(banco, u.funcao_id)].filter((f): f is FuncaoDto => !!f) : []).has(permissao);
}
