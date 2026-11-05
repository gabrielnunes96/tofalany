/** Janela deslizante simples em memória: até `maximo` tentativas por chave (IP) em `janelaMs`. */
export function criarLimitador(maximo: number, janelaMs: number, agora: () => number = Date.now) {
  const tentativas = new Map<string, number[]>();
  return {
    /** Registra a tentativa; devolve false se a chave estourou o limite. */
    permitir(chave: string): boolean {
      const limite = agora() - janelaMs;
      const lista = (tentativas.get(chave) ?? []).filter((t) => t > limite);
      // Limpa chaves antigas de outros IPs para o mapa não crescer sem fim.
      for (const [outra, horarios] of tentativas) {
        if (outra !== chave && horarios.every((t) => t <= limite)) tentativas.delete(outra);
      }
      if (lista.length >= maximo) {
        tentativas.set(chave, lista);
        return false;
      }
      lista.push(agora());
      tentativas.set(chave, lista);
      return true;
    },
    /** Quantos IPs estão sendo acompanhados (para teste). */
    tamanho(): number {
      return tentativas.size;
    },
  };
}

export type Limitador = ReturnType<typeof criarLimitador>;
