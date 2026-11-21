import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ANEXO_MAX_BYTES,
  ANEXOS_POR_MENSAGEM,
  DIGITANDO_INTERVALO_MS,
  EXTENSOES_ANEXO,
  textoSemGif,
  trechoDeResposta,
  validarTextoMensagem,
  type AnexoDto,
  type CanalDto,
  type GifDto,
  type MensagemDto,
  type PaginaMensagens,
  type UsuarioDto,
} from '@tofalando/shared';
import { tamanhoLegivel } from './Anexos';
import { chaveCanal, useLojaDaTela, type Chave } from '../estado/loja';
import type { ClienteApi } from '../servicos/api';
import { ErroApiCliente, type JanelaHistorico } from '../servicos/api';
import { ItemMensagem } from './ItemMensagem';
import { PainelGif } from './PainelGif';
import type { Klipy } from '../servicos/gif';

/** O que a conversa mostra: canal de texto ("#geral") ou DM ("Bia"). */
export interface DadosConversa {
  chave: Chave;
  /** "#geral" ou "Bia": usado em "Mensagens de …", "Mensagem para …". */
  titulo: string;
  /** Frase no começo do histórico. */
  inicio: string;
  /** Rótulo da lista de mensagens. */
  rotuloLista: string;
}

interface Props {
  conversa: DadosConversa;
  carregarPagina: (antes?: number, ate?: number, janela?: JanelaHistorico) => Promise<PaginaMensagens>;
  usuarios: UsuarioDto[];
  servidorUrl: string;
  api: Pick<ClienteApi, 'enviarAnexo'>;
  /** Envia pelo tempo real; devolve a mensagem de erro ou null. */
  aoEnviar: (texto: string, anexos: string[], opcoes?: OpcoesEnvio) => Promise<string | null>;
  /** Busca de GIF: só quando o servidor tem a busca ligada (sem ela, o botão GIF não aparece). */
  klipy?: Klipy;
  euId: number;
  ehAdmin: boolean;
  aoEditar: (id: number, texto: string) => Promise<string | null>;
  aoApagar: (id: number) => Promise<string | null>;
  /** Reações (RF-2, RF-3): devolve a mensagem de erro ou null. */
  aoReagir?: (id: number, emoji: string) => Promise<string | null>;
  aoDigitar: () => void;
  /** Conversa só para leitura (ex.: DM com conta removida): sem campo de escrever. */
  somenteLeitura?: string;
  /** Comandos de bot (ex.: ToOuvini) que abrem numa lista ao digitar "/" no começo. */
  comandos?: readonly ComandoBot[];
  /** Menções: a lista ao digitar "@" (só em canal) e se @todos aparece nela. */
  mencoes?: { podeTodos: boolean };
  /** chat-fixar-e-buscar: fixar e desafixar (só para quem pode). */
  aoFixar?: (id: number, fixar: boolean) => Promise<string | null>;
}

/** Resposta (RF-6): a original e se o autor dela é avisado. */
export interface OpcoesEnvio {
  respostaA?: number;
  avisar?: boolean;
  /** GIF escolhido na busca (vai com o texto do compositor). */
  gif?: GifDto;
}

/** Uma resposta, um anexo ou um GIF é sempre mensagem (o texto não vira comando do bot). */
export function podeSerComando(anexos: string[], opcoes?: OpcoesEnvio): boolean {
  return anexos.length === 0 && !opcoes?.respostaA && !opcoes?.gif;
}

/** Um comando de bot para a lista do "/": nomes (o primeiro aparece), argumento e o que faz. */
export interface ComandoBot {
  nomes: string[];
  argumento?: string;
  descricao: string;
}

/** Extensão de um arquivo colado: a do nome ou a do tipo (image/png → png). */
function extensaoDe(f: File): string {
  const doNome = /\.(\w+)$/.exec(f.name)?.[1];
  return (doNome ?? f.type.split('/')[1] ?? 'png').toLowerCase();
}

interface Pendente {
  chave: number;
  nome: string;
  bytes: number;
  estado: 'enviando' | 'pronto' | 'erro';
  anexo?: AnexoDto;
  erro?: string;
}

/** Confere no app o que o servidor também confere (RN-19): extensão e tamanho. */
export function problemaDoArquivo(nome: string, bytes: number): string | null {
  const ext = nome.toLowerCase().split('.').pop() ?? '';
  if (!(EXTENSOES_ANEXO as readonly string[]).includes(ext)) return 'Formato não aceito. Envie JPEG, PNG, GIF, WebP, PDF ou ZIP.';
  if (bytes > ANEXO_MAX_BYTES) return 'O arquivo deve ter no máximo 25 MB.';
  return null;
}

let proximaChave = 1;

/** "Ana está digitando…", "Ana e Bia estão digitando…", "Várias pessoas estão digitando…". */
export function textoDigitando(nomes: string[]): string | null {
  if (nomes.length === 0) return null;
  if (nomes.length === 1) return `${nomes[0]} está digitando…`;
  if (nomes.length <= 3) return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)} estão digitando…`;
  return 'Várias pessoas estão digitando…';
}

/** Perto do fim (px): mensagem nova rola a lista; mais acima, a pessoa está lendo o histórico. */
const PERTO_DO_FIM = 120;

/** RF-8, RF-12a: histórico com carga ao rolar para cima (CA-14) e envio de mensagens — canal ou DM. */
export function Conversa({
  conversa,
  carregarPagina,
  usuarios,
  servidorUrl,
  api,
  aoEnviar,
  klipy,
  euId,
  ehAdmin,
  aoEditar,
  aoApagar,
  aoReagir,
  aoDigitar,
  somenteLeitura,
  comandos,
  mencoes,
  aoFixar,
}: Props) {
  const chave = conversa.chave;
  const useLoja = useLojaDaTela();
  const historico = useLoja((s) => s.historicos[chave]);
  const listaFixadas = useLoja((s) => s.fixadas[chave]);
  const idsFixados = new Set(listaFixadas?.map((f) => f.mensagem.id));
  const digitandoAte = useLoja((s) => s.digitando[chave]);
  const [agora, setAgora] = useState(() => Date.now());
  const ultimoSinal = useRef(0);
  const lista = useRef<HTMLDivElement>(null);
  const topo = useRef<HTMLDivElement>(null);
  /** Fim da lista quando o histórico não vai até a mais nova (janela): chegar nele carrega as seguintes. */
  const fundo = useRef<HTMLDivElement>(null);
  /** Altura antes de pôr mensagens antigas no topo, para manter a posição de leitura. */
  const alturaAntes = useRef<number | null>(null);
  const estavaNoFim = useRef(true);
  /** Chegaram as seguintes (para baixo, longe do fim): a posição de leitura fica onde está (não pula para o fim). */
  const chegaramSeguintes = useRef(false);
  /** Ir até a original (RF-7): a mensagem destacada por 2 s, a que espera a página chegar e o aviso de "antiga demais". */
  const [destacada, setDestacada] = useState<number | null>(null);
  const irDepois = useRef<number | null>(null);
  const irQuandoCarregar = useRef<number | null>(null);
  const tempoAviso = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tempoDestaque = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [avisoIr, setAvisoIr] = useState<string | null>(null);
  useEffect(
    () => () => {
      clearTimeout(tempoDestaque.current);
      clearTimeout(tempoAviso.current);
    },
    [],
  );
  const [texto, setTexto] = useState('');
  /** Respondendo a esta mensagem (faixa acima do compositor) e se o autor dela é avisado (padrão: sim). */
  // Só o id: a faixa mostra a versão atual da original (editada ou apagada enquanto se escreve).
  const [respondendoA, setRespondendoA] = useState<number | null>(null);
  /** Null com respondendoA preenchido: a original foi apagada enquanto se escrevia (a faixa avisa; sai sem vínculo). */
  const respondendo = respondendoA === null ? null : (historico?.mensagens.find((m) => m.id === respondendoA) ?? null);
  const [avisar, setAvisar] = useState(true);
  // Comandos de bot: a lista abre ao digitar "/" no começo (até o primeiro espaço) e some com Esc.
  const [paletaFechada, setPaletaFechada] = useState(false);
  const [paletaFoco, setPaletaFoco] = useState(0);
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const prefixo = /^\/(\S*)$/.exec(texto)?.[1]?.toLowerCase();
  const sugestoes = !comandos || paletaFechada || prefixo === undefined ? [] : comandos.filter((c) => c.nomes.some((n) => n.startsWith(prefixo)));
  // Menções: "@" + o começo do nome antes do cursor abre a lista de pessoas (e @todos, se pode).
  const [cursor, setCursor] = useState(0);
  const [mencaoFechada, setMencaoFechada] = useState(false);
  const [mencaoFoco, setMencaoFoco] = useState(0);
  const parcial = mencoes && !mencaoFechada ? /(^|\s)@([\w.-]{0,32})$/.exec(texto.slice(0, cursor)) : null;
  const termo = parcial?.[2]?.toLowerCase();
  const opcoesMencao: { usuario: string; nome: string }[] =
    termo === undefined
      ? []
      : [
          ...(mencoes?.podeTodos && 'todos'.startsWith(termo) ? [{ usuario: 'todos', nome: 'Todos do canal' }] : []),
          ...usuarios
            .filter((u) => u.id !== euId && (u.usuario.toLowerCase().startsWith(termo) || u.nomeExibicao.toLowerCase().includes(termo)))
            .slice(0, 8)
            .map((u) => ({ usuario: u.usuario, nome: u.nomeExibicao })),
        ];
  const comandoAtual = comandos?.find((c) => c.nomes.includes(/^\/(\S+)(\s|$)/.exec(texto)?.[1]?.toLowerCase() ?? '\u0000') && /^\/\S+\s/.test(texto));
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Enter apertado enquanto a mensagem anterior ia: manda assim que ela terminar (antes era ignorado). */
  const enviarDepois = useRef(false);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);
  const botaoGif = useRef<HTMLButtonElement>(null);
  const [painelGif, setPainelGif] = useState(false);
  /** Anexos ocupando vaga (enviando ou prontos), contados na hora: duas escolhas seguidas não passam de 10. */
  const ativos = useRef(0);

  function anexar(arquivos: FileList | File[]) {
    const lista = [...arquivos];
    setErroEnvio(null);
    const vagas = ANEXOS_POR_MENSAGEM - ativos.current;
    if (lista.length > vagas) setErroEnvio(`Até ${ANEXOS_POR_MENSAGEM} anexos por mensagem.`);
    for (const arquivo of lista.slice(0, Math.max(0, vagas))) {
      const chave = proximaChave++;
      const problema = problemaDoArquivo(arquivo.name, arquivo.size);
      const base: Pendente = { chave, nome: arquivo.name, bytes: arquivo.size, estado: problema ? 'erro' : 'enviando', erro: problema ?? undefined };
      setPendentes((p) => [...p, base]);
      if (problema) continue;
      ativos.current++;
      api
        .enviarAnexo(arquivo, arquivo.name)
        .then((anexo) => setPendentes((p) => p.map((x) => (x.chave === chave ? { ...x, estado: 'pronto', anexo } : x))))
        .catch((e: unknown) => {
          ativos.current--;
          setPendentes((p) =>
            p.map((x) => (x.chave === chave ? { ...x, estado: 'erro', erro: e instanceof Error ? e.message : 'Não foi possível enviar.' } : x)),
          );
        });
    }
  }

  /** Colar (Ctrl+V): arquivos da área de transferência (ex.: um print) viram anexos; texto cola normalmente. */
  function colar(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const arquivos = [...e.clipboardData.files];
    if (!arquivos.length) return;
    e.preventDefault();
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    // Prints chegam como "image.png": dá um nome que não se repete entre colagens.
    anexar(
      arquivos.map((f, i) =>
        /^image\.\w+$/i.test(f.name) || !f.name ? new File([f], `print-${carimbo}${i ? `-${i + 1}` : ''}.${extensaoDe(f)}`, { type: f.type }) : f,
      ),
    );
  }

  const carregar = useCallback(
    (antes?: number) => {
      const { iniciarCarga, receberPagina, falharCarga } = useLoja.getState();
      const geracao = iniciarCarga(chave);
      carregarPagina(antes)
        .then((pagina) => receberPagina(chave, pagina, geracao))
        .catch((e: unknown) => {
          alturaAntes.current = null;
          falharCarga(chave, e instanceof ErroApiCliente ? e.message : 'Não foi possível carregar as mensagens.', geracao);
        });
    },
    [carregarPagina, chave, useLoja],
  );

  // Primeira abertura da conversa (ou depois de reconectar, quando o histórico foi descartado).
  useEffect(() => {
    if (!useLoja.getState().historicos[chave]) carregar();
  }, [chave, carregar, historico, useLoja]);

  const carregarAnteriores = useCallback(
    (automatico: boolean) => {
      const h = useLoja.getState().historicos[chave];
      if (!h || h.fim || h.carregando || (automatico && h.erro)) return;
      alturaAntes.current = lista.current?.scrollHeight ?? null;
      carregar(h.mensagens[0]?.id);
    },
    [chave, carregar, useLoja],
  );

  // Chegar ao topo da lista carrega as anteriores (o botão continua para teclado e leitor de tela).
  useEffect(() => {
    const alvo = topo.current;
    if (!alvo || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && carregarAnteriores(true), { root: lista.current });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [carregarAnteriores]);

  const mensagens = historico?.mensagens;
  const primeiroId = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    const primeiro = mensagens?.[0]?.id;
    const entrouNoTopo = primeiroId.current !== undefined && primeiro !== primeiroId.current;
    primeiroId.current = primeiro;
    // Só compensa quando chegaram mensagens antigas no topo (mensagem nova no fim não conta).
    if (alturaAntes.current !== null && entrouNoTopo) {
      el.scrollTop += el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
    } else if (chegaramSeguintes.current) {
      // Páginas para baixo depois de uma janela: entram abaixo, sem mexer em onde a pessoa está lendo.
      chegaramSeguintes.current = false;
    } else if (estavaNoFim.current) {
      el.scrollTop = el.scrollHeight;
    }
    // A página com a original chegou: rola até ela agora que está na tela.
    if (irDepois.current !== null && rolarAte(irDepois.current)) irDepois.current = null;
  }, [mensagens]);

  /** Rola até a mensagem (no meio da lista), destaca por 2 s e põe o foco nela. Falso se ela não está carregada. */
  function rolarAte(id: number): boolean {
    const alvo = lista.current?.querySelector<HTMLElement>(`[data-mensagem-id="${id}"]`);
    if (!alvo) return false;
    estavaNoFim.current = false;
    const reduzir = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    alvo.scrollIntoView?.({ block: 'center', behavior: reduzir ? 'auto' : 'smooth' });
    // Focável só enquanto é o alvo (um clique comum numa mensagem não deixa as ações presas na tela).
    alvo.tabIndex = -1;
    alvo.addEventListener('blur', () => alvo.removeAttribute('tabindex'), { once: true });
    alvo.focus({ preventScroll: true });
    setDestacada(id);
    clearTimeout(tempoDestaque.current);
    tempoDestaque.current = setTimeout(() => setDestacada(null), 2000);
    return true;
  }

  /**
   * RF-7/RN-13 e chat-fixar-e-buscar (CA-6, CA-13): já carregada, rola; senão abre a janela em volta dela (a qualquer
   * distância do fim). A janela substitui o histórico; se não chega ao fim, aparece "Ir para as mais recentes".
   */
  async function irPara(id: number) {
    avisarIr(null);
    if (rolarAte(id)) return;
    const { historicos, iniciarCarga, receberJanela, falharCarga } = useLoja.getState();
    const h = historicos[chave];
    if (!h) return;
    // Uma carga já está em andamento (ex.: chegou ao topo): tenta de novo quando ela terminar.
    if (h.carregando) {
      irQuandoCarregar.current = id;
      return;
    }
    const geracao = iniciarCarga(chave);
    try {
      const pagina = await carregarPagina(undefined, undefined, { em: id });
      const achou = pagina.mensagens.some((m) => m.id === id);
      if (achou) irDepois.current = id;
      estavaNoFim.current = false;
      receberJanela(chave, pagina, geracao);
      // Reconexão no meio do caminho (o histórico recomeçou): nada fica pendurado.
      if (useLoja.getState().historicos[chave]?.geracao !== geracao) irDepois.current = null;
      else if (!achou) avisarIr('Essa mensagem não está mais aqui.');
    } catch (e) {
      irDepois.current = null;
      falharCarga(chave, e instanceof ErroApiCliente ? e.message : 'Não foi possível carregar as mensagens.', geracao);
    }
  }

  /** Longe do fim: as seguintes, ao chegar ao fim da lista. */
  const carregarSeguintes = useCallback(() => {
    const { historicos, iniciarCarga, receberDepois, falharCarga } = useLoja.getState();
    const h = historicos[chave];
    const ultima = h?.mensagens.at(-1)?.id;
    if (!h || h.noFim || h.carregando || h.erro || ultima === undefined) return;
    const geracao = iniciarCarga(chave);
    carregarPagina(undefined, undefined, { depois: ultima })
      .then((pagina) => {
        chegaramSeguintes.current = true;
        receberDepois(chave, pagina, geracao);
      })
      .catch((e: unknown) => falharCarga(chave, e instanceof ErroApiCliente ? e.message : 'Não foi possível carregar as mensagens.', geracao));
  }, [carregarPagina, chave, useLoja]);

  /** "Ir para as mais recentes": recarrega do fim (o histórico da janela é descartado). */
  function irParaRecentes() {
    estavaNoFim.current = true;
    useLoja.getState().descartarHistorico(chave);
  }

  const longeDoFim = !!historico && !historico.noFim;
  useEffect(() => {
    const alvo = fundo.current;
    if (!longeDoFim || !alvo || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && carregarSeguintes(), { root: lista.current });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [carregarSeguintes, longeDoFim]);

  // Pedido de ir até uma mensagem vindo de fora (fixadas, busca): atende quando o histórico já carregou.
  const irAte = useLoja((s) => (s.irAte?.chave === chave ? s.irAte.id : null));
  const historicoPronto = !!historico && !historico.carregando && historico.mensagens.length + (historico.fim ? 1 : 0) > 0;
  useEffect(() => {
    if (irAte === null || !historicoPronto) return;
    useLoja.getState().consumirIrAte();
    void irPara(irAte);
    // irPara lê o estado atual na hora.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [irAte, historicoPronto]);

  /** Aviso de "ir até a original": some sozinho em 5 s. */
  function avisarIr(texto: string | null) {
    setAvisoIr(texto);
    clearTimeout(tempoAviso.current);
    if (texto) tempoAviso.current = setTimeout(() => setAvisoIr(null), 5000);
  }

  // A carga que estava em andamento terminou: retoma o "ir até a original" pedido no meio dela.
  const carregandoAgora = historico?.carregando ?? false;
  useEffect(() => {
    if (carregandoAgora || irQuandoCarregar.current === null) return;
    const id = irQuandoCarregar.current;
    irQuandoCarregar.current = null;
    void irPara(id);
    // irPara lê o estado atual na hora; só a troca de "carregando" importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregandoAgora]);

  // Relógio para o aviso de "digitando" expirar sozinho (CA-17).
  const alguemDigitando = !!digitandoAte && Object.entries(digitandoAte).some(([id, ate]) => ate > agora && Number(id) !== euId);
  // Só roda enquanto alguém está de fato digitando; para sozinho quando o aviso expira.
  useEffect(() => {
    if (!alguemDigitando) return;
    const t = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(t);
  }, [alguemDigitando]);

  function mudarTexto(valor: string, posicao: number = valor.length) {
    setTexto(valor);
    setCursor(posicao);
    setMencaoFechada(false);
    setMencaoFoco(0);
    setPaletaFechada(false);
    setPaletaFoco(0);
    const t = Date.now();
    // Comando de bot não é conversa: não avisa "digitando".
    if (valor.trim() && !valor.startsWith('/') && t - ultimoSinal.current > DIGITANDO_INTERVALO_MS) {
      ultimoSinal.current = t;
      aoDigitar();
    }
  }

  const prontos = pendentes.filter((p) => p.estado === 'pronto').map((p) => p.anexo!.id);
  const subindo = pendentes.some((p) => p.estado === 'enviando');
  const podeEnviar = !enviando && !subindo && (texto.trim() !== '' || prontos.length > 0);

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    if (enviando && !subindo && (texto.trim() !== '' || prontos.length > 0)) {
      enviarDepois.current = true;
      return;
    }
    if (!podeEnviar) return;
    const v = validarTextoMensagem(texto);
    if (!v.ok && prontos.length === 0) return;
    setEnviando(true);
    setErroEnvio(null);
    // Limpa só o que foi enviado: o que a pessoa digitou ou anexou durante o envio fica no compositor.
    const textoEnviado = texto;
    const enviados = new Set(pendentes.filter((p) => p.estado === 'pronto').map((p) => p.chave));
    const resposta = respondendoA;
    // Original apagada no meio do caminho: vai como mensagem comum.
    const vinculo = resposta !== null && respondendo ? { respostaA: resposta, avisar } : null;
    const falha = await (vinculo ? aoEnviar(v.ok ? v.valor : '', prontos, vinculo) : aoEnviar(v.ok ? v.valor : '', prontos));
    setEnviando(false);
    if (falha) setErroEnvio(falha);
    else {
      setRespondendoA((atual) => (atual === resposta ? null : atual));
      setTexto((atual) => (atual === textoEnviado ? '' : atual));
      setPendentes((lista) => lista.filter((p) => !enviados.has(p.chave)));
      ativos.current = Math.max(0, ativos.current - enviados.size);
      ultimoSinal.current = 0;
      estavaNoFim.current = true;
      // Enviou longe do fim (janela): volta para as mais recentes, onde a mensagem aparece.
      if (useLoja.getState().historicos[chave]?.noFim === false) irParaRecentes();
    }
  }

  /** Envia o GIF escolhido com o texto do compositor e a resposta em andamento (RF-3); avisa a Klipy do envio. */
  async function enviarGif(gif: GifDto, q: string) {
    setPainelGif(false);
    // Um envio em andamento ainda não limpou o compositor: o texto sairia duas vezes.
    if (enviando) return;
    campoRef.current?.focus();
    setEnviando(true);
    setErroEnvio(null);
    const textoEnviado = texto;
    const v = validarTextoMensagem(texto);
    const resposta = respondendoA;
    const vinculo = resposta !== null && respondendo ? { respostaA: resposta, avisar } : {};
    const falha = await aoEnviar(v.ok ? v.valor : '', [], { ...vinculo, gif });
    setEnviando(false);
    if (falha) {
      setErroEnvio(falha);
      return;
    }
    void klipy?.compartilhar(gif.slug, q);
    setRespondendoA((atual) => (atual === resposta ? null : atual));
    setTexto((atual) => (atual === textoEnviado ? '' : atual));
    ultimoSinal.current = 0;
    estavaNoFim.current = true;
    if (useLoja.getState().historicos[chave]?.noFim === false) irParaRecentes();
  }

  // Envio que ficou na fila: sai quando o anterior terminou e o compositor já mostra o texto novo.
  useEffect(() => {
    if (enviando || !enviarDepois.current) return;
    enviarDepois.current = false;
    void enviar();
  });

  /** Troca o "@começo" antes do cursor por "@usuario " e põe o cursor depois. */
  function escolherMencao(o: { usuario: string }) {
    const antes = texto.slice(0, cursor).replace(/@[\w.-]*$/, `@${o.usuario} `);
    const novo = antes + texto.slice(cursor);
    setTexto(novo);
    setCursor(antes.length);
    setMencaoFoco(0);
    requestAnimationFrame(() => {
      const c = campoRef.current;
      if (!c) return;
      c.focus();
      c.setSelectionRange(antes.length, antes.length);
    });
  }

  function escolherComando(c: ComandoBot) {
    const novo = `/${c.nomes[0]}${c.argumento ? ' ' : ''}`;
    setTexto(novo);
    setPaletaFechada(true);
    campoRef.current?.focus();
    // Sem argumento: já manda (ex.: /pause).
    if (!c.argumento) enviarDepois.current = true;
  }

  function teclas(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (opcoesMencao.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setMencaoFoco((f) => (f + (e.key === 'ArrowDown' ? 1 : opcoesMencao.length - 1)) % opcoesMencao.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        escolherMencao(opcoesMencao[Math.min(mencaoFoco, opcoesMencao.length - 1)]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMencaoFechada(true);
        return;
      }
    }
    if (sugestoes.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setPaletaFoco((f) => (f + (e.key === 'ArrowDown' ? 1 : sugestoes.length - 1)) % sugestoes.length);
        return;
      }
      if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab') {
        e.preventDefault();
        escolherComando(sugestoes[Math.min(paletaFoco, sugestoes.length - 1)]!);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setPaletaFechada(true);
        return;
      }
    }
    if (e.key === 'Escape' && respondendoA !== null) {
      e.preventDefault();
      setRespondendoA(null);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar();
    }
  }

  function cancelarResposta() {
    setRespondendoA(null);
    campoRef.current?.focus();
  }

  function responder(m: MensagemDto) {
    setRespondendoA(m.id);
    setAvisar(true);
    requestAnimationFrame(() => campoRef.current?.focus());
  }

  const porId = new Map(usuarios.map((u) => [u.id, u]));
  const nomeDe = (id: number) => (id === euId ? 'você mesmo' : (porId.get(id)?.nomeExibicao ?? 'conta removida'));

  return (
    <div
      className={`chat${arrastando ? ' arrastando' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setArrastando(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        if (e.dataTransfer.files.length) anexar(e.dataTransfer.files);
      }}
    >
      <div
        className="mensagens"
        ref={lista}
        onScroll={(e) => {
          const el = e.currentTarget;
          estavaNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < PERTO_DO_FIM;
        }}
      >
        <div ref={topo} className="sentinela" aria-hidden="true" />
        {historico && !historico.fim && historico.mensagens.length > 0 && (
          <button type="button" className="secundario carregar-antigas" onClick={() => carregarAnteriores(false)} disabled={historico.carregando}>
            {historico.carregando ? 'Carregando…' : 'Carregar mensagens anteriores'}
          </button>
        )}
        {historico?.fim && <p className="suave inicio-canal">{conversa.inicio}</p>}
        {historico?.erro && (
          <div className="erro-carga">
            <p className="erro" role="alert">
              {historico.erro}
            </p>
            {historico.mensagens.length === 0 && (
              <button type="button" className="secundario" onClick={() => carregar()} disabled={historico.carregando}>
                Tentar de novo
              </button>
            )}
          </div>
        )}
        <ol className="lista-mensagens" aria-label={conversa.rotuloLista} aria-busy={historico?.carregando ?? true}>
          {mensagens?.map((m) => (
            <ItemMensagem
              key={m.id}
              mensagem={m}
              autor={porId.get(m.autorId)}
              servidorUrl={servidorUrl}
              podeEditar={m.autorId === euId}
              podeApagar={m.autorId === euId || ehAdmin}
              aoEditar={aoEditar}
              aoApagar={aoApagar}
              usuarios={porId}
              euId={euId}
              aoReagir={somenteLeitura ? undefined : aoReagir}
              aoResponder={somenteLeitura ? undefined : responder}
              aoIrPara={(id) => void irPara(id)}
              destacada={destacada === m.id}
              fixada={idsFixados.has(m.id)}
              aoFixar={aoFixar}
            />
          ))}
        </ol>
        {historico && !historico.noFim && <div ref={fundo} className="sentinela" aria-hidden="true" />}
      </div>
      {historico && !historico.noFim && (
        <button type="button" className="secundario ir-recentes" onClick={irParaRecentes}>
          Ir para as mais recentes
        </button>
      )}
      {/* Fora da área que rola: aparece onde a pessoa está, e o leitor de tela anuncia (região sempre montada). */}
      <p className={`aviso-ir${avisoIr ? '' : ' visualmente-oculto'}`} role="status">
        {avisoIr}
      </p>
      {somenteLeitura ? (
        <p className="suave somente-leitura" role="note">
          {somenteLeitura}
        </p>
      ) : (
        <>
          {respondendoA !== null && (
            <div
              id={`faixa-resposta-${chave}`}
              className="faixa-resposta"
              role="group"
              aria-label={respondendo ? `Respondendo a ${nomeDe(respondendo.autorId)}` : 'Resposta a uma mensagem apagada'}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelarResposta();
                }
              }}
            >
              <span className="faixa-resposta-texto">
                {respondendo ? (
                  <>
                    Respondendo a <strong>{nomeDe(respondendo.autorId)}</strong>
                    <span className="trecho-texto">
                      {trechoDeResposta(textoSemGif(respondendo.texto, respondendo.gif)) ||
                        (respondendo.gif ? 'GIF' : respondendo.anexos.length ? 'Anexo' : '')}
                    </span>
                  </>
                ) : (
                  <em>A mensagem original foi apagada; a sua vai como mensagem comum.</em>
                )}
              </span>
              {respondendo && respondendo.autorId !== euId && (
                <button
                  type="button"
                  className={`icone faixa-avisar${avisar ? ' ligado' : ''}`}
                  aria-pressed={avisar}
                  aria-label={`Avisar ${nomeDe(respondendo.autorId)}`}
                  title={avisar ? 'A pessoa será avisada' : 'A pessoa não será avisada'}
                  onClick={() => setAvisar((v) => !v)}
                >
                  <span aria-hidden="true">{avisar ? '@ Avisar' : '@ Sem aviso'}</span>
                </button>
              )}
              <button type="button" className="icone" aria-label="Cancelar resposta" onClick={cancelarResposta}>
                ×
              </button>
            </div>
          )}
          {pendentes.length > 0 && (
            <ul className="pendentes" aria-label="Anexos a enviar">
              {pendentes.map((p) => (
                <li key={p.chave} className={`pendente ${p.estado}`}>
                  <span className="anexo-nome">{p.nome}</span>
                  <span className="suave">{p.estado === 'enviando' ? 'enviando…' : p.estado === 'erro' ? p.erro : tamanhoLegivel(p.bytes)}</span>
                  <button
                    type="button"
                    className="icone"
                    aria-label={`Tirar ${p.nome}`}
                    onClick={() => {
                      if (p.estado !== 'erro') ativos.current--;
                      setPendentes((lista) => lista.filter((x) => x.chave !== p.chave));
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="compositor" onSubmit={enviar}>
            <button type="button" className="secundario anexar" aria-label="Anexar arquivo" title="Anexar arquivo" onClick={() => seletor.current?.click()}>
              +
            </button>
            {klipy && (
              <button
                ref={botaoGif}
                type="button"
                className="secundario botao-gif"
                aria-label="Enviar GIF"
                title="Enviar GIF"
                aria-expanded={painelGif}
                aria-haspopup="dialog"
                disabled={enviando}
                onClick={() => setPainelGif((v) => !v)}
              >
                GIF
              </button>
            )}
            {klipy && painelGif && (
              <div className="painel-gif-ancora">
                <PainelGif
                  klipy={klipy}
                  ancora={botaoGif.current}
                  aoEscolher={(gif, q) => void enviarGif(gif, q)}
                  aoFechar={(devolverFoco) => {
                    setPainelGif(false);
                    if (devolverFoco) botaoGif.current?.focus();
                  }}
                />
              </div>
            )}
            <input
              ref={seletor}
              type="file"
              multiple
              hidden
              aria-label="Arquivos para anexar"
              accept={EXTENSOES_ANEXO.map((e) => `.${e}`).join(',')}
              onChange={(e) => {
                if (e.target.files?.length) anexar(e.target.files);
                e.target.value = '';
              }}
            />
            {opcoesMencao.length > 0 && (
              <ul className="paleta-comandos" role="listbox" aria-label="Mencionar" id="paleta-mencoes">
                <li className="paleta-titulo" role="presentation">
                  Mencionar
                </li>
                {opcoesMencao.map((o, i) => (
                  <li
                    key={o.usuario}
                    id={`mencao-${o.usuario}`}
                    role="option"
                    aria-selected={i === mencaoFoco}
                    className={i === mencaoFoco ? 'foco' : undefined}
                    onMouseEnter={() => setMencaoFoco(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      escolherMencao(o);
                    }}
                  >
                    <span className="paleta-nome">{o.nome}</span>
                    <span className="paleta-descricao">@{o.usuario}</span>
                  </li>
                ))}
              </ul>
            )}
            {sugestoes.length > 0 && (
              <ul className="paleta-comandos" role="listbox" aria-label="Comandos" id="paleta-comandos">
                <li className="paleta-titulo" role="presentation">
                  🎵 ToOuvini
                </li>
                {sugestoes.map((c, i) => (
                  <li
                    key={c.nomes[0]}
                    id={`comando-${c.nomes[0]}`}
                    role="option"
                    aria-selected={i === paletaFoco}
                    className={i === paletaFoco ? 'foco' : undefined}
                    onMouseEnter={() => setPaletaFoco(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      escolherComando(c);
                    }}
                  >
                    <span className="paleta-nome">
                      /{c.nomes[0]}
                      {c.argumento && <span className="paleta-argumento"> &lt;{c.argumento}&gt;</span>}
                    </span>
                    <span className="paleta-descricao">{c.descricao}</span>
                  </li>
                ))}
              </ul>
            )}
            {comandoAtual && (
              <span className="chip-comando" aria-hidden="true">
                🎵 /{comandoAtual.nomes[0]}
              </span>
            )}
            <textarea
              ref={campoRef}
              className={comandoAtual ? 'com-comando' : undefined}
              aria-expanded={sugestoes.length > 0 || opcoesMencao.length > 0 ? true : undefined}
              aria-controls={opcoesMencao.length > 0 ? 'paleta-mencoes' : sugestoes.length > 0 ? 'paleta-comandos' : undefined}
              aria-activedescendant={
                opcoesMencao.length > 0
                  ? `mencao-${opcoesMencao[Math.min(mencaoFoco, opcoesMencao.length - 1)]!.usuario}`
                  : sugestoes.length > 0
                    ? `comando-${sugestoes[Math.min(paletaFoco, sugestoes.length - 1)]!.nomes[0]}`
                    : undefined
              }
              aria-label={`Mensagem para ${conversa.titulo}`}
              aria-describedby={respondendoA !== null ? `faixa-resposta-${chave}` : undefined}
              placeholder={`Mensagem para ${conversa.titulo}`}
              value={texto}
              onChange={(e) => mudarTexto(e.target.value, e.target.selectionStart ?? e.target.value.length)}
              onSelect={(e) => setCursor(e.currentTarget.selectionStart ?? 0)}
              onKeyDown={teclas}
              onPaste={colar}
              rows={1}
              maxLength={4000}
            />
            <button type="submit" disabled={!podeEnviar}>
              Enviar
            </button>
          </form>
        </>
      )}
      <p className="digitando" aria-live="polite">
        {alguemDigitando
          ? textoDigitando(
              Object.entries(digitandoAte!)
                .filter(([id, ate]) => ate > agora && Number(id) !== euId)
                .map(([id]) => porId.get(Number(id))?.nomeExibicao ?? 'Alguém'),
            )
          : ''}
      </p>
      {erroEnvio && (
        <p className="erro" role="alert">
          {erroEnvio}
        </p>
      )}
    </div>
  );
}

type PropsCanal = Omit<Props, 'conversa' | 'carregarPagina' | 'api'> & {
  canal: CanalDto;
  api: Pick<ClienteApi, 'mensagensCanal' | 'enviarAnexo'>;
};

/** Conversa de um canal de texto. */
export function MensagensCanal({ canal, api, ...resto }: PropsCanal) {
  // Sem `ate`, a chamada continua com a forma de antes (antes só).
  const carregarPagina = useCallback(
    (antes?: number, ate?: number, janela?: JanelaHistorico) =>
      janela ? api.mensagensCanal(canal.id, antes, ate, janela) : ate ? api.mensagensCanal(canal.id, antes, ate) : api.mensagensCanal(canal.id, antes),
    [api, canal.id],
  );
  return (
    <Conversa
      {...resto}
      api={api}
      carregarPagina={carregarPagina}
      conversa={{
        chave: chaveCanal(canal.id),
        titulo: `#${canal.nome}`,
        inicio: `Este é o começo de #${canal.nome}.`,
        rotuloLista: `Mensagens de #${canal.nome}`,
      }}
    />
  );
}
