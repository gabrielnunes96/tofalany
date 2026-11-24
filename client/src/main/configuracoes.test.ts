import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { criarArmazemConfiguracoes } from './configuracoes';
import { ATALHOS_PADRAO, AUDIO_PADRAO, NOTIFICACOES_PADRAO, SONS_PADRAO, TELA_PADRAO } from '@tofalando/shared';

const pastas: string[] = [];
function arquivoTemp(): string {
  const pasta = mkdtempSync(join(tmpdir(), 'tofalando-cfg-'));
  pastas.push(pasta);
  return join(pasta, 'sub', 'configuracoes.json');
}
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

describe('criarArmazemConfiguracoes', () => {
  it('começa com o padrão quando não há arquivo', () => {
    expect(criarArmazemConfiguracoes(arquivoTemp()).ler()).toEqual({ servidorUrl: null, audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO });
  });

  it('organizar-a-tela (CA-1, RN-8): larguras e pastas validadas e guardadas; teste-de-microfone: contador antigo é ignorado', () => {
    const arquivo = arquivoTemp();
    const c = criarArmazemConfiguracoes(arquivo);
    c.gravar({ colunas: { canais: 320, membros: 9999 }, pastas: [{ id: 'p1', nome: 'Jogos', cor: '#22e4f2', aberta: false, urls: ['https://a'] }] } as never);
    const lido = criarArmazemConfiguracoes(arquivo).ler();
    expect(lido.colunas).toEqual({ canais: 320, membros: 360 });
    expect(lido.pastas).toEqual([{ id: 'p1', nome: 'Jogos', cor: '#22e4f2', aberta: false, urls: ['https://a'] }]);
    c.gravar({ contador: { cores: {} } } as never);
    expect('contador' in criarArmazemConfiguracoes(arquivo).ler()).toBe(false);
  });

  it('grava e relê de outra instância (sobrevive a reinício)', () => {
    const arquivo = arquivoTemp();
    criarArmazemConfiguracoes(arquivo).gravar({ servidorUrl: 'http://100.64.0.1:3000' });
    expect(criarArmazemConfiguracoes(arquivo).ler()).toEqual({ servidorUrl: 'http://100.64.0.1:3000', audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO });
    expect(JSON.parse(readFileSync(arquivo, 'utf8'))).toEqual({ servidorUrl: 'http://100.64.0.1:3000', audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO });
  });

  it('ignora chaves desconhecidas e mantém o valor anterior diante de tipo errado', () => {
    const armazem = criarArmazemConfiguracoes(arquivoTemp());
    armazem.gravar({ servidorUrl: 'http://100.64.0.1:3000' });
    expect(armazem.gravar({ servidorUrl: 42, outra: 'x' } as never)).toEqual({ servidorUrl: 'http://100.64.0.1:3000', audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO });
  });

  it('normaliza a URL e recusa a inválida mantendo a anterior', () => {
    const armazem = criarArmazemConfiguracoes(arquivoTemp());
    expect(armazem.gravar({ servidorUrl: ' fala.exemplo.com/x ' })).toEqual({ servidorUrl: 'http://fala.exemplo.com', audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO });
    expect(armazem.gravar({ servidorUrl: 'javascript:alert(1)' })).toEqual({ servidorUrl: 'http://fala.exemplo.com', audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO });
    expect(armazem.gravar({ servidorUrl: null })).toEqual({ servidorUrl: null, audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO });
  });

  it('servidores guardam a imagem só do mesmo host, em /files/<id>', () => {
    const arm = criarArmazemConfiguracoes(arquivoTemp());
    arm.gravar({
      servidores: [
        { url: 'https://a.io', nome: 'A', icone: 'https://a.io/files/abc.webp' },
        { url: 'https://a.io/c/2', icone: 'https://outro.io/files/abc.webp' },
        { url: 'https://b.io', icone: 'https://b.io/api/eu' },
        { url: 'https://c.io', icone: 'javascript:alert(1)' },
      ],
    });
    expect(arm.ler().servidores).toEqual([
      { url: 'https://a.io', nome: 'A', icone: 'https://a.io/files/abc.webp' },
      { url: 'https://a.io/c/2' },
      { url: 'https://b.io' },
      { url: 'https://c.io' },
    ]);
  });

  it('volta ao padrão com arquivo corrompido', () => {
    const arquivo = arquivoTemp();
    criarArmazemConfiguracoes(arquivo).gravar({ servidorUrl: 'http://a' });
    writeFileSync(arquivo, '{ quebrado', 'utf8');
    expect(criarArmazemConfiguracoes(arquivo).ler()).toEqual({ servidorUrl: null, audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO });
  });

  it('guarda as preferências de áudio validadas (RN-14, CA-30)', () => {
    const arquivo = arquivoTemp();
    const armazem = criarArmazemConfiguracoes(arquivo);
    armazem.gravar({ audio: { ...AUDIO_PADRAO, entradaId: 'mic-2', cancelamentoEco: false } });
    armazem.gravar({ audio: { sensibilidadeDb: 99 } as never });
    expect(criarArmazemConfiguracoes(arquivo).ler().audio).toEqual({ ...AUDIO_PADRAO, entradaId: 'mic-2', cancelamentoEco: false });
  });

  it('volume-da-voz, CA-1: arquivo de uma versão antiga (sem os campos novos) volta com o nivelamento ligado', () => {
    const arquivo = arquivoTemp();
    mkdirSync(dirname(arquivo), { recursive: true });
    writeFileSync(arquivo, JSON.stringify({ servidorUrl: 'http://a', audio: { supressaoRuido: false, sensibilidadeDb: -40 } }), 'utf8');
    expect(criarArmazemConfiguracoes(arquivo).ler().audio).toEqual({ ...AUDIO_PADRAO, supressaoRuido: false, sensibilidadeDb: -40 });
    expect(AUDIO_PADRAO).toMatchObject({ nivelarVoz: true, ganhoMicrofone: 1, volumeChamada: 1 });
  });
});
