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

/**
 * mover-e-afk (RN-9, RN-15): controles ao trocar de sala. Indo para a AFK: guarda o mudo de antes e fica mudo e sem câmera;
 * saindo dela: o mudo volta como estava. `mudoAntes` null = não veio da AFK.
 */
export function controlesAoTrocar<T extends { mudo: boolean; camera: boolean }>(
  controles: T,
  mudoAntes: boolean | null,
  paraAfk: boolean,
): { controles: T; mudoAntes: boolean | null } {
  if (paraAfk) return { controles: { ...controles, mudo: true, camera: false }, mudoAntes: mudoAntes ?? controles.mudo };
  if (mudoAntes !== null) return { controles: { ...controles, mudo: mudoAntes }, mudoAntes: null };
  return { controles, mudoAntes: null };
}

/** E2E: adianta o relógio da vigia (a última fala fica "antiga" sem esperar minutos). Só o modo de teste mexe. */
export const relogioAfk = { adiantarMs: 0 };

/** De quanto em quanto tempo o app confere a inatividade (ms). */
export const INTERVALO_VIGIA_AFK_MS = 15_000;
