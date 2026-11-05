// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AnexoDto } from '@tofalando/shared';
import { ListaAnexos, tamanhoLegivel } from './Anexos';
import { problemaDoArquivo } from './MensagensCanal';

afterEach(cleanup);

const pdf: AnexoDto = { id: 'a'.repeat(24), url: `/files/${'b'.repeat(32)}.pdf`, tipo: 'documento', nome: 'r.pdf', bytes: 5 * 1024 * 1024, largura: null, altura: null };
const img: AnexoDto = { ...pdf, id: 'c'.repeat(24), url: `/files/${'d'.repeat(32)}.png`, tipo: 'imagem', nome: 'f.png', largura: 10, altura: 10 };

describe('regras de anexo no app', () => {
  it('formato e tamanho como o servidor', () => {
    expect(problemaDoArquivo('Foto.JPG', 100)).toBeNull();
    expect(problemaDoArquivo('a.exe', 100)).toContain('Formato não aceito');
    expect(problemaDoArquivo('a.pdf', 25 * 1024 * 1024 + 1)).toBe('O arquivo deve ter no máximo 25 MB.');
  });
  it('tamanho legível', () => {
    expect(tamanhoLegivel(5 * 1024 * 1024)).toBe('5 MB');
    expect(tamanhoLegivel(2.4 * 1024 * 1024)).toBe('2,4 MB');
    expect(tamanhoLegivel(300)).toBe('1 KB');
  });
});

describe('ListaAnexos', () => {
  it('imagem amplia e fecha com Esc; documento baixa pelo processo principal e oferece abrir', async () => {
    const baixar = vi.fn(async () => '/home/x/r.pdf');
    window.tofalando = { arquivos: { baixar, abrir: vi.fn(async () => undefined) } } as never;
    render(<ListaAnexos anexos={[img, pdf]} servidorUrl="http://s" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar imagem f.png' }));
    expect(screen.getByRole('dialog', { name: 'Imagem f.png' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));
    await waitFor(() => expect(baixar).toHaveBeenCalledWith(`http://s${pdf.url}`, 'r.pdf'));
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Salvo em /home/x/r.pdf');
    expect(screen.getByRole('button', { name: 'Abrir' })).toBeTruthy();
  });
});
