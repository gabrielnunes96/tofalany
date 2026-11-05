import type { DmDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarPorId } from './usuarios.js';

interface LinhaDm {
  id: number;
  usuario_a: number;
  usuario_b: number;
  criado_em: number;
  ultima: number | null;
}

const paraDto = (d: LinhaDm, eu: number): DmDto => ({
  id: d.id,
  outroId: d.usuario_a === eu ? d.usuario_b : d.usuario_a,
  ultimaEm: d.ultima ?? d.criado_em,
});

const SELECIONAR = `SELECT d.*, (SELECT MAX(m.criada_em) FROM mensagens m WHERE m.dm_id = d.id) AS ultima FROM dms d`;

export function buscarDm(banco: Banco, id: number): { id: number; participantes: [number, number] } | undefined {
  const d = banco.prepare('SELECT * FROM dms WHERE id = ?').get(id) as LinhaDm | undefined;
  return d && { id: d.id, participantes: [d.usuario_a, d.usuario_b] };
}

/** DM vista por uma das pessoas (para o ack e o aviso a cada participante). */
export function dmPara(banco: Banco, id: number, eu: number): DmDto {
  return paraDto(banco.prepare(`${SELECIONAR} WHERE d.id = ?`).get(id) as LinhaDm, eu);
}

/** RN-18: só quem participa. Inclusive administrador: nada de exceção. */
export function exigirParticipante(banco: Banco, dmId: number, usuarioId: number): [number, number] {
  const dm = buscarDm(banco, dmId);
  if (!dm || !dm.participantes.includes(usuarioId)) throw new ErroHttp(403, 'sem_permissao', 'Conversa não encontrada.');
  return dm.participantes;
}

/** Abre a DM com outra pessoa ativa (cria se ainda não existe). Consigo mesmo, não. */
export function abrirDm(banco: Banco, eu: number, outro: number, agora: number = Date.now()): number {
  if (eu === outro) throw new ErroHttp(400, 'dados_invalidos', 'Escolha outra pessoa para conversar.');
  if (!buscarPorId(banco, outro)) throw new ErroHttp(404, 'nao_encontrado', 'Pessoa não encontrada.');
  const [a, b] = eu < outro ? [eu, outro] : [outro, eu];
  banco.prepare('INSERT INTO dms (usuario_a, usuario_b, criado_em) VALUES (?, ?, ?) ON CONFLICT(usuario_a, usuario_b) DO NOTHING').run(a, b, agora);
  return (banco.prepare('SELECT id FROM dms WHERE usuario_a = ? AND usuario_b = ?').get(a, b) as { id: number }).id;
}

/** DMs da pessoa (para o retrato inicial), da mais recente para a mais antiga. */
export function listarDms(banco: Banco, eu: number): DmDto[] {
  const linhas = banco.prepare(`${SELECIONAR} WHERE d.usuario_a = ? OR d.usuario_b = ?`).all(eu, eu) as LinhaDm[];
  return linhas.map((d) => paraDto(d, eu)).sort((x, y) => y.ultimaEm - x.ultimaEm || y.id - x.id);
}
