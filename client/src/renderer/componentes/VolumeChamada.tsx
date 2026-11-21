import { useId, useRef, useState } from 'react';
import { VOLUME_CHAMADA_MAX } from '@tofalando/shared';
import { Icone } from './Icone';

/**
 * volume-da-voz, RF-4 (T-8): botão "Volume da chamada" no painel de voz; abre um controle de 0 a 200% que vale para a
 * voz de todos (a transmissão e o ToOuvini têm volume próprio). Esc fecha e devolve o foco ao botão; tirar o foco
 * (clique fora ou Tab) também fecha.
 */
export function VolumeChamada({ volume, aoMudar }: { volume: number; aoMudar: (v: number) => void }) {
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const idPainel = useId();
  const pct = Math.round(volume * 100);
  return (
    <div
      className="volume-chamada"
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || !aberto) return;
        e.stopPropagation();
        setAberto(false);
        botao.current?.focus();
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <button
        ref={botao}
        type="button"
        className="icone controle"
        aria-expanded={aberto}
        aria-controls={idPainel}
        aria-label="Volume da chamada"
        title={`Volume da chamada: ${pct}%`}
        onClick={() => setAberto(!aberto)}
      >
        <Icone nome={volume === 0 ? 'volumeMudo' : volume < 0.5 ? 'volumeBaixo' : 'altoFalante'} />
      </button>
      {aberto && (
        <div id={idPainel} className="volume-chamada-painel">
          <input
            type="range"
            min={0}
            max={Math.round(VOLUME_CHAMADA_MAX * 100)}
            step={5}
            value={pct}
            autoFocus
            aria-label="Volume da chamada (porcentagem)"
            aria-valuetext={`${pct}%`}
            onChange={(e) => aoMudar(Number(e.target.value) / 100)}
          />
          <span className="suave">{pct}%</span>
        </div>
      )}
    </div>
  );
}
