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
 * Backlog v2, item 14: o que o bot de música toca no meu canal de voz, com pular e parar.
 * Pedir música: "/tocar <link do YouTube ou nome>" no chat de qualquer canal de texto.
 */
export function PainelMusica({ estado, usuarios, aoComando }: { estado: EstadoMusica | undefined; usuarios: UsuarioDto[]; aoComando: (c: ComandoMusica) => Promise<string | null> }) {
  const [erro, setErro] = useState<string | null>(null);
  if (!estado?.tocando) return null;
  const { tocando, fila } = estado;
  const quem = (id: number) => usuarios.find((u) => u.id === id)?.nomeExibicao ?? 'alguém';
  const mandar = async (c: ComandoMusica) => setErro(await aoComando(c));
  return (
    <div className="painel-musica" role="region" aria-label="Música no canal">
      <p className="musica-atual">
        <span aria-hidden="true">🎵 </span>
        <strong title={tocando.titulo}>{tocando.titulo}</strong>
        <span className="suave">
          {' '}
          · {tempo(tocando.duracao)} · pedido por {quem(tocando.pedidoPor)}
        </span>
      </p>
      {fila.length > 0 && (
        <p className="suave musica-fila" title={fila.map((m, i) => `${i + 1}. ${m.titulo}`).join('\n')}>
          Depois: {fila[0]!.titulo}
          {fila.length > 1 ? ` e mais ${fila.length - 1}` : ''}
        </p>
      )}
      <div className="musica-botoes">
        <button type="button" className="secundario" onClick={() => void mandar({ comando: 'pular' })}>
          ⏭ Pular
        </button>
        <button type="button" className="secundario" onClick={() => void mandar({ comando: 'parar' })}>
          ⏹ Parar
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
