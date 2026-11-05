/* global registerProcessor, AudioWorkletProcessor, sampleRate */
/**
 * RF-14/RF-16: portão do microfone, na thread de áudio (não é freado com a janela em segundo plano).
 * - detecção de voz: abre quando o nível passa da sensibilidade e segura aberto por um instante;
 * - push-to-talk: abre só com o atalho apertado;
 * - mudo: sempre fechado.
 * A troca de estado é suave (rampa curta), para não estalar.
 */
export class LogicaPortao {
  /** @param {number} taxa amostras por segundo */
  constructor(taxa) {
    this.taxa = taxa;
    this.limiarDb = -50;
    this.modo = 'deteccao';
    this.ptt = false;
    this.mudo = false;
    /** Segura aberto 300 ms depois da última amostra acima do limiar (não corta fim de palavra). */
    this.retencao = Math.round(0.3 * taxa);
    this.restante = 0;
    this.ganho = 0;
    /** Rampa de ~10 ms entre fechado e aberto. */
    this.passo = 1 / Math.max(1, Math.round(0.01 * taxa));
  }

  /** @param {{ limiarDb?: number, modo?: 'deteccao' | 'ptt', ptt?: boolean, mudo?: boolean }} p */
  definir(p) {
    if (typeof p.limiarDb === 'number') this.limiarDb = p.limiarDb;
    if (p.modo === 'deteccao' || p.modo === 'ptt') this.modo = p.modo;
    if (typeof p.ptt === 'boolean') this.ptt = p.ptt;
    if (typeof p.mudo === 'boolean') this.mudo = p.mudo;
  }

  /**
   * Processa um bloco: copia `entrada` para `saida` com o ganho do portão.
   * @param {Float32Array} entrada
   * @param {Float32Array} saida
   * @returns {boolean} se o portão está aberto (transmitindo)
   */
  processar(entrada, saida) {
    let soma = 0;
    for (let i = 0; i < entrada.length; i++) soma += entrada[i] * entrada[i];
    const rms = Math.sqrt(soma / Math.max(1, entrada.length));
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    let alvo;
    if (this.mudo) alvo = 0;
    else if (this.modo === 'ptt') alvo = this.ptt ? 1 : 0;
    else {
      if (db >= this.limiarDb) this.restante = this.retencao;
      else this.restante = Math.max(0, this.restante - entrada.length);
      alvo = this.restante > 0 ? 1 : 0;
    }
    for (let i = 0; i < entrada.length; i++) {
      const d = alvo - this.ganho;
      this.ganho += d > this.passo ? this.passo : d < -this.passo ? -this.passo : d;
      saida[i] = entrada[i] * this.ganho;
    }
    return alvo === 1;
  }
}

if (typeof registerProcessor === 'function') {
  registerProcessor(
    'portao-voz',
    class extends AudioWorkletProcessor {
      constructor() {
        super();
        this.logica = new LogicaPortao(sampleRate);
        this.aberto = false;
        this.port.onmessage = (e) => this.logica.definir(e.data);
      }

      process(entradas, saidas) {
        const saida = saidas[0];
        if (!saida || saida.length === 0) return true;
        const entrada = entradas[0] && entradas[0][0];
        if (!entrada) {
          for (const canal of saida) canal.fill(0);
          return true;
        }
        const aberto = this.logica.processar(entrada, saida[0]);
        for (let c = 1; c < saida.length; c++) saida[c].set(saida[0]);
        if (aberto !== this.aberto) {
          this.aberto = aberto;
          this.port.postMessage({ aberto });
        }
        return true;
      }
    },
  );
}
