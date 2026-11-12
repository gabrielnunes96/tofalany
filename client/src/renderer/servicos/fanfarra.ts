/**
 * Fanfarra da janela de novidades: arpejo subindo, acorde maior cheio e um chuvisco de brilhos.
 * Gerada na hora (sem arquivo), como os sons da voz. Som é enfeite: erro de áudio nunca sobe.
 */
type Contexto = AudioContext;

const VOLUME = 0.09;
/** Dó maior: arpejo subindo duas oitavas e o acorde final. */
const ARPEJO = [523.25, 659.25, 783.99, 1046.5, 1318.5];
const ACORDE = [523.25, 659.25, 783.99, 1046.5];
/** Brilhos agudos (pentatônica), em ordem fixa para soar igual sempre. */
const BRILHOS = [2093, 2637, 3136, 2349, 3520, 2794, 4186, 3136];

export function tocarFanfarra(criarContexto: () => Contexto = () => new AudioContext()): void {
  let c: Contexto;
  try {
    c = criarContexto();
  } catch {
    return;
  }
  try {
    const saida = c.createGain();
    saida.gain.value = VOLUME;
    saida.connect(c.destination);
    const nota = (freq: number, inicio: number, duracao: number, tipo: OscillatorType, volume = 1) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = tipo;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, inicio);
      g.gain.linearRampToValueAtTime(volume, inicio + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, inicio + duracao);
      osc.connect(g).connect(saida);
      osc.start(inicio);
      osc.stop(inicio + duracao + 0.02);
    };
    const t0 = c.currentTime + 0.05;
    ARPEJO.forEach((f, i) => nota(f, t0 + i * 0.07, 0.22, 'triangle', 0.9));
    const tAcorde = t0 + ARPEJO.length * 0.07;
    for (const f of ACORDE) {
      // Duas vozes levemente desafinadas por nota: soa "cheio", como metais de festa.
      nota(f * 0.997, tAcorde, 1.1, 'sawtooth', 0.22);
      nota(f * 1.003, tAcorde, 1.1, 'triangle', 0.5);
    }
    BRILHOS.forEach((f, i) => nota(f, tAcorde + 0.08 + i * 0.06, 0.18, 'sine', 0.35));
    setTimeout(() => void c.close().catch(() => undefined), 2500);
  } catch {
    void c.close().catch(() => undefined);
  }
}
