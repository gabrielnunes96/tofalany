import { describe, expect, it } from 'vitest';
import type { MensagemDto } from '@tofalando/shared';
import { decidirMensagemNova } from './notificar';

const usuarios = [
  { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#fff', avatarUrl: null, cargo: 'membro' as const },
  { id: 2, usuario: 'dono', nomeExibicao: 'Dono', cor: '#fff', avatarUrl: null, cargo: 'admin' as const },
];
const canais = [{ id: 5, tipo: 'texto' as const, nome: 'jogos', posicao: 1 }];
const msg = (p: Partial<MensagemDto>): MensagemDto => ({ id: 9, canalId: 5, dmId: null, autorId: 2, texto: 'oi', criadaEm: 1, editadaEm: null, anexos: [], ...p });
const ctx = (p: Partial<Parameters<typeof decidirMensagemNova>[1]> = {}) => ({ euId: 1, chaveAberta: null, focado: true, usuarios, canais, ...p });

describe('decidirMensagemNova (RF-12)', () => {
  it('mensagem da própria pessoa: nada', () => {
    expect(decidirMensagemNova(msg({ autorId: 1 }), ctx())).toBeUndefined();
  });

  it('canal fechado: conta e notifica com "#canal — autor"', () => {
    expect(decidirMensagemNova(msg({}), ctx({ chaveAberta: 'c:1' }))).toEqual({
      chave: 'c:5',
      acao: 'contar',
      notificacao: { titulo: '#jogos — Dono', corpo: 'oi', chave: 'c:5', conversaAberta: false },
    });
  });

  it('conversa aberta com foco: marca como lida; aberta sem foco: conta (e o main notifica)', () => {
    expect(decidirMensagemNova(msg({}), ctx({ chaveAberta: 'c:5' }))?.acao).toBe('lido');
    const semFoco = decidirMensagemNova(msg({}), ctx({ chaveAberta: 'c:5', focado: false }))!;
    expect(semFoco.acao).toBe('contar');
    expect(semFoco.notificacao.conversaAberta).toBe(true);
  });

  it('DM (CA-19a): título é o nome; anexo sem texto vira "📎 nome" ou "📎 N anexos"', () => {
    const a = { id: 'x', url: '/files/x.pdf', tipo: 'documento' as const, nome: 'r.pdf', bytes: 1, largura: null, altura: null };
    const dm = decidirMensagemNova(msg({ canalId: null, dmId: 3, texto: '', anexos: [a] }), ctx())!;
    expect(dm).toMatchObject({ chave: 'd:3', acao: 'contar', notificacao: { titulo: 'Dono', corpo: '📎 r.pdf' } });
    expect(decidirMensagemNova(msg({ canalId: null, dmId: 3, texto: '', anexos: [a, a] }), ctx())!.notificacao.corpo).toBe('📎 2 anexos');
  });
});
