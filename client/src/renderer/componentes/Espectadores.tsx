import { useEffect, useRef, useState } from 'react';
import { Icone } from './Icone';

/** Quem está assistindo uma transmissão: olho com o número; ao clicar, a lista com os nomes. */
export function Espectadores({ nomes }: { nomes: string[] }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);
  const n = nomes.length;
  const rotulo = n === 0 ? 'Ninguém assistindo' : n === 1 ? '1 pessoa assistindo' : `${n} pessoas assistindo`;
  return (
    <div className="espectadores" ref={caixa}>
      <button
        type="button"
        className="espectadores-botao"
        aria-haspopup="true"
        aria-expanded={aberto}
        aria-label={rotulo}
        title={rotulo}
        onClick={() => setAberto(!aberto)}
      >
        <Icone nome="olho" tamanho={16} />
        <span>{n}</span>
      </button>
      {aberto && (
        <div className="espectadores-lista" role="dialog" aria-label="Quem está assistindo">
          <strong>{rotulo}</strong>
          {n > 0 && (
            <ul>
              {[...nomes]
                .sort((a, b) => a.localeCompare(b, 'pt-BR'))
                .map((nome, i) => (
                  <li key={`${nome}-${i}`}>{nome}</li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
