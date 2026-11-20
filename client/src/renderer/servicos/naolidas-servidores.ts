import type { ServidorConhecido } from '@tofalando/shared';

/** De quanto em quanto tempo o app confere os servidores que não estão abertos. */
export const INTERVALO_OUTROS_MS = 60_000;

/**
 * Backlog v2: número de não lidas dos servidores que não estão abertos (o aberto já tem o seu contador ao vivo).
 * Só os servidores com sessão guardada; um que não responde (fora do ar, sessão vencida) fica sem número.
 */
export async function naoLidasDosOutros(
  servidores: readonly ServidorConhecido[],
  ativo: string | null,
  lerToken: (url: string) => Promise<string | null>,
  consultar: (url: string, token: string) => Promise<{ total: number }>,
): Promise<Record<string, number>> {
  const resultado: Record<string, number> = {};
  await Promise.all(
    servidores
      .filter((s) => s.url !== ativo)
      .map(async (s) => {
        try {
          const token = await lerToken(s.url);
          if (!token) return;
          const { total } = await consultar(s.url, token);
          if (Number.isInteger(total) && total > 0) resultado[s.url] = total;
        } catch {
          // Fora do ar ou sessão encerrada: sem número até a próxima rodada.
        }
      }),
  );
  return resultado;
}
