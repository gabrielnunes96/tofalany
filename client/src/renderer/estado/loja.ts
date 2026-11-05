import { create } from 'zustand';
import type { CanalDto, DmDto, MensagemDto, OlaPayload, PaginaMensagens, UsuarioDto } from '@tofalando/shared';
import type { EstadoConexao } from '../servicos/tempo-real';

import { chaveCanal, chaveDe, type Chave } from './chaves';

export { chaveCanal, chaveDe, chaveDm, type Chave } from './chaves';

/** Estado da sessão alimentado pelo tempo real (cresce com voz…). */
interface Loja {
  conexao: EstadoConexao;
  nomeServidor: string | null;
  linkConvite: string | null;
  eu: UsuarioDto | null;
  usuarios: UsuarioDto[];
  canais: CanalDto[];
  /** Canal de texto escolhido (fica guardado mesmo com uma DM aberta). */
  canalAtivo: number | null;
  /** DMs da pessoa, da mais recente para a mais antiga. */
  dms: DmDto[];
  /** DM aberta no centro (null = mostra o canal ativo). */
  dmAtiva: number | null;
  /** Histórico já carregado por conversa (some ao reconectar, para recarregar sem buracos). */
  historicos: Partial<Record<Chave, Historico>>;
  /** Quem está digitando em cada conversa: usuarioId → até quando (ms). */
  digitando: Partial<Record<Chave, Record<number, number>>>;
  definirConexao(estado: EstadoConexao): void;
  aplicarOla(payload: OlaPayload): void;
  adicionarUsuario(usuario: UsuarioDto): void;
  /** Mesmo efeito de adicionar (substitui pelo id) e também atualiza "eu" se for a própria pessoa. */
  atualizarUsuario(usuario: UsuarioDto): void;
  removerUsuario(id: number): void;
  definirLinkConvite(link: string): void;
  salvarCanal(canal: CanalDto): void;
  removerCanal(id: number): void;
  abrirCanal(id: number): void;
  salvarDm(dm: DmDto): void;
  abrirDm(id: number): void;
  /** Marca o início de uma carga e devolve a geração dela; respostas de cargas antigas são ignoradas. */
  iniciarCarga(chave: Chave): number;
  receberPagina(chave: Chave, pagina: PaginaMensagens, geracao: number): void;
  falharCarga(chave: Chave, erro: string, geracao: number): void;
  adicionarMensagem(mensagem: MensagemDto): void;
  atualizarMensagem(mensagem: MensagemDto): void;
  removerMensagem(id: number, chave: Chave | null): void;
  registrarDigitando(chave: Chave, usuarioId: number, ate: number): void;
  limpar(): void;
}

/** Mesma ordem do servidor: nome_exibicao COLLATE NOCASE (só A–Z sem caixa), depois id. */
const semCaixaAscii = (t: string) => t.replace(/[A-Z]/g, (c) => c.toLowerCase());
function compararComoServidor(a: UsuarioDto, b: UsuarioDto): number {
  const x = semCaixaAscii(a.nomeExibicao);
  const y = semCaixaAscii(b.nomeExibicao);
  return x < y ? -1 : x > y ? 1 : a.id - b.id;
}

export interface Historico {
  mensagens: MensagemDto[];
  /** Geração da carga em andamento (ou da última). */
  geracao: number;
  /** Não há mais antigas. */
  fim: boolean;
  carregando: boolean;
  erro: string | null;
}

const historicoVazio: Historico = { mensagens: [], geracao: 0, fim: false, carregando: false, erro: null };
let proximaGeracao = 1;

const inicial = {
  conexao: 'conectando' as EstadoConexao,
  nomeServidor: null,
  linkConvite: null,
  eu: null,
  usuarios: [] as UsuarioDto[],
  canais: [] as CanalDto[],
  canalAtivo: null as number | null,
  dms: [] as DmDto[],
  dmAtiva: null as number | null,
  historicos: {} as Partial<Record<Chave, Historico>>,
  digitando: {} as Partial<Record<Chave, Record<number, number>>>,
};

const ordenarCanais = (canais: CanalDto[]) =>
  [...canais].sort((a, b) => (a.tipo === b.tipo ? a.posicao - b.posicao || a.id - b.id : a.tipo === 'texto' ? -1 : 1));

const ordenarDms = (dms: DmDto[]) => [...dms].sort((a, b) => b.ultimaEm - a.ultimaEm || b.id - a.id);

/** Mantém o canal aberto se ele ainda existe; senão abre o primeiro de texto. */
function canalValido(canais: CanalDto[], atual: number | null): number | null {
  if (atual !== null && canais.some((c) => c.id === atual && c.tipo === 'texto')) return atual;
  return canais.find((c) => c.tipo === 'texto')?.id ?? null;
}

export const useLoja = create<Loja>((set) => ({
  ...inicial,
  definirConexao: (conexao) => set({ conexao }),
  aplicarOla: ({ servidor, convite, eu, usuarios, canais, dms }) =>
    set((s) => {
      const ordenados = ordenarCanais(canais);
      return {
        nomeServidor: servidor.nome,
        linkConvite: convite.link,
        eu,
        usuarios,
        canais: ordenados,
        canalAtivo: canalValido(ordenados, s.canalAtivo),
        dms: ordenarDms(dms),
        dmAtiva: dms.some((d) => d.id === s.dmAtiva) ? s.dmAtiva : null,
        // Reconectou: o que chegou durante a queda não está aqui; a conversa aberta recarrega.
        historicos: {},
        digitando: {},
      };
    }),
  salvarCanal: (canal) =>
    set((s) => {
      const canais = ordenarCanais([...s.canais.filter((c) => c.id !== canal.id), canal]);
      return { canais, canalAtivo: canalValido(canais, s.canalAtivo) };
    }),
  removerCanal: (id) =>
    set((s) => {
      const canais = s.canais.filter((c) => c.id !== id);
      const historicos = { ...s.historicos };
      delete historicos[chaveCanal(id)];
      return { canais, canalAtivo: canalValido(canais, s.canalAtivo), historicos };
    }),
  salvarDm: (dm) => set((s) => ({ dms: ordenarDms([...s.dms.filter((d) => d.id !== dm.id), dm]) })),
  abrirDm: (id) => set((s) => ({ dmAtiva: s.dms.some((d) => d.id === id) ? id : s.dmAtiva })),
  iniciarCarga: (chave) => {
    const geracao = proximaGeracao++;
    set((s) => ({ historicos: { ...s.historicos, [chave]: { ...(s.historicos[chave] ?? historicoVazio), geracao, carregando: true, erro: null } } }));
    return geracao;
  },
  receberPagina: (chave, pagina, geracao) =>
    set((s) => {
      const atual = s.historicos[chave];
      // Conversa removida, reconexão (ola limpou tudo) ou carga mais nova em andamento: resposta velha, ignora.
      if (!atual || atual.geracao !== geracao) return {};
      const porId = new Map([...atual.mensagens, ...pagina.mensagens].map((m) => [m.id, m]));
      const mensagens = [...porId.values()].sort((a, b) => a.id - b.id);
      return { historicos: { ...s.historicos, [chave]: { ...atual, mensagens, fim: pagina.fim, carregando: false, erro: null } } };
    }),
  falharCarga: (chave, erro, geracao) =>
    set((s) => {
      const atual = s.historicos[chave];
      if (!atual || atual.geracao !== geracao) return {};
      return { historicos: { ...s.historicos, [chave]: { ...atual, carregando: false, erro } } };
    }),
  adicionarMensagem: (m) =>
    set((s) => {
      const chave = chaveDe(m);
      if (!chave) return {};
      const atual = s.historicos[chave];
      // Quem mandou a mensagem parou de digitar.
      const quem = { ...(s.digitando[chave] ?? {}) };
      delete quem[m.autorId];
      const digitando = { ...s.digitando, [chave]: quem };
      // Conversa ainda não carregada: a mensagem vem junto quando ela for aberta.
      if (!atual || atual.mensagens.some((x) => x.id === m.id)) return { digitando };
      return { digitando, historicos: { ...s.historicos, [chave]: { ...atual, mensagens: [...atual.mensagens, m] } } };
    }),
  atualizarMensagem: (m) =>
    set((s) => {
      const chave = chaveDe(m);
      const atual = chave ? s.historicos[chave] : undefined;
      if (!chave || !atual) return {};
      return { historicos: { ...s.historicos, [chave]: { ...atual, mensagens: atual.mensagens.map((x) => (x.id === m.id ? m : x)) } } };
    }),
  removerMensagem: (id, chave) =>
    set((s) => {
      const atual = chave ? s.historicos[chave] : undefined;
      if (!chave || !atual) return {};
      return { historicos: { ...s.historicos, [chave]: { ...atual, mensagens: atual.mensagens.filter((x) => x.id !== id) } } };
    }),
  registrarDigitando: (chave, usuarioId, ate) =>
    set((s) => ({ digitando: { ...s.digitando, [chave]: { ...(s.digitando[chave] ?? {}), [usuarioId]: ate } } })),
  abrirCanal: (id) => set((s) => ({ canalAtivo: canalValido(s.canais, id), dmAtiva: null })),
  definirLinkConvite: (linkConvite) => set({ linkConvite }),
  adicionarUsuario: (usuario) =>
    set((s) => ({
      usuarios: [...s.usuarios.filter((u) => u.id !== usuario.id), usuario].sort(compararComoServidor),
    })),
  atualizarUsuario: (usuario) =>
    set((s) => ({
      usuarios: [...s.usuarios.filter((u) => u.id !== usuario.id), usuario].sort(compararComoServidor),
      eu: s.eu?.id === usuario.id ? usuario : s.eu,
    })),
  removerUsuario: (id) =>
    set((s) => ({
      usuarios: s.usuarios.filter((u) => u.id !== id),
      digitando: Object.fromEntries(
        Object.entries(s.digitando).map(([chave, quem]) => [chave, Object.fromEntries(Object.entries(quem ?? {}).filter(([u]) => Number(u) !== id))]),
      ),
    })),
  limpar: () => set(inicial),
}));
