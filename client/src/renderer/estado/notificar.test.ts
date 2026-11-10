import { describe, expect, it } from 'vitest';
import type { MensagemDto } from '@tofalando/shared';
import { decidirAvisoPresenca, decidirMensagemNova } from './notificar';

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

  it('menção a mim (ou @todos num canal) notifica mesmo silenciada ou com mensagens desligadas; "não incomodar" vence', () => {
    const silenciada = ctx({ silenciadas: ['c:5'], notificar: false });
    expect(decidirMensagemNova(msg({}), silenciada)?.notificacao).toBeUndefined();
    expect(decidirMensagemNova(msg({ mencoes: [1] }), silenciada)?.notificacao).toMatchObject({ titulo: '@ Dono mencionou você em #jogos' });
    expect(decidirMensagemNova(msg({ mencionaTodos: true }), silenciada)?.notificacao).toBeDefined();
    expect(decidirMensagemNova(msg({ mencoes: [3] }), silenciada)?.notificacao).toBeUndefined();
    expect(decidirMensagemNova(msg({ mencoes: [1] }), ctx({ naoIncomodar: true }))?.notificacao).toBeUndefined();
  });

  it('backlog v2, item 2: em "não incomodar", conta mas não notifica', () => {
    expect(decidirMensagemNova(msg({}), ctx({ naoIncomodar: true }))).toEqual({ chave: 'c:5', acao: 'contar', notificacao: undefined });
  });

  it('conversa aberta com foco: marca como lida; aberta sem foco: conta (e o main notifica)', () => {
    expect(decidirMensagemNova(msg({}), ctx({ chaveAberta: 'c:5' }))?.acao).toBe('lido');
    const semFoco = decidirMensagemNova(msg({}), ctx({ chaveAberta: 'c:5', focado: false }))!;
    expect(semFoco.acao).toBe('contar');
    expect(semFoco.notificacao?.conversaAberta).toBe(true);
  });

  it('DM (CA-19a): título é o nome; anexo sem texto vira "📎 nome" ou "📎 N anexos"', () => {
    const a = { id: 'x', url: '/files/x.pdf', tipo: 'documento' as const, nome: 'r.pdf', bytes: 1, largura: null, altura: null };
    const dm = decidirMensagemNova(msg({ canalId: null, dmId: 3, texto: '', anexos: [a] }), ctx())!;
    expect(dm).toMatchObject({ chave: 'd:3', acao: 'contar', notificacao: { titulo: 'Dono', corpo: '📎 r.pdf' } });
    expect(decidirMensagemNova(msg({ canalId: null, dmId: 3, texto: '', anexos: [a, a] }), ctx())!.notificacao?.corpo).toBe('📎 2 anexos');
  });

  it('RF-39/RF-40: desligadas ou conversa silenciada — conta, mas não notifica', () => {
    const base = { euId: 1, chaveAberta: null, focado: true, usuarios: [], canais: [] };
    const msg = { id: 9, canalId: 3, dmId: null, autorId: 2, texto: 'oi', criadaEm: 0, editadaEm: null, anexos: [] };
    expect(decidirMensagemNova(msg, { ...base, notificar: false })).toEqual({ chave: 'c:3', acao: 'contar' });
    expect(decidirMensagemNova(msg, { ...base, silenciadas: ['c:3'] })?.notificacao).toBeUndefined();
    expect(decidirMensagemNova(msg, { ...base, silenciadas: ['c:4'] })?.notificacao).toBeDefined();
  });
});

describe('decidirAvisoPresenca (RF-41)', () => {
  const ctx = { id: 2, euId: 1, calado: false, som: true, aviso: true, surdo: false };
  it('entrou e saiu avisam; ausente↔online não', () => {
    expect(decidirAvisoPresenca(undefined, 'online', ctx)).toEqual({ tipo: 'entrou', som: true, aviso: true });
    expect(decidirAvisoPresenca(undefined, 'ausente', ctx)?.tipo).toBe('entrou');
    expect(decidirAvisoPresenca('ausente', 'offline', ctx)?.tipo).toBe('saiu');
    expect(decidirAvisoPresenca('online', 'ausente', ctx)).toBeUndefined();
    expect(decidirAvisoPresenca('ausente', 'online', ctx)).toBeUndefined();
    expect(decidirAvisoPresenca(undefined, 'offline', ctx)).toBeUndefined();
  });
  it('eu mesmo, logo depois de conectar, chaves desligadas e deafen', () => {
    expect(decidirAvisoPresenca(undefined, 'online', { ...ctx, id: 1 })).toBeUndefined();
    expect(decidirAvisoPresenca(undefined, 'online', { ...ctx, calado: true })).toBeUndefined();
    expect(decidirAvisoPresenca(undefined, 'online', { ...ctx, som: false, aviso: false })).toBeUndefined();
    expect(decidirAvisoPresenca(undefined, 'online', { ...ctx, surdo: true })).toEqual({ tipo: 'entrou', som: false, aviso: true });
  });
});
