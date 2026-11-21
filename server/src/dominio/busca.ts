import type { PedidoBusca, RespostaBusca } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal, comunidadeDoCanal } from './canais.js';
import { exigirParticipante, listarDms } from './dms.js';
import { listarAmizades } from './amizades.js';
import { membroDe } from './comunidades.js';
import { paraDtos } from './mensagens.js';

/** chat-fixar-e-buscar (RF-5 a RF-7): até 8 termos de 2 a 32 letras; 25 resultados por vez. */
export const BUSCA_TERMOS_MAX = 8;
export const BUSCA_TERMO_MIN = 2;
export const BUSCA_TERMO_MAX = 32;
export const BUSCA_PAGINA = 25;

/** Minúsculas e sem acento (o mesmo que o índice faz com remove_diacritics). */
export const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

/**
 * Termos da busca (A6): só letras e números. Tudo o mais separa palavras, como no índice, então aspas, dois-pontos,
 * NEAR, -, *, ^ e parênteses nunca chegam ao MATCH como sintaxe. Termos de 1 letra ficam de fora (RN-9).
 */
export function termosDaBusca(q: string): string[] {
  // Sem NFKC: o índice e os destaques não o aplicam ("x²" precisa achar "x²", não "x2").
  const palavras = q.split(/[^\p{L}\p{N}]+/u);
  return palavras
    .filter((p) => [...p].length >= BUSCA_TERMO_MIN)
    .map((p) => [...p].slice(0, BUSCA_TERMO_MAX).join(''))
    .slice(0, BUSCA_TERMOS_MAX);
}

/** Cada termo vira uma frase com prefixo ("jog"*), unidas por E (RN-8). */
export const consultaFts = (termos: string[]) => termos.map((t) => `"${t.replaceAll('"', '""')}"*`).join(' ');

/** Onde estão os termos no texto: palavras que começam por um deles, sem diferenciar acento nem maiúsculas. */
export function destaquesDe(texto: string, termos: string[]): [number, number][] {
  const alvos = termos.map(normalizar);
  const r: [number, number][] = [];
  for (const m of texto.matchAll(/[\p{L}\p{N}]+/gu)) {
    const palavra = normalizar(m[0]);
    if (alvos.some((t) => palavra.startsWith(t))) r.push([m.index, m.index + m[0].length]);
  }
  return r;
}

/** DMs da pessoa que aparecem neste servidor (o outro é membro daqui ou amigo), como no `ola` (R-5). */
function dmsVisiveis(banco: Banco, usuarioId: number, comunidadeId: number): number[] {
  const amigos = new Set(
    listarAmizades(banco, usuarioId)
      .filter((a) => a.situacao === 'amigo')
      .map((a) => a.usuarioId),
  );
  return listarDms(banco, usuarioId)
    .filter((d) => amigos.has(d.outroId) || !!membroDe(banco, comunidadeId, d.outroId))
    .map((d) => d.id);
}

/**
 * RN-6: o escopo sai sempre do servidor do pedido e da conta de quem pede (nunca de uma lista mandada pelo app).
 * Canal de outro servidor = não encontrado; DM alheia = 403 (administrador também).
 */
function escopo(banco: Banco, pedido: PedidoBusca, usuarioId: number, comunidadeId: number): { sql: string; params: number[] } | null {
  if (pedido.onde === 'servidor') return { sql: "m.canal_id IN (SELECT id FROM canais WHERE comunidade_id = ? AND tipo = 'texto')", params: [comunidadeId] };
  if (pedido.onde === 'dms') {
    const ids = dmsVisiveis(banco, usuarioId, comunidadeId);
    return ids.length ? { sql: `m.dm_id IN (${ids.map(() => '?').join(',')})`, params: ids } : null;
  }
  if (pedido.canalId !== undefined) {
    const canal = comunidadeDoCanal(banco, pedido.canalId) === comunidadeId ? buscarCanal(banco, pedido.canalId) : undefined;
    if (!canal || canal.tipo !== 'texto') throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
    return { sql: 'm.canal_id = ?', params: [pedido.canalId] };
  }
  if (pedido.dmId !== undefined) {
    exigirParticipante(banco, pedido.dmId, usuarioId);
    return { sql: 'm.dm_id = ?', params: [pedido.dmId] };
  }
  throw new ErroHttp(400, 'dados_invalidos', 'Diga em qual conversa buscar.');
}

export function buscarMensagens(banco: Banco, pedido: PedidoBusca, usuarioId: number, comunidadeId: number): RespostaBusca {
  const termos = termosDaBusca(pedido.q ?? '');
  const temFiltro = pedido.autorId !== undefined || !!pedido.comAnexo || !!pedido.comGif;
  if (termos.length === 0 && !temFiltro) throw new ErroHttp(400, 'dados_invalidos', 'Digite pelo menos 2 letras.');
  const onde = escopo(banco, pedido, usuarioId, comunidadeId);
  if (!onde) return { resultados: [], mais: false };
  const condicoes = ["m.tipo = 'normal'", onde.sql];
  const params: (number | string)[] = [...onde.params];
  if (pedido.autorId !== undefined) {
    condicoes.push('m.autor_id = ?');
    params.push(pedido.autorId);
  }
  if (pedido.comAnexo) condicoes.push('EXISTS (SELECT 1 FROM anexos a WHERE a.mensagem_id = m.id)');
  if (pedido.comGif) condicoes.push('m.gif IS NOT NULL');
  if (pedido.antes !== undefined) {
    condicoes.push('m.id < ?');
    params.push(pedido.antes);
  }
  const sql = termos.length
    ? `SELECT m.* FROM busca_mensagens b JOIN mensagens m ON m.id = b.rowid WHERE busca_mensagens MATCH ? AND ${condicoes.join(' AND ')} ORDER BY b.rowid DESC LIMIT ?`
    : `SELECT m.* FROM mensagens m WHERE ${condicoes.join(' AND ')} ORDER BY m.id DESC LIMIT ?`;
  const linhas = banco.prepare(sql).all(...(termos.length ? [consultaFts(termos)] : []), ...params, BUSCA_PAGINA + 1) as Parameters<typeof paraDtos>[1];
  const pagina = linhas.slice(0, BUSCA_PAGINA);
  const mensagens = paraDtos(banco, pagina);
  return {
    // Destaques só no texto que a pessoa escreveu (com GIF, o texto do DTO termina com o endereço dele); os índices
    // continuam valendo no MensagemDto.texto, que começa por ele.
    resultados: mensagens.map((mensagem, i) => ({ mensagem, destaques: termos.length ? destaquesDe(pagina[i]!.texto, termos) : [] })),
    mais: linhas.length > BUSCA_PAGINA,
  };
}
