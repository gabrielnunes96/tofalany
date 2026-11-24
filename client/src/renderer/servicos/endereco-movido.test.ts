import { describe, expect, it } from 'vitest';
import { AUDIO_PADRAO, CONFIGURACOES_PADRAO, type ConfiguracoesLocais } from '@tofalando/shared';
import { destinoMovido, moverConfiguracoes } from './endereco-movido';

const DE = 'https://168-138-133-232.sslip.io';
const PARA = 'https://tofalany.duckdns.org';

describe('endereço movido (infra-e-atualizacao, RF-4, T-6)', () => {
  it('só o host exato do mapa, só https; mantém o /c/<id>', () => {
    expect(destinoMovido(DE)).toBe(PARA);
    expect(destinoMovido(`${DE}/c/3`)).toBe(`${PARA}/c/3`);
    expect(destinoMovido('https://168-138-133-232.sslip.io.evil.com')).toBeUndefined();
    expect(destinoMovido('http://168-138-133-232.sslip.io')).toBeUndefined();
    expect(destinoMovido('https://outro.exemplo')).toBeUndefined();
    expect(destinoMovido(DE, { [DE]: 'http://inseguro.exemplo' })).toBeUndefined();
  });

  it('move servidores, aberto, status e preferências por pessoa; sem repetir, sem a imagem antiga; outros servidores intactos', () => {
    const c = {
      servidorUrl: `${DE}/c/2`,
      audio: AUDIO_PADRAO,
      servidores: [
        { url: DE, nome: 'ToFalany', icone: `${DE}/files/a.webp` },
        { url: `${DE}/c/2`, nome: 'Família' },
        { url: PARA, nome: 'ToFalany' },
        { url: 'https://outro.exemplo', nome: 'Outro', icone: 'https://outro.exemplo/files/b.webp' },
      ],
      statusEscolhido: { [DE]: 'ausente', 'https://outro.exemplo': 'naoIncomodar' },
      pessoas: { [`${DE}/c/2`]: { volumes: { '3': 1.5 }, silenciados: [] } },
    } as unknown as ConfiguracoesLocais;
    const r = moverConfiguracoes(c, DE, PARA);
    expect(r.servidorUrl).toBe(`${PARA}/c/2`);
    // A entrada que já estava no endereço novo vale (no lugar dela); a antiga equivalente sai.
    expect(r.servidores).toEqual([
      { url: `${PARA}/c/2`, nome: 'Família' },
      { url: PARA, nome: 'ToFalany' },
      { url: 'https://outro.exemplo', nome: 'Outro', icone: 'https://outro.exemplo/files/b.webp' },
    ]);
    expect(r.statusEscolhido).toEqual({ [PARA]: 'ausente', 'https://outro.exemplo': 'naoIncomodar' });
    expect(r.pessoas).toEqual({ [`${PARA}/c/2`]: { volumes: { '3': 1.5 }, silenciados: [] } });
  });

  it('organizar-a-tela e atalhos-de-sons: pastas e atalhos dos sons vão junto com o endereço', () => {
    const f1 = { codigo: 'F1', ctrl: false, alt: false, shift: false, meta: false };
    const c = {
      ...CONFIGURACOES_PADRAO,
      servidores: [{ url: DE }, { url: 'https://outro.io' }],
      pastas: [{ id: 'p1', nome: '', cor: '#7c6cff', aberta: true, urls: [DE, 'https://outro.io'] }],
      atalhosSons: { globais: {}, porServidor: { [DE]: { 1: f1 }, 'https://outro.io': { 2: f1 } } },
    };
    const p = moverConfiguracoes(c, DE, PARA);
    expect(p.pastas![0]!.urls).toEqual([PARA, 'https://outro.io']);
    expect(Object.keys(p.atalhosSons!.porServidor).sort()).toEqual(['https://outro.io', PARA]);
  });
});
