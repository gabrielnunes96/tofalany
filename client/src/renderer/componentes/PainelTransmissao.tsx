import { useEffect, useRef, useState } from 'react';
import type { FaixaVideo } from '../servicos/voz';
import { alternarTelaCheia, useEmTelaCheia } from './telaCheia';
import { Espectadores } from './Espectadores';
import { Icone } from './Icone';

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
  aoSom,
}: {
  nome: string;
  faixa: FaixaVideo | undefined;
  espectadores?: string[];
  aoAssistir?: (assistindo: boolean) => void;
  conectado?: boolean;
  /** Som da transmissão aqui: toca só assistindo, no volume escolhido (0 = mudo). */
  aoSom?: (o: { assistindo: boolean; volume: number }) => void;
}) {
  const [assistindo, setAssistindo] = useState(false);
  const [volume, setVolume] = useState(1);
  const [mudo, setMudo] = useState(false);
  const som = useRef(aoSom);
  useEffect(() => {
    som.current = aoSom;
  }, [aoSom]);
  useEffect(() => {
    som.current?.({ assistindo, volume: mudo ? 0 : volume });
  }, [assistindo, volume, mudo]);
  // Painel some (a pessoa parou): o som dela para de tocar aqui.
  useEffect(() => () => som.current?.({ assistindo: false, volume: 1 }), []);
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
          <Icone nome="tela" tamanho={16} /> <strong>{nome}</strong> está transmitindo a tela.
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
        <span className="com-icone"><Icone nome="tela" tamanho={16} /> {nome}</span>
        <Espectadores nomes={espectadores} />
        <div className="transmissao-volume">
          <button
            type="button"
            className="secundario"
            aria-pressed={mudo || volume === 0}
            aria-label={mudo || volume === 0 ? 'Ligar o som da transmissão' : 'Mutar o som da transmissão'}
            title={mudo || volume === 0 ? 'Ligar o som' : 'Mutar'}
            onClick={() => (volume === 0 ? (setVolume(1), setMudo(false)) : setMudo(!mudo))}
          >
            <Icone nome={mudo || volume === 0 ? 'volumeMudo' : volume < 0.5 ? 'volumeBaixo' : 'altoFalante'} tamanho={16} />
          </button>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={mudo ? 0 : Math.round(volume * 100)}
            aria-label="Volume da transmissão"
            aria-valuetext={`${mudo ? 0 : Math.round(volume * 100)}%`}
            title={`${mudo ? 0 : Math.round(volume * 100)}%`}
            onChange={(e) => {
              setVolume(Number(e.target.value) / 100);
              setMudo(false);
            }}
          />
        </div>
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
