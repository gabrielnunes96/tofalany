import { PERMISSOES, PERMISSOES_BASICAS, type FuncaoDto, type StatusPessoa, type UsuarioDto } from '@tofalando/shared';

/** Peso do cargo: administrador no topo; cargo personalizado pelo número de permissões; sem cargo, as básicas. */
export function pesoDoCargo(u: Pick<UsuarioDto, 'cargo' | 'funcaoId'>, funcoes: FuncaoDto[]): number {
  if (u.cargo === 'admin') return PERMISSOES.length + 1;
  const funcao = u.funcaoId ? funcoes.find((f) => f.id === u.funcaoId) : undefined;
  return funcao ? funcao.permissoes.length : PERMISSOES_BASICAS.length;
}

/** Nome do grupo do cargo na lista de membros. */
export function nomeDoCargo(u: Pick<UsuarioDto, 'cargo' | 'funcaoId'>, funcoes: FuncaoDto[]): string {
  if (u.cargo === 'admin') return 'Administradores';
  return (u.funcaoId ? funcoes.find((f) => f.id === u.funcaoId)?.nome : undefined) ?? 'Membros';
}

export type LinhaMembros = { grupo: string } | { u: UsuarioDto; status: StatusPessoa };

/**
 * Lista de membros como no Discord: quem está conectado, agrupado por cargo (do que tem mais permissões para o
 * que tem menos; empate pelo nome do cargo) e em ordem alfabética dentro de cada um; depois os offline, na mesma ordem.
 */
export function ordenarMembros(usuarios: UsuarioDto[], presencas: Partial<Record<number, StatusPessoa>>, funcoes: FuncaoDto[]): LinhaMembros[] {
  const comparar = (a: UsuarioDto, b: UsuarioDto) =>
    pesoDoCargo(b, funcoes) - pesoDoCargo(a, funcoes) ||
    nomeDoCargo(a, funcoes).localeCompare(nomeDoCargo(b, funcoes), 'pt-BR') ||
    a.nomeExibicao.localeCompare(b.nomeExibicao, 'pt-BR', { sensitivity: 'base' });
  const com = [...usuarios].sort(comparar).map((u) => ({ u, status: presencas[u.id] ?? ('offline' as StatusPessoa) }));
  const ativos = com.filter((m) => m.status !== 'offline');
  const fora = com.filter((m) => m.status === 'offline');
  const linhas: LinhaMembros[] = [];
  let grupoAtual: string | undefined;
  for (const m of ativos) {
    const grupo = nomeDoCargo(m.u, funcoes);
    if (grupo !== grupoAtual) {
      linhas.push({ grupo: `${grupo} — ${ativos.filter((x) => nomeDoCargo(x.u, funcoes) === grupo).length}` });
      grupoAtual = grupo;
    }
    linhas.push(m);
  }
  if (fora.length) linhas.push({ grupo: `Offline — ${fora.length}` }, ...fora);
  return linhas;
}
