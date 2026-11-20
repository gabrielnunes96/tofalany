/** WAV PCM 8 kHz mono 16 bits com `segundos` de silêncio. */
export function wav(segundos: number): Buffer {
  const taxa = 8000;
  const dados = taxa * 2 * segundos;
  const b = Buffer.alloc(44 + dados);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + dados, 4);
  b.write('WAVE', 8, 'latin1');
  b.write('fmt ', 12, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(taxa, 24);
  b.writeUInt32LE(taxa * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(dados, 40);
  return b;
}
