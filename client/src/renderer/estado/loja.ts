import { create } from 'zustand';
import type { CanalDto, MensagemDto, OlaPayload, PaginaMensagens, UsuarioDto } from '@tofalando/shared';
import type { EstadoConexao } from '../servicos/tempo-real';

/** Estado da sessão alimentado pelo tempo real (cresce com canais, mensagens, voz…). */
interface Loja {
  conexao: EstadoConexao;
  nomeServidor: string | null;
  linkConvite: string | null;
  eu: UsuarioDto | null;
  usuarios: UsuarioDto[];
  canais: CanalDto[];
  /** Canal de texto aberto no centro. */
  canalAtivo: number | null;
  /** Histórico já carregado por canal (some ao reconectar, para recarregar sem buracos). */
  historicos: Record<number, Historico>;
  /** Quem está digitando em cada canal: usuarioId → até quando (ms). */
  digitando: Record<number, Record<number, number>>;
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
  /** Marca o início de uma carga e devolve a geração dela; respostas de cargas antigas são ignoradas. */
  iniciarCarga(canalId: number): number;
  receberPagina(canalId: number, pagina: PaginaMensagens, geracao: number): void;
  falharCarga(canalId: number, erro: string, geracao: number): void;
  adicionarMensagem(mensagem: MensagemDto): void;
  atualizarMensagem(mensagem: MensagemDto): void;
  removerMensagem(id: number, canalId: number | null): void;
  registrarDigitando(canalId: number, usuarioId: number, ate: number): void;
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
  historicos: {} as Record<number, Historico>,
  digitando: {} as Record<number, Record<number, number>>,
};

const ordenarCanais = (canais: CanalDto[]) =>
  [...canais].sort((a, b) => (a.tipo === b.tipo ? a.posicao - b.posicao || a.id - b.id : a.tipo === 'texto' ? -1 : 1));

/** Mantém o canal aberto se ele ainda existe; senão abre o primeiro de texto. */
function canalValido(canais: CanalDto[], atual: number | null): number | null {
  if (atual !== null && canais.some((c) => c.id === atual && c.tipo === 'texto')) return atual;
  return canais.find((c) => c.tipo === 'texto')?.id ?? null;
}

export const useLoja = create<Loja>((set) => ({
  ...inicial,
  definirConexao: (conexao) => set({ conexao }),
  aplicarOla: ({ servidor, convite, eu, usuarios, canais }) =>
    set((s) => {
      const ordenados = ordenarCanais(canais);
      return {
        nomeServidor: servidor.nome,
        linkConvite: convite.link,
        eu,
        usuarios,
        canais: ordenados,
        canalAtivo: canalValido(ordenados, s.canalAtivo),
        // Reconectou: o que chegou durante a queda não está aqui; o canal aberto recarrega.
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
      delete historicos[id];
      return { canais, canalAtivo: canalValido(canais, s.canalAtivo), historicos };
    }),
  iniciarCarga: (canalId) => {
    const geracao = proximaGeracao++;
    set((s) => ({ historicos: { ...s.historicos, [canalId]: { ...(s.historicos[canalId] ?? historicoVazio), geracao, carregando: true, erro: null } } }));
    return geracao;
  },
  receberPagina: (canalId, pagina, geracao) =>
    set((s) => {
      const atual = s.historicos[canalId];
      // Canal removido, reconexão (ola limpou tudo) ou carga mais nova em andamento: resposta velha, ignora.
      if (!atual || atual.geracao !== geracao) return {};
      const porId = new Map([...atual.mensagens, ...pagina.mensagens].map((m) => [m.id, m]));
      const mensagens = [...porId.values()].sort((a, b) => a.id - b.id);
      return { historicos: { ...s.historicos, [canalId]: { ...atual, mensagens, fim: pagina.fim, carregando: false, erro: null } } };
    }),
  falharCarga: (canalId, erro, geracao) =>
    set((s) => {
      const atual = s.historicos[canalId];
      if (!atual || atual.geracao !== geracao) return {};
      return { historicos: { ...s.historicos, [canalId]: { ...atual, carregando: false, erro } } };
    }),
  adicionarMensagem: (m) =>
    set((s) => {
      if (m.canalId === null) return {};
      const atual = s.historicos[m.canalId];
      // Canal ainda não carregado: a mensagem vem junto quando ele for aberto.
      // Quem mandou a mensagem parou de digitar.
      const quem = { ...(s.digitando[m.canalId] ?? {}) };
      delete quem[m.autorId];
      const digitando = { ...s.digitando, [m.canalId]: quem };
      if (!atual || atual.mensagens.some((x) => x.id === m.id)) return { digitando };
      return { digitando, historicos: { ...s.historicos, [m.canalId]: { ...atual, mensagens: [...atual.mensagens, m] } } };
    }),
  atualizarMensagem: (m) =>
    set((s) => {
      const atual = m.canalId === null ? undefined : s.historicos[m.canalId];
      if (!atual) return {};
      return { historicos: { ...s.historicos, [m.canalId!]: { ...atual, mensagens: atual.mensagens.map((x) => (x.id === m.id ? m : x)) } } };
    }),
  removerMensagem: (id, canalId) =>
    set((s) => {
      const atual = canalId === null ? undefined : s.historicos[canalId];
      if (!atual) return {};
      return { historicos: { ...s.historicos, [canalId!]: { ...atual, mensagens: atual.mensagens.filter((x) => x.id !== id) } } };
    }),
  registrarDigitando: (canalId, usuarioId, ate) =>
    set((s) => ({ digitando: { ...s.digitando, [canalId]: { ...(s.digitando[canalId] ?? {}), [usuarioId]: ate } } })),
  abrirCanal: (id) => set((s) => ({ canalAtivo: canalValido(s.canais, id) })),
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
        Object.entries(s.digitando).map(([canal, quem]) => [canal, Object.fromEntries(Object.entries(quem).filter(([u]) => Number(u) !== id))]),
      ),
    })),
  limpar: () => set(inicial),
}));
