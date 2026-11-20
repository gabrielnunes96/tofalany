import { HISTORICO_ATE_MAX, PAGINA_MENSAGENS, trechoDeResposta, type Destino, type GifDto, type MensagemDto, type PaginaMensagens, type RespostaDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { anexosDasMensagens } from './anexos.js';
import { reacoesDasMensagens } from './reacoes.js';

interface LinhaMensagem {
  id: number;
  canal_id: number | null;
  dm_id: number | null;
  autor_id: number;
  texto: string;
  criada_em: number;
  editada_em: number | null;
  mencoes?: string | null;
  menciona_todos?: number;
  resposta_a?: number | null;
  resposta_avisa?: number;
  gif?: string | null;
}

function lerGif(json: string | null | undefined): GifDto | undefined {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as GifDto;
  } catch {
    return undefined;
  }
}

/** Quem foi marcado numa mensagem (resolvido por quem envia). */
export interface Mencoes {
  usuarios: number[];
  todos: boolean;
}

function lerIds(json: string | null | undefined): number[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is number => Number.isInteger(x)) : [];
  } catch {
    return [];
  }
}

function paraDtoSemAnexos(m: LinhaMensagem): MensagemDto {
  const gif = lerGif(m.gif);
  return {
    id: m.id,
    canalId: m.canal_id,
    dmId: m.dm_id,
    autorId: m.autor_id,
    // RF-5: com GIF, o endereço vai no fim do texto (os apps antigos mostram como link; os novos tiram com textoSemGif).
    texto: gif ? (m.texto ? `${m.texto}\n${gif.url}` : gif.url) : m.texto,
    criadaEm: m.criada_em,
    editadaEm: m.editada_em,
    anexos: [],
    ...(lerIds(m.mencoes).length ? { mencoes: lerIds(m.mencoes) } : {}),
    ...(m.menciona_todos ? { mencionaTodos: true } : {}),
    ...(gif ? { gif } : {}),
  };
}


/** O começo de cada original numa consulta só; a que não volta foi apagada (RN-10). */
function trechosDasOriginais(banco: Banco, ids: number[]): Map<number, RespostaDto> {
  const mapa = new Map<number, RespostaDto>();
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return mapa;
  const linhas = banco
    .prepare(
      `SELECT m.id, m.autor_id, m.texto, m.gif IS NOT NULL AS tem_gif, EXISTS (SELECT 1 FROM anexos a WHERE a.mensagem_id = m.id) AS tem_anexo FROM mensagens m WHERE m.id IN (${unicos.map(() => '?').join(',')})`,
    )
    .all(...unicos) as { id: number; autor_id: number; texto: string; tem_gif: number; tem_anexo: number }[];
  for (const l of linhas) {
    const trecho = trechoDeResposta(l.texto) || (l.tem_gif ? 'GIF' : '');
    mapa.set(l.id, { id: l.id, autorId: l.autor_id, trecho, ...(!trecho && l.tem_anexo ? { soAnexo: true as const } : {}) });
  }
  for (const id of unicos) if (!mapa.has(id)) mapa.set(id, { id, apagada: true });
  return mapa;
}

/** Mensagens com os anexos, as reações e o trecho da original de cada uma (uma consulta de cada para a página toda). */
function paraDtos(banco: Banco, linhas: LinhaMensagem[]): MensagemDto[] {
  const ids = linhas.map((l) => l.id);
  const anexos = anexosDasMensagens(banco, ids);
  const reacoes = reacoesDasMensagens(banco, ids);
  const originais = trechosDasOriginais(
    banco,
    linhas.flatMap((l) => (l.resposta_a ? [l.resposta_a] : [])),
  );
  return linhas.map((l) => {
    const r = reacoes.get(l.id);
    const o = l.resposta_a ? originais.get(l.resposta_a) : undefined;
    return { ...paraDtoSemAnexos(l), anexos: anexos.get(l.id) ?? [], ...(r ? { reacoes: r } : {}), ...(o ? { resposta: o } : {}) };
  });
}

/** Cria a linha num canal ou numa DM e devolve o id (os anexos são vinculados na mesma transação por quem chama). */
export function inserirMensagem(
  banco: Banco,
  destino: Destino,
  autorId: number,
  texto: string,
  agora: number = Date.now(),
  mencoes: Mencoes = { usuarios: [], todos: false },
  resposta: { a: number; avisa: number } | null = null,
  gif: GifDto | null = null,
): number {
  const [canalId, dmId] = 'canalId' in destino ? [destino.canalId, null] : [null, destino.dmId];
  return Number(
    banco
      .prepare('INSERT INTO mensagens (canal_id, dm_id, autor_id, texto, criada_em, mencoes, menciona_todos, resposta_a, resposta_avisa, gif) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(
        canalId,
        dmId,
        autorId,
        texto,
        agora,
        mencoes.usuarios.length ? JSON.stringify(mencoes.usuarios) : null,
        mencoes.todos ? 1 : 0,
        resposta?.a ?? null,
        resposta?.avisa ?? 0,
        gif ? JSON.stringify(gif) : null,
      ).lastInsertRowid,
  );
}

/** Onde a mensagem vive e quem a escreveu (para conferir uma resposta e refazer o aviso ao editar). */
export function localDaMensagem(banco: Banco, id: number): { canalId: number | null; dmId: number | null; autorId: number; respostaAvisa: number } | undefined {
  const l = banco.prepare('SELECT canal_id, dm_id, autor_id, resposta_avisa FROM mensagens WHERE id = ?').get(id) as
    | { canal_id: number | null; dm_id: number | null; autor_id: number; resposta_avisa: number }
    | undefined;
  return l && { canalId: l.canal_id, dmId: l.dm_id, autorId: l.autor_id, respostaAvisa: l.resposta_avisa };
}

export function buscarMensagem(banco: Banco, id: number): MensagemDto | undefined {
  const m = banco.prepare('SELECT * FROM mensagens WHERE id = ?').get(id) as LinhaMensagem | undefined;
  return m && paraDtos(banco, [m])[0];
}

export function editarMensagem(banco: Banco, id: number, texto: string, agora: number = Date.now(), mencoes: Mencoes = { usuarios: [], todos: false }): MensagemDto {
  banco
    .prepare('UPDATE mensagens SET texto = ?, editada_em = ?, mencoes = ?, menciona_todos = ? WHERE id = ?')
    .run(texto, agora, mencoes.usuarios.length ? JSON.stringify(mencoes.usuarios) : null, mencoes.todos ? 1 : 0, id);
  return buscarMensagem(banco, id)!;
}

export function apagarMensagem(banco: Banco, id: number): void {
  banco.prepare('DELETE FROM mensagens WHERE id = ?').run(id);
}

/** Histórico paginado por id (RF-8, RF-12a): as `limite` mais recentes antes de `antes`, em ordem cronológica. */
export function listarMensagens(banco: Banco, destino: Destino, antes?: number, limite: number = PAGINA_MENSAGENS, ate?: number): PaginaMensagens {
  const [coluna, id] = 'canalId' in destino ? ['canal_id', destino.canalId] : ['dm_id', destino.dmId];
  // Ir até a original (RN-13): tudo de `ate` até `antes`, se couber em 1000; senão, a página normal.
  if (ate && (!antes || ate < antes)) {
    const linhas = banco
      .prepare(`SELECT * FROM mensagens WHERE ${coluna} = ? AND id >= ? ${antes ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`)
      .all(...(antes ? [id, ate, antes, HISTORICO_ATE_MAX + 1] : [id, ate, HISTORICO_ATE_MAX + 1])) as LinhaMensagem[];
    if (linhas.length <= HISTORICO_ATE_MAX) {
      const maisAntiga = linhas.at(-1)?.id ?? ate;
      const temAntes = !!banco.prepare(`SELECT 1 FROM mensagens WHERE ${coluna} = ? AND id < ? LIMIT 1`).get(id, maisAntiga);
      return { mensagens: paraDtos(banco, linhas.reverse()), fim: !temAntes };
    }
  }
  const n = Math.min(Math.max(limite, 1), 100);
  const linhas = banco
    .prepare(`SELECT * FROM mensagens WHERE ${coluna} = ? ${antes ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`)
    .all(...(antes ? [id, antes, n + 1] : [id, n + 1])) as LinhaMensagem[];
  return { mensagens: paraDtos(banco, linhas.slice(0, n).reverse()), fim: linhas.length <= n };
}
