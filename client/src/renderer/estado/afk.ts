/**
 * mover-e-afk (RN-7, RN-8): vai para a sala de AFK quem está numa sala de voz (que não é a de AFK) há o tempo escolhido
 * sem falar e sem mexer no teclado e no mouse, a não ser que esteja com a câmera ligada ou transmitindo a tela.
 * Sozinho na sala também vai (D-3).
 */
export function deveIrParaAfk(e: {
  afk: { canalId: number; minutos: number } | null;
  minhaVoz: number | null;
  ociosoSegundos: number;
  ultimaFalaMs: number;
  agora: number;
  camera: boolean;
  tela: boolean;
}): boolean {
  if (!e.afk || e.minhaVoz === null || e.minhaVoz === e.afk.canalId) return false;
  if (e.camera || e.tela) return false;
  const limiteS = e.afk.minutos * 60;
  return e.ociosoSegundos >= limiteS && (e.agora - e.ultimaFalaMs) / 1000 >= limiteS;
}

/** De quanto em quanto tempo o app confere a inatividade (ms). */
export const INTERVALO_VIGIA_AFK_MS = 15_000;
