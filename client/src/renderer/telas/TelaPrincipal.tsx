import { useEffect, useMemo, useRef, useState } from 'react';
import { DIGITANDO_DURACAO_MS, type Destino, type MensagemDto, type MotivoRevogacao, type TipoCanal, type UsuarioDto } from '@tofalando/shared';
import { useShallow } from 'zustand/react/shallow';
import { useLoja } from '../estado/loja';
import { conectarTempoReal, type ConexaoTempoReal } from '../servicos/tempo-real';
import { criarApi } from '../servicos/api';
import { ponte } from '../servicos/ponte';
import { TelaAuditoria, type PessoaFiltro } from './TelaAuditoria';
import { TelaPerfil } from './TelaPerfil';
import { TelaMembros } from './TelaMembros';
import { TelaConvite } from './TelaConvite';
import { TelaSons } from './TelaSons';
import { Avatar } from '../componentes/Avatar';
import { BarraLateral } from '../componentes/BarraLateral';
import { CanalAberto } from '../componentes/CanalAberto';
import { DmAberta } from '../componentes/DmAberta';
import { chaveCanal, chaveDm, type Chave, type Historico } from '../estado/loja';
import { decidirMensagemNova } from '../estado/notificar';

interface Props {
  servidorUrl: string;
  token: string;
  /** Usuário de /api/eu, mostrado até o retrato do tempo real chegar. */
  usuarioInicial: UsuarioDto;
  aoSair: () => void;
  aoTrocarServidor: () => void;
  aoSessaoRevogada: (motivo: MotivoRevogacao) => void;
}

type Vista = 'canal' | 'auditoria' | 'perfil' | 'membros' | 'convite' | 'sons';

/** "c:1" → { canalId: 1 }; "d:2" → { dmId: 2 }. */
const destinoDe = (chave: Chave): Destino => {
  const id = Number(chave.slice(2));
  return chave.startsWith('c:') ? { canalId: id } : { dmId: id };
};

/** Tela logada: barra de canais, canal aberto (ou telas de perfil/administração) e membros. */
export function TelaPrincipal({ servidorUrl, token, usuarioInicial, aoSair, aoTrocarServidor, aoSessaoRevogada }: Props) {
  const { conexao, eu, usuarios, nomeServidor, canais, canalAtivo, linkConvite, dms, dmAtiva, naoLidas, sons } = useLoja(
    useShallow((s) => ({
      naoLidas: s.naoLidas,
      sons: s.sons,
      dms: s.dms,
      dmAtiva: s.dmAtiva,
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
      salvarDm: s.salvarDm,
      contarNaoLida: s.contarNaoLida,
      zerarNaoLidas: s.zerarNaoLidas,
      aplicarLeitura: s.aplicarLeitura,
      descontarApagada: s.descontarApagada,
      definirSons: s.definirSons,
      salvarSom: s.salvarSom,
      tirarSom: s.tirarSom,
      abrirDm: s.abrirDm,
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
  const chaveAbertaRef = useRef<Chave | null>(null);

  useEffect(() => {
    /** RF-12: conta como não lida ou marca como lida, e pede a notificação (o processo principal decide pelo foco). */
    function avisarMensagemNova(m: MensagemDto) {
      const estado = useLoja.getState();
      if (!estado.eu) return;
      const d = decidirMensagemNova(m, {
        euId: estado.eu.id,
        chaveAberta: chaveAbertaRef.current,
        focado: document.hasFocus(),
        usuarios: estado.usuarios,
        canais: estado.canais,
      });
      if (!d) return;
      if (d.acao === 'lido') conexaoRef.current?.avisarLido(destinoDe(d.chave), m.id);
      else acoes.contarNaoLida(d.chave, m.id);
      void ponte()
        .notificacoes.mostrar(d.notificacao)
        .catch(() => undefined);
    }

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
      aoMensagemNova: (m) => {
        acoes.adicionarMensagem(m);
        avisarMensagemNova(m);
      },
      aoMensagemEditada: acoes.atualizarMensagem,
      aoMensagemApagada: (id, chave) => {
        acoes.removerMensagem(id, chave);
        if (chave) acoes.descontarApagada(chave, id);
      },
      aoDigitando: (chave, usuarioId) => acoes.registrarDigitando(chave, usuarioId, Date.now() + DIGITANDO_DURACAO_MS),
      aoDmAtualizada: acoes.salvarDm,
      aoLidoAtualizado: acoes.aplicarLeitura,
      aoSonsAtualizados: acoes.definirSons,
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
  const vistaAtual: Vista = !ehAdmin && (vista === 'auditoria' || vista === 'membros' || vista === 'convite' || vista === 'sons') ? 'canal' : vista;

  /** Conversa na tela agora (null em perfil/administração). */
  const chaveAberta: Chave | null =
    vistaAtual !== 'canal' ? null : dmAtiva !== null ? chaveDm(dmAtiva) : canalAtivo !== null ? chaveCanal(canalAtivo) : null;
  useEffect(() => {
    chaveAbertaRef.current = chaveAberta;
  }, [chaveAberta]);

  // Conversa aberta com a janela em foco: zera o contador e marca como lida até a última mensagem.
  const ultimoIdAberta = useLoja((s) => (chaveAberta ? s.historicos[chaveAberta]?.mensagens.at(-1)?.id : undefined));
  useEffect(() => {
    if (!chaveAberta) return;
    const marcar = () => {
      if (!document.hasFocus()) return;
      // Só zera quando há o que marcar (histórico carregado); senão o contador voltaria na reconexão.
      const id = useLoja.getState().historicos[chaveAberta]?.mensagens.at(-1)?.id;
      if (!id) return;
      acoes.zerarNaoLidas(chaveAberta);
      conexaoRef.current?.avisarLido(destinoDe(chaveAberta), id);
    };
    marcar();
    window.addEventListener('focus', marcar);
    return () => window.removeEventListener('focus', marcar);
  }, [chaveAberta, ultimoIdAberta, acoes]);

  // Clique na notificação do sistema: abre a conversa.
  useEffect(
    () =>
      ponte().notificacoes.aoClicar((chave) => {
        const [tipo, id] = chave.split(':');
        if (tipo === 'c') acoes.abrirCanal(Number(id));
        else if (tipo === 'd') acoes.abrirDm(Number(id));
        setVista('canal');
      }),
    [acoes],
  );

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
  const enviarMensagem = (destino: Destino, texto: string, anexos: string[]) =>
    pedir((c) => c.pedir('mensagem:enviar', { destino, texto, anexos }), acoes.adicionarMensagem);
  /** RF-12a: abre a DM com alguém da lista de membros. */
  const conversarCom = (usuarioId: number) =>
    void pedir(
      (c) => c.pedir('dm:abrir', { usuarioId }),
      (dm) => {
        acoes.salvarDm(dm);
        acoes.abrirDm(dm.id);
        setVista('canal');
      },
    );
  const editarMensagem = (id: number, texto: string) => pedir((c) => c.pedir('mensagem:editar', { id, texto }), acoes.atualizarMensagem);
  const apagarMensagem = (id: number) => {
    const chave = (Object.entries(useLoja.getState().historicos) as [Chave, Historico | undefined][]).find(([, h]) =>
      h?.mensagens.some((m) => m.id === id),
    )?.[0];
    return pedir(
      (c) => c.pedir('mensagem:apagar', { id }),
      () => acoes.removerMensagem(id, chave ?? null),
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
            canalAtivo={vistaAtual === 'canal' && dmAtiva === null ? canalAtivo : null}
            dms={dms}
            usuarios={usuarios}
            dmAtiva={vistaAtual === 'canal' ? dmAtiva : null}
            naoLidas={naoLidas}
            aoAbrirDm={(id) => {
              acoes.abrirDm(id);
              setVista('canal');
            }}
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
                  <button type="button" className="secundario" onClick={() => setVista('sons')}>
                    Soundboard
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
          ) : vistaAtual === 'sons' ? (
            <TelaSons sons={sons} servidorUrl={servidorUrl} api={api} aoSalvar={acoes.salvarSom} aoRemover={acoes.tirarSom} aoVoltar={voltar} />
          ) : vistaAtual === 'convite' ? (
            <TelaConvite api={api} aoVoltar={voltar} />
          ) : vistaAtual === 'perfil' ? (
            <TelaPerfil usuario={usuario} servidorUrl={servidorUrl} api={api} aoAtualizar={acoes.atualizarUsuario} aoVoltar={voltar} />
          ) : dmAtiva !== null && dms.some((d) => d.id === dmAtiva) ? (
            <DmAberta
              key={`dm-${dmAtiva}`}
              dm={dms.find((d) => d.id === dmAtiva)!}
              outro={usuarios.find((u) => u.id === dms.find((d) => d.id === dmAtiva)!.outroId)}
              usuarios={usuarios}
              servidorUrl={servidorUrl}
              euId={usuario.id}
              api={api}
              aoEnviar={(dmId, texto, anexos) => enviarMensagem({ dmId }, texto, anexos)}
              aoEditarMensagem={editarMensagem}
              aoApagarMensagem={apagarMensagem}
              aoDigitar={(dmId) => conexaoRef.current?.avisarDigitando({ dmId })}
            />
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
              aoEnviar={(canalId, texto, anexos) => enviarMensagem({ canalId }, texto, anexos)}
              euId={usuario.id}
              aoEditarMensagem={editarMensagem}
              aoApagarMensagem={apagarMensagem}
              aoDigitar={(canalId) => conexaoRef.current?.avisarDigitando({ canalId })}
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
                {u.id !== usuario.id && (
                  <button type="button" className="icone conversar" aria-label={`Conversar com ${u.nomeExibicao}`} title="Mensagem direta" onClick={() => conversarCom(u.id)}>
                    ✉
                  </button>
                )}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
