/** Tipos do portão de voz (o arquivo .js roda como AudioWorklet). */
export declare class LogicaPortao {
  constructor(taxa: number);
  definir(p: { limiarDb?: number; modo?: 'deteccao' | 'ptt'; ptt?: boolean; mudo?: boolean }): void;
  processar(entrada: Float32Array, saida: Float32Array): boolean;
}
