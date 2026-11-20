import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {}, dialog: {}, net: {}, shell: {} }));
const { nomeParaSalvar, podeAbrir, urlPermitida } = await import('./arquivos');

describe('arquivos (main)', () => {
  it('só baixa /files/<id> do servidor configurado', () => {
    const id = 'a'.repeat(32);
    expect(urlPermitida(`http://s:3000/files/${id}.pdf`, 'http://s:3000')).toBe(true);
    expect(urlPermitida(`http://outro:3000/files/${id}.pdf`, 'http://s:3000')).toBe(false);
    expect(urlPermitida('http://s:3000/api/eu', 'http://s:3000')).toBe(false);
    expect(urlPermitida(`file:///etc/passwd`, 'http://s:3000')).toBe(false);
    expect(urlPermitida(`http://s:3000/files/${id}.pdf`, null)).toBe(false);
  });

  it('abre só imagem, PDF e ZIP, mesmo que a pessoa troque a extensão ao salvar', () => {
    expect(podeAbrir('/home/a/relatório.PDF')).toBe(true);
    expect(podeAbrir('C:\\x\\fotos.zip')).toBe(true);
    expect(podeAbrir('/home/a/x.bat')).toBe(false);
    expect(podeAbrir('/home/a/x.exe')).toBe(false);
    expect(podeAbrir('/home/a/sem-extensao')).toBe(false);
  });

  it('nome sugerido sem caminho nem caracteres proibidos', () => {
    expect(nomeParaSalvar('../../relatório: final?.pdf')).toBe('relatório_ final_.pdf');
    expect(nomeParaSalvar('C:\\x\\y.zip')).toBe('y.zip');
    expect(nomeParaSalvar('   ')).toBe('anexo');
  });
});
