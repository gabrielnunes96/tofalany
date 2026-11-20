import { temPermissao } from '../dominio/funcoes.js';
import { comunidadeDoCanal } from '../dominio/canais.js';
import { membroDe } from '../dominio/comunidades.js';
import { qualidadesDaLoja } from '../dominio/loja.js';
import { salaComunidade } from './salas.js';
import { DIMENSOES_TELA, LIMITE_TELAS_POR_CANAL, QUALIDADES_TELA, qualidadesPermitidas, type QualidadeTela, type TransmissaoDto, PERMISSOES } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal } from '../dominio/canais.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { comAck } from './acoes.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';
import type { Voz } from './voz.js';

/**
 * RF-26/RN-10: cada pessoa transmite a sua tela (até LIMITE_TELAS_POR_CANAL por canal de voz). Quem quer transmitir pede a trava (`tela:pedir`);
 * ela é liberada ao parar, ao sair da voz (queda, troca de canal, conta removida) ou com o canal removido.
 */
const chaveTela = (canalVozId: number, usuarioId: number) => `${canalVozId}:${usuarioId}`;

export function criarTela(io: ServidorTempoReal, banco: Banco, voz: Pick<Voz, 'presenca'>, registrarErro: (e: unknown) => void) {
  /** Transmissões ativas por canal e pessoa (`canal:usuário`). */
  const ativas = new Map<string, TransmissaoDto>();
  /**
   * Pontos e loja (RN-15): transmissões cuja qualidade foi liberada por um vale. Se o vale vencer no meio, a
   * transmissão segue até a pessoa parar (inclusive se a faixa for republicada); a próxima já sai limitada.
   */
  const porVale = new Set<string>();

  function auditar(tipo: 'tela_iniciou' | 'tela_parou', t: TransmissaoDto, motivo?: string) {
    try {
      const canal = buscarCanal(banco, t.canalVozId);
      registrarAuditoria(banco, {
        tipo,
        atorId: t.usuarioId,
        canal: canal ? { id: canal.id, nome: canal.nome } : undefined,
        detalhes: { qualidade: t.qualidade, ...(motivo ? { motivo } : {}) },
      });
    } catch (erro) {
      registrarErro(erro);
    }
  }

  /** Cargo e permissão de transmitir em alta no servidor do canal (cada servidor tem os seus cargos), e os vales da conta. */
  function papel(usuarioId: number, canalVozId: number) {
    const c = comunidadeDoCanal(banco, canalVozId) ?? 1;
    const permissoes = new Set(PERMISSOES.map((p) => p.id).filter((p) => temPermissao(banco, usuarioId, p, c)));
    return { cargo: membroDe(banco, c, usuarioId)?.cargo ?? 'membro', alta: permissoes, c, vales: qualidadesDaLoja(banco, usuarioId) };
  }
  /** A qualidade da transmissão continua valendo: pelo cargo, pelos vales de agora ou pelo vale que a liberou. */
  function qualidadeValida(t: TransmissaoDto, p: ReturnType<typeof papel> = papel(t.usuarioId, t.canalVozId)): boolean {
    return qualidadesPermitidas(p.cargo, p.alta, p.vales).includes(t.qualidade) || porVale.has(chaveTela(t.canalVozId, t.usuarioId));
  }
  const paraCanal = (canalVozId: number) => io.to(salaComunidade(comunidadeDoCanal(banco, canalVozId) ?? 1));

  const doCanal = (canalVozId: number) => [...ativas.values()].filter((t) => t.canalVozId === canalVozId);

  /** Muda quem assiste uma transmissão e avisa (sem mudança, nada). */
  function marcarEspectador(t: TransmissaoDto, usuarioId: number, assistindo: boolean) {
    if (t.usuarioId === usuarioId) return;
    const lista = t.espectadores ?? [];
    if (lista.includes(usuarioId) === assistindo) return;
    t.espectadores = assistindo ? [...lista, usuarioId] : lista.filter((id) => id !== usuarioId);
    if (banco.open) paraCanal(t.canalVozId).emit('tela:espectadores', { canalVozId: t.canalVozId, usuarioId: t.usuarioId, espectadores: t.espectadores });
  }

  function liberar(canalVozId: number, usuarioId: number, motivo?: string) {
    const chave = chaveTela(canalVozId, usuarioId);
    const t = ativas.get(chave);
    if (!t) return;
    ativas.delete(chave);
    porVale.delete(chave);
    // Servidor fechando: nada a gravar nem a avisar.
    if (!banco.open) return;
    auditar('tela_parou', t, motivo);
    paraCanal(canalVozId).emit('tela:parada', { canalVozId, usuarioId: t.usuarioId });
  }

  return {
    transmissoes: () => [...ativas.values()],
    registrar(socket: SocketTofalando) {
      const usuarioId = socket.data.usuarioId;
      socket.on(
        'tela:pedir',
        comAck(registrarErro, (dados: unknown) => {
          const { canalVozId, qualidade } = (typeof dados === 'object' && dados !== null ? dados : {}) as { canalVozId?: unknown; qualidade?: unknown };
          if (typeof canalVozId !== 'number' || !Number.isInteger(canalVozId)) throw new ErroHttp(400, 'dados_invalidos', 'Canal inválido.');
          if (!QUALIDADES_TELA.includes(qualidade as QualidadeTela)) throw new ErroHttp(400, 'dados_invalidos', 'Qualidade inválida.');
          if (voz.presenca(usuarioId)?.canalVozId !== canalVozId) throw new ErroHttp(403, 'sem_permissao', 'Entre no canal de voz para transmitir.');
          const { cargo, alta, vales } = papel(usuarioId, canalVozId);
          if (!alta.has('transmitir_tela') && cargo !== 'admin') throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite transmitir a tela.');
          // RN-17: membro transmite só em 720p30; cargo e vales da loja liberam mais (o servidor aplica, não só a tela).
          if (!qualidadesPermitidas(cargo, alta, vales).includes(qualidade as QualidadeTela)) {
            throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não libera essa qualidade.');
          }
          const pedidaPorVale = !qualidadesPermitidas(cargo, alta).includes(qualidade as QualidadeTela);
          const atual = ativas.get(chaveTela(canalVozId, usuarioId));
          if (atual) return atual;
          // Cada pessoa transmite a sua tela; até LIMITE_TELAS_POR_CANAL ao mesmo tempo no canal.
          if (doCanal(canalVozId).length >= LIMITE_TELAS_POR_CANAL) {
            throw new ErroHttp(409, 'sem_permissao', `Já há ${LIMITE_TELAS_POR_CANAL} pessoas transmitindo neste canal.`);
          }
          const t: TransmissaoDto = { canalVozId, usuarioId, qualidade: qualidade as QualidadeTela, espectadores: [] };
          ativas.set(chaveTela(canalVozId, usuarioId), t);
          if (pedidaPorVale) porVale.add(chaveTela(canalVozId, usuarioId));
          auditar('tela_iniciou', t);
          paraCanal(canalVozId).emit('tela:iniciada', t);
          return t;
        }),
      );
      socket.on(
        'tela:parar',
        comAck(registrarErro, (dados: unknown) => {
          const canalVozId = typeof dados === 'object' && dados !== null ? (dados as { canalVozId?: unknown }).canalVozId : undefined;
          if (typeof canalVozId !== 'number' || !Number.isInteger(canalVozId)) throw new ErroHttp(400, 'dados_invalidos', 'Canal inválido.');
          liberar(canalVozId, usuarioId, 'parou');
          return undefined;
        }),
      );
      socket.on(
        'tela:assistir',
        comAck(registrarErro, (dados: unknown) => {
          const { canalVozId, assistindo, usuarioId: transmissor } = (typeof dados === 'object' && dados !== null ? dados : {}) as {
            canalVozId?: unknown;
            assistindo?: unknown;
            usuarioId?: unknown;
          };
          if (typeof canalVozId !== 'number' || !Number.isInteger(canalVozId) || typeof assistindo !== 'boolean')
            throw new ErroHttp(400, 'dados_invalidos', 'Dados inválidos.');
          // Só quem está no canal de voz assiste (fechar vale sempre).
          if (assistindo && voz.presenca(usuarioId)?.canalVozId !== canalVozId)
            throw new ErroHttp(403, 'sem_permissao', 'Entre no canal de voz para assistir.');
          if (transmissor !== undefined && (typeof transmissor !== 'number' || !Number.isInteger(transmissor))) throw new ErroHttp(400, 'dados_invalidos', 'Dados inválidos.');
          // App antigo não diz de quem: a primeira transmissão do canal que não é a minha.
          const t =
            transmissor !== undefined ? ativas.get(chaveTela(canalVozId, transmissor)) : doCanal(canalVozId).find((x) => x.usuarioId !== usuarioId);
          if (t) marcarEspectador(t, usuarioId, assistindo);
          return undefined;
        }),
      );
    },
    /**
     * R-2: confere a faixa de tela publicada no LiveKit (webhook). Silenciar quando quem publicou não tem a
     * trava do canal (segunda tela) ou passou das dimensões da qualidade pedida (membro acima de 720p30).
     * Só confere largura e altura: o LiveKit não informa os quadros, então 720p30 e 720p60 (e 1080p30 e 1080p60)
     * passam iguais aqui (risco aceito, técnica pontos-e-loja R-1).
     * As dimensões vêm de quem publica: um app adulterado poderia mentir (risco aceito na técnica).
     */
    faixaForaDaRegra(usuarioId: number, canalVozId: number, largura: number, altura: number, soAudio = false): boolean {
      const t = ativas.get(chaveTela(canalVozId, usuarioId));
      if (!t) return true;
      // Áudio da tela: basta ter a trava.
      if (soAudio) return false;
      // Sem dimensões (o livekit-client sempre manda em vídeo): de membro, é suspeito.
      const p = papel(usuarioId, canalVozId);
      const valida = qualidadeValida(t, p);
      // Sem dimensões: só passa quem tem cargo de alta ou uma transmissão acima de 720p30 liberada (vale).
      if (largura <= 0 || altura <= 0) return p.cargo !== 'admin' && !p.alta.has('transmitir_1080p') && (t.qualidade === '720p30' || !valida);
      const qualidade = valida ? t.qualidade : '720p30';
      const max = DIMENSOES_TELA[qualidade];
      // Retrato (tela em pé) também vale: compara o lado maior e o menor.
      return Math.max(largura, altura) > max.largura || Math.min(largura, altura) > max.altura;
    },
    /** RN-17: quem perdeu o cargo transmitindo acima de 720p30 deixa de transmitir. */
    cargoMudou(usuarioId: number) {
      for (const t of [...ativas.values()]) {
        if (t.usuarioId !== usuarioId) continue;
        const p = papel(usuarioId, t.canalVozId);
        if (!qualidadeValida(t, p)) {
          liberar(t.canalVozId, usuarioId, 'cargo_alterado');
          continue;
        }
        // Perdeu o cargo, mas um vale cobre: a partir daqui a transmissão segue pelo vale (RN-15 se ele vencer).
        if (!qualidadesPermitidas(p.cargo, p.alta).includes(t.qualidade)) porVale.add(chaveTela(t.canalVozId, usuarioId));
      }
    },
    /** Quem saiu da voz (por qualquer motivo) deixa de transmitir. */
    saiuDaVoz(usuarioId: number, canalVozId: number) {
      liberar(canalVozId, usuarioId, 'saiu_da_voz');
      for (const t of doCanal(canalVozId)) marcarEspectador(t, usuarioId, false);
    },
  };
}
