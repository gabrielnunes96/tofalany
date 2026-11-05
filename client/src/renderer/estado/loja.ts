import { create } from 'zustand';
import type { CanalDto, OlaPayload, UsuarioDto } from '@tofalando/shared';
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
  limpar(): void;
}

/** Mesma ordem do servidor: nome_exibicao COLLATE NOCASE (só A–Z sem caixa), depois id. */
const semCaixaAscii = (t: string) => t.replace(/[A-Z]/g, (c) => c.toLowerCase());
function compararComoServidor(a: UsuarioDto, b: UsuarioDto): number {
  const x = semCaixaAscii(a.nomeExibicao);
  const y = semCaixaAscii(b.nomeExibicao);
  return x < y ? -1 : x > y ? 1 : a.id - b.id;
}

const inicial = {
  conexao: 'conectando' as EstadoConexao,
  nomeServidor: null,
  linkConvite: null,
  eu: null,
  usuarios: [] as UsuarioDto[],
  canais: [] as CanalDto[],
  canalAtivo: null as number | null,
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
      return { nomeServidor: servidor.nome, linkConvite: convite.link, eu, usuarios, canais: ordenados, canalAtivo: canalValido(ordenados, s.canalAtivo) };
    }),
  salvarCanal: (canal) =>
    set((s) => {
      const canais = ordenarCanais([...s.canais.filter((c) => c.id !== canal.id), canal]);
      return { canais, canalAtivo: canalValido(canais, s.canalAtivo) };
    }),
  removerCanal: (id) =>
    set((s) => {
      const canais = s.canais.filter((c) => c.id !== id);
      return { canais, canalAtivo: canalValido(canais, s.canalAtivo) };
    }),
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
  removerUsuario: (id) => set((s) => ({ usuarios: s.usuarios.filter((u) => u.id !== id) })),
  limpar: () => set(inicial),
}));
