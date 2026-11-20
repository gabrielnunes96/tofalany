import { useEffect, useState } from 'react';
import type { ApiTofalando } from '../../preload/api';
import icone from '../assets/icone.png';

type Estado = { versao: string; modo: 'reiniciar' | 'pagina' };

/**
 * Backlog v2, 1d: aviso de versão nova, num canto da tela (não mexe no layout).
 * Windows, AppImage e .deb: a versão já foi baixada, e "Reiniciar e atualizar" instala (no .deb o sistema pede a senha). Outros: abre a página da versão.
 */
export function AvisoAtualizacao({ atualizacao }: { atualizacao: ApiTofalando['atualizacao'] }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [fechado, setFechado] = useState<string | null>(null);
  /** Backlog 18: ao reiniciar, o ícone gira no meio da tela até o app fechar (no Windows, uma janelinha segue depois). */
  const [instalando, setInstalando] = useState(false);

  async function reiniciar() {
    setInstalando(true);
    // Dá tempo de a tela de espera aparecer antes de o app fechar.
    await new Promise((r) => setTimeout(r, 600));
    await atualizacao.instalar();
  }

  useEffect(() => {
    let vivo = true;
    void atualizacao
      .estado()
      .then((e) => vivo && e && setEstado(e))
      .catch(() => undefined);
    const parar = atualizacao.aoMudar((e) => setEstado(e));
    return () => {
      vivo = false;
      parar();
    };
  }, [atualizacao]);

  if (instalando) {
    return (
      <div className="tela-atualizando" role="status" aria-live="assertive">
        <img src={icone} alt="" className="tela-atualizando-icone" />
        <p>Atualizando o ToFalany{estado ? ` para a versão ${estado.versao}` : ''}…</p>
        <p className="suave">Ele abre de novo sozinho em alguns segundos.</p>
      </div>
    );
  }
  if (!estado || fechado === `${estado.versao}:${estado.modo}`) return null;
  return (
    <aside className="aviso-atualizacao" role="status" aria-label="Versão nova">
      <p>
        <strong>ToFalany {estado.versao}</strong> {estado.modo === 'reiniciar' ? 'está pronto para instalar.' : 'está disponível.'}
      </p>
      <div>
        {estado.modo === 'reiniciar' ? (
          <button type="button" onClick={() => void reiniciar()}>
            Reiniciar e atualizar
          </button>
        ) : (
          <button type="button" onClick={() => void atualizacao.abrirPagina()}>
            Baixar a versão nova
          </button>
        )}
        <button type="button" className="secundario" onClick={() => setFechado(`${estado.versao}:${estado.modo}`)}>
          Depois
        </button>
      </div>
    </aside>
  );
}
