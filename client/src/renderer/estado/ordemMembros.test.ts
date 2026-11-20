import { describe, expect, it } from 'vitest';
import type { FuncaoDto, UsuarioDto } from '@tofalando/shared';
import { ordenarMembros } from './ordemMembros';

const u = (id: number, nome: string, extra: Partial<UsuarioDto> = {}): UsuarioDto => ({ id, usuario: nome, nomeExibicao: nome, cor: '#fff', avatarUrl: null, cargo: 'membro', ...extra });
const funcoes: FuncaoDto[] = [
  { id: 1, nome: 'Moderador', cor: '#f00', permissoes: ['enviar_mensagens', 'enviar_anexos', 'entrar_voz', 'usar_camera', 'transmitir_tela', 'tocar_sons', 'usar_toouvini', 'gerenciar_canais', 'apagar_mensagens'] },
  { id: 2, nome: 'Visitante', cor: '#0f0', permissoes: ['enviar_mensagens'] },
];

describe('ordenarMembros', () => {
  it('conectados por cargo (mais permissões primeiro) e alfabético; offline no fim na mesma ordem', () => {
    const lista = ordenarMembros(
      [u(1, 'zeca'), u(2, 'Ana'), u(3, 'bia', { funcaoId: 1 }), u(4, 'caio', { cargo: 'admin' }), u(5, 'davi', { funcaoId: 2 }), u(6, 'eva', { cargo: 'admin' }), u(7, 'beto')],
      { 1: 'online', 2: 'ausente', 3: 'online', 4: 'online', 5: 'online', 7: 'naoIncomodar' },
      funcoes,
    );
    const texto = lista.map((l) => ('grupo' in l ? `[${l.grupo}]` : l.u.nomeExibicao));
    expect(texto).toEqual(['[Administradores — 1]', 'caio', '[Moderador — 1]', 'bia', '[Membros — 3]', 'Ana', 'beto', 'zeca', '[Visitante — 1]', 'davi', '[Offline — 1]', 'eva']);
  });
});
