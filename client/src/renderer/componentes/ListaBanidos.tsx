import { useEffect, useState } from 'react';
import type { BanimentoDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';
import { Avatar } from './Avatar';

/** Moderação: quem está banido deste servidor (com motivo, quem baniu e quando) e o botão de desbanir. */
export function ListaBanidos({ api, servidorUrl }: { api: Pick<ClienteApi, 'banidos' | 'desbanir'>; servidorUrl: string }) {
  const [lista, setLista] = useState<BanimentoDto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    api
      .banidos()
      .then((l) => vivo && setLista(l))
      .catch((e: unknown) => vivo && setErro(e instanceof Error ? e.message : 'Não foi possível ler os banidos.'));
    return () => {
      vivo = false;
    };
  }, [api]);
  async function desbanir(id: number) {
    setErro(null);
    try {
      await api.desbanir(id);
      setLista((l) => l?.filter((b) => b.usuario.id !== id) ?? null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível desbanir.');
    }
  }
  return (
    <section aria-labelledby="titulo-banidos">
      <h3 id="titulo-banidos">Banidos</h3>
      {lista === null && !erro && <p className="suave">Carregando…</p>}
      {lista?.length === 0 && <p className="suave">Ninguém banido.</p>}
      {lista && lista.length > 0 && (
        <ul className="lista-membros" aria-label="Banidos">
          {lista.map((b) => (
            <li key={b.usuario.id}>
              <Avatar usuario={b.usuario} servidorUrl={servidorUrl} tamanho={28} />
              <span className="banido-info">
                <strong>{b.usuario.nomeExibicao}</strong>
                <small className="suave">
                  {new Date(b.em).toLocaleDateString('pt-BR')}
                  {b.porNome ? ` por ${b.porNome}` : ''}
                  {b.motivo ? ` · ${b.motivo}` : ''}
                </small>
              </span>
              <button type="button" className="secundario" onClick={() => void desbanir(b.usuario.id)}>
                Desbanir
              </button>
            </li>
          ))}
        </ul>
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
