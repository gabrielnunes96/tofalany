/** Tipos do som externo (o arquivo .js roda como AudioWorklet). */
export declare class BufferSom {
  constructor(capacidade?: number, minimo?: number);
  total: number;
  tocando: boolean;
  descartados: number;
  escrever(pcm: Int16Array): void;
  ler(esquerdo: Float32Array, direito: Float32Array): void;
}
export declare function paraPcm(dados: unknown): Int16Array | null;
