import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ session: { defaultSession: { webRequest: { onBeforeRequest: vi.fn() } } } }));
const { permitido } = await import('./rede');

describe('privacidade de rede (CA-46)', () => {
  const servidor = 'https://fala.exemplo.com';
  it('só o host do servidor configurado (qualquer porta/protocolo, para o LiveKit)', () => {
    expect(permitido('https://fala.exemplo.com/api/eu', servidor)).toBe(true);
    expect(permitido('wss://fala.exemplo.com/rtc?x=1', servidor)).toBe(true);
    expect(permitido('ws://fala.exemplo.com:7880/rtc', servidor)).toBe(true);
    expect(permitido('https://cdn.terceiro.com/x.js', servidor)).toBe(false);
    expect(permitido('wss://outro.com/socket.io', servidor)).toBe(false);
    expect(permitido('ftp://fala.exemplo.com/x', servidor)).toBe(false);
  });

  it('arquivos do app, dev e a sondagem de endereço novo', () => {
    expect(permitido('file:///app/index.html', null)).toBe(true);
    // Sem servidor salvo (primeira execução, convite num app novo): livre.
    expect(permitido('http://100.64.0.9:3000/api/auth/cadastro', null)).toBe(true);
    expect(permitido('data:image/png;base64,xx', servidor)).toBe(true);
    expect(permitido('blob:file:///abc', servidor)).toBe(true);
    expect(permitido('http://localhost:5173/src/main.tsx', null, 'http://localhost:5173')).toBe(true);
    expect(permitido('http://100.64.0.9:3000/api/servidor', servidor)).toBe(true);
    expect(permitido('http://100.64.0.9:3000/api/auth/login', servidor)).toBe(false);
    expect(permitido('nada', servidor)).toBe(false);
  });

  it('sondagem só leitura e sem parâmetros; servidor do convite pendente; servidor salvo inválido; dev com barra', () => {
    expect(permitido('http://x.com/api/servidor', servidor, undefined, { metodo: 'POST' })).toBe(false);
    expect(permitido('http://x.com/api/servidor?dados=1', servidor)).toBe(false);
    expect(permitido('http://x.com/api/servidor', servidor, undefined, { metodo: 'HEAD' })).toBe(true);
    expect(permitido('http://100.64.0.9:3000/api/auth/cadastro', servidor, undefined, { pendente: 'http://100.64.0.9:3000' })).toBe(true);
    expect(permitido('http://100.64.0.9:3000/api/auth/cadastro', servidor, undefined, { pendente: null })).toBe(false);
    expect(permitido('https://fala.exemplo.com/x', 'nao é url')).toBe(false);
    expect(permitido('http://localhost:51730/x', servidor, 'http://localhost:5173')).toBe(false);
  });

  it('atualização: o processo principal fala com o GitHub por HTTPS; a janela não', () => {
    const principal = { doProcessoPrincipal: true };
    expect(permitido('https://github.com/gabrielnunes96/tofalany/releases/download/v0.2.0/latest.yml', 'https://s.io', undefined, principal)).toBe(true);
    expect(permitido('https://release-assets.githubusercontent.com/x', 'https://s.io', undefined, principal)).toBe(true);
    expect(permitido('http://github.com/x', 'https://s.io', undefined, principal)).toBe(false);
    expect(permitido('https://github.com.mal.io/x', 'https://s.io', undefined, principal)).toBe(false);
    expect(permitido('https://github.com/x', 'https://s.io')).toBe(false);
  });
});
