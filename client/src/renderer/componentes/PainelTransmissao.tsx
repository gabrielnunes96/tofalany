import { useEffect, useRef, useState } from 'react';
import type { FaixaVideo } from '../servicos/voz';
import { alternarTelaCheia, useEmTelaCheia } from './telaCheia';
import { Espectadores } from './Espectadores';

/**
 * RF-30: a transmissão de alguém do meu canal — aviso com "Assistir", e grande com tela cheia ao assistir.
 * Abrir e fechar avisa o servidor (`aoAssistir`), para todos verem quem está assistindo.
 */
export function PainelTransmissao({
  nome,
  faixa,
  espectadores = [],
  aoAssistir,
  conectado = true,
}: {
  nome: string;
  faixa: FaixaVideo | undefined;
  espectadores?: string[];
  aoAssistir?: (assistindo: boolean) => void;
  conectado?: boolean;
}) {
  const [assistindo, setAssistindo] = useState(false);
  const avisar = useRef(aoAssistir);
  useEffect(() => {
    avisar.current = aoAssistir;
  }, [aoAssistir]);
  // Avisa ao abrir, ao fechar (ou o painel sumir) e de novo depois de uma reconexão.
  useEffect(() => {
    if (!assistindo || !conectado) return;
    avisar.current?.(true);
    return () => avisar.current?.(false);
  }, [assistindo, conectado]);
  const ref = useRef<HTMLVideoElement>(null);
  const caixa = useRef<HTMLElement>(null);
  const cheia = useEmTelaCheia(caixa);
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
        <Espectadores nomes={espectadores} />
        <button type="button" onClick={() => setAssistindo(true)} disabled={!faixa}>
          {faixa ? 'Assistir' : 'Conectando…'}
        </button>
      </section>
    );
  }
  return (
    <section ref={caixa} className="transmissao-grande" aria-label={`Transmissão de ${nome}`}>
      <video ref={ref} autoPlay playsInline muted aria-label={`Tela de ${nome}`} onDoubleClick={() => alternarTelaCheia(caixa.current)} />
      <div className="transmissao-acoes">
        <span>🖥️ {nome}</span>
        <Espectadores nomes={espectadores} />
        <button type="button" className="secundario" onClick={() => alternarTelaCheia(caixa.current)}>
          {cheia ? 'Sair da tela cheia' : 'Tela cheia'}
        </button>
        <button type="button" className="secundario" onClick={() => setAssistindo(false)}>
          Fechar
        </button>
      </div>
    </section>
  );
}
