import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { EscolhaStatus } from '@tofalando/shared';
import { Icone } from './Icone';

const OPCOES: { valor: EscolhaStatus; texto: string; dica: string; cor: string }[] = [
  { valor: 'auto', texto: 'Online', dica: 'Fica ausente sozinho depois de 10 min parado', cor: 'online' },
  { valor: 'ausente', texto: 'Ausente', dica: 'Aparece como ausente para todos', cor: 'ausente' },
  { valor: 'naoIncomodar', texto: 'Não incomodar', dica: 'Sem notificações nem sons de mensagem', cor: 'naoIncomodar' },
  { valor: 'invisivel', texto: 'Invisível', dica: 'Aparece offline, mas você vê e fala normalmente', cor: 'offline' },
];

/** Backlog v2, item 2: escolha do próprio status, num menu com a bolinha de cada um (antes um select do sistema). */
export function SeletorStatus({ valor, aoMudar }: { valor: EscolhaStatus; aoMudar: (v: EscolhaStatus) => void }) {
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  /** Backlog 23: o menu abre fora da coluna (no corpo da página), junto do botão, para não ser cortado por ela. */
  const [posicao, setPosicao] = useState<CSSProperties>({});
  const caixa = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const atual = OPCOES.find((o) => o.valor === valor) ?? OPCOES[0]!;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!caixa.current?.contains(alvo) && !lista.current?.contains(alvo)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    lista.current?.focus();
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const abrir = () => {
    const r = caixa.current?.getBoundingClientRect();
    if (r) setPosicao({ left: Math.max(8, Math.min(r.left, window.innerWidth - 258)), bottom: window.innerHeight - r.top + 6 });
    setFoco(Math.max(0, OPCOES.findIndex((o) => o.valor === valor)));
    setAberto(true);
  };
  const escolher = (v: EscolhaStatus) => {
    aoMudar(v);
    setAberto(false);
  };
  const teclado = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setAberto(false);
    else if (e.key === 'ArrowDown') setFoco((f) => (f + 1) % OPCOES.length);
    else if (e.key === 'ArrowUp') setFoco((f) => (f + OPCOES.length - 1) % OPCOES.length);
    else if (e.key === 'Enter' || e.key === ' ') escolher(OPCOES[foco]!.valor);
    else return;
    e.preventDefault();
  };

  return (
    <div className="seletor-status" ref={caixa}>
      <button type="button" className="seletor-status-botao" aria-haspopup="listbox" aria-expanded={aberto} aria-label={`Meu status: ${atual.texto}`} onClick={() => (aberto ? setAberto(false) : abrir())}>
        <span className={`status-ponto status-${atual.cor}`} aria-hidden="true" />
        <span>{atual.texto}</span>
        <Icone nome="setaBaixo" tamanho={14} />
      </button>
      {aberto &&
        createPortal(
          <ul ref={lista} className="seletor-status-lista" style={posicao} role="listbox" aria-label="Meu status" tabIndex={-1} aria-activedescendant={`status-${OPCOES[foco]!.valor}`} onKeyDown={teclado}>
            {OPCOES.map((o, i) => (
              <li
                key={o.valor}
                id={`status-${o.valor}`}
                role="option"
                aria-selected={o.valor === valor}
                className={i === foco ? 'foco' : undefined}
                onMouseEnter={() => setFoco(i)}
                onClick={() => escolher(o.valor)}
              >
                <span className={`status-ponto status-${o.cor}`} aria-hidden="true" />
                <span className="seletor-status-texto">
                  {o.texto}
                  <small>{o.dica}</small>
                </span>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  );
}
