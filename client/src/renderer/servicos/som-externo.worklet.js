/* global registerProcessor, AudioWorkletProcessor */
/**
 * som-sistema-windows: som do sistema que chega do processo principal pela MessagePort (PCM 16 bits, 48 kHz,
 * estéreo intercalado) e sai como áudio na thread de áudio. Um buffer circular segura uns 40 ms antes de começar a
 * tocar (pedaços chegam a cada ~10 ms, com folga); se faltar, sai silêncio e volta a juntar; se sobrar demais
 * (meio segundo), descarta o mais antigo para o atraso não crescer.
 */
export class BufferSom {
  /**
   * @param {number} capacidade quadros guardados no máximo
   * @param {number} minimo quadros juntados antes de tocar
   */
  constructor(capacidade = 24000, minimo = 1920) {
    this.capacidade = capacidade;
    this.minimo = minimo;
    this.esquerdo = new Float32Array(capacidade);
    this.direito = new Float32Array(capacidade);
    this.leitura = 0;
    this.escrita = 0;
    this.total = 0;
    this.tocando = false;
    this.descartados = 0;
  }

  /** @param {Int16Array} pcm estéreo intercalado */
  escrever(pcm) {
    const quadros = pcm.length >> 1;
    for (let i = 0; i < quadros; i++) {
      if (this.total === this.capacidade) {
        this.leitura = (this.leitura + 1) % this.capacidade;
        this.total--;
        this.descartados++;
      }
      this.esquerdo[this.escrita] = pcm[2 * i] / 32768;
      this.direito[this.escrita] = pcm[2 * i + 1] / 32768;
      this.escrita = (this.escrita + 1) % this.capacidade;
      this.total++;
    }
  }

  /**
   * @param {Float32Array} esquerdo
   * @param {Float32Array} direito
   */
  ler(esquerdo, direito) {
    if (!this.tocando && this.total >= this.minimo) this.tocando = true;
    for (let i = 0; i < esquerdo.length; i++) {
      if (!this.tocando || this.total === 0) {
        this.tocando = false;
        esquerdo[i] = 0;
        direito[i] = 0;
        continue;
      }
      esquerdo[i] = this.esquerdo[this.leitura];
      direito[i] = this.direito[this.leitura];
      this.leitura = (this.leitura + 1) % this.capacidade;
      this.total--;
    }
  }
}

/** Converte o que chega pela porta em PCM 16 bits (copia: o Buffer do Node pode vir desalinhado). */
export function paraPcm(dados) {
  const bytes = dados instanceof Uint8Array ? dados : dados instanceof ArrayBuffer ? new Uint8Array(dados) : null;
  if (!bytes || bytes.byteLength < 4) return null;
  const copia = bytes.slice(0, bytes.byteLength - (bytes.byteLength % 4));
  return new Int16Array(copia.buffer);
}

if (typeof registerProcessor === 'function') {
  registerProcessor(
    'som-externo',
    class extends AudioWorkletProcessor {
      constructor() {
        super();
        this.buffer = new BufferSom();
        // A janela entrega a porta do processo principal; o PCM chega direto aqui, sem passar pela página.
        this.port.onmessage = (e) => {
          if (e.data && e.data.fechar) {
            if (this.porta) this.porta.close();
            this.porta = undefined;
            return;
          }
          const porta = e.data && e.data.porta;
          if (!porta) return;
          this.porta = porta;
          porta.onmessage = (m) => {
            if (m.data && m.data.erro) {
              this.port.postMessage({ erro: m.data.erro });
              return;
            }
            const pcm = paraPcm(m.data);
            if (pcm) this.buffer.escrever(pcm);
          };
        };
      }

      process(_entradas, saidas) {
        const saida = saidas[0];
        if (!saida || saida.length === 0) return true;
        this.buffer.ler(saida[0], saida[1] || saida[0]);
        return true;
      }
    },
  );
}
