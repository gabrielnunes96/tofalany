import { describe, expect, it } from 'vitest';
import { mesclarSons, SONS_PADRAO, type TransmissaoDto } from '@tofalando/shared';
import { criarFiltroRepeticao, somAoAbrir, somAoFechar, sonsAoMudarEspectadores } from './sons-transmissao';
import { NOTAS } from '../servicos/sons-voz';

/** video-teatro-cameras-e-sons, T6 (CA-11, CA-12). Ana (1) transmite no canal 10; Bia (2) assiste; Caio (3) só está na sala. */
const t = (espectadores: number[] = []): TransmissaoDto => ({ canalVozId: 10, usuarioId: 1, qualidade: '720p30', espectadores });

describe('sons da transmissão', () => {
  it('abrir e fechar: para quem está no mesmo canal; não para quem transmite nem para outro canal', () => {
    expect(somAoAbrir(t(), 3, 10)).toEqual(['tela-abrir']);
    expect(somAoAbrir(t(), 1, 10)).toEqual([]);
    expect(somAoAbrir(t(), 3, 11)).toEqual([]);
    expect(somAoAbrir(t(), 3, null)).toEqual([]);
    expect(somAoFechar([t()], 10, 1, 3, 10)).toEqual(['tela-fechar']);
    expect(somAoFechar([t()], 10, 1, 1, 10)).toEqual([]);
    expect(somAoFechar([], 10, 1, 3, 10)).toEqual([]);
    // Servidor antigo (sem usuário): todas as do canal.
    expect(somAoFechar([t()], 10, undefined, 3, 10)).toEqual(['tela-fechar']);
  });

  it('CA-11: começar e parar de assistir tocam para quem transmite e quem assiste, não para quem só está na sala', () => {
    expect(sonsAoMudarEspectadores(t([]), [2], 1)).toEqual([{ som: 'assistir-comecar', quem: 2 }]);
    expect(sonsAoMudarEspectadores(t([2]), [2, 4], 2)).toEqual([{ som: 'assistir-comecar', quem: 4 }]);
    expect(sonsAoMudarEspectadores(t([]), [2], 3)).toEqual([]);
    expect(sonsAoMudarEspectadores(t([2]), [], 1)).toEqual([{ som: 'assistir-parar', quem: 2 }]);
    // As minhas próprias ações não tocam para mim (R-5).
    expect(sonsAoMudarEspectadores(t([]), [2], 2)).toEqual([]);
    expect(sonsAoMudarEspectadores(undefined, [2], 1)).toEqual([]);
  });

  it('CA-12: entrar e sair em menos de 1 s não repete', () => {
    let agora = 0;
    const filtro = criarFiltroRepeticao(1000, () => agora);
    expect(filtro('1:2')).toBe(true);
    agora = 500;
    expect(filtro('1:2')).toBe(false);
    expect(filtro('1:3')).toBe(true);
    agora = 1600;
    expect(filtro('1:2')).toBe(true);
  });

  it('preferências: os quatro vêm ligados; valores inválidos ficam no padrão; cada som tem as suas notas', () => {
    expect(SONS_PADRAO).toMatchObject({ telaAbrir: true, telaFechar: true, assistirComecar: true, assistirParar: true });
    expect(mesclarSons(SONS_PADRAO, { telaAbrir: false, assistirParar: 'não' })).toMatchObject({ telaAbrir: false, assistirParar: true });
    for (const som of ['tela-abrir', 'tela-fechar', 'assistir-comecar', 'assistir-parar'] as const) expect(NOTAS[som].freqs.length).toBeGreaterThan(1);
  });
});

describe('CA-12: quem está surdo ou desligou o som não ouve', () => {
  it('deveTocar respeita a preferência de cada som e o surdo', async () => {
    const { deveTocar } = await import('./sons-transmissao');
    expect(deveTocar('tela-abrir', SONS_PADRAO, false)).toBe(true);
    expect(deveTocar('tela-abrir', SONS_PADRAO, true)).toBe(false);
    expect(deveTocar('tela-abrir', { ...SONS_PADRAO, telaAbrir: false }, false)).toBe(false);
    expect(deveTocar('assistir-parar', { ...SONS_PADRAO, telaAbrir: false }, false)).toBe(true);
  });
});
