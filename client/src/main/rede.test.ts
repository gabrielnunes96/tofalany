import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ session: { defaultSession: { webRequest: { onBeforeRequest: vi.fn() } } } }));
const { criarEstadoGif, permitido } = await import('./rede');

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

  it('outros servidores conhecidos: só GET /api/nao-lidas, sem parâmetros', () => {
    const conhecidos = ['https://outro.io', 'http://10.0.0.5:3000'];
    expect(permitido('https://outro.io/api/nao-lidas', 'https://s.io', undefined, { conhecidos })).toBe(true);
    expect(permitido('http://10.0.0.5:3000/api/nao-lidas', 'https://s.io', undefined, { conhecidos, metodo: 'GET' })).toBe(true);
    expect(permitido('https://outro.io/api/eu', 'https://s.io', undefined, { conhecidos })).toBe(false);
    expect(permitido('https://outro.io/api/nao-lidas?x=1', 'https://s.io', undefined, { conhecidos })).toBe(false);
    expect(permitido('https://outro.io/api/nao-lidas', 'https://s.io', undefined, { conhecidos, metodo: 'POST' })).toBe(false);
    expect(permitido('wss://outro.io/api/nao-lidas', 'https://s.io', undefined, { conhecidos })).toBe(false);
    expect(permitido('https://estranho.io/api/nao-lidas', 'https://s.io', undefined, { conhecidos })).toBe(false);
  });

  it('atualização: o processo principal fala com o GitHub por HTTPS; a janela não', () => {
    const principal = { doProcessoPrincipal: true };
    expect(permitido('https://github.com/gabrielnunes96/tofalany/releases/download/v0.2.0/latest.yml', 'https://s.io', undefined, principal)).toBe(true);
    expect(permitido('https://release-assets.githubusercontent.com/x', 'https://s.io', undefined, principal)).toBe(true);
    expect(permitido('http://github.com/x', 'https://s.io', undefined, principal)).toBe(false);
    expect(permitido('https://github.com.mal.io/x', 'https://s.io', undefined, principal)).toBe(false);
    expect(permitido('https://github.com/x', 'https://s.io')).toBe(false);
  });

  it('busca de GIF: só a API e a mídia da Klipy, em https, com a busca ligada (CA-1, CA-6)', () => {
    const ligado = { gifLigado: true };
    for (const url of ['https://api.klipy.com/api/v1/k/gifs/search?q=gato', 'https://static.klipy.com/ii/a.webp', 'https://static2.klipy.com/ii/a.gif'])
      expect([url, permitido(url, servidor)]).toEqual([url, false]);
    for (const url of ['https://api.klipy.com/api/v1/k/gifs/trending', 'https://static.klipy.com/ii/a.webp', 'https://static1.klipy.com/a.gif', 'https://static2.klipy.com/a.gif'])
      expect([url, permitido(url, servidor, undefined, ligado)]).toEqual([url, true]);
    for (const url of [
      'http://api.klipy.com/api/v1/k/gifs/trending',
      'https://static.klipy.com:8443/a.gif',
      'https://klipy.com/',
      'https://evil-klipy.com/a.gif',
      'https://static.klipy.com.evil.io/a.gif',
      'https://partner.klipy.com/',
      'wss://api.klipy.com/x',
    ])
      expect([url, permitido(url, servidor, undefined, ligado)]).toEqual([url, false]);
  });

  it('busca de GIF: só o servidor atual libera; desligar tira; cada comunidade é separada; lixo é ignorado', () => {
    const e = criarEstadoGif(2);
    e.marcar('https://a.com', true);
    expect(e.ligado('https://a.com')).toBe(true);
    expect(e.ligado('https://a.com/')).toBe(true);
    expect(e.ligado('https://b.com')).toBe(false);
    expect(e.ligado(null)).toBe(false);
    e.marcar('https://a.com/', false);
    expect(e.ligado('https://a.com')).toBe(false);
    e.marcar(42, true);
    e.marcar('ftp://x', true);
    e.marcar('https://b.com', true);
    e.marcar('https://c.com', true);
    e.marcar('https://d.com', true);
    expect([e.ligado('https://b.com'), e.ligado('https://c.com'), e.ligado('https://d.com')]).toEqual([true, true, false]);
  });

  it('0.17.1: fechar a tela de outra comunidade do mesmo endereço não desliga a busca da que está aberta', () => {
    const e = criarEstadoGif();
    e.marcar('https://a.com', true);
    e.marcar('https://a.com/c/2', true);
    e.marcar('https://a.com/c/2', false);
    expect(e.ligado('https://a.com')).toBe(true);
    expect(e.ligado('https://a.com/c/2')).toBe(false);
  });
});
