import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { criarArmazemConfiguracoes } from './configuracoes';

function arquivoTemp(): string {
  return join(mkdtempSync(join(tmpdir(), 'tofalando-cfg-')), 'sub', 'configuracoes.json');
}

describe('criarArmazemConfiguracoes', () => {
  it('começa com o padrão quando não há arquivo', () => {
    expect(criarArmazemConfiguracoes(arquivoTemp()).ler()).toEqual({ servidorUrl: null });
  });

  it('grava e relê de outra instância (sobrevive a reinício)', () => {
    const arquivo = arquivoTemp();
    criarArmazemConfiguracoes(arquivo).gravar({ servidorUrl: 'http://100.64.0.1:3000' });
    expect(criarArmazemConfiguracoes(arquivo).ler()).toEqual({ servidorUrl: 'http://100.64.0.1:3000' });
    expect(JSON.parse(readFileSync(arquivo, 'utf8'))).toEqual({ servidorUrl: 'http://100.64.0.1:3000' });
  });

  it('ignora chaves desconhecidas e mantém o valor anterior diante de tipo errado', () => {
    const armazem = criarArmazemConfiguracoes(arquivoTemp());
    armazem.gravar({ servidorUrl: 'http://100.64.0.1:3000' });
    expect(armazem.gravar({ servidorUrl: 42, outra: 'x' } as never)).toEqual({ servidorUrl: 'http://100.64.0.1:3000' });
  });

  it('normaliza a URL e recusa a inválida mantendo a anterior', () => {
    const armazem = criarArmazemConfiguracoes(arquivoTemp());
    expect(armazem.gravar({ servidorUrl: ' fala.exemplo.com/x ' })).toEqual({ servidorUrl: 'http://fala.exemplo.com' });
    expect(armazem.gravar({ servidorUrl: 'javascript:alert(1)' })).toEqual({ servidorUrl: 'http://fala.exemplo.com' });
    expect(armazem.gravar({ servidorUrl: null })).toEqual({ servidorUrl: null });
  });

  it('volta ao padrão com arquivo corrompido', () => {
    const arquivo = arquivoTemp();
    criarArmazemConfiguracoes(arquivo).gravar({ servidorUrl: 'http://a' });
    writeFileSync(arquivo, '{ quebrado', 'utf8');
    expect(criarArmazemConfiguracoes(arquivo).ler()).toEqual({ servidorUrl: null });
  });
});
