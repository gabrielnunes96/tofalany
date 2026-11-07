import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { SOM_INTERVALO_MS, ATALHOS_PADRAO, AUDIO_PADRAO, DIGITANDO_DURACAO_MS, type AcaoAtalho, type StatusPessoa, type StatusVisivel, type EscolhaStatus, type Tema, type PartesOcultas, type Atalhos, type PreferenciasAudio, type PreferenciasPessoas, type PreferenciasSons, type PreferenciasNotificacoes, type PreferenciasTela, type QualidadeTela, TELA_PADRAO, qualidadesPermitidas, NOTIFICACOES_PADRAO, SONS_PADRAO, type Destino, type MensagemDto, type MotivoRevogacao, type TipoCanal, type UsuarioDto, permissoesDe, type Permissao, type AcaoFechar, acaoAoFechar, lerComandoMusica, type ComandoMusica } from '@tofalando/shared';
import { useShallow } from 'zustand/react/shallow';
import { useLoja } from '../estado/loja';
import { conectarTempoReal, type ConexaoTempoReal } from '../servicos/tempo-real';
import { criarApi, ErroApiCliente } from '../servicos/api';
// A sala de voz (livekit-client, WebRTC) só carrega na primeira entrada na voz (R-7: memória ociosa).
import type { SalaVoz, VideoSala } from '../servicos/voz';
import { criarSonsVoz, type SomVoz, type SonsVoz } from '../servicos/sons-voz';
import { criarTocadorSoundboard, type TocadorSoundboard } from '../servicos/soundboard';
import { PainelSoundboard } from '../componentes/PainelSoundboard';
import { GradeVideos } from '../componentes/GradeVideos';
import { SeletorTela, type FonteTela } from '../componentes/SeletorTela';
import { PainelTransmissao } from '../componentes/PainelTransmissao';
import { PainelMusica } from '../componentes/PainelMusica';
import { Icone } from '../componentes/Icone';
import { SeletorStatus } from '../componentes/SeletorStatus';
import { alternarTelaCheia, useEmTelaCheia } from '../componentes/telaCheia';
import { ponte } from '../servicos/ponte';
import { TelaAuditoria, type PessoaFiltro } from './TelaAuditoria';
import { TelaPerfil } from './TelaPerfil';
import { TelaMembros } from './TelaMembros';
import { TelaConvite } from './TelaConvite';
import { TelaSons } from './TelaSons';
import { TelaConfiguracoes } from './TelaConfiguracoes';
import { Avatar } from '../componentes/Avatar';
import { StatusPonto, TEXTO_STATUS } from '../componentes/StatusPonto';
import { ContextoPrevia, criarBuscaPrevia } from '../componentes/Previa';
import { BarraLateral, type AbaBarra } from '../componentes/BarraLateral';
import { CanalAberto } from '../componentes/CanalAberto';
import { DmAberta } from '../componentes/DmAberta';
import { chaveCanal, chaveDm, type Chave, type Historico } from '../estado/loja';
import { decidirAvisoPresenca, decidirMensagemNova } from '../estado/notificar';

interface Props {
  /** Backlog v2, item 7: o nome do servidor chegou (vai para a coluna de servidores). */
  aoNomeServidor?: (nome: string) => void;
  servidorUrl: string;
  token: string;
  /** Usuário de /api/eu, mostrado até o retrato do tempo real chegar. */
  usuarioInicial: UsuarioDto;
  aoSair: () => void;
  aoTrocarServidor: () => void;
  aoSessaoRevogada: (motivo: MotivoRevogacao) => void;
}

/** Estado de voz enviado ao servidor (mute/deafen/câmera chegam nas T16 e T20). */
const estadoVoz = (canalVozId: number | null, sid?: string, c: { mudo: boolean; surdo: boolean; camera?: boolean } = { mudo: false, surdo: false }) => ({
  canalVozId,
  mudo: c.mudo || c.surdo,
  surdo: c.surdo,
  camera: !!c.camera,
  sid,
});

/** O que espera para ser gravado no disco (sliders mandam dezenas de mudanças). */
interface GravacaoAdiada {
  pessoas?: { servidor: string; valor: PreferenciasPessoas };
  audio?: PreferenciasAudio;
  sons?: PreferenciasSons;
}

type Vista = 'canal' | 'auditoria' | 'perfil' | 'membros' | 'convite' | 'sons' | 'configuracoes';

/** "c:1" → { canalId: 1 }; "d:2" → { dmId: 2 }. */
const destinoDe = (chave: Chave): Destino => {
  const id = Number(chave.slice(2));
  return chave.startsWith('c:') ? { canalId: id } : { dmId: id };
};

/** Tela logada: barra de canais, canal aberto (ou telas de perfil/administração) e membros. */
export function TelaPrincipal({ servidorUrl, token, usuarioInicial, aoSair, aoTrocarServidor, aoSessaoRevogada, aoNomeServidor }: Props) {
  const { conexao, eu, usuarios, funcoes, nomeServidor, canais, canalAtivo, linkConvite, dms, dmAtiva, naoLidas, sons, voz, falando, presencas, transmissoes, musica } = useLoja(
    useShallow((s) => ({
      voz: s.voz,
      falando: s.falando,
      transmissoes: s.transmissoes,
      musica: s.musica,
      presencas: s.presencas,
      naoLidas: s.naoLidas,
      sons: s.sons,
      dms: s.dms,
      dmAtiva: s.dmAtiva,
      conexao: s.conexao,
      eu: s.eu,
      usuarios: s.usuarios,
      funcoes: s.funcoes,
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
      definirFuncoes: s.definirFuncoes,
      zerarNaoLidas: s.zerarNaoLidas,
      aplicarLeitura: s.aplicarLeitura,
      descontarApagada: s.descontarApagada,
      definirSons: s.definirSons,
      definirVoz: s.definirVoz,
      iniciarTransmissao: s.iniciarTransmissao,
      pararTransmissao: s.pararTransmissao,
      definirMusica: s.definirMusica,
      definirPresenca: s.definirPresenca,
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
  /** RF-31: a mídia da voz caiu e está voltando. */
  const [reconectandoVoz, setReconectandoVoz] = useState(false);
  /** Canal para onde estou entrando (trava contra clique duplo e permite cancelar se o canal sumir). */
  const entrandoRef = useRef<number | null>(null);
  // RN-14: preferências de áudio deste computador (RF-17, RF-18).
  const [audio, setAudio] = useState<PreferenciasAudio>(AUDIO_PADRAO);
  const audioRef = useRef<PreferenciasAudio>(AUDIO_PADRAO);
  const [atalhos, setAtalhos] = useState<Atalhos>(ATALHOS_PADRAO);
  // RF-28/R-3: qualidade padrão e codec deste computador; qualidade da transmissão em curso (para retomar a trava).
  const [telaPrefs, setTelaPrefs] = useState<PreferenciasTela>(TELA_PADRAO);
  const telaRef = useRef(telaPrefs);
  const qualidadeAtualRef = useRef<QualidadeTela>('720p30');
  function mudarTela(novo: PreferenciasTela) {
    telaRef.current = novo;
    setTelaPrefs(novo);
    void ponte()
      .config.gravar({ tela: novo })
      .catch(() => undefined);
  }
  // Backlog v2, item 10: esconder canais, membros e câmeras (Ctrl+B e Ctrl+M; guardado no computador).
  const [ocultos, setOcultos] = useState<PartesOcultas>({ canais: false, membros: false, cameras: false });
  const alternarParte = useCallback((parte: keyof PartesOcultas) => {
    setOcultos((atual) => {
      const novo = { ...atual, [parte]: !atual[parte] };
      void ponte()
        .config.gravar({ ocultos: novo })
        .catch(() => undefined);
      return novo;
    });
  }, []);
  useEffect(() => {
    const tecla = (e: globalThis.KeyboardEvent) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b') alternarParte('canais');
      else if (k === 'm') alternarParte('membros');
      else return;
      e.preventDefault();
    };
    document.addEventListener('keydown', tecla);
    return () => document.removeEventListener('keydown', tecla);
  }, [alternarParte]);
  // Barra lateral: canais ou conversas diretas (abrir uma DM, por notificação ou pelo envelope, troca para Diretas).
  const [abaBarra, setAbaBarra] = useState<AbaBarra>('canais');
  // Ping até o servidor de voz, atualizado a cada 2 s enquanto estou num canal.
  const [ping, setPing] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (minhaVoz === null) return;
    const medir = () => setPing(salaVozRef.current?.latencia());
    const relogio = setInterval(medir, 2000);
    return () => {
      clearInterval(relogio);
      setPing(undefined);
    };
  }, [minhaVoz]);
  // Backlog v2, item 12: prévia da minha transmissão (a faixa local; não gasta banda).
  const [previaMinhaTela, setPreviaMinhaTela] = useState<MediaStreamTrack | undefined>(undefined);
  const [verPrevia, setVerPrevia] = useState(true);
  // Backlog v2, item 8: menu do usuário (fecha ao clicar fora ou com Esc).
  const [menuAberto, setMenuAberto] = useState(false);
  useEffect(() => {
    if (!menuAberto) return;
    const fechar = () => setMenuAberto(false);
    const tecla = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && setMenuAberto(false);
    document.addEventListener('click', fechar);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('click', fechar);
      document.removeEventListener('keydown', tecla);
    };
  }, [menuAberto]);
  // Backlog v2, item 9: tema (aplicado no <html>; main.tsx já aplica o guardado ao abrir).
  const [tema, setTema] = useState<Tema>((document.documentElement.dataset.tema as Tema | undefined) ?? 'neon');
  function mudarTema(novo: Tema) {
    setTema(novo);
    document.documentElement.dataset.tema = novo;
    void ponte()
      .config.gravar({ tema: novo })
      .catch(() => undefined);
  }
  // Backlog v2, item 2: status escolhido neste servidor (guardado no computador; o servidor recebe ao conectar).
  const [escolhaStatus, setEscolhaStatus] = useState<EscolhaStatus>('auto');
  const escolhaRef = useRef<EscolhaStatus>('auto');
  function mudarStatus(novo: EscolhaStatus) {
    escolhaRef.current = novo;
    setEscolhaStatus(novo);
    conexaoRef.current?.escolherStatus(novo);
    void ponte()
      .config.ler()
      .then((c) => ponte().config.gravar({ statusEscolhido: { ...(c.statusEscolhido ?? {}), [servidorUrl]: novo } }))
      .catch(() => undefined);
  }
  // Backlog v2, 1e: o que fazer ao fechar a janela (padrão: perguntar).
  const [aoFechar, setAoFechar] = useState<AcaoFechar>('perguntar');
  function mudarAoFechar(acao: AcaoFechar) {
    setAoFechar(acao);
    void ponte()
      .config.gravar({ aoFechar: acao })
      .catch(() => undefined);
  }
  // RF-39 a RF-41: notificações deste computador (declaradas antes da leitura do disco, que as preenche).
  const [notif, setNotif] = useState<PreferenciasNotificacoes>(NOTIFICACOES_PADRAO);
  const notifRef = useRef(notif);
  const nomeServidorRef = useRef(nomeServidor);
  useEffect(() => {
    nomeServidorRef.current = nomeServidor;
  }, [nomeServidor]);
  /** Quando chegou o último retrato (ola): logo depois, mudanças de presença não são novidade. */
  const olaEmRef = useRef(0);
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
        notifRef.current = c.notificacoes ?? NOTIFICACOES_PADRAO;
        telaRef.current = c.tela ?? TELA_PADRAO;
        setAoFechar(acaoAoFechar(c));
        if (c.tema) setTema(c.tema);
        if (c.ocultos) setOcultos(c.ocultos);
        const escolhida = c.statusEscolhido?.[servidorUrl];
        if (escolhida && escolhaRef.current === 'auto') {
          escolhaRef.current = escolhida;
          setEscolhaStatus(escolhida);
          conexaoRef.current?.escolherStatus(escolhida);
        }
        setTelaPrefs(telaRef.current);
        setNotif(notifRef.current);
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
  const pendente = useRef<GravacaoAdiada & { relogio?: ReturnType<typeof setTimeout> }>({});
  const descarregar = () => {
    const p = pendente.current;
    clearTimeout(p.relogio);
    pendente.current = {};
    const parcial = {
      ...(p.pessoas ? { pessoas: { [p.pessoas.servidor]: p.pessoas.valor } } : {}),
      ...(p.audio ? { audio: p.audio } : {}),
      ...(p.sons ? { sons: p.sons } : {}),
    };
    if (Object.keys(parcial).length > 0)
      void ponte()
        .config.gravar(parcial)
        .catch(() => undefined);
  };
  const adiarGravacao = (parcial: GravacaoAdiada) => {
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
  // RF-39 a RF-41: notificações deste computador.
  function mudarNotificacoes(novo: PreferenciasNotificacoes) {
    notifRef.current = novo;
    setNotif(novo);
    void ponte()
      .config.gravar({ notificacoes: { ...novo, silenciadas: { [servidorUrl]: novo.silenciadas[servidorUrl] ?? [] } } })
      .catch(() => undefined);
  }
  const silenciadasAqui = notif.silenciadas[servidorUrl] ?? [];
  const silenciarConversa = (chave: string, sim: boolean) => {
    const atuais = (notifRef.current.silenciadas[servidorUrl] ?? []).filter((c) => c !== chave);
    mudarNotificacoes({ ...notifRef.current, silenciadas: { ...notifRef.current.silenciadas, [servidorUrl]: sim ? [...atuais, chave] : atuais } });
  };
  const avisarEntradaSaida = (id: number, antes: StatusVisivel | undefined, status: StatusPessoa) => {
    const nome = useLoja.getState().usuarios.find((u) => u.id === id)?.nomeExibicao;
    if (!nome) return;
    const d = decidirAvisoPresenca(antes, status, {
      id,
      euId: useLoja.getState().eu?.id,
      calado: Date.now() - olaEmRef.current < 5000 || useLoja.getState().conexao !== 'conectado',
      som: notifRef.current.entradaSaidaSom && escolhaRef.current !== 'naoIncomodar',
      aviso: notifRef.current.entradaSaidaAviso && escolhaRef.current !== 'naoIncomodar',
      surdo: controlesRef.current.surdo,
    });
    if (!d) return;
    const entrou = d.tipo === 'entrou';
    if (d.som) sonsVozRef.current?.tocar(entrou ? 'servidor-entrou' : 'servidor-saiu');
    if (d.aviso) {
      void ponte()
        .notificacoes.mostrar({
          titulo: nomeServidorRef.current ?? 'ToFalany',
          corpo: `${nome} ${entrou ? 'entrou' : 'saiu'}`,
          chave: `u:${id}`,
          conversaAberta: false,
          // Com o som de entrada/saída desligado, a notificação não toca o som do sistema.
          silencioso: !notifRef.current.entradaSaidaSom,
        })
        .catch(() => undefined);
    }
  };
  function mudarSons(novo: PreferenciasSons) {
    sonsRef.current = novo;
    setPrefSons(novo);
    adiarGravacao({ sons: novo });
  }
  // RF-23: soundboard — tocador local com cache, painel e aviso de quem tocou.
  const tocadorRef = useRef<TocadorSoundboard | null>(null);
  const [soundboardAberto, setSoundboardAberto] = useState(false);
  // Aviso "X tocou Y": o número faz o mesmo texto repetido reiniciar o tempo e ser anunciado de novo.
  const [avisoSom, setAvisoSom] = useState<{ texto: string; n: number } | null>(null);
  /** RN-13: quando posso tocar de novo (vale mesmo fechando o painel). */
  const [liberadoEm, setLiberadoEm] = useState(0);
  useEffect(() => {
    const tocador = criarTocadorSoundboard(servidorUrl);
    tocador.definirSaida(audioRef.current.saidaId);
    tocadorRef.current = tocador;
    return () => {
      tocadorRef.current = null;
      tocador.fechar();
    };
  }, [servidorUrl]);
  useEffect(() => {
    if (!avisoSom) return;
    const t = setTimeout(() => setAvisoSom(null), 4000);
    return () => clearTimeout(t);
  }, [avisoSom]);
  const pararSoundboard = () => tocadorRef.current?.parar();
  // RN-25: ocioso há 10 min (avisado pelo processo principal) → ausente para todos.
  const ausenteRef = useRef(false);
  useEffect(() => {
    const avisar = (ausente: boolean) => {
      ausenteRef.current = ausente;
      conexaoRef.current?.avisarAusente(ausente);
    };
    void ponte()
      .presenca.ausente()
      .then((a) => a && avisar(true))
      .catch(() => undefined);
    return ponte().presenca.aoMudar(avisar);
  }, []);
  // RF-15/RF-16: mute e deafen (valem também fora da voz e são aplicados ao entrar) e atalhos globais.
  const [controles, setControlesEstado] = useState({
    mudo: false,
    surdo: false,
    camera: false,
  });
  const controlesRef = useRef(controles);
  const [transmitindo, setTransmitindo] = useState(false);
  // RF-26/RF-30: transmissão de tela — seletor, telas dos outros chegando.
  const [seletorTela, setSeletorTela] = useState(false);
  const [iniciandoTela, setIniciandoTela] = useState(false);
  const iniciandoTelaRef = useRef(false);
  const botaoTelaRef = useRef<HTMLButtonElement>(null);
  /** Fecha o seletor e devolve o foco ao botão que o abriu. */
  const fecharSeletorTela = () => {
    setSeletorTela(false);
    setTimeout(() => botaoTelaRef.current?.focus(), 0);
  };
  const [telasRemotas, setTelasRemotas] = useState<VideoSala[]>([]);
  // RF-25: vídeos das câmeras na sala.
  const [videos, setVideos] = useState<VideoSala[]>([]);
  const cameraPendente = useRef(false);
  async function alternarCamera() {
    // Enquanto a câmera abre (permissão, dispositivo), outro clique não faz nada.
    if (cameraPendente.current) return;
    cameraPendente.current = true;
    try {
      const ligar = !controlesRef.current.camera;
      const ligada = (await salaVozRef.current?.camera(ligar)) ?? false;
      definirControles({ ...controlesRef.current, camera: ligada });
    } finally {
      cameraPendente.current = false;
    }
  }
  /** A sala sempre esvazia os vídeos ao sair (queda, tirado, canal removido, troca): sem o meu, a câmera está desligada. */
  const aoVideos = (lista: VideoSala[]) => {
    setVideos(lista);
    if (!lista.some((v) => v.meu) && controlesRef.current.camera) {
      controlesRef.current = { ...controlesRef.current, camera: false };
      setControlesEstado(controlesRef.current);
    }
  };
  function definirControles(novo: { mudo: boolean; surdo: boolean; camera: boolean }) {
    const antes = controlesRef.current;
    if (minhaVozRef.current !== null && (antes.mudo || antes.surdo) !== (novo.mudo || novo.surdo)) tocar(novo.mudo || novo.surdo ? 'mudo' : 'desmudo');
    controlesRef.current = novo;
    setControlesEstado(novo);
    // Deafen corta também o som do soundboard que estiver tocando.
    if (novo.surdo) pararSoundboard();
    salaVozRef.current?.controlar({ mudo: novo.mudo, surdo: novo.surdo });
    const canal = minhaVozRef.current;
    if (canal !== null) void conexaoRef.current?.pedir('voz:estado', estadoVoz(canal, salaVozRef.current?.sid(), novo));
  }
  const alternarMudo = () => {
    const c = controlesRef.current;
    // Desmutar durante o deafen desliga os dois (como o microfone volta, o áudio também).
    definirControles(c.surdo ? { ...c, mudo: false, surdo: false } : { ...c, mudo: !c.mudo });
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
    tocadorRef.current?.definirSaida(novo.saidaId);
    return salaVozRef.current?.aplicarAudio(novo).catch(() => undefined);
  }
  const setMinhaVoz = (id: number | null) => {
    minhaVozRef.current = id;
    setMinhaVozEstado(id);
  };

  const criandoSalaRef = useRef<Promise<SalaVoz | null> | null>(null);
  const montadoRef = useRef(true);
  /** Cria a sala na primeira vez que for preciso (carrega o módulo de voz sob demanda). */
  function obterSala(): Promise<SalaVoz | null> {
    if (salaVozRef.current) return Promise.resolve(salaVozRef.current);
    criandoSalaRef.current ??= import('../servicos/voz').then(({ criarSalaVoz }) => {
      if (!montadoRef.current) return null;
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
        aoVideos: (lista) => aoVideos(lista),
        aoTelas: setTelasRemotas,
        aoReconectando: (r) => {
          setReconectandoVoz(r);
          // Reconexão completa troca a sessão de mídia (sid): o servidor precisa da nova para reconhecer a saída certa.
          const canal = minhaVozRef.current;
          if (!r && canal !== null) void conexaoRef.current?.pedir('voz:estado', estadoVoz(canal, salaVozRef.current?.sid(), controlesRef.current));
        },
        aoMinhaTelaParou: () => {
          const canal = minhaVozRef.current;
          if (canal !== null) void conexaoRef.current?.pedir('tela:parar', { canalVozId: canal });
        },
      });
      sala.definirPessoas(pessoasRef.current);
      sala.controlar({ mudo: controlesRef.current.mudo, surdo: controlesRef.current.surdo });
      salaVozRef.current = sala;
      return sala;
    });
    return criandoSalaRef.current;
  }

  useEffect(() => {
    montadoRef.current = true;
    const sonsVoz = criarSonsVoz();
    sonsVoz.definirSaida(audioRef.current.saidaId);
    sonsVozRef.current = sonsVoz;
    return () => {
      montadoRef.current = false;
      const sala = salaVozRef.current;
      salaVozRef.current = null;
      criandoSalaRef.current = null;
      minhaVozRef.current = null;
      sonsVozRef.current = null;
      sonsVoz.fechar();
      void sala?.destruir();
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
        notificar: notifRef.current.mensagens,
        silenciadas: notifRef.current.silenciadas[servidorUrl] ?? [],
        naoIncomodar: escolhaRef.current === 'naoIncomodar',
      });
      if (!d) return;
      if (d.acao === 'lido') conexaoRef.current?.avisarLido(destinoDe(d.chave), m.id);
      else acoes.contarNaoLida(d.chave, m.id);
      if (d.notificacao)
        void ponte()
          .notificacoes.mostrar(d.notificacao)
          .catch(() => undefined);
    }

    const conexao = conectarTempoReal(servidorUrl, token, {
      aoEstado: acoes.definirConexao,
      aoOla: (ola) => {
        olaEmRef.current = Date.now();
        acoes.aplicarOla(ola);
        // Reconectou com a voz ligada: a presença volta para todos.
        const canal = minhaVozRef.current;
        if (canal === null) return;
        void conexaoRef.current?.pedir('voz:estado', estadoVoz(canal, salaVozRef.current?.sid(), controlesRef.current)).then((r) => {
          // RN-10: a trava acompanha a transmissão de verdade — retoma se ainda transmito; libera se não.
          if (r.ok && minhaVozRef.current === canal) {
            const transmitindo = salaVozRef.current?.transmitindoTela() ?? false;
            const travaMinha = ola.transmissoes?.some((x) => x.canalVozId === canal && x.usuarioId === ola.eu.id);
            if (transmitindo)
              void conexaoRef.current?.pedir('tela:pedir', { canalVozId: canal, qualidade: qualidadeAtualRef.current }).then((t) => {
                if (!t.ok) void salaVozRef.current?.pararTela();
              });
            else if (travaMinha) void conexaoRef.current?.pedir('tela:parar', { canalVozId: canal });
          }
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
        // Perdeu a permissão: as telas de administração somem sozinhas (podeVer).
        if (u.id === useLoja.getState().eu?.id) {
          const alta = permissoesDe(u, useLoja.getState().funcoes).has('transmitir_alta');
          // RN-17: transmitindo acima de 720p30 sem permissão — para (o servidor também libera).
          if (salaVozRef.current?.transmitindoTela() && !qualidadesPermitidas(u.cargo, alta).includes(qualidadeAtualRef.current)) {
            void salaVozRef.current.pararTela();
            setAvisoVoz('Sua transmissão parou: acima de 720p30 só administradores transmitem.');
          }
        }
      },
      aoUsuarioRemovido: acoes.removerUsuario,
      aoFuncoes: acoes.definirFuncoes,
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
      aoSonsAtualizados: (lista) => {
        acoes.definirSons(lista);
        tocadorRef.current?.esquecer(lista);
      },
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
      aoTelaIniciada: acoes.iniciarTransmissao,
      aoTelaParada: acoes.pararTransmissao,
      aoMusica: acoes.definirMusica,
      aoPresenca: (id, status) => {
        // RF-41: alguém entrou ou saiu do servidor.
        avisarEntradaSaida(id, useLoja.getState().presencas[id], status);
        acoes.definirPresenca(id, status);
      },
      aoSomTocado: ({ somId, porUsuarioId, canalVozId }) => {
        const estado = useLoja.getState();
        const som = estado.sons.find((x) => x.id === somId);
        if (!som) return;
        const quem = estado.usuarios.find((u) => u.id === porUsuarioId)?.nomeExibicao ?? 'Alguém';
        // Chegou depois de eu sair (ou trocar) de canal: ignora.
        if (minhaVozRef.current !== canalVozId) return;
        setAvisoSom((a) => ({ texto: `${quem} tocou ${som.nome}`, n: (a?.n ?? 0) + 1 }));
        // Deafen não ouve (RN-12); volume 0 não ouve (RF-24).
        if (controlesRef.current.surdo) return;
        void tocadorRef.current?.tocar(som, sonsRef.current.soundboard).then((tocou) => {
          // Marca para os testes de ponta a ponta (e para depurar) que o som saiu de fato.
          if (tocou) document.documentElement.dataset.somSoundboard = `${somId}:${Date.now()}`;
        });
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
    conexao.escolherStatus(escolhaRef.current);
    return () => {
      conexaoRef.current = null;
      conexao.desconectar();
      acoes.limpar();
    };
  }, [servidorUrl, token, acoes, aoSessaoRevogada]);

  // Backlog v2, item 7: o nome do servidor vai para a coluna de servidores.
  useEffect(() => {
    if (nomeServidor) aoNomeServidor?.(nomeServidor);
  }, [nomeServidor, aoNomeServidor]);
  const usuario = eu ?? usuarioInicial;
  const barraVisao = (
    <span className="barra-visao" role="group" aria-label="Mostrar ou ocultar">
      {videos.length > 0 && (
        <button
          type="button"
          className="icone"
          aria-pressed={!ocultos.cameras}
          aria-label="Mostrar câmeras"
          title="Câmeras"
          onClick={() => alternarParte('cameras')}
        >
          <Icone nome="camera" />
        </button>
      )}
      <button
        type="button"
        className="icone"
        aria-pressed={!ocultos.membros}
        aria-label="Mostrar membros"
        title="Membros (Ctrl+M)"
        onClick={() => alternarParte('membros')}
      >
        <Icone nome="pessoas" />
      </button>
    </span>
  );
  // Com a barra de canais escondida, o botão de trazê-la fica à esquerda, no topo da conversa.
  const mostrarCanais = ocultos.canais ? (
    <button type="button" className="icone mostrar-canais" aria-label="Mostrar canais" title="Mostrar a barra de canais (Ctrl+B)" onClick={() => alternarParte('canais')}>
      <Icone nome="painelEsquerdoAbrir" />
    </button>
  ) : null;
  const minhaTela = minhaVoz !== null && transmissoes.some((t) => t.canalVozId === minhaVoz && t.usuarioId === usuario.id);
  const faixaPrevia = minhaTela ? previaMinhaTela : undefined;
  const membrosPorStatus = useMemo(() => {
    const com = usuarios.map((u) => ({ u, status: (presencas[u.id] ?? 'offline') as StatusPessoa }));
    const ativos = com.filter((m) => m.status !== 'offline');
    const fora = com.filter((m) => m.status === 'offline');
    return [
      ...(ativos.length ? [{ grupo: `Online — ${ativos.length}` }, ...ativos] : []),
      ...(fora.length ? [{ grupo: `Offline — ${fora.length}` }, ...fora] : []),
    ] as ({ grupo: string } | { u: UsuarioDto; status: StatusPessoa })[];
  }, [usuarios, presencas]);
  const api = useMemo(() => criarApi(servidorUrl, token), [servidorUrl, token]);
  // Backlog v2, item 10b: prévias de links, guardadas enquanto a tela estiver aberta.
  const buscarPrevia = useMemo(() => criarBuscaPrevia((url) => api.previa(url)), [api]);
  const ehAdmin = usuario.cargo === 'admin';
  // Backlog v2, item 10c: o que o cargo personalizado libera (administrador: tudo).
  const permissoes = useMemo(() => permissoesDe(usuario, funcoes), [usuario, funcoes]);
  const podeVer = (v: Vista) =>
    v === 'membros' ? ehAdmin : v === 'auditoria' ? permissoes.has('ver_auditoria') : v === 'convite' ? permissoes.has('gerenciar_convite') : v === 'sons' ? permissoes.has('gerenciar_sons') : true;
  const vistaAtual: Vista = !podeVer(vista) ? 'canal' : vista;

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
        // Aviso sobre uma pessoa (entrou/saiu): só traz a janela, sem trocar de tela.
        if (tipo === 'u') return;
        if (tipo === 'c') {
          acoes.abrirCanal(Number(id));
          setAbaBarra('canais');
        } else if (tipo === 'd') {
          acoes.abrirDm(Number(id));
          setAbaBarra('diretas');
        }
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
  /** Backlog v2, item 14: /tocar, /pular e /parar no chat viram comando do bot (não vão como mensagem). */
  const comandoMusica = (comando: ComandoMusica) => pedir((c) => c.pedir('musica:comando', comando), acoes.definirMusica);
  const enviarNoCanal = (canalId: number, texto: string, anexos: string[]) => {
    const comando = anexos.length === 0 ? lerComandoMusica(texto) : undefined;
    if (!comando) return enviarMensagem({ canalId }, texto, anexos);
    if ('erro' in comando) return Promise.resolve(comando.erro);
    return comandoMusica(comando);
  };
  /** RF-12a: abre a DM com alguém da lista de membros. */
  const conversarCom = (usuarioId: number) =>
    void pedir(
      (c) => c.pedir('dm:abrir', { usuarioId }),
      (dm) => {
        acoes.salvarDm(dm);
        acoes.abrirDm(dm.id);
        setAbaBarra('diretas');
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
    if (entrandoRef.current !== null) return;
    entrandoRef.current = canalId;
    setEntrandoVoz(true);
    let sala: SalaVoz | null = null;
    try {
      sala = await obterSala();
    } catch {
      // Módulo de voz não carregou (arquivo corrompido?): tenta de novo na próxima vez.
      criandoSalaRef.current = null;
      setAvisoVoz('Não foi possível carregar a voz. Tente de novo.');
    }
    if (!sala || entrandoRef.current !== canalId) {
      entrandoRef.current = null;
      setEntrandoVoz(false);
      return;
    }
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
      void tocadorRef.current?.carregar(useLoja.getState().sons);
      tocar('entrar');
      // Mute/deafen trocados enquanto esperava a resposta: manda o estado atual.
      if (controlesRef.current !== enviados) void conexaoRef.current?.pedir('voz:estado', estadoVoz(canalId, sala.sid(), controlesRef.current));
    } catch (e) {
      setMinhaVoz(null);
      if (!(e as { cancelada?: boolean } | null)?.cancelada) {
        setAvisoVoz(e instanceof ErroApiCliente ? e.message : 'Não foi possível conectar à voz. Confira se o servidor de mídia está no ar.');
      }
      // Saiu do canal anterior e não entrou no novo: a presença antiga não pode ficar.
      if (tinhaVoz) await conexaoRef.current?.pedir('voz:estado', estadoVoz(null));
    } finally {
      entrandoRef.current = null;
      setEntrandoVoz(false);
    }
  }

  const tocarSom = (somId: number) =>
    pedir(
      (c) => c.pedir('som:tocar', { somId }),
      () => setLiberadoEm(Date.now() + SOM_INTERVALO_MS),
    );

  /** RF-27: antes de abrir o seletor, avisa se alguém já transmite neste canal. */
  function abrirSeletorTela() {
    const canal = minhaVozRef.current;
    const outro = useLoja.getState().transmissoes.find((t) => t.canalVozId === canal && t.usuarioId !== usuario.id);
    if (outro) {
      const nome = usuarios.find((u) => u.id === outro.usuarioId)?.nomeExibicao ?? 'Alguém';
      setAvisoVoz(`${nome} já está transmitindo neste canal.`);
      return;
    }
    setSeletorTela(true);
  }
  async function transmitirTela(fonte: FonteTela, audioSistema: boolean, qualidade: QualidadeTela) {
    fecharSeletorTela();
    const canal = minhaVozRef.current;
    const sala = salaVozRef.current;
    if (canal === null || !sala || iniciandoTelaRef.current) return;
    iniciandoTelaRef.current = true;
    setIniciandoTela(true);
    let ok = false;
    try {
      // A trava vem antes da captura (RN-10): se outro pegou, nada inicia.
      const r = await conexaoRef.current?.pedir('tela:pedir', { canalVozId: canal, qualidade });
      if (!r?.ok) {
        setAvisoVoz(r?.erro ?? 'Sem conexão com o servidor.');
        return;
      }
      try {
        // Linux (backlog v2, item 13): true quando o som vai pelo microfone virtual, publicado à parte.
        const somVirtual = (await ponte().captura.escolher(fonte.id, audioSistema)) === true;
        ok = await sala.transmitir(qualidade, audioSistema && !somVirtual, telaRef.current.codec, somVirtual);
        if (!ok && somVirtual) void ponte().captura.pararSom().catch(() => undefined);
        if (ok) {
          qualidadeAtualRef.current = qualidade;
          setPreviaMinhaTela(sala.faixaMinhaTela());
        }
      } catch {
        setAvisoVoz('Não foi possível transmitir a tela.');
      }
      // Qualquer falha depois da trava: libera (senão o canal fica "ocupado" sem transmissão).
      if (!ok) await conexaoRef.current?.pedir('tela:parar', { canalVozId: canal });
    } finally {
      iniciandoTelaRef.current = false;
      setIniciandoTela(false);
    }
  }
  async function pararTela() {
    const canal = minhaVozRef.current;
    await salaVozRef.current?.pararTela();
    void ponte().captura.pararSom?.().catch(() => undefined);
    if (canal !== null) await conexaoRef.current?.pedir('tela:parar', { canalVozId: canal });
  }

  async function sairVoz() {
    pararSoundboard();
    if (minhaVozRef.current !== null) tocar('sair');
    setMinhaVoz(null);
    await salaVozRef.current?.sair();
    void ponte().captura.pararSom?.().catch(() => undefined);
    await conexaoRef.current?.pedir('voz:estado', estadoVoz(null));
  }

  return (
    <div className="layout-principal">
      {conexao !== 'conectado' && (
        <div className="faixa-conexao" role="status" data-testid="faixa-conexao">
          {conexao === 'conectando' ? 'Conectando…' : 'Sem conexão com o servidor. Reconectando…'}
        </div>
      )}
      <div className={`layout-colunas${ocultos.canais ? ' sem-canais' : ''}${ocultos.membros ? ' sem-membros' : ''}`}>
        <aside className="coluna-esquerda">
          <BarraLateral
            aoEsconder={() => alternarParte('canais')}
            aba={abaBarra}
            aoMudarAba={setAbaBarra}
            aoConversarCom={conversarCom}
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
            presencas={presencas}
            transmissoes={transmissoes}
            silenciadas={silenciadasAqui}
          />
          {(minhaVoz !== null || entrandoVoz || avisoVoz) && (
            <section className="painel-voz" aria-label="Conexão de voz">
              <p className="estado" role="status">
                {entrandoVoz ? (
                  'Conectando à voz…'
                ) : minhaVoz !== null && reconectandoVoz ? (
                  <>
                    <strong className="reconectando">Reconectando à voz…</strong>
                    {canais.find((c) => c.id === minhaVoz)?.nome}
                  </>
                ) : minhaVoz !== null ? (
                  <>
                    <strong>
                      Voz conectada
                      {ping !== undefined && (
                        <span className={`ping ${ping < 100 ? 'bom' : ping < 200 ? 'medio' : 'ruim'}`} title="Ida e volta até o servidor de voz" aria-label={`Ping ${ping} milissegundos`}>
                          {ping} ms
                        </span>
                      )}
                    </strong>
                    {canais.find((c) => c.id === minhaVoz)?.nome}
                  </>
                ) : (
                  avisoVoz
                )}
              </p>
              {minhaVoz !== null && <PainelMusica estado={musica.find((m) => m.canalVozId === minhaVoz)} usuarios={usuarios} aoComando={comandoMusica} />}
              {minhaVoz !== null && !entrandoVoz && (
                <>
                  <span
                    className={`transmitindo${transmitindo && !controles.mudo && !controles.surdo ? ' ativo' : ''}`}
                    role="img"
                    aria-label={transmitindo ? 'Transmitindo' : 'Microfone em silêncio'}
                    title={`${transmitindo ? 'Transmitindo' : 'Em silêncio'}${ping !== undefined ? ` · ping ${ping} ms` : ''}`}
                  />
                  <button
                    type="button"
                    className={`icone controle${controles.mudo || controles.surdo ? ' desligado' : ''}`}
                    aria-pressed={controles.mudo || controles.surdo}
                    aria-label="Mutar microfone"
                    title="Mutar microfone (mute)"
                    onClick={alternarMudo}
                  >
                    <Icone nome={controles.mudo || controles.surdo ? 'microfoneDesligado' : 'microfone'} />
                  </button>
                  <button
                    type="button"
                    className={`icone controle${controles.surdo ? ' desligado' : ''}`}
                    aria-pressed={controles.surdo}
                    aria-label="Desligar áudio"
                    title="Desligar áudio (deafen)"
                    onClick={alternarSurdo}
                  >
                    <Icone nome={controles.surdo ? 'foneDesligado' : 'fone'} />
                  </button>
                  <button
                    type="button"
                    className={`icone controle${controles.camera ? ' ligado' : ''}`}
                    aria-pressed={controles.camera}
                    aria-label="Câmera"
                    title={controles.camera ? 'Desligar câmera' : 'Ligar câmera'}
                    onClick={() => void alternarCamera()}
                  >
                    <Icone nome="camera" />
                  </button>
                  <button
                    type="button"
                    className={`icone controle${minhaTela ? ' ligado' : ''}`}
                    aria-pressed={minhaTela}
                    aria-label="Transmitir tela"
                    ref={botaoTelaRef}
                    disabled={iniciandoTela}
                    title={iniciandoTela ? 'Iniciando a transmissão…' : minhaTela ? 'Parar transmissão' : 'Transmitir tela'}
                    onClick={() => (minhaTela ? void pararTela() : abrirSeletorTela())}
                  >
                    <Icone nome="tela" />
                  </button>
                  <button
                    type="button"
                    className={`icone controle${soundboardAberto ? ' ligado' : ''}`}
                    aria-expanded={soundboardAberto}
                    aria-label="Tocar sons"
                    title="Soundboard: tocar sons para o canal"
                    onClick={() => setSoundboardAberto(!soundboardAberto)}
                  >
                    <Icone nome="sons" />
                  </button>
                  <button type="button" className="icone controle sair-voz" aria-label="Sair da voz" title="Sair da voz" onClick={() => void sairVoz()}>
                    <Icone nome="desligar" />
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
          {/* Região viva sempre montada: o leitor de tela anuncia quando o texto muda. */}
          <p className={`aviso-som${avisoSom ? '' : ' vazio'}`} aria-live="polite" aria-atomic="true">
            {avisoSom ? `🔊 ${avisoSom.texto}` : ''}
          </p>
          {soundboardAberto && (
            <PainelSoundboard
              sons={sons}
              naVoz={minhaVoz !== null}
              liberadoEm={liberadoEm}
              volume={prefSons.soundboard}
              aoVolume={(v) => mudarSons({ ...sonsRef.current, soundboard: v })}
              aoTocar={tocarSom}
              aoFechar={() => setSoundboardAberto(false)}
            />
          )}
          <section className="painel-usuario" aria-label="Você">
            <div className="painel-usuario-topo">
              <Avatar usuario={usuario} servidorUrl={servidorUrl} tamanho={34} />
              <div className="painel-usuario-nomes">
                <p className="nome" data-testid="usuario-logado">
                  Olá, {usuario.nomeExibicao}
                </p>
                <p className="suave">
                  {ehAdmin ? 'Administrador' : (funcoes.find((f) => f.id === usuario.funcaoId)?.nome ?? 'Membro')} · {nomeServidor ?? servidorUrl}
                </p>
                <SeletorStatus valor={escolhaStatus} aoMudar={mudarStatus} />
              </div>
              <button
                type="button"
                className="icone abrir-menu"
                aria-label="Menu"
                title="Perfil, configurações, convite, administração…"
                aria-expanded={menuAberto}
                aria-controls="menu-usuario"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuAberto(!menuAberto);
                }}
              >
                <Icone nome="engrenagem" tamanho={20} />
              </button>
            </div>
            {/* Backlog v2, item 8: as opções saíram do canto (eram 10 botões soltos) para este menu. */}
            {menuAberto && (
              <div id="menu-usuario" className="menu-usuario" onClick={() => setMenuAberto(false)}>
                <button type="button" onClick={() => setVista('perfil')}>
                  Meu perfil
                </button>
                <button type="button" onClick={() => setVista('configuracoes')}>
                  Configurações
                </button>
                {linkConvite && (
                  <button
                    type="button"
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
                {(ehAdmin || ['gerenciar_convite', 'gerenciar_sons', 'ver_auditoria'].some((p) => permissoes.has(p as Permissao))) && (
                  <>
                    <p className="menu-grupo">Administração</p>
                    {ehAdmin && (
                      <button type="button" onClick={() => setVista('membros')}>
                        Membros
                      </button>
                    )}
                    {permissoes.has('gerenciar_convite') && (
                      <button type="button" onClick={() => setVista('convite')}>
                        Convite
                      </button>
                    )}
                    {permissoes.has('gerenciar_sons') && (
                      <button type="button" onClick={() => setVista('sons')}>
                        Soundboard
                      </button>
                    )}
                    {permissoes.has('ver_auditoria') && (
                      <button type="button" onClick={abrirAuditoria}>
                        Auditoria
                      </button>
                    )}
                  </>
                )}
                <hr />
                <button type="button" onClick={aoTrocarServidor}>
                  Trocar servidor
                </button>
                <button type="button" className="sair" onClick={aoSair}>
                  Sair
                </button>
              </div>
            )}
            {copiado && (
              <p className="aviso-ok" role="status">
                {copiado}
              </p>
            )}
          </section>
        </aside>

        <ContextoPrevia.Provider value={buscarPrevia}>
        <main className="conteudo">
          {minhaTela && (
            <section className="aviso-transmissao" aria-label="Sua transmissão">
              <span>🖥️ Você está transmitindo a tela.</span>
              {faixaPrevia && (
                <button type="button" className="secundario" aria-pressed={verPrevia} onClick={() => setVerPrevia(!verPrevia)}>
                  {verPrevia ? 'Ocultar prévia' : 'Ver prévia'}
                </button>
              )}
              <button type="button" className="perigo" disabled={iniciandoTela} onClick={() => void pararTela()}>
                Parar transmissão
              </button>
              {faixaPrevia && verPrevia && <PreviaLocal faixa={faixaPrevia} />}
            </section>
          )}
          {transmissoes
            .filter((t) => t.canalVozId === minhaVoz && t.usuarioId !== usuario.id)
            .map((t) => (
              <PainelTransmissao
                key={t.usuarioId}
                nome={usuarios.find((u) => u.id === t.usuarioId)?.nomeExibicao ?? 'Alguém'}
                faixa={telasRemotas.find((v) => v.usuarioId === t.usuarioId)?.faixa}
              />
            ))}
          {!ocultos.cameras && <GradeVideos videos={videos} usuarios={usuarios} euId={usuario.id} />}
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
              copiar={(texto) => ponte().areaTransferencia.copiar(texto)}
              funcoes={funcoes}
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
              notificacoes={notif}
              aoMudarNotificacoes={mudarNotificacoes}
              tema={tema}
              aoMudarTema={mudarTema}
              aoFechar={aoFechar}
              aoMudarAoFechar={mudarAoFechar}
              tela={telaPrefs}
              aoMudarTela={mudarTela}
              qualidadesTela={qualidadesPermitidas(usuario.cargo, permissoes.has('transmitir_alta'))}
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
              extras={barraVisao}
              antes={mostrarCanais}
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
              silenciada={silenciadasAqui.includes(`d:${dmAtiva}`)}
              aoSilenciar={(sim) => silenciarConversa(`d:${dmAtiva}`, sim)}
            />
          ) : (
            <CanalAberto
              extras={barraVisao}
              antes={mostrarCanais}
              key={canalAtivo ?? 'nenhum'}
              canal={canais.find((c) => c.id === canalAtivo)}
              ehAdmin={ehAdmin}
              aoRenomear={renomearCanal}
              aoRemover={removerCanal}
              usuarios={usuarios}
              servidorUrl={servidorUrl}
              api={api}
              aoEnviar={enviarNoCanal}
              euId={usuario.id}
              aoEditarMensagem={editarMensagem}
              aoApagarMensagem={apagarMensagem}
              aoDigitar={(canalId) => conexaoRef.current?.avisarDigitando({ canalId })}
              silenciada={canalAtivo !== null && silenciadasAqui.includes(`c:${canalAtivo}`)}
              aoSilenciar={canalAtivo !== null ? (sim) => silenciarConversa(`c:${canalAtivo}`, sim) : undefined}
            />
          )}
        </main>
        </ContextoPrevia.Provider>

        {seletorTela && (
          <SeletorTela
            listar={ponte().captura.fontes}
            audioDisponivel={ponte().captura.audioDisponivel}
            qualidades={qualidadesPermitidas(usuario.cargo, permissoes.has('transmitir_alta'))}
            qualidadePadrao={telaPrefs.qualidade}
            aoEscolher={(f, a, q) => void transmitirTela(f, a, q)}
            aoCancelar={fecharSeletorTela}
          />
        )}
        <aside className="coluna-direita">
          <h2 className="subtitulo">Membros — {usuarios.length}</h2>
          {/* RF-37: online/ausente primeiro, depois offline; cada um com a bolinha de status. */}
          <ul className="lista-membros" aria-label="Membros">
            {membrosPorStatus.map((item) =>
              'grupo' in item ? (
                <li key={item.grupo} className="grupo-membros" aria-hidden="true">
                  {item.grupo}
                </li>
              ) : (
                <li key={item.u.id} aria-label={`${item.u.nomeExibicao}, ${TEXTO_STATUS[item.status]}`}>
                  <span className="avatar-com-status">
                    <Avatar usuario={item.u} servidorUrl={servidorUrl} tamanho={28} />
                    <StatusPonto status={item.status} />
                  </span>
                  <span style={funcoes.find((f) => f.id === item.u.funcaoId) ? { color: funcoes.find((f) => f.id === item.u.funcaoId)!.cor } : undefined}>
                    {item.u.nomeExibicao}
                  </span>
                  {item.u.cargo === 'admin' && <span className="selo">admin</span>}
                  {funcoes.find((f) => f.id === item.u.funcaoId) && (
                    <span className="selo selo-funcao" style={{ color: funcoes.find((f) => f.id === item.u.funcaoId)!.cor, borderColor: funcoes.find((f) => f.id === item.u.funcaoId)!.cor }}>
                      {funcoes.find((f) => f.id === item.u.funcaoId)!.nome}
                    </span>
                  )}
                  {item.u.id !== usuario.id && (
                    <button
                      type="button"
                      className="icone conversar"
                      aria-label={`Conversar com ${item.u.nomeExibicao}`}
                      title="Mensagem direta"
                      onClick={() => conversarCom(item.u.id)}
                    >
                      <Icone nome="carta" tamanho={16} />
                    </button>
                  )}
                </li>
              ),
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}

/** Backlog v2, item 12: o que a minha tela está mandando, num quadro pequeno (mudo, sem rede), com tela cheia. */
function PreviaLocal({ faixa }: { faixa: MediaStreamTrack }) {
  const ref = useRef<HTMLVideoElement>(null);
  const caixa = useRef<HTMLElement>(null);
  const cheia = useEmTelaCheia(caixa);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = new MediaStream([faixa]);
    void v.play().catch(() => undefined);
    return () => {
      v.srcObject = null;
    };
  }, [faixa]);
  return (
    <figure ref={caixa} className="previa-minha-tela" onDoubleClick={() => alternarTelaCheia(caixa.current)}>
      <video ref={ref} aria-label="Prévia da sua transmissão" muted playsInline />
      <button type="button" className="icone quadro-tela-cheia" aria-label={cheia ? 'Sair da tela cheia' : 'Prévia em tela cheia'} title={cheia ? 'Sair da tela cheia (ou Esc)' : 'Tela cheia (ou duplo clique)'} onClick={() => alternarTelaCheia(caixa.current)}>
        {cheia ? '🗗' : '⛶'}
      </button>
    </figure>
  );
}
