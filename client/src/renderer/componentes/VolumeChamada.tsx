import { useEffect, useRef, useState } from 'react';
import { VOLUME_CHAMADA_MAX } from '@tofalando/shared';
import { Icone } from './Icone';

/**
 * volume-da-voz, RF-4 (T-8): botão "Volume da chamada" no painel de voz; abre um controle de 0 a 200% que vale para a
 * voz de todos (a transmissão e o ToOuvini têm volume próprio). Esc ou clique fora fecha.
 */
export function VolumeChamada({ volume, aoMudar }: { volume: number; aoMudar: (v: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);
  const pct = Math.round(volume * 100);
  return (
    <div className="volume-chamada" ref={caixa}>
      <button type="button" className="icone controle" aria-expanded={aberto} aria-label="Volume da chamada" title={`Volume da chamada: ${pct}%`} onClick={() => setAberto(!aberto)}>
        <Icone nome={volume === 0 ? 'volumeMudo' : volume < 0.5 ? 'volumeBaixo' : 'altoFalante'} />
      </button>
      {aberto && (
        <div className="volume-chamada-painel" role="group" aria-label="Volume da chamada">
          <input
            type="range"
            min={0}
            max={Math.round(VOLUME_CHAMADA_MAX * 100)}
            step={5}
            value={pct}
            autoFocus
            aria-label="Volume da chamada"
            aria-valuetext={`${pct}%`}
            onChange={(e) => aoMudar(Number(e.target.value) / 100)}
          />
          <span className="suave">{pct}%</span>
        </div>
      )}
    </div>
  );
}
