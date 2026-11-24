import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icone } from './Icone';

const ALTURA_LISTA = 260;
const FOLGA = 6;

/**
 * teste-de-microfone (item 58, RN-8): a lista abre para o lado com mais espaço e nunca passa da borda de `limite`
 * (o painel da transmissão, que corta o que vaza, ou a janela).
 */
export function posicaoLista(botao: { top: number; bottom: number }, limite: { top: number; bottom: number }) {
  const abaixo = limite.bottom - botao.bottom - FOLGA * 2;
  const acima = botao.top - limite.top - FOLGA * 2;
  const paraCima = abaixo < ALTURA_LISTA && acima > abaixo;
  return { paraCima, maxAltura: Math.max(80, Math.min(ALTURA_LISTA, paraCima ? acima : abaixo)) };
}

/** Quem está assistindo uma transmissão: olho com o número; ao clicar, a lista com os nomes. */
export function Espectadores({ nomes }: { nomes: string[] }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState<{ paraCima: boolean; maxAltura: number } | null>(null);
  useLayoutEffect(() => {
    if (!aberto || !caixa.current) return;
    const botao = caixa.current.getBoundingClientRect();
    const painel = caixa.current.closest('.transmissao-grande')?.getBoundingClientRect();
    const limite = { top: Math.max(0, painel?.top ?? 0), bottom: Math.min(window.innerHeight, painel?.bottom ?? window.innerHeight) };
    setPosicao(posicaoLista(botao, limite));
  }, [aberto]);
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
        <div
          className={posicao?.paraCima ? 'espectadores-lista para-cima' : 'espectadores-lista'}
          style={posicao ? { maxHeight: posicao.maxAltura } : undefined}
          role="dialog"
          aria-label="Quem está assistindo"
        >
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
