/**
 * Pontos e loja (RN-1 a RN-4, RN-14): conta os minutos em voz de cada conta e credita os pontos.
 * Trecho válido: em voz, sem surdo, fora da carência de queda e com mais alguém no canal (o ToOuvini nunca entra
 * na presença, então não conta). A presença é por conta (um segundo aparelho tira o primeiro), então não dobra.
 * O trecho em andamento vive em memória: um reinício perde no máximo o minuto corrente (R-12).
 */
export interface Participante {
  usuarioId: number;
  canalVozId: number;
  surdo: boolean;
  emCarencia: boolean;
}

export interface OpcoesPontos {
  participantes: () => Participante[];
  minutoMs: number;
  porMinuto: number;
  /** Credita e devolve a linha de ganho da sessão (dominio/loja.creditar). */
  creditar: (usuarioId: number, pontos: number, movimentoId: number | null) => number | null;
  /** O saldo mudou: avisa as conexões da conta. */
  avisar: (usuarioId: number) => void;
  registrarErro: (e: unknown) => void;
  agora?: () => number;
}

export interface Pontos {
  /** Reconfere quem está ganhando e credita os minutos completos (a cada mudança de voz e a cada tique). */
  atualizar(): void;
}

/** Contas que estão ganhando agora. */
export function contasValidas(lista: readonly Participante[]): Set<number> {
  const ativos = lista.filter((p) => !p.emCarencia);
  const porCanal = new Map<number, number>();
  for (const p of ativos) porCanal.set(p.canalVozId, (porCanal.get(p.canalVozId) ?? 0) + 1);
  return new Set(ativos.filter((p) => !p.surdo && (porCanal.get(p.canalVozId) ?? 0) >= 2).map((p) => p.usuarioId));
}

export function criarPontos(opcoes: OpcoesPontos): Pontos {
  const agora = opcoes.agora ?? Date.now;
  /** Início do minuto em andamento e a linha do extrato da sessão, por conta. */
  const trechos = new Map<number, { inicio: number; movimentoId: number | null }>();

  function creditarCompletos(usuarioId: number, trecho: { inicio: number; movimentoId: number | null }, instante: number) {
    const minutos = Math.floor((instante - trecho.inicio) / opcoes.minutoMs);
    if (minutos <= 0) return;
    // Só avança o início depois de gravar: se o banco falhar, os minutos ficam para a próxima vez.
    trecho.movimentoId = opcoes.creditar(usuarioId, minutos * opcoes.porMinuto, trecho.movimentoId);
    trecho.inicio += minutos * opcoes.minutoMs;
    opcoes.avisar(usuarioId);
  }

  return {
    atualizar() {
      let validas: Set<number>;
      const instante = agora();
      try {
        validas = contasValidas(opcoes.participantes());
      } catch (erro) {
        opcoes.registrarErro(erro);
        return;
      }
      for (const [usuarioId, trecho] of trechos) {
        try {
          creditarCompletos(usuarioId, trecho, instante);
        } catch (erro) {
          opcoes.registrarErro(erro);
        } finally {
          // Saiu do trecho válido: o minuto incompleto se perde (RN-1: só minuto completo).
          if (!validas.has(usuarioId)) trechos.delete(usuarioId);
        }
      }
      for (const usuarioId of validas) if (!trechos.has(usuarioId)) trechos.set(usuarioId, { inicio: instante, movimentoId: null });
    },
  };
}
