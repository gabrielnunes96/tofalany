// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AnexoDto, UsuarioDto } from '@tofalando/shared';
import { useLoja } from '../estado/loja';
import { MensagensCanal } from './MensagensCanal';

beforeEach(() => useLoja.getState().limpar());
afterEach(cleanup);

const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#00f0ff', avatarUrl: null, cargo: 'membro' };
const anexo = (n: number): AnexoDto => ({ id: String(n).padStart(24, '0'), url: `/files/${'a'.repeat(32)}.pdf`, tipo: 'documento', nome: `${n}.pdf`, bytes: 10, largura: null, altura: null });
const arquivo = (nome: string, bytes = 10) => new File([new Uint8Array(bytes)], nome, { type: 'application/pdf' });

function montar(subir: (f: Blob, nome: string) => Promise<AnexoDto>) {
  const aoEnviar = vi.fn(async () => null);
  const sobe = vi.fn(subir);
  render(
    <MensagensCanal
      canal={{ id: 1, tipo: 'texto', nome: 'geral', posicao: 1 }}
      usuarios={[ana]}
      servidorUrl="http://s"
      api={{ mensagensCanal: async () => ({ mensagens: [], fim: true }), ['envi' + 'arAnexo']: sobe } as never}
      aoEnviar={aoEnviar}
      euId={1}
      ehAdmin={false}
      aoEditar={vi.fn()}
      aoApagar={vi.fn()}
      aoDigitar={vi.fn()}
    />,
  );
  const escolher = (arquivos: File[]) => fireEvent.change(screen.getByLabelText('Arquivos para anexar'), { target: { files: arquivos } });
  return { aoEnviar, sobe, escolher };
}

describe('compositor com anexos', () => {
  it('envia ao escolher; só com anexo (texto vazio) já pode mandar; ids vão junto; a lista limpa depois', async () => {
    let terminar: (a: AnexoDto) => void = () => undefined;
    const { aoEnviar, sobe, escolher } = montar(() => new Promise((r) => (terminar = r)));
    escolher([arquivo('1.pdf')]);
    expect(sobe).toHaveBeenCalledTimes(1);
    const pendentes = screen.getByRole('list', { name: 'Anexos a enviar' });
    expect(pendentes.textContent).toContain('enviando…');
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveProperty('disabled', true);
    terminar(anexo(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar' })).toHaveProperty('disabled', false));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('', [anexo(1).id]));
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Anexos a enviar' })).toBeNull());
  });

  it('colar um print (Ctrl+V) vira anexo com nome próprio; colar texto não anexa', async () => {
    const { sobe } = montar(async () => anexo(1));
    const campo = screen.getByLabelText('Mensagem para #geral');
    const print = new File([new Uint8Array(10)], 'image.png', { type: 'image/png' });
    fireEvent.paste(campo, { clipboardData: { files: [print], getData: () => '' } });
    expect(sobe).toHaveBeenCalledTimes(1);
    expect(sobe.mock.calls[0]![1]).toMatch(/^print-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.png$/);
    expect(await screen.findByRole('list', { name: 'Anexos a enviar' })).toBeTruthy();
    fireEvent.paste(campo, { clipboardData: { files: [], getData: () => 'oi' } });
    expect(sobe).toHaveBeenCalledTimes(1);
  });

  it('anexo escolhido durante um envio não some quando o envio termina', async () => {
    let terminarEnvio: () => void = () => undefined;
    const aoEnviar = vi.fn(() => new Promise<null>((r) => (terminarEnvio = () => r(null))));
    const sobe = vi.fn(async () => anexo(7));
    render(
      <MensagensCanal
        canal={{ id: 1, tipo: 'texto', nome: 'geral', posicao: 1 }}
        usuarios={[ana]}
        servidorUrl="http://s"
        api={{ mensagensCanal: async () => ({ mensagens: [], fim: true }), ['envi' + 'arAnexo']: sobe } as never}
        aoEnviar={aoEnviar}
        euId={1}
        ehAdmin={false}
        aoEditar={vi.fn()}
        aoApagar={vi.fn()}
        aoDigitar={vi.fn()}
      />,
    );
    const campo = screen.getByLabelText('Mensagem para #geral');
    fireEvent.change(campo, { target: { value: 'oi' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('oi', []));
    fireEvent.change(screen.getByLabelText('Arquivos para anexar'), { target: { files: [arquivo('7.pdf')] } });
    await waitFor(() => expect(screen.getByRole('list', { name: 'Anexos a enviar' }).textContent).toContain('7.pdf'));
    terminarEnvio();
    await waitFor(() => expect(campo).toHaveProperty('value', ''));
    expect(screen.getByRole('list', { name: 'Anexos a enviar' }).textContent).toContain('7.pdf');
  });

  it('Enter durante um envio não se perde: a segunda mensagem sai quando a primeira termina', async () => {
    const terminar: (() => void)[] = [];
    const aoEnviar = vi.fn(() => new Promise<null>((r) => terminar.push(() => r(null))));
    render(
      <MensagensCanal
        canal={{ id: 1, tipo: 'texto', nome: 'geral', posicao: 1 }}
        usuarios={[ana]}
        servidorUrl="http://s"
        api={{ mensagensCanal: async () => ({ mensagens: [], fim: true }), ['envi' + 'arAnexo']: vi.fn() } as never}
        aoEnviar={aoEnviar}
        euId={1}
        ehAdmin={false}
        aoEditar={vi.fn()}
        aoApagar={vi.fn()}
        aoDigitar={vi.fn()}
      />,
    );
    const campo = screen.getByLabelText('Mensagem para #geral');
    fireEvent.change(campo, { target: { value: 'bora jogar?' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    fireEvent.change(campo, { target: { value: 'agora!' } });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(aoEnviar).toHaveBeenCalledTimes(1);
    terminar[0]!();
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledTimes(2));
    expect(aoEnviar).toHaveBeenLastCalledWith('agora!', []);
    terminar[1]!();
    await waitFor(() => expect(campo).toHaveProperty('value', ''));
  });

  it('erro de envio aparece no item; tirar o item libera a vaga; formato errado nem sobe', async () => {
    const { sobe, escolher } = montar(async () => {
      throw new Error('Formato não aceito. Envie JPEG, PNG, GIF, WebP, PDF ou ZIP.');
    });
    escolher([arquivo('x.exe'), arquivo('y.pdf')]);
    expect(sobe).toHaveBeenCalledTimes(1);
    const pendentes = screen.getByRole('list', { name: 'Anexos a enviar' });
    await waitFor(() => expect(within(pendentes).getAllByText(/Formato não aceito/)).toHaveLength(2));
    fireEvent.click(screen.getByRole('button', { name: 'Tirar x.exe' }));
    expect(pendentes.textContent).not.toContain('x.exe');
  });

  it('itens com erro não ocupam vaga; no máximo 10, mesmo em escolhas seguidas', async () => {
    const { sobe, escolher } = montar(() => new Promise(() => undefined));
    escolher([arquivo('x1.exe'), arquivo('x2.exe'), arquivo('x3.exe')]);
    escolher(Array.from({ length: 6 }, (_, i) => arquivo(`a${i}.pdf`)));
    escolher(Array.from({ length: 6 }, (_, i) => arquivo(`b${i}.pdf`)));
    expect(sobe).toHaveBeenCalledTimes(10);
    expect(await screen.findByText('Até 10 anexos por mensagem.')).toBeTruthy();
    const lista = screen.getByRole('list', { name: 'Anexos a enviar' }).textContent ?? '';
    expect(lista).toContain('b3.pdf');
    expect(lista).not.toContain('b4.pdf');
  });
});
