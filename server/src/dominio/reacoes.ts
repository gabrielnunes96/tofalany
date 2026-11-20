import { REACOES_POR_MENSAGEM, type ReacaoDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';

interface LinhaReacao {
  mensagem_id: number;
  emoji: string;
  usuario_id: number;
}

/** Reações de várias mensagens numa consulta só; cada emoji na ordem em que apareceu na mensagem, quem reagiu na ordem em que reagiu. */
export function reacoesDasMensagens(banco: Banco, ids: number[]): Map<number, ReacaoDto[]> {
  const mapa = new Map<number, ReacaoDto[]>();
  if (ids.length === 0) return mapa;
  const linhas = banco
    .prepare(`SELECT mensagem_id, emoji, usuario_id FROM reacoes WHERE mensagem_id IN (${ids.map(() => '?').join(',')}) ORDER BY mensagem_id, primeira_em, rowid`)
    .all(...ids) as LinhaReacao[];
  for (const l of linhas) {
    let lista = mapa.get(l.mensagem_id);
    if (!lista) mapa.set(l.mensagem_id, (lista = []));
    const r = lista.find((x) => x.emoji === l.emoji);
    if (r) r.usuarios.push(l.usuario_id);
    else lista.push({ emoji: l.emoji, usuarios: [l.usuario_id] });
  }
  return mapa;
}

export const reacoesDa = (banco: Banco, mensagemId: number): ReacaoDto[] => reacoesDasMensagens(banco, [mensagemId]).get(mensagemId) ?? [];

/**
 * RN-2/RN-3: põe a reação da pessoa ou tira, se ela já tinha usado esse emoji. Um emoji novo só entra se a mensagem
 * tiver menos de 20 diferentes. Chamar dentro de uma transação (a conferência do limite e o INSERT andam juntos).
 */
export function alternarReacao(banco: Banco, mensagemId: number, usuarioId: number, emoji: string, agora: number = Date.now()): ReacaoDto[] {
  const tirou = banco.prepare('DELETE FROM reacoes WHERE mensagem_id = ? AND emoji = ? AND usuario_id = ?').run(mensagemId, emoji, usuarioId).changes > 0;
  if (!tirou) {
    const jaTem = banco.prepare('SELECT primeira_em FROM reacoes WHERE mensagem_id = ? AND emoji = ? LIMIT 1').get(mensagemId, emoji) as { primeira_em: number } | undefined;
    if (!jaTem) {
      const { n } = banco.prepare('SELECT COUNT(DISTINCT emoji) AS n FROM reacoes WHERE mensagem_id = ?').get(mensagemId) as { n: number };
      if (n >= REACOES_POR_MENSAGEM) throw new ErroHttp(409, 'dados_invalidos', `Esta mensagem já tem ${REACOES_POR_MENSAGEM} reações diferentes.`);
    }
    // Emoji novo vai depois de todos os que já estão, mesmo no mesmo milissegundo ou com o relógio voltando.
    const { ultima } = banco.prepare('SELECT MAX(primeira_em) AS ultima FROM reacoes WHERE mensagem_id = ?').get(mensagemId) as { ultima: number | null };
    const primeira = jaTem?.primeira_em ?? (ultima === null ? agora : Math.max(agora, ultima + 1));
    // Emoji que já está na mensagem herda o momento em que apareceu.
    banco
      .prepare('INSERT INTO reacoes (mensagem_id, emoji, usuario_id, criada_em, primeira_em) VALUES (?, ?, ?, ?, ?)')
      .run(mensagemId, emoji, usuarioId, agora, primeira);
  }
  return reacoesDa(banco, mensagemId);
}
