import { CORES_PERFIL, normalizarUsuario, type Cargo, type UsuarioDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { iguaisSeguro } from '../auth/tokens.js';
import { CHAVE_CONVITE, lerConfiguracao } from './configuracoes.js';

interface LinhaUsuario {
  id: number;
  usuario: string;
  senha_hash: string;
  nome_exibicao: string;
  cor: string;
  avatar_arquivo: string | null;
  cargo: Cargo;
}

export function paraDto(u: LinhaUsuario): UsuarioDto {
  return {
    id: u.id,
    usuario: u.usuario,
    nomeExibicao: u.nome_exibicao,
    cor: u.cor,
    avatarUrl: u.avatar_arquivo ? `/files/${u.avatar_arquivo}` : null,
    cargo: u.cargo,
  };
}

export function contarContasAtivas(banco: Banco): number {
  return (banco.prepare('SELECT COUNT(*) AS n FROM usuarios WHERE removido_em IS NULL').get() as { n: number }).n;
}

export function buscarPorLogin(banco: Banco, usuario: string): LinhaUsuario | undefined {
  return banco
    .prepare('SELECT * FROM usuarios WHERE usuario_norm = ? AND removido_em IS NULL')
    .get(normalizarUsuario(usuario)) as LinhaUsuario | undefined;
}

export function buscarPorId(banco: Banco, id: number): LinhaUsuario | undefined {
  return banco.prepare('SELECT * FROM usuarios WHERE id = ? AND removido_em IS NULL').get(id) as LinhaUsuario | undefined;
}

interface NovoUsuario {
  convite: string;
  usuario: string;
  senhaHash: string;
  limiteContas: number;
}

/** RN-1: compara com o código vigente; sem código configurado, nada passa. */
export function conferirConvite(banco: Banco, convite: string): void {
  const vigente = lerConfiguracao(banco, CHAVE_CONVITE);
  if (!vigente || !iguaisSeguro(convite.trim(), vigente)) {
    throw new ErroHttp(403, 'convite_invalido', 'Código de convite inválido.');
  }
}

/** RN-1 a RN-4, numa transação para o limite e a unicidade não correrem entre dois cadastros. */
export function cadastrarUsuario(banco: Banco, novo: NovoUsuario, agora: number = Date.now()): LinhaUsuario {
  return banco.transaction(() => {
    // De novo dentro da transação: o administrador pode ter trocado o código no meio (T6).
    conferirConvite(banco, novo.convite);
    if (contarContasAtivas(banco) >= novo.limiteContas) {
      throw new ErroHttp(409, 'limite_contas', 'Limite de contas atingido neste servidor.');
    }
    if (buscarPorLogin(banco, novo.usuario)) {
      throw new ErroHttp(409, 'usuario_em_uso', 'Esse nome de usuário já está em uso.');
    }
    const primeira = (banco.prepare('SELECT COUNT(*) AS n FROM usuarios').get() as { n: number }).n === 0;
    const cargo: Cargo = primeira ? 'admin' : 'membro';
    const cor = CORES_PERFIL[Math.floor(Math.random() * CORES_PERFIL.length)]!;
    const resultado = banco
      .prepare(
        `INSERT INTO usuarios (usuario, usuario_norm, senha_hash, nome_exibicao, cor, cargo, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(novo.usuario, normalizarUsuario(novo.usuario), novo.senhaHash, novo.usuario, cor, cargo, agora);
    return buscarPorId(banco, Number(resultado.lastInsertRowid))!;
  })();
}
