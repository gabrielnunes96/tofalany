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
  limpar(): void;
}

const inicial = { conexao: 'conectando' as EstadoConexao, nomeServidor: null, eu: null, usuarios: [] };

export const useLoja = create<Loja>((set) => ({
  ...inicial,
  definirConexao: (conexao) => set({ conexao }),
  aplicarOla: ({ servidor, eu, usuarios }) => set({ nomeServidor: servidor.nome, eu, usuarios }),
  limpar: () => set(inicial),
}));
