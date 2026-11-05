import { create } from 'zustand';
import type { OlaPayload, UsuarioDto } from '@tofalando/shared';
import type { EstadoConexao } from '../servicos/tempo-real';

/** Estado da sessão alimentado pelo tempo real (cresce com canais, mensagens, voz…). */
interface Loja {
  conexao: EstadoConexao;
  nomeServidor: string | null;
  eu: UsuarioDto | null;
  usuarios: UsuarioDto[];
  definirConexao(estado: EstadoConexao): void;
  aplicarOla(payload: OlaPayload): void;
  adicionarUsuario(usuario: UsuarioDto): void;
  limpar(): void;
}

/** Mesma ordem do servidor: nome_exibicao COLLATE NOCASE (só A–Z sem caixa), depois id. */
const semCaixaAscii = (t: string) => t.replace(/[A-Z]/g, (c) => c.toLowerCase());
function compararComoServidor(a: UsuarioDto, b: UsuarioDto): number {
  const x = semCaixaAscii(a.nomeExibicao);
  const y = semCaixaAscii(b.nomeExibicao);
  return x < y ? -1 : x > y ? 1 : a.id - b.id;
}

const inicial = { conexao: 'conectando' as EstadoConexao, nomeServidor: null, eu: null, usuarios: [] };

export const useLoja = create<Loja>((set) => ({
  ...inicial,
  definirConexao: (conexao) => set({ conexao }),
  aplicarOla: ({ servidor, eu, usuarios }) => set({ nomeServidor: servidor.nome, eu, usuarios }),
  adicionarUsuario: (usuario) =>
    set((s) => ({
      usuarios: [...s.usuarios.filter((u) => u.id !== usuario.id), usuario].sort(compararComoServidor),
    })),
  limpar: () => set(inicial),
}));
