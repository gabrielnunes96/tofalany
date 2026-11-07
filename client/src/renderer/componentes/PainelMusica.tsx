import { useState } from 'react';
import type { ComandoMusica, EstadoMusica, UsuarioDto } from '@tofalando/shared';

function tempo(segundos: number): string {
  if (!segundos) return 'ao vivo';
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = String(segundos % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/**
 * Backlog v2, item 14: o ToOuvini no meu canal de voz — o que toca, pausa, pular, parar, a fila e tirá-lo da sala.
 * Pedir música: "/play <link, playlist ou nome>" no chat de qualquer canal de texto ("/" abre a lista de comandos).
 */
export function PainelMusica({
  estado,
  usuarios,
  aoComando,
  filaAberta,
  aoAlternarFila,
}: {
  estado: EstadoMusica | undefined;
  usuarios: UsuarioDto[];
  aoComando: (c: ComandoMusica) => Promise<string | null>;
  /** /queue abre a fila; o botão alterna. */
  filaAberta: boolean;
  aoAlternarFila: () => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  if (!estado?.tocando && !estado?.conectado) return null;
  const { tocando, fila, pausado } = estado;
  const quem = (id: number) => usuarios.find((u) => u.id === id)?.nomeExibicao ?? 'alguém';
  const mandar = async (c: ComandoMusica) => setErro(await aoComando(c));
  return (
    <div className={`painel-musica${pausado ? ' pausado' : ''}`} role="region" aria-label="Música no canal">
      <p className="musica-bot">
        <span aria-hidden="true">🎵</span> <strong>ToOuvini</strong>
        <span className="suave">{tocando ? (pausado ? ' · pausado' : ' · tocando') : ' · na sala, sem música (/play para pedir)'}</span>
      </p>
      {tocando && (
        <p className="musica-atual">
          <strong title={tocando.titulo}>{tocando.titulo}</strong>
          <span className="suave">
            {' '}
            · {tempo(tocando.duracao)} · pedido por {quem(tocando.pedidoPor)}
          </span>
        </p>
      )}
      {fila.length > 0 && !filaAberta && (
        <p className="suave musica-fila">
          Depois: {fila[0]!.titulo}
          {fila.length > 1 ? ` e mais ${fila.length - 1}` : ''}
        </p>
      )}
      {filaAberta && (
        <ol className="musica-lista" aria-label="Fila do ToOuvini">
          {fila.length === 0 && <li className="suave">A fila está vazia.</li>}
          {fila.map((m, i) => (
            <li key={`${m.url}-${i}`} title={m.titulo}>
              {m.titulo} <span className="suave">· {tempo(m.duracao)}</span>
            </li>
          ))}
        </ol>
      )}
      <div className="musica-botoes">
        {tocando &&
          (pausado ? (
            <button type="button" className="secundario" onClick={() => void mandar({ comando: 'continuar' })} aria-label="Continuar" title="Continuar">
              ▶
            </button>
          ) : (
            <button type="button" className="secundario" onClick={() => void mandar({ comando: 'pausar' })} aria-label="Pausar" title="Pausar">
              ⏸
            </button>
          ))}
        {tocando && (
          <button type="button" className="secundario" onClick={() => void mandar({ comando: 'pular' })} aria-label="Pular" title="Pular">
            ⏭
          </button>
        )}
        {tocando && (
          <button type="button" className="secundario" onClick={() => void mandar({ comando: 'parar' })} aria-label="Parar" title="Parar">
            ⏹
          </button>
        )}
        <button type="button" className="secundario" aria-pressed={filaAberta} aria-label="Fila" title="Fila" onClick={aoAlternarFila}>
          ☰{fila.length ? ` ${fila.length}` : ''}
        </button>
        <button type="button" className="secundario" aria-label="Tirar o ToOuvini da sala" title="Tirar o ToOuvini da sala" onClick={() => void mandar({ comando: 'expulsar' })}>
          ⏏
        </button>
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
