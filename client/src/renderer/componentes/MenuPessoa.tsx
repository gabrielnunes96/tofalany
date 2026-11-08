import { useEffect, useRef } from 'react';
import { VOLUME_PESSOA_MAX, type AmizadeDto, type UsuarioDto } from '@tofalando/shared';
import { Avatar } from './Avatar';

/**
 * Clique direito numa pessoa (na sala de voz ou na lista de membros): volume dela só para mim, silenciar para mim,
 * conversa direta e amizade (adicionar, cancelar o pedido, aceitar ou desfazer).
 */
export function MenuPessoa({
  usuario,
  x,
  y,
  servidorUrl,
  eu,
  volume,
  silenciado,
  amizade,
  aoVolume,
  aoSilenciar,
  aoConversar,
  aoPedirAmizade,
  aoAceitarAmizade,
  aoRemoverAmizade,
  aoFechar,
}: {
  usuario: UsuarioDto;
  x: number;
  y: number;
  servidorUrl: string;
  eu: boolean;
  volume: number;
  silenciado: boolean;
  amizade: AmizadeDto['situacao'] | undefined;
  aoVolume: (v: number) => void;
  aoSilenciar: (sim: boolean) => void;
  aoConversar: () => void;
  aoPedirAmizade: () => void;
  aoAceitarAmizade: () => void;
  aoRemoverAmizade: () => void;
  aoFechar: () => void;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) aoFechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') aoFechar();
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    caixa.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aoFechar]);
  // Não sai da janela (perto da borda, abre para o outro lado).
  const largura = 250;
  const esquerda = Math.min(x, window.innerWidth - largura - 8);
  const topo = Math.min(y, window.innerHeight - 280);
  const fazer = (acao: () => void) => () => {
    acao();
    aoFechar();
  };

  return (
    <div ref={caixa} className="menu-pessoa" role="menu" aria-label={`Opções de ${usuario.nomeExibicao}`} style={{ left: esquerda, top: Math.max(8, topo), width: largura }}>
      <div className="menu-pessoa-topo">
        <Avatar usuario={usuario} servidorUrl={servidorUrl} tamanho={32} />
        <strong>{usuario.nomeExibicao}</strong>
      </div>
      {!eu && (
        <>
          <label className="menu-pessoa-volume">
            <span>Volume para mim</span>
            <span className="linha">
              <input
                type="range"
                min={0}
                max={Math.round(VOLUME_PESSOA_MAX * 100)}
                step={5}
                value={Math.round(volume * 100)}
                aria-label={`Volume de ${usuario.nomeExibicao}`}
                onChange={(e) => aoVolume(Number(e.target.value) / 100)}
              />
              <span className="suave">{Math.round(volume * 100)}%</span>
            </span>
          </label>
          <label className="menu-pessoa-check">
            <input type="checkbox" checked={silenciado} onChange={(e) => aoSilenciar(e.target.checked)} /> Silenciar para mim
          </label>
          <hr />
          <button type="button" role="menuitem" onClick={fazer(aoConversar)}>
            Mensagem direta
          </button>
          {amizade === undefined && (
            <button type="button" role="menuitem" onClick={fazer(aoPedirAmizade)}>
              Adicionar amigo
            </button>
          )}
          {amizade === 'enviado' && (
            <button type="button" role="menuitem" onClick={fazer(aoRemoverAmizade)}>
              Cancelar pedido de amizade
            </button>
          )}
          {amizade === 'recebido' && (
            <button type="button" role="menuitem" onClick={fazer(aoAceitarAmizade)}>
              Aceitar pedido de amizade
            </button>
          )}
          {amizade === 'amigo' && (
            <button type="button" role="menuitem" className="perigo-texto" onClick={fazer(aoRemoverAmizade)}>
              Desfazer amizade
            </button>
          )}
        </>
      )}
      {eu && <p className="suave">É você.</p>}
    </div>
  );
}
