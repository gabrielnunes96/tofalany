import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import {
  ATALHOS_PADRAO,
  AUDIO_PADRAO,
  DIGITANDO_DURACAO_MS,
  type AcaoAtalho,
  type Atalhos,
  type PreferenciasAudio,
  type PreferenciasPessoas,
  type PreferenciasSons,
  SONS_PADRAO,
  type Destino,
  type MensagemDto,
  type MotivoRevogacao,
  type TipoCanal,
  type UsuarioDto,
} from '@tofalando/shared';
import { useShallow } from 'zustand/react/shallow';
import { useLoja } from '../estado/loja';
import { conectarTempoReal, type ConexaoTempoReal } from '../servicos/tempo-real';
import { criarApi, ErroApiCliente } from '../servicos/api';
import { criarSalaVoz, EntradaCancelada, type SalaVoz } from '../servicos/voz';
import { criarSonsVoz, type SomVoz, type SonsVoz } from '../servicos/sons-voz';
import { ponte } from '../servicos/ponte';
import { TelaAuditoria, type PessoaFiltro } from './TelaAuditoria';
import { TelaPerfil } from './TelaPerfil';
import { TelaMembros } from './TelaMembros';
import { TelaConvite } from './TelaConvite';
import { TelaSons } from './TelaSons';
import { TelaConfiguracoes } from './TelaConfiguracoes';
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

/** Estado de voz enviado ao servidor (mute/deafen/câmera chegam nas T16 e T20). */
const estadoVoz = (canalVozId: number | null, sid?: string, c: { mudo: boolean; surdo: boolean } = { mudo: false, surdo: false }) => ({
  canalVozId,
  mudo: c.mudo || c.surdo,
  surdo: c.surdo,
  camera: false,
  sid,
});

type Vista = 'canal' | 'auditoria' | 'perfil' | 'membros' | 'convite' | 'sons' | 'configuracoes';

/** "c:1" → { canalId: 1 }; "d:2" → { dmId: 2 }. */
const destinoDe = (chave: Chave): Destino => {
  const id = Number(chave.slice(2));
  return chave.startsWith('c:') ? { canalId: id } : { dmId: id };
};

/** Tela logada: barra de canais, canal aberto (ou telas de perfil/administração) e membros. */
export function TelaPrincipal({ servidorUrl, token, usuarioInicial, aoSair, aoTrocarServidor, aoSessaoRevogada }: Props) {
  const { conexao, eu, usuarios, nomeServidor, canais, canalAtivo, linkConvite, dms, dmAtiva, naoLidas, sons, voz, falando } = useLoja(
    useShallow((s) => ({
      voz: s.voz,
      falando: s.falando,
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
      definirVoz: s.definirVoz,
      definirFalando: s.definirFalando,
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
  // RF-13: sala de voz (uma por vez) e o canal em que estou.
  const salaVozRef = useRef<SalaVoz | null>(null);
  const minhaVozRef = useRef<number | null>(null);
  const [minhaVoz, setMinhaVozEstado] = useState<number | null>(null);
  const [avisoVoz, setAvisoVoz] = useState<string | null>(null);
  const [entrandoVoz, setEntrandoVoz] = useState(false);
  /** Canal para onde estou entrando (trava contra clique duplo e permite cancelar se o canal sumir). */
  const entrandoRef = useRef<number | null>(null);
  // RN-14: preferências de áudio deste computador (RF-17, RF-18).
  const [audio, setAudio] = useState<PreferenciasAudio>(AUDIO_PADRAO);
  const audioRef = useRef<PreferenciasAudio>(AUDIO_PADRAO);
  const [atalhos, setAtalhos] = useState<Atalhos>(ATALHOS_PADRAO);
  // RF-19/RF-38: volume e silêncio de cada pessoa, deste servidor (RN-26); RF-21: sons de voz.
  const [pessoasVoz, setPessoasVoz] = useState<PreferenciasPessoas>({
    volumes: {},
    silenciados: [],
  });
  const pessoasRef = useRef(pessoasVoz);
  const [prefSons, setPrefSons] = useState<PreferenciasSons>(SONS_PADRAO);
  const sonsRef = useRef(prefSons);
  const sonsVozRef = useRef<SonsVoz | null>(null);
  const tocar = (som: SomVoz) => {
    // Com o áudio desligado (deafen), nada toca — nem os avisos.
    if (sonsRef.current.voz && !controlesRef.current.surdo) sonsVozRef.current?.tocar(som);
  };
  /** A pessoa já mexeu nos ajustes por pessoa: a leitura do disco (que chega depois) não desfaz. */
  const mexeuPessoasRef = useRef(false);
  useEffect(() => {
    let vivo = true;
    void ponte()
      .config.ler()
      .then((c) => {
        if (!vivo) return;
        const lido = c.audio ?? AUDIO_PADRAO;
        setAtalhos(c.atalhos ?? ATALHOS_PADRAO);
        const pessoas = c.pessoas?.[servidorUrl] ?? {
          volumes: {},
          silenciados: [],
        };
        if (!mexeuPessoasRef.current) {
          pessoasRef.current = pessoas;
          setPessoasVoz(pessoas);
          salaVozRef.current?.definirPessoas(pessoas);
        }
        sonsRef.current = c.sons ?? SONS_PADRAO;
        setPrefSons(sonsRef.current);
        sonsVozRef.current?.definirSaida(lido.saidaId);
        audioRef.current = lido;
        setAudio(lido);
        void salaVozRef.current?.aplicarAudio(lido);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [servidorUrl]);
  // Gravações adiadas (sliders mandam dezenas de mudanças): guardam o que gravar e para qual servidor.
  const pendente = useRef<{ pessoas?: { servidor: string; valor: PreferenciasPessoas }; audio?: PreferenciasAudio; relogio?: ReturnType<typeof setTimeout> }>(
    {},
  );
  const descarregar = () => {
    const p = pendente.current;
    clearTimeout(p.relogio);
    pendente.current = {};
    const parcial = { ...(p.pessoas ? { pessoas: { [p.pessoas.servidor]: p.pessoas.valor } } : {}), ...(p.audio ? { audio: p.audio } : {}) };
    if (Object.keys(parcial).length > 0)
      void ponte()
        .config.gravar(parcial)
        .catch(() => undefined);
  };
  const adiarGravacao = (parcial: { pessoas?: { servidor: string; valor: PreferenciasPessoas }; audio?: PreferenciasAudio }) => {
    clearTimeout(pendente.current.relogio);
    pendente.current = { ...pendente.current, ...parcial, relogio: setTimeout(descarregar, 400) };
  };
  // Fechar a janela não desmonta o React: grava o que estava esperando antes.
  useEffect(() => {
    window.addEventListener('beforeunload', descarregar);
    return () => {
      window.removeEventListener('beforeunload', descarregar);
      descarregar();
    };
    // descarregar só usa refs.
  }, []);
  function mudarPessoas(novo: PreferenciasPessoas) {
    mexeuPessoasRef.current = true;
    pessoasRef.current = novo;
    setPessoasVoz(novo);
    salaVozRef.current?.definirPessoas(novo);
    adiarGravacao({ pessoas: { servidor: servidorUrl, valor: novo } });
  }
  const volumePessoa = (id: number, volume: number) =>
    mudarPessoas({
      ...pessoasRef.current,
      volumes: { ...pessoasRef.current.volumes, [String(id)]: volume },
    });
  const silenciarPessoa = (id: number, sim: boolean) => {
    const atuais = pessoasRef.current.silenciados.filter((x) => x !== id);
    mudarPessoas({
      ...pessoasRef.current,
      silenciados: sim ? [...atuais, id] : atuais,
    });
  };
  function mudarSons(novo: PreferenciasSons) {
    sonsRef.current = novo;
    setPrefSons(novo);
    void ponte()
      .config.gravar({ sons: novo })
      .catch(() => undefined);
  }
  // RF-15/RF-16: mute e deafen (valem também fora da voz e são aplicados ao entrar) e atalhos globais.
  const [controles, setControlesEstado] = useState({
    mudo: false,
    surdo: false,
  });
  const controlesRef = useRef(controles);
  const [transmitindo, setTransmitindo] = useState(false);
  function definirControles(novo: { mudo: boolean; surdo: boolean }) {
    const antes = controlesRef.current;
    if (minhaVozRef.current !== null && (antes.mudo || antes.surdo) !== (novo.mudo || novo.surdo)) tocar(novo.mudo || novo.surdo ? 'mudo' : 'desmudo');
    controlesRef.current = novo;
    setControlesEstado(novo);
    salaVozRef.current?.controlar(novo);
    const canal = minhaVozRef.current;
    if (canal !== null) void conexaoRef.current?.pedir('voz:estado', estadoVoz(canal, salaVozRef.current?.sid(), novo));
  }
  const alternarMudo = () => {
    const c = controlesRef.current;
    // Desmutar durante o deafen desliga os dois (como o microfone volta, o áudio também).
    definirControles(c.surdo ? { mudo: false, surdo: false } : { ...c, mudo: !c.mudo });
  };
  const alternarSurdo = () => {
    const c = controlesRef.current;
    definirControles({ ...c, surdo: !c.surdo });
  };
  const aoAtalho = useEffectEvent(({ acao, pressionado }: { acao: AcaoAtalho; pressionado: boolean }) => {
    if (acao === 'ptt') salaVozRef.current?.controlar({ ptt: pressionado });
    else if (pressionado && acao === 'mudo') alternarMudo();
    else if (pressionado && acao === 'surdo') alternarSurdo();
  });
  useEffect(() => ponte().atalhos.aoEvento((e) => aoAtalho(e)), []);
  const pausarAtalhos = (sim: boolean) =>
    void ponte()
      .atalhos.pausar(sim)
      .catch(() => undefined);
  function mudarAtalhos(novos: Atalhos) {
    setAtalhos(novos);
    void ponte()
      .config.gravar({ atalhos: novos })
      .then((c) => setAtalhos(c.atalhos))
      .catch(() => undefined);
  }

  function mudarAudio(novo: PreferenciasAudio) {
    audioRef.current = novo;
    setAudio(novo);
    // Arrastar o slider gera dezenas de mudanças: grava no disco só quando para.
    adiarGravacao({ audio: novo });
    sonsVozRef.current?.definirSaida(novo.saidaId);
    return salaVozRef.current?.aplicarAudio(novo).catch(() => undefined);
  }
  const setMinhaVoz = (id: number | null) => {
    minhaVozRef.current = id;
    setMinhaVozEstado(id);
  };

  useEffect(() => {
    const sala = criarSalaVoz({
      aoFalando: acoes.definirFalando,
      aoCaiu: () => {
        if (minhaVozRef.current !== null) tocar('sair');
        minhaVozRef.current = null;
        setMinhaVozEstado(null);
        setAvisoVoz('Você saiu da voz: a conexão de mídia caiu ou você entrou em outro computador.');
        void conexaoRef.current?.pedir('voz:estado', estadoVoz(null));
      },
      aoAviso: setAvisoVoz,
      aoTransmitindo: setTransmitindo,
    });
    salaVozRef.current = sala;
    sala.definirPessoas(pessoasRef.current);
    const sonsVoz = criarSonsVoz();
    sonsVoz.definirSaida(audioRef.current.saidaId);
    sonsVozRef.current = sonsVoz;
    return () => {
      salaVozRef.current = null;
      minhaVozRef.current = null;
      sonsVozRef.current = null;
      sonsVoz.fechar();
      void sala.destruir();
    };
  }, [acoes]);

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
      aoOla: (ola) => {
        acoes.aplicarOla(ola);
        // Reconectou com a voz ligada: a presença volta para todos.
        const canal = minhaVozRef.current;
        if (canal === null) return;
        void conexaoRef.current?.pedir('voz:estado', estadoVoz(canal, salaVozRef.current?.sid(), controlesRef.current)).then((r) => {
          // O canal sumiu durante a queda (ou o servidor recusou): sai da mídia também.
          if (r.ok || minhaVozRef.current !== canal) return;
          minhaVozRef.current = null;
          setMinhaVozEstado(null);
          setAvisoVoz(r.erro);
          void salaVozRef.current?.sair();
        });
      },
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
      aoCanalRemovido: (id) => {
        acoes.removerCanal(id);
        if (entrandoRef.current === id) void salaVozRef.current?.sair();
        if (minhaVozRef.current === id) {
          minhaVozRef.current = null;
          setMinhaVozEstado(null);
          setAvisoVoz('O canal de voz foi removido.');
          void salaVozRef.current?.sair();
        }
      },
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
      aoVozEstados: (estados) => {
        // RF-21: alguém entrou ou saiu do canal em que estou.
        const meu = minhaVozRef.current;
        const euId = useLoja.getState().eu?.id;
        if (meu !== null) {
          const ali = (lista: typeof estados) => new Set(lista.filter((e) => e.canalVozId === meu && e.usuarioId !== euId).map((e) => e.usuarioId));
          const antes = ali(useLoja.getState().voz);
          const agora = ali(estados);
          if ([...agora].some((id) => !antes.has(id))) tocar('entrar');
          else if ([...antes].some((id) => !agora.has(id))) tocar('sair');
        }
        acoes.definirVoz(estados);
      },
      aoVozTirado: () => {
        if (minhaVozRef.current !== null) tocar('sair');
        minhaVozRef.current = null;
        setMinhaVozEstado(null);
        setAvisoVoz('Você entrou na voz por outro computador; aqui a voz foi desligada.');
        void salaVozRef.current?.sair();
      },
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
  const chaveAberta: Chave | null = vistaAtual !== 'canal' ? null : dmAtiva !== null ? chaveDm(dmAtiva) : canalAtivo !== null ? chaveCanal(canalAtivo) : null;
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
  const removerCanal = (id: number) =>
    pedir(
      (c) => c.pedir('canal:remover', { id }),
      () => acoes.removerCanal(id),
    );

  function abrirAuditoria() {
    setPessoasAuditoria(usuarios.map((u) => ({ id: u.id, nome: u.nomeExibicao })));
    setVista('auditoria');
    // Inclui contas removidas que ainda têm registros no prazo; se falhar, fica a lista dos ativos.
    api
      .usuariosAdmin()
      .then((todos) =>
        setPessoasAuditoria(
          todos.map((u) => ({
            id: u.id,
            nome: u.nomeExibicao,
            removido: u.removido,
          })),
        ),
      )
      .catch(() => undefined);
  }

  const voltar = () => setVista('canal');

  /** RF-13: entra no canal de voz (sai do anterior, se houver). */
  async function entrarVoz(canalId: number) {
    const sala = salaVozRef.current;
    if (!sala || entrandoRef.current !== null) return;
    entrandoRef.current = canalId;
    setAvisoVoz(null);
    setEntrandoVoz(true);
    const tinhaVoz = minhaVozRef.current !== null;
    try {
      if (tinhaVoz) {
        setMinhaVoz(null);
        await sala.sair();
      }
      const { url, token: tokenVoz } = await api.tokenVoz(canalId);
      sala.controlar({ ...controlesRef.current, ptt: false });
      await sala.entrar(url, tokenVoz, audioRef.current);
      const enviados = controlesRef.current;
      const r = await conexaoRef.current?.pedir('voz:estado', estadoVoz(canalId, sala.sid(), enviados));
      if (!r || !r.ok) {
        // Servidor recusou (ex.: canal removido nesse meio-tempo): não fica na mídia sem aparecer.
        await sala.sair();
        setAvisoVoz(r?.erro ?? 'Sem conexão com o servidor.');
        if (tinhaVoz) await conexaoRef.current?.pedir('voz:estado', estadoVoz(null));
        return;
      }
      setMinhaVoz(canalId);
      tocar('entrar');
      // Mute/deafen trocados enquanto esperava a resposta: manda o estado atual.
      if (controlesRef.current !== enviados) void conexaoRef.current?.pedir('voz:estado', estadoVoz(canalId, sala.sid(), controlesRef.current));
    } catch (e) {
      setMinhaVoz(null);
      if (!(e instanceof EntradaCancelada)) {
        setAvisoVoz(e instanceof ErroApiCliente ? e.message : 'Não foi possível conectar à voz. Confira se o servidor de mídia está no ar.');
      }
      // Saiu do canal anterior e não entrou no novo: a presença antiga não pode ficar.
      if (tinhaVoz) await conexaoRef.current?.pedir('voz:estado', estadoVoz(null));
    } finally {
      entrandoRef.current = null;
      setEntrandoVoz(false);
    }
  }

  async function sairVoz() {
    if (minhaVozRef.current !== null) tocar('sair');
    setMinhaVoz(null);
    await salaVozRef.current?.sair();
    await conexaoRef.current?.pedir('voz:estado', estadoVoz(null));
  }

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
            voz={voz}
            falando={falando}
            minhaVoz={minhaVoz}
            servidorUrl={servidorUrl}
            aoEntrarVoz={(id) => void entrarVoz(id)}
            euId={usuario.id}
            pessoasVoz={pessoasVoz}
            aoVolumePessoa={volumePessoa}
            aoSilenciarPessoa={silenciarPessoa}
          />
          {(minhaVoz !== null || entrandoVoz || avisoVoz) && (
            <section className="painel-voz" aria-label="Conexão de voz">
              <p className="estado" role="status">
                {entrandoVoz ? (
                  'Conectando à voz…'
                ) : minhaVoz !== null ? (
                  <>
                    <strong>Voz conectada</strong>
                    {canais.find((c) => c.id === minhaVoz)?.nome}
                  </>
                ) : (
                  avisoVoz
                )}
              </p>
              {minhaVoz !== null && !entrandoVoz && (
                <>
                  <span
                    className={`transmitindo${transmitindo && !controles.mudo && !controles.surdo ? ' ativo' : ''}`}
                    role="img"
                    aria-label={transmitindo ? 'Transmitindo' : 'Microfone em silêncio'}
                    title={transmitindo ? 'Transmitindo' : 'Em silêncio'}
                  />
                  <button
                    type="button"
                    className={`icone controle${controles.mudo || controles.surdo ? ' desligado' : ''}`}
                    aria-pressed={controles.mudo || controles.surdo}
                    aria-label="Mutar microfone"
                    title="Mutar microfone (mute)"
                    onClick={alternarMudo}
                  >
                    🎙️
                  </button>
                  <button
                    type="button"
                    className={`icone controle${controles.surdo ? ' desligado' : ''}`}
                    aria-pressed={controles.surdo}
                    aria-label="Desligar áudio"
                    title="Desligar áudio (deafen)"
                    onClick={alternarSurdo}
                  >
                    🎧
                  </button>
                  <button type="button" className="perigo" onClick={() => void sairVoz()}>
                    Sair da voz
                  </button>
                </>
              )}
              {minhaVoz === null && !entrandoVoz && avisoVoz && (
                <button type="button" className="secundario" aria-label="Fechar aviso da voz" onClick={() => setAvisoVoz(null)}>
                  ×
                </button>
              )}
            </section>
          )}
          {minhaVoz !== null && avisoVoz && (
            <p className="aviso-ok" role="alert">
              {avisoVoz}
            </p>
          )}
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
              <button type="button" className="secundario" onClick={() => setVista('configuracoes')}>
                Configurações
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
          ) : vistaAtual === 'configuracoes' ? (
            <TelaConfiguracoes
              audio={audio}
              aoMudarAudio={mudarAudio}
              microfoneDaChamada={() => salaVozRef.current?.microfone()}
              atalhos={atalhos}
              aoMudarAtalhos={mudarAtalhos}
              aoCapturar={pausarAtalhos}
              sons={prefSons}
              aoMudarSons={mudarSons}
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
                  <button
                    type="button"
                    className="icone conversar"
                    aria-label={`Conversar com ${u.nomeExibicao}`}
                    title="Mensagem direta"
                    onClick={() => conversarCom(u.id)}
                  >
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
