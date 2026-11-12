import { useEffect, type CSSProperties } from 'react';
import { NOVIDADES, type NotasVersao } from '@tofalando/shared';
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

/** "0.15.0" > "0.14.0" (números, não texto). */
const compararVersoes = (a: string, b: string) => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
  return 0;
};

/** Notas de todas as versões, da mais nova para a mais antiga (seção "Novidades" das configurações). */
export function NotasDasVersoes({ versaoAtual, notas = NOVIDADES }: { versaoAtual: string; notas?: Record<string, NotasVersao> }) {
  const versoes = Object.keys(notas).sort(compararVersoes);
  return (
    <div className="notas-versoes">
      {versoes.map((v) => (
        <section key={v} className="nota-versao" aria-label={`Versão ${v}`}>
          <h3>
            Versão {v} {v === versaoAtual && <span className="selo">Instalada</span>}
          </h3>
          {notas[v]!.chamada && <p className="nota-chamada">{notas[v]!.chamada}</p>}
          <ul>
            {notas[v]!.itens.map((item) => (
              <li key={item.titulo}>
                <strong>{item.titulo}</strong>: {item.texto}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

