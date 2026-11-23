import { useCallback, useEffect, useState } from 'react';
import type { SessaoAparelhoDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';

const data = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/**
 * celular (RN-12): onde a conta está aberta. Desconectar um aparelho (um celular perdido, por exemplo) derruba a
 * sessão dele na hora e para os avisos dele.
 */
export function AparelhosConectados({ api }: { api: Required<Pick<ClienteApi, 'sessoes' | 'desconectarSessao'>> }) {
  const [lista, setLista] = useState<SessaoAparelhoDto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const carregar = useCallback(
    () =>
      api
        .sessoes()
        .then(setLista)
        .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os aparelhos.')),
    [api],
  );
  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function desconectar(id: string) {
    setErro(null);
    try {
      await api.desconectarSessao(id);
      setConfirmando(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desconectar.');
    }
  }

  return (
    <section className="perfil-form" aria-labelledby="titulo-aparelhos">
      <h2 id="titulo-aparelhos">Aparelhos conectados</h2>
      <p className="suave">Onde a sua conta está aberta. Desconecte o que você não reconhece ou não usa mais.</p>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {lista === null ? (
        !erro && <p className="suave">Carregando…</p>
      ) : (
        <ul className="lista-admin" aria-label="Aparelhos conectados">
          {lista.map((s) => (
            <li key={s.id} aria-label={s.aparelho ?? 'Aparelho'}>
              <span className="nome">
                {s.aparelho ?? 'Aparelho sem nome'}
                {s.atual ? ' (este aparelho)' : ''}{' '}
                <span className="suave">último uso {data.format(s.vistoEm)}</span>
              </span>
              {!s.atual &&
                (confirmando === s.id ? (
                  <span className="confirmar" role="group" aria-label={`Confirmar desconectar ${s.aparelho ?? 'aparelho'}`}>
                    <button type="button" className="perigo" onClick={() => void desconectar(s.id)}>
                      Desconectar
                    </button>
                    <button type="button" className="secundario" onClick={() => setConfirmando(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button type="button" className="secundario" onClick={() => setConfirmando(s.id)}>
                    Desconectar
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
