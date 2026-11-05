import { useEffect, useMemo, useRef, useState } from 'react';
import { DIGITANDO_DURACAO_MS, type MotivoRevogacao, type TipoCanal, type UsuarioDto } from '@tofalando/shared';
import { useShallow } from 'zustand/react/shallow';
import { useLoja } from '../estado/loja';
import { conectarTempoReal, type ConexaoTempoReal } from '../servicos/tempo-real';
import { criarApi } from '../servicos/api';
import { ponte } from '../servicos/ponte';
import { TelaAuditoria, type PessoaFiltro } from './TelaAuditoria';
import { TelaPerfil } from './TelaPerfil';
import { TelaMembros } from './TelaMembros';
import { TelaConvite } from './TelaConvite';
import { Avatar } from '../componentes/Avatar';
import { BarraLateral } from '../componentes/BarraLateral';
import { CanalAberto } from '../componentes/CanalAberto';

interface Props {
  servidorUrl: string;
  token: string;
  /** Usuário de /api/eu, mostrado até o retrato do tempo real chegar. */
  usuarioInicial: UsuarioDto;
  aoSair: () => void;
  aoTrocarServidor: () => void;
  aoSessaoRevogada: (motivo: MotivoRevogacao) => void;
}

type Vista = 'canal' | 'auditoria' | 'perfil' | 'membros' | 'convite';

/** Tela logada: barra de canais, canal aberto (ou telas de perfil/administração) e membros. */
export function TelaPrincipal({ servidorUrl, token, usuarioInicial, aoSair, aoTrocarServidor, aoSessaoRevogada }: Props) {
  const { conexao, eu, usuarios, nomeServidor, canais, canalAtivo, linkConvite } = useLoja(
    useShallow((s) => ({
      conexao: s.conexao,
      eu: s.eu,
      usuarios: s.usuarios,
      nomeServidor: s.nomeServidor,
      canais: s.canais,
      canalAtivo: s.canalAtivo,
      linkConvite: s.linkConvite,
    })),
  );
  const acoes = useLoja(
    useShallow((s) => ({
      definirConexao: s.definirConexao,
      aplicarOla: s.aplicarOla,
      adicionarUsuario: s.adicionarUsuario,
      atualizarUsuario: s.atualizarUsuario,
      removerUsuario: s.removerUsuario,
      definirLinkConvite: s.definirLinkConvite,
      salvarCanal: s.salvarCanal,
      removerCanal: s.removerCanal,
      abrirCanal: s.abrirCanal,
      adicionarMensagem: s.adicionarMensagem,
      atualizarMensagem: s.atualizarMensagem,
      removerMensagem: s.removerMensagem,
      registrarDigitando: s.registrarDigitando,
      limpar: s.limpar,
    })),
  );
  const [vista, setVista] = useState<Vista>('canal');
  const [copiado, setCopiado] = useState<string | null>(null);
  const [pessoasAuditoria, setPessoasAuditoria] = useState<PessoaFiltro[]>([]);
  const conexaoRef = useRef<ConexaoTempoReal | null>(null);

  useEffect(() => {
    const conexao = conectarTempoReal(servidorUrl, token, {
      aoEstado: acoes.definirConexao,
      aoOla: acoes.aplicarOla,
      aoUsuarioCriado: acoes.adicionarUsuario,
      aoUsuarioAtualizado: (u) => {
        acoes.atualizarUsuario(u);
        // Perdeu o cargo: sai da tela de administração (e não volta sozinho se for promovido de novo).
        if (u.id === useLoja.getState().eu?.id && u.cargo !== 'admin') setVista('canal');
      },
      aoUsuarioRemovido: acoes.removerUsuario,
      aoConviteAtualizado: (link) => {
        acoes.definirLinkConvite(link);
        setCopiado(null);
      },
      aoCanalCriado: acoes.salvarCanal,
      aoCanalRenomeado: acoes.salvarCanal,
      aoCanalRemovido: acoes.removerCanal,
      aoMensagemNova: acoes.adicionarMensagem,
      aoMensagemEditada: acoes.atualizarMensagem,
      aoMensagemApagada: acoes.removerMensagem,
      aoDigitando: (canalId, usuarioId) => acoes.registrarDigitando(canalId, usuarioId, Date.now() + DIGITANDO_DURACAO_MS),
      aoRevogada: aoSessaoRevogada,
    });
    conexaoRef.current = conexao;
    return () => {
      conexaoRef.current = null;
      conexao.desconectar();
      acoes.limpar();
    };
  }, [servidorUrl, token, acoes, aoSessaoRevogada]);

  const usuario = eu ?? usuarioInicial;
  const api = useMemo(() => criarApi(servidorUrl, token), [servidorUrl, token]);
  const ehAdmin = usuario.cargo === 'admin';
  const vistaAtual: Vista = !ehAdmin && (vista === 'auditoria' || vista === 'membros' || vista === 'convite') ? 'canal' : vista;

  /** Ação em tempo real; devolve a mensagem de erro (ou null) e aplica o resultado na hora. */
  async function pedir<T>(fn: (c: ConexaoTempoReal) => Promise<{ ok: true; valor: T } | { ok: false; erro: string }>, aplicar: (v: T) => void) {
    const c = conexaoRef.current;
    if (!c) return 'Sem conexão com o servidor.';
    const r = await fn(c);
    if (!r.ok) return r.erro;
    aplicar(r.valor);
    return null;
  }

  const criarCanal = (tipo: TipoCanal, nome: string) =>
    pedir(
      (c) => c.pedir('canal:criar', { tipo, nome }),
      (canal) => {
        acoes.salvarCanal(canal);
        if (canal.tipo === 'texto') {
          acoes.abrirCanal(canal.id);
          setVista('canal');
        }
      },
    );
  const renomearCanal = (id: number, nome: string) => pedir((c) => c.pedir('canal:renomear', { id, nome }), acoes.salvarCanal);
  const enviarMensagem = (canalId: number, texto: string, anexos: string[]) =>
    pedir((c) => c.pedir('mensagem:enviar', { destino: { canalId }, texto, anexos }), acoes.adicionarMensagem);
  const editarMensagem = (id: number, texto: string) => pedir((c) => c.pedir('mensagem:editar', { id, texto }), acoes.atualizarMensagem);
  const apagarMensagem = (id: number) => {
    const canalId = Object.entries(useLoja.getState().historicos).find(([, h]) => h.mensagens.some((m) => m.id === id))?.[0];
    return pedir(
      (c) => c.pedir('mensagem:apagar', { id }),
      () => acoes.removerMensagem(id, canalId ? Number(canalId) : null),
    );
  };
  const removerCanal = (id: number) => pedir((c) => c.pedir('canal:remover', { id }), () => acoes.removerCanal(id));

  function abrirAuditoria() {
    setPessoasAuditoria(usuarios.map((u) => ({ id: u.id, nome: u.nomeExibicao })));
    setVista('auditoria');
    // Inclui contas removidas que ainda têm registros no prazo; se falhar, fica a lista dos ativos.
    api
      .usuariosAdmin()
      .then((todos) => setPessoasAuditoria(todos.map((u) => ({ id: u.id, nome: u.nomeExibicao, removido: u.removido }))))
      .catch(() => undefined);
  }

  const voltar = () => setVista('canal');

  return (
    <div className="layout-principal">
      {conexao !== 'conectado' && (
        <div className="faixa-conexao" role="status" data-testid="faixa-conexao">
          {conexao === 'conectando' ? 'Conectando…' : 'Sem conexão com o servidor. Reconectando…'}
        </div>
      )}
      <div className="layout-colunas">
        <aside className="coluna-esquerda">
          <BarraLateral
            nomeServidor={nomeServidor ?? servidorUrl}
            canais={canais}
            canalAtivo={vistaAtual === 'canal' ? canalAtivo : null}
            aoAbrir={(id) => {
              acoes.abrirCanal(id);
              setVista('canal');
            }}
            aoCriar={criarCanal}
            ehAdmin={ehAdmin}
            aoRenomear={renomearCanal}
            aoRemover={removerCanal}
          />
          <section className="painel-usuario" aria-label="Você">
            <div className="painel-usuario-topo">
              <Avatar usuario={usuario} servidorUrl={servidorUrl} tamanho={36} />
              <div>
                <p className="nome" data-testid="usuario-logado">
                  Olá, {usuario.nomeExibicao}
                </p>
                <p className="suave">
                  {ehAdmin ? 'Administrador' : 'Membro'} · {nomeServidor ?? servidorUrl}
                </p>
              </div>
            </div>
            <div className="painel-usuario-botoes">
              <button type="button" className="secundario" onClick={() => setVista('perfil')}>
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
              {ehAdmin && (
                <>
                  <button type="button" className="secundario" onClick={() => setVista('membros')}>
                    Membros
                  </button>
                  <button type="button" className="secundario" onClick={() => setVista('convite')}>
                    Convite
                  </button>
                  <button type="button" className="secundario" onClick={abrirAuditoria}>
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
            </div>
            {copiado && (
              <p className="aviso-ok" role="status">
                {copiado}
              </p>
            )}
          </section>
        </aside>

        <main className="conteudo">
          {vistaAtual === 'auditoria' ? (
            <TelaAuditoria api={api} pessoas={pessoasAuditoria} canais={canais} aoVoltar={voltar} />
          ) : vistaAtual === 'membros' ? (
            <TelaMembros
              eu={usuario}
              usuarios={usuarios}
              servidorUrl={servidorUrl}
              api={api}
              aoAtualizar={acoes.atualizarUsuario}
              aoRemover={acoes.removerUsuario}
              aoVoltar={voltar}
            />
          ) : vistaAtual === 'convite' ? (
            <TelaConvite api={api} aoVoltar={voltar} />
          ) : vistaAtual === 'perfil' ? (
            <TelaPerfil usuario={usuario} servidorUrl={servidorUrl} api={api} aoAtualizar={acoes.atualizarUsuario} aoVoltar={voltar} />
          ) : (
            <CanalAberto
              key={canalAtivo ?? 'nenhum'}
              canal={canais.find((c) => c.id === canalAtivo)}
              ehAdmin={ehAdmin}
              aoRenomear={renomearCanal}
              aoRemover={removerCanal}
              usuarios={usuarios}
              servidorUrl={servidorUrl}
              api={api}
              aoEnviar={enviarMensagem}
              euId={usuario.id}
              aoEditarMensagem={editarMensagem}
              aoApagarMensagem={apagarMensagem}
              aoDigitar={(canalId) => conexaoRef.current?.avisarDigitando(canalId)}
            />
          )}
        </main>

        <aside className="coluna-direita">
          <h2 className="subtitulo">Membros — {usuarios.length}</h2>
          <ul className="lista-membros" aria-label="Membros">
            {usuarios.map((u) => (
              <li key={u.id}>
                <Avatar usuario={u} servidorUrl={servidorUrl} tamanho={28} />
                <span>{u.nomeExibicao}</span>
                {u.cargo === 'admin' && <span className="selo">admin</span>}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
