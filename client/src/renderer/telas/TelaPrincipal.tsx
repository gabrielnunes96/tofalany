import { useEffect, useMemo, useState } from 'react';
import type { MotivoRevogacao, UsuarioDto } from '@tofalando/shared';
import { useShallow } from 'zustand/react/shallow';
import { useLoja } from '../estado/loja';
import { conectarTempoReal } from '../servicos/tempo-real';
import { criarApi } from '../servicos/api';
import { TelaAuditoria } from './TelaAuditoria';
import { TelaPerfil } from './TelaPerfil';
import { Avatar } from '../componentes/Avatar';

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
  const adicionarUsuario = useLoja((s) => s.adicionarUsuario);
  const atualizarUsuario = useLoja((s) => s.atualizarUsuario);
  const limpar = useLoja((s) => s.limpar);

  useEffect(() => {
    const desconectar = conectarTempoReal(servidorUrl, token, {
      aoEstado: definirConexao,
      aoOla: aplicarOla,
      aoUsuarioCriado: adicionarUsuario,
      aoUsuarioAtualizado: atualizarUsuario,
      aoRevogada: aoSessaoRevogada,
    });
    return () => {
      desconectar();
      limpar();
    };
  }, [servidorUrl, token, definirConexao, aplicarOla, adicionarUsuario, atualizarUsuario, limpar, aoSessaoRevogada]);

  const usuario = eu ?? usuarioInicial;
  const [vista, setVista] = useState<'inicio' | 'auditoria' | 'perfil'>('inicio');
  const api = useMemo(() => criarApi(servidorUrl, token), [servidorUrl, token]);
  const ehAdmin = usuario.cargo === 'admin';

  return (
    <div className="layout-principal">
      {conexao !== 'conectado' && (
        <div className="faixa-conexao" role="status" data-testid="faixa-conexao">
          {conexao === 'conectando' ? 'Conectando…' : 'Sem conexão com o servidor. Reconectando…'}
        </div>
      )}
      {vista === 'auditoria' && ehAdmin ? (
        <main className="conteudo">
          <TelaAuditoria api={api} usuarios={usuarios} aoVoltar={() => setVista('inicio')} />
        </main>
      ) : vista === 'perfil' ? (
        <main className="conteudo">
          <TelaPerfil usuario={usuario} servidorUrl={servidorUrl} api={api} aoAtualizar={atualizarUsuario} aoVoltar={() => setVista('inicio')} />
        </main>
      ) : (
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
                    <Avatar usuario={u} servidorUrl={servidorUrl} tamanho={24} />
                    <span>{u.nomeExibicao}</span>
                    {u.cargo === 'admin' && <span className="selo">admin</span>}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => setVista('perfil')}>
            Meu perfil
          </button>
          {ehAdmin && (
            <button type="button" onClick={() => setVista('auditoria')}>
              Auditoria
            </button>
          )}
          <button type="button" className="secundario" onClick={aoSair}>
            Sair
          </button>
          <button type="button" className="link" onClick={aoTrocarServidor}>
            Trocar servidor
          </button>
        </section>
      </main>
      )}
    </div>
  );
}
