/**
 * celular (RF-6, RN-3 a RN-5): push sem conteúdo. O Google só leva `{ v: 1, k }` (k é um código aleatório que o
 * próprio app gerou no registro e usa para saber de qual servidor buscar); o app acorda, busca os resumos pendentes da
 * sessão dele (`/api/push/pendentes`) e monta a notificação no celular. O registro do aparelho é da sessão (CASCADE):
 * sair, redefinir a senha, remover a conta ou desconectar o aparelho apagam o registro (A3).
 */
import { randomBytes } from 'node:crypto';
import { CHAMADO_DURACAO_MS, type PreferenciasAvisoDto, type ResumoPushDto } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { membroDe } from './comunidades.js';

/** Resumos pendentes valem 10 min (o app busca logo depois do aviso). */
export const VALIDADE_PENDENTE_MS = 10 * 60_000;
/** chamar-tocando (RN-8): o aviso de chamado dura o mesmo que o chamado. */
const VALIDADE_CHAMADO_MS = CHAMADO_DURACAO_MS;
/** No máximo 1 aviso a cada 30 s por aparelho (A6: menos metadados para o Google, A19: sem cansar o aparelho). */
export const INTERVALO_AVISO_MS = 30_000;

const FORMATO_FCM = /^[A-Za-z0-9_:.-]{20,4096}$/;
const FORMATO_K = /^[0-9a-f]{32}$/;

/** Registra (ou move) o aparelho para a sessão. Devolve se é novo (para a auditoria). Mesmo token em outra sessão sai de lá (A4). */
export function registrarAparelho(banco: Banco, sessaoHash: string, fcmToken: unknown, k: unknown, agora = Date.now()): boolean {
  if (typeof fcmToken !== 'string' || !FORMATO_FCM.test(fcmToken) || typeof k !== 'string' || !FORMATO_K.test(k)) {
    throw new ErroHttp(400, 'dados_invalidos', 'Registro de aparelho inválido.');
  }
  return banco.transaction(() => {
    const antes = banco.prepare('SELECT fcm_token FROM push_aparelhos WHERE sessao_hash = ?').get(sessaoHash) as { fcm_token: string } | undefined;
    banco.prepare('DELETE FROM push_aparelhos WHERE fcm_token = ? AND sessao_hash <> ?').run(fcmToken, sessaoHash);
    banco
      .prepare(
        'INSERT INTO push_aparelhos (sessao_hash, fcm_token, k, criado_em, visto_em) VALUES (?, ?, ?, ?, ?) ON CONFLICT(sessao_hash) DO UPDATE SET fcm_token = excluded.fcm_token, k = excluded.k, visto_em = excluded.visto_em',
      )
      .run(sessaoHash, fcmToken, k, agora, agora);
    return antes?.fcm_token !== fcmToken;
  })();
}

export function removerAparelho(banco: Banco, sessaoHash: string): boolean {
  return banco.prepare('DELETE FROM push_aparelhos WHERE sessao_hash = ?').run(sessaoHash).changes > 0;
}

const PADRAO: PreferenciasAvisoDto = { mensagens: true, chamados: true, silenciadas: [] };

export function preferenciasAviso(banco: Banco, usuarioId: number): PreferenciasAvisoDto {
  const l = banco.prepare('SELECT mensagens, chamados, silenciadas FROM preferencias_aviso WHERE usuario_id = ?').get(usuarioId) as
    | { mensagens: number; chamados: number; silenciadas: string }
    | undefined;
  if (!l) return { ...PADRAO };
  return { mensagens: !!l.mensagens, chamados: !!l.chamados, silenciadas: JSON.parse(l.silenciadas) as string[] };
}

/** Conversas silenciadas: "c:<id>" (canal) ou "d:<id>" (DM), no máximo 500. */
const CHAVE_CONVERSA = /^[cd]:[1-9]\d{0,9}$/;
export function gravarPreferenciasAviso(banco: Banco, usuarioId: number, p: { mensagens: boolean; chamados: boolean; silenciadas: string[] }): PreferenciasAvisoDto {
  const silenciadas = [...new Set(p.silenciadas.filter((s) => CHAVE_CONVERSA.test(s)))].slice(0, 500);
  banco
    .prepare(
      'INSERT INTO preferencias_aviso (usuario_id, mensagens, chamados, silenciadas) VALUES (?, ?, ?, ?) ON CONFLICT(usuario_id) DO UPDATE SET mensagens = excluded.mensagens, chamados = excluded.chamados, silenciadas = excluded.silenciadas',
    )
    .run(usuarioId, p.mensagens ? 1 : 0, p.chamados ? 1 : 0, JSON.stringify(silenciadas));
  return preferenciasAviso(banco, usuarioId);
}

/** O que acontece num envio: entregue, aparelho não existe mais no Google (apaga o registro) ou falha passageira. */
export type ResultadoEnvio = 'ok' | 'nao_registrado' | 'erro';
/** Envia um aviso data-only ao FCM (injetável nos testes). */
export type Transporte = (aviso: { fcmToken: string; k: string; ttlSegundos: number; urgente: boolean }) => Promise<ResultadoEnvio>;

export interface ItemPush {
  tipo: ResumoPushDto['tipo'];
  /** Conversa ("c:<id>"/"d:<id>") para as silenciadas e para abrir ao tocar. */
  conversa?: string;
  resumo: Omit<ResumoPushDto, 'id' | 'em'>;
}

/**
 * Serviço de push: decide quem recebe, guarda o resumo para cada sessão com aparelho e agrupa os avisos por aparelho.
 * `conectada(hash)`: a sessão tem o app aberto agora (recebe pelo socket; sem push).
 */
export function criarPush(opcoes: { banco: Banco; transporte?: Transporte; conectada: (sessaoHash: string) => boolean; registrarErro: (e: unknown) => void; agora?: () => number }) {
  const { banco, conectada, registrarErro } = opcoes;
  let transporte = opcoes.transporte;
  const agora = opcoes.agora ?? Date.now;
  const ultimoEnvio = new Map<string, number>();
  const agendados = new Map<string, ReturnType<typeof setTimeout>>();

  async function enviar(sessaoHash: string, urgente: boolean) {
    if (!transporte) return;
    const a = banco.prepare('SELECT fcm_token, k FROM push_aparelhos WHERE sessao_hash = ?').get(sessaoHash) as { fcm_token: string; k: string } | undefined;
    if (!a) return;
    ultimoEnvio.set(sessaoHash, agora());
    let resultado: ResultadoEnvio = 'erro';
    for (let tentativa = 0; tentativa < 3 && resultado === 'erro'; tentativa++) {
      resultado = await transporte({ fcmToken: a.fcm_token, k: a.k, ttlSegundos: urgente ? Math.ceil(VALIDADE_CHAMADO_MS / 1000) : 600, urgente }).catch(() => 'erro' as const);
      if (resultado === 'erro' && tentativa < 2) await new Promise((r) => setTimeout(r, 500 * 2 ** tentativa));
    }
    if (resultado === 'nao_registrado') banco.prepare('DELETE FROM push_aparelhos WHERE sessao_hash = ?').run(sessaoHash);
  }

  /** Um aviso agora, ou ao fim da janela de 30 s se já houve um há pouco (chamados não esperam). */
  function avisarAparelho(sessaoHash: string, urgente: boolean) {
    const ultimo = ultimoEnvio.get(sessaoHash) ?? -Infinity;
    const espera = INTERVALO_AVISO_MS - (agora() - ultimo);
    if (urgente || espera <= 0) {
      clearTimeout(agendados.get(sessaoHash));
      agendados.delete(sessaoHash);
      void enviar(sessaoHash, urgente).catch(registrarErro);
      return;
    }
    if (agendados.has(sessaoHash)) return;
    const t = setTimeout(() => {
      agendados.delete(sessaoHash);
      void enviar(sessaoHash, false).catch(registrarErro);
    }, espera);
    t.unref?.();
    agendados.set(sessaoHash, t);
  }

  return {
    /** Avisa estas pessoas (já sem o autor). Respeita preferências, silenciadas e o app aberto em cada aparelho. */
    avisar(usuarioIds: number[], item: ItemPush) {
      const em = agora();
      banco.prepare('DELETE FROM push_pendentes WHERE criado_em < ?').run(em - VALIDADE_PENDENTE_MS);
      for (const usuarioId of new Set(usuarioIds)) {
        const p = preferenciasAviso(banco, usuarioId);
        if (item.tipo === 'chamado' ? !p.chamados : !p.mensagens) continue;
        if (item.conversa && p.silenciadas.includes(item.conversa)) continue;
        const sessoes = banco.prepare('SELECT a.sessao_hash AS h FROM push_aparelhos a JOIN sessoes s ON s.token_hash = a.sessao_hash WHERE s.usuario_id = ?').all(usuarioId) as {
          h: string;
        }[];
        for (const { h } of sessoes) {
          if (conectada(h)) continue;
          banco
            .prepare('INSERT INTO push_pendentes (id, sessao_hash, tipo, resumo_json, criado_em) VALUES (?, ?, ?, ?, ?)')
            .run(randomBytes(16).toString('hex'), h, item.tipo, JSON.stringify(item.resumo), em);
          avisarAparelho(h, item.tipo === 'chamado');
        }
      }
    },
    /** O push está ligado (há credencial do FCM): o app só registra o aparelho quando está. */
    ligado: () => transporte !== undefined,
    /** Testes: troca o envio pelo FCM por um falso. */
    usarTransporte(t: Transporte | undefined) {
      transporte = t;
    },
    fechar() {
      for (const t of agendados.values()) clearTimeout(t);
      agendados.clear();
    },
  };
}
export type Push = ReturnType<typeof criarPush>;

/** Resumos pendentes da sessão (uso único: saem ao ler). `k` precisa ser o do aparelho registrado (A5, A15). */
export function tomarPendentes(banco: Banco, sessaoHash: string, k: unknown, agora = Date.now()): ResumoPushDto[] {
  const a = banco.prepare('SELECT k FROM push_aparelhos WHERE sessao_hash = ?').get(sessaoHash) as { k: string } | undefined;
  if (!a || a.k !== k) throw new ErroHttp(404, 'nao_encontrado', 'Nada pendente.');
  return banco.transaction(() => {
    const linhas = banco
      .prepare(
        "SELECT id, resumo_json, criado_em FROM push_pendentes WHERE sessao_hash = ? AND criado_em >= ? AND (tipo <> 'chamado' OR criado_em >= ?) ORDER BY criado_em LIMIT 20",
      )
      .all(sessaoHash, agora - VALIDADE_PENDENTE_MS, agora - VALIDADE_CHAMADO_MS) as { id: string; resumo_json: string; criado_em: number }[];
    banco.prepare('DELETE FROM push_pendentes WHERE sessao_hash = ?').run(sessaoHash);
    const usuarioId = (banco.prepare('SELECT usuario_id FROM sessoes WHERE token_hash = ?').get(sessaoHash) as { usuario_id: number } | undefined)?.usuario_id;
    return (
      linhas
        .map((l) => ({ ...(JSON.parse(l.resumo_json) as Omit<ResumoPushDto, 'id' | 'em'>), id: l.id, em: l.criado_em }))
        // A5: na hora da busca, a mensagem ainda existe e a pessoa ainda está no servidor dela.
        .filter((r) => {
          if (r.mensagemId !== undefined && !banco.prepare('SELECT 1 FROM mensagens WHERE id = ?').get(r.mensagemId)) return false;
          if (r.comunidadeId !== undefined && r.conversa?.startsWith('c:') && (usuarioId === undefined || !membroDe(banco, r.comunidadeId, usuarioId))) return false;
          return true;
        })
    );
  })();
}
