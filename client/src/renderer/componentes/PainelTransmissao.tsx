import { useEffect, useRef, useState } from 'react';
import type { FaixaVideo } from '../servicos/voz';

/** RF-30: a transmissão de alguém do meu canal — aviso com "Assistir", e grande com tela cheia ao assistir. */
export function PainelTransmissao({ nome, faixa }: { nome: string; faixa: FaixaVideo | undefined }) {
  const [assistindo, setAssistindo] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!assistindo || !el || !faixa) return;
    faixa.attach(el);
    return () => {
      faixa.detach(el);
    };
  }, [assistindo, faixa]);

  if (!assistindo) {
    return (
      <section className="aviso-transmissao" aria-label={`Transmissão de ${nome}`}>
        <span>
          🖥️ <strong>{nome}</strong> está transmitindo a tela.
        </span>
        <button type="button" onClick={() => setAssistindo(true)} disabled={!faixa}>
          {faixa ? 'Assistir' : 'Conectando…'}
        </button>
      </section>
    );
  }
  return (
    <section className="transmissao-grande" aria-label={`Transmissão de ${nome}`}>
      <video ref={ref} autoPlay playsInline muted aria-label={`Tela de ${nome}`} />
      <div className="transmissao-acoes">
        <span>🖥️ {nome}</span>
        <button type="button" className="secundario" onClick={() => void ref.current?.requestFullscreen?.().catch(() => undefined)}>
          Tela cheia
        </button>
        <button type="button" className="secundario" onClick={() => setAssistindo(false)}>
          Fechar
        </button>
      </div>
    </section>
  );
}
