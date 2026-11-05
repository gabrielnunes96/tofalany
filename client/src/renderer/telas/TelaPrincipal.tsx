import { useEffect, useMemo, useState } from 'react';
import type { MotivoRevogacao, UsuarioDto } from '@tofalando/shared';
import { useShallow } from 'zustand/react/shallow';
import { useLoja } from '../estado/loja';
import { conectarTempoReal } from '../servicos/tempo-real';
import { criarApi } from '../servicos/api';
import { ponte } from '../servicos/ponte';
import { TelaAuditoria } from './TelaAuditoria';
import { TelaPerfil } from './TelaPerfil';
import { TelaMembros } from './TelaMembros';
import { TelaConvite } from './TelaConvite';
import type { PessoaFiltro } from './TelaAuditoria';
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
  const removerUsuario = useLoja((s) => s.removerUsuario);
  const definirLinkConvite = useLoja((s) => s.definirLinkConvite);
  const linkConvite = useLoja((s) => s.linkConvite);
  const [copiado, setCopiado] = useState<string | null>(null);
  const limpar = useLoja((s) => s.limpar);

  const [vista, setVista] = useState<'inicio' | 'auditoria' | 'perfil' | 'membros' | 'convite'>('inicio');

  useEffect(() => {
    const desconectar = conectarTempoReal(servidorUrl, token, {
      aoEstado: definirConexao,
      aoOla: aplicarOla,
      aoUsuarioCriado: adicionarUsuario,
      aoUsuarioAtualizado: (u) => {
        atualizarUsuario(u);
        // Perdeu o cargo: sai da tela de administração (e não volta sozinho se for promovido de novo).
        if (u.id === useLoja.getState().eu?.id && u.cargo !== 'admin') setVista('inicio');
      },
      aoUsuarioRemovido: removerUsuario,
      aoConviteAtualizado: (link) => {
        definirLinkConvite(link);
        setCopiado(null);
      },
      aoRevogada: aoSessaoRevogada,
    });
    return () => {
      desconectar();
      limpar();
    };
  }, [servidorUrl, token, definirConexao, aplicarOla, adicionarUsuario, atualizarUsuario, removerUsuario, definirLinkConvite, limpar, aoSessaoRevogada]);

  const usuario = eu ?? usuarioInicial;
  const [pessoasAuditoria, setPessoasAuditoria] = useState<PessoaFiltro[]>([]);
  const api = useMemo(() => criarApi(servidorUrl, token), [servidorUrl, token]);
  const ehAdmin = usuario.cargo === 'admin';
  // Perdeu o cargo enquanto estava numa tela de administração: volta ao início.
  const vistaAtual = !ehAdmin && (vista === 'auditoria' || vista === 'membros' || vista === 'convite') ? 'inicio' : vista;

  function abrirAuditoria() {
    setPessoasAuditoria(usuarios.map((u) => ({ id: u.id, nome: u.nomeExibicao })));
    setVista('auditoria');
    // Inclui contas removidas (CA-11a + auditoria); se falhar, fica a lista dos ativos.
    api
      .usuariosAdmin()
      .then((todos) => setPessoasAuditoria(todos.map((u) => ({ id: u.id, nome: u.nomeExibicao, removido: u.removido }))))
      .catch(() => undefined);
  }

  return (
    <div className="layout-principal">
      {conexao !== 'conectado' && (
        <div className="faixa-conexao" role="status" data-testid="faixa-conexao">
          {conexao === 'conectando' ? 'Conectando…' : 'Sem conexão com o servidor. Reconectando…'}
        </div>
      )}
      {vistaAtual === 'auditoria' ? (
        <main className="conteudo">
          <TelaAuditoria api={api} pessoas={pessoasAuditoria} aoVoltar={() => setVista('inicio')} />
        </main>
      ) : vistaAtual === 'membros' ? (
        <main className="conteudo">
          <TelaMembros
            eu={usuario}
            usuarios={usuarios}
            servidorUrl={servidorUrl}
            api={api}
            aoAtualizar={atualizarUsuario}
            aoRemover={removerUsuario}
            aoVoltar={() => setVista('inicio')}
          />
        </main>
      ) : vistaAtual === 'convite' ? (
        <main className="conteudo">
          <TelaConvite api={api} aoVoltar={() => setVista('inicio')} />
        </main>
      ) : vistaAtual === 'perfil' ? (
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
          {linkConvite && (
            <button
              type="button"
              className="secundario"
              onClick={() =>
                void ponte()
                  .areaTransferencia.copiar(linkConvite)
                  .then(() => setCopiado('Link de convite copiado.'))
                  .catch(() => setCopiado('Não foi possível copiar o link.'))
                  .finally(() => setTimeout(() => setCopiado(null), 4000))
              }
            >
              Copiar link de convite
            </button>
          )}
          {copiado && (
            <p className="aviso-ok" role="status">
              {copiado}
            </p>
          )}
          {ehAdmin && (
            <>
              <button type="button" onClick={() => setVista('membros')}>
                Membros
              </button>
              <button type="button" onClick={() => setVista('convite')}>
                Convite
              </button>
              <button type="button" onClick={abrirAuditoria}>
                Auditoria
              </button>
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
      )}
    </div>
  );
}
