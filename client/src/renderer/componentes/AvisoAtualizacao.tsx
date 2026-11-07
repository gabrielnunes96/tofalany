import { useEffect, useState } from 'react';
import type { ApiTofalando } from '../../preload/api';

type Estado = { versao: string; modo: 'reiniciar' | 'pagina' };

/**
 * Backlog v2, 1d: aviso de versão nova, num canto da tela (não mexe no layout).
 * Windows, AppImage e .deb: a versão já foi baixada, e "Reiniciar e atualizar" instala (no .deb o sistema pede a senha). Outros: abre a página da versão.
 */
export function AvisoAtualizacao({ atualizacao }: { atualizacao: ApiTofalando['atualizacao'] }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [fechado, setFechado] = useState<string | null>(null);

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

  if (!estado || fechado === `${estado.versao}:${estado.modo}`) return null;
  return (
    <aside className="aviso-atualizacao" role="status" aria-label="Versão nova">
      <p>
        <strong>ToFalany {estado.versao}</strong> {estado.modo === 'reiniciar' ? 'está pronto para instalar.' : 'está disponível.'}
      </p>
      <div>
        {estado.modo === 'reiniciar' ? (
          <button type="button" onClick={() => void atualizacao.instalar()}>
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
