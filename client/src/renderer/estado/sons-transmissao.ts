import type { PreferenciasSons, TransmissaoDto } from '@tofalando/shared';
import type { SomVoz } from '../servicos/sons-voz';

/**
 * video-teatro-cameras-e-sons (RN-8, RN-9): que som tocar quando uma transmissão abre, fecha ou alguém começa e para
 * de assistir. As minhas próprias ações não tocam para mim (R-5).
 */
export type SomTransmissao = Extract<SomVoz, 'tela-abrir' | 'tela-fechar' | 'assistir-comecar' | 'assistir-parar'>;

/** Preferência de cada som (Configurações). */
export const PREFERENCIA_DO_SOM: Record<SomTransmissao, keyof PreferenciasSons> = {
  'tela-abrir': 'telaAbrir',
  'tela-fechar': 'telaFechar',
  'assistir-comecar': 'assistirComecar',
  'assistir-parar': 'assistirParar',
};

/** Abrir e fechar: para quem está no mesmo canal de voz (RN-8). */
export function somAoAbrir(t: TransmissaoDto, eu: number, minhaVoz: number | null): SomTransmissao[] {
  return minhaVoz !== null && t.canalVozId === minhaVoz && t.usuarioId !== eu ? ['tela-abrir'] : [];
}

export function somAoFechar(antes: TransmissaoDto[], canalVozId: number, usuarioId: number | undefined, eu: number, minhaVoz: number | null): SomTransmissao[] {
  if (minhaVoz === null || canalVozId !== minhaVoz) return [];
  const fechadas = antes.filter((t) => t.canalVozId === canalVozId && (usuarioId === undefined || t.usuarioId === usuarioId) && t.usuarioId !== eu);
  return fechadas.length ? ['tela-fechar'] : [];
}

/**
 * Começar e parar de assistir: só para quem transmite e para quem assiste a mesma transmissão (RN-8). Devolve cada som
 * com quem entrou ou saiu (para não repetir em menos de 1 s).
 */
export function sonsAoMudarEspectadores(antes: TransmissaoDto | undefined, novos: number[], eu: number): { som: SomTransmissao; quem: number }[] {
  if (!antes) return [];
  const anteriores = antes.espectadores ?? [];
  const meInteressa = antes.usuarioId === eu || anteriores.includes(eu) || novos.includes(eu);
  if (!meInteressa) return [];
  return [
    ...novos.filter((id) => id !== eu && !anteriores.includes(id)).map((quem) => ({ som: 'assistir-comecar' as const, quem })),
    ...anteriores.filter((id) => id !== eu && !novos.includes(id)).map((quem) => ({ som: 'assistir-parar' as const, quem })),
  ];
}

/** RN-9: a mesma pessoa entrando e saindo da mesma transmissão em menos de 1 s não repete o som. */
export function criarFiltroRepeticao(janelaMs = 1000, agora: () => number = Date.now) {
  const ultimos = new Map<string, number>();
  return (chave: string): boolean => {
    const t = agora();
    const antes = ultimos.get(chave);
    ultimos.set(chave, t);
    return antes === undefined || t - antes >= janelaMs;
  };
}

/** RN-9: toca se a preferência daquele som está ligada e a pessoa não está surda. */
export function deveTocar(som: SomTransmissao, prefs: PreferenciasSons, surdo: boolean): boolean {
  return !surdo && prefs[PREFERENCIA_DO_SOM[som]] !== false;
}
