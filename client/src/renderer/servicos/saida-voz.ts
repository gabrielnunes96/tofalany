/**
 * teste-de-microfone (item 54, RN-5): antes de reiniciar para instalar uma atualização, o app sai da voz como no
 * "Sair da voz". A tela que está na voz registra a sua saída; o aviso de atualização (montado fora dela) espera.
 */
type Saida = () => Promise<void>;
const saidas = new Set<Saida>();

export function registrarSaidaVoz(saida: Saida): () => void {
  saidas.add(saida);
  return () => {
    saidas.delete(saida);
  };
}

/** Sai de toda voz aberta; nunca espera mais que `tetoMs` (a atualização não pode ficar presa). */
export async function sairDaVozAntesDeAtualizar(tetoMs = 3000): Promise<void> {
  if (saidas.size === 0) return;
  const todas = Promise.allSettled([...saidas].map((s) => s())).then(() => undefined);
  await Promise.race([todas, new Promise<void>((r) => setTimeout(r, tetoMs))]);
}
