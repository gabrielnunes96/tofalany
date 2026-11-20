/** RMS em dBFS, limitado a -100..0. */
export function nivelEmDb(amostras: Float32Array): number {
  let soma = 0;
  for (const a of amostras) soma += a * a;
  const rms = Math.sqrt(soma / Math.max(1, amostras.length));
  if (rms <= 0) return -100;
  return Math.max(-100, Math.min(0, 20 * Math.log10(rms)));
}
