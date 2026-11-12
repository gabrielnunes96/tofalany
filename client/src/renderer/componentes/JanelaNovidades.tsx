import { useEffect, type CSSProperties } from 'react';
import type { NotasVersao } from '@tofalando/shared';
import { tocarFanfarra } from '../servicos/fanfarra';

/** Pedacinhos de confete: posição, cor, atraso e giro vêm do índice (mesma festa toda vez). */
const CONFETES = Array.from({ length: 36 }, (_, i) => i);

/**
 * Notas da versão, uma vez depois de atualizar: a janela entra com mola, a borda gira em gradiente, chove confete
 * e toca a fanfarra. Com "reduzir movimento", fica só a janela parada (o som continua, é curto).
 */
export function JanelaNovidades({ notas, versao, aoFechar, tocar = tocarFanfarra }: { notas: NotasVersao; versao: string; aoFechar: () => void; tocar?: () => void }) {
  useEffect(() => {
    tocar();
  }, [tocar]);
  return (
    <div className="dialogo-fundo novidades-fundo" role="presentation">
      <div className="confetes" aria-hidden="true">
        {CONFETES.map((i) => (
          <span key={i} style={{ '--i': i } as CSSProperties} />
        ))}
      </div>
      <div className="dialogo cartao novidades" role="dialog" aria-label={`Novidades da versão ${versao}`}>
        <p className="novidades-selo">versão {versao}</p>
        <h2>{notas.chamada ?? `Novidades da versão ${versao}`}</h2>
        <ul>
          {notas.itens.map((item, i) => (
            <li key={item.titulo} style={{ '--i': i } as CSSProperties}>
              <strong>{item.titulo}</strong>
              <span>{item.texto}</span>
            </li>
          ))}
        </ul>
        <div className="dialogo-acoes">
          <button type="button" autoFocus onClick={aoFechar}>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
}
