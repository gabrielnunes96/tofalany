import { useState } from 'react';
import type { Cargo, UsuarioDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';
import { Avatar } from '../componentes/Avatar';

interface Props {
  eu: UsuarioDto;
  usuarios: UsuarioDto[];
  servidorUrl: string;
  api: Pick<ClienteApi, 'mudarCargo' | 'removerConta'>;
  /** Aplica na hora o resultado (o evento do servidor também chega, mas pode atrasar com a conexão caída). */
  aoAtualizar: (usuario: UsuarioDto) => void;
  aoRemover: (id: number) => void;
  aoVoltar: () => void;
}

/** RF-6 (administrador): promover, rebaixar e remover contas. O servidor confere tudo (RN-5, RN-16). */
export function TelaMembros({ eu, usuarios, servidorUrl, api, aoAtualizar, aoRemover, aoVoltar }: Props) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);

  async function agir(id: number, acao: () => Promise<unknown>) {
    setErro(null);
    setOcupado(id);
    try {
      await acao();
      setConfirmando(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(null);
    }
  }

  const mudarCargo = (u: UsuarioDto, cargo: Cargo) => agir(u.id, async () => aoAtualizar(await api.mudarCargo(u.id, cargo)));
  const remover = (u: UsuarioDto) =>
    agir(u.id, async () => {
      await api.removerConta(u.id);
      aoRemover(u.id);
    });

  return (
    <section className="painel" aria-labelledby="titulo-membros">
      <div className="painel-topo">
        <h1 id="titulo-membros">Membros</h1>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <ul className="lista-admin" aria-label="Contas do servidor">
        {usuarios.map((u) => (
          <li key={u.id} aria-label={u.nomeExibicao}>
            <Avatar usuario={u} servidorUrl={servidorUrl} tamanho={32} />
            <span className="nome">
              {u.nomeExibicao} <span className="suave">@{u.usuario}</span>
              {u.id === eu.id && <span className="suave"> (você)</span>}
            </span>
            <span className="selo">{u.cargo === 'admin' ? 'Administrador' : 'Membro'}</span>
            {u.cargo === 'membro' ? (
              <button type="button" disabled={ocupado !== null} onClick={() => void mudarCargo(u, 'admin')}>
                Tornar administrador
              </button>
            ) : (
              <button type="button" className="secundario" disabled={ocupado !== null} onClick={() => void mudarCargo(u, 'membro')}>
                Tornar membro
              </button>
            )}
            {confirmando === u.id ? (
              <span className="confirmar" role="group" aria-label={`Confirmar remoção de ${u.nomeExibicao}`}>
                <button type="button" className="perigo" disabled={ocupado !== null} onClick={() => void remover(u)}>
                  Confirmar remoção
                </button>
                <button type="button" className="secundario" onClick={() => setConfirmando(null)}>
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" className="secundario" disabled={ocupado !== null} onClick={() => setConfirmando(u.id)}>
                Remover conta
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="suave">
        Remover uma conta desconecta a pessoa na hora e libera a vaga. As mensagens dela continuam, com o autor "conta removida".
      </p>
    </section>
  );
}
