import { useEffect } from 'react';
import type { MotivoRevogacao, UsuarioDto } from '@tofalando/shared';
import { useShallow } from 'zustand/react/shallow';
import { useLoja } from '../estado/loja';
import { conectarTempoReal } from '../servicos/tempo-real';

interface Props {
  servidorUrl: string;
  token: string;
  /** Usuário de /api/eu, mostrado até o retrato do tempo real chegar. */
  usuarioInicial: UsuarioDto;
  aoSair: () => void;
  aoTrocarServidor: () => void;
  aoSessaoRevogada: (motivo: MotivoRevogacao) => void;
}

/** Tela principal logada: mantém a conexão em tempo real. Canais e chat chegam nas próximas tarefas (T8, T9). */
export function TelaPrincipal({ servidorUrl, token, usuarioInicial, aoSair, aoTrocarServidor, aoSessaoRevogada }: Props) {
  const { conexao, eu, usuarios, nomeServidor } = useLoja(
    useShallow((s) => ({ conexao: s.conexao, eu: s.eu, usuarios: s.usuarios, nomeServidor: s.nomeServidor })),
  );
  const definirConexao = useLoja((s) => s.definirConexao);
  const aplicarOla = useLoja((s) => s.aplicarOla);
  const limpar = useLoja((s) => s.limpar);

  useEffect(() => {
    const desconectar = conectarTempoReal(servidorUrl, token, {
      aoEstado: definirConexao,
      aoOla: aplicarOla,
      aoRevogada: aoSessaoRevogada,
    });
    return () => {
      desconectar();
      limpar();
    };
  }, [servidorUrl, token, definirConexao, aplicarOla, limpar, aoSessaoRevogada]);

  const usuario = eu ?? usuarioInicial;

  return (
    <div className="layout-principal">
      {conexao !== 'conectado' && (
        <div className="faixa-conexao" role="status" data-testid="faixa-conexao">
          {conexao === 'conectando' ? 'Conectando…' : 'Sem conexão com o servidor. Reconectando…'}
        </div>
      )}
      <main className="tela-centro">
        <section className="cartao">
          <h1 data-testid="usuario-logado">Olá, {usuario.nomeExibicao}</h1>
          <p className="suave">
            {usuario.cargo === 'admin' ? 'Administrador' : 'Membro'} · {nomeServidor ?? servidorUrl}
          </p>
          {usuarios.length > 0 && (
            <>
              <h2 className="subtitulo">Membros</h2>
              <ul className="lista-membros" aria-label="Membros">
                {usuarios.map((u) => (
                  <li key={u.id}>
                    <span className="bolinha" style={{ background: u.cor }} aria-hidden="true" />
                    {u.nomeExibicao}
                    {u.cargo === 'admin' && <span className="selo">admin</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" className="secundario" onClick={aoSair}>
            Sair
          </button>
          <button type="button" className="link" onClick={aoTrocarServidor}>
            Trocar servidor
          </button>
        </section>
      </main>
    </div>
  );
}
