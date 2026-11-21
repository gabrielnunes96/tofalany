// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { GifDto, MensagemDto, PaginaMensagens, UsuarioDto } from '@tofalando/shared';
import { useLoja } from '../estado/loja';
import { MensagensCanal, podeSerComando } from './MensagensCanal';
import { ItemMensagem } from './ItemMensagem';
import { GifMensagem } from './GifMensagem';
import { decidirMensagemNova } from '../estado/notificar';
import type { Klipy } from '../servicos/gif';

beforeEach(() => useLoja.getState().limpar());
afterEach(cleanup);

const extras = { euId: 1, ehAdmin: false, aoEditar: vi.fn(async () => null), aoApagar: vi.fn(async () => null), aoDigitar: vi.fn() };
const canal = { id: 1, tipo: 'texto' as const, nome: 'geral', posicao: 1 };
const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#00f0ff', avatarUrl: null, cargo: 'membro' };
const beto: UsuarioDto = { id: 2, usuario: 'beto', nomeExibicao: 'Beto', cor: '#fff', avatarUrl: null, cargo: 'membro' };
const GIF: GifDto = { slug: 'gato-1', url: 'https://static.klipy.com/gato-md.webp', largura: 600, altura: 300, descricao: 'Gato dançando' };
const msg = (id: number, autorId = 1, extra: Partial<MensagemDto> = {}): MensagemDto => ({
  id,
  canalId: 1,
  dmId: null,
  autorId,
  texto: `texto ${id}`,
  criadaEm: 1_700_000_000_000 + id,
  editadaEm: null,
  anexos: [],
  ...extra,
});

function klipyFalsa(): Klipy {
  return {
    emAlta: vi.fn(async () => ({
      itens: [{ slug: GIF.slug, descricao: GIF.descricao, miniatura: { url: 'https://static.klipy.com/gato-sm.webp', largura: 220, altura: 110 }, gif: GIF }],
      temMais: false,
    })),
    buscar: vi.fn(async () => ({ itens: [], temMais: false })),
    compartilhar: vi.fn(async () => undefined),
  };
}

function montar(aoEnviar: (t: string, a: string[], o?: object) => Promise<string | null>, klipy?: Klipy, mensagens: MensagemDto[] = []) {
  const mensagensCanal = vi.fn(async (): Promise<PaginaMensagens> => ({ mensagens, fim: true }));
  render(
    <MensagensCanal
      canal={canal}
      usuarios={[ana, beto]}
      servidorUrl="http://s"
      api={{ mensagensCanal, enviarAnexo: vi.fn() }}
      aoEnviar={aoEnviar}
      klipy={klipy}
      {...extras}
    />,
  );
}

describe('GIF no compositor (T4)', () => {
  it('CA-1: sem busca ligada, não há botão GIF', () => {
    montar(vi.fn(async () => null));
    expect(screen.queryByRole('button', { name: 'Enviar GIF' })).toBeNull();
  });

  it('CA-4/CA-5/CA-10: escolher envia com o texto e a resposta em andamento, limpa e registra o envio na Klipy', async () => {
    const aoEnviar = vi.fn(async () => null);
    const klipy = klipyFalsa();
    montar(aoEnviar, klipy, [{ ...msg(5, 2), texto: 'bom dia' }]);
    await screen.findByText('bom dia');
    fireEvent.click(screen.getByRole('button', { name: 'Responder' }));
    const campo = screen.getByLabelText('Mensagem para #geral') as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: 'olha isso' } });
    const botao = screen.getByRole('button', { name: 'Enviar GIF' });
    fireEvent.click(botao);
    expect(botao.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(await screen.findByRole('button', { name: 'Gato dançando' }));
    await waitFor(() => expect(aoEnviar).toHaveBeenCalledWith('olha isso', [], { respostaA: 5, avisar: true, gif: GIF }));
    await waitFor(() => expect(campo.value).toBe(''));
    expect(screen.queryByRole('dialog', { name: 'Escolher GIF' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Respondendo a Beto' })).toBeNull();
    expect(klipy.compartilhar).toHaveBeenCalledWith('gato-1', '');
  });

  it('busca: Enter no campo não envia a mensagem; o registro leva o termo buscado; GIF nunca vira comando do bot', async () => {
    const aoEnviar = vi.fn(async () => null);
    const klipy = klipyFalsa();
    (klipy.buscar as ReturnType<typeof vi.fn>).mockImplementation(async () => await klipy.emAlta());
    montar(aoEnviar, klipy);
    fireEvent.change(screen.getByLabelText('Mensagem para #geral'), { target: { value: '/tocar algo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar GIF' }));
    const busca = screen.getByRole('searchbox', { name: 'Buscar GIF' });
    fireEvent.change(busca, { target: { value: 'gato' } });
    fireEvent.keyDown(busca, { key: 'Enter' });
    await waitFor(() => expect(klipy.buscar).toHaveBeenCalledWith('gato', 1), { timeout: 2000 });
    fireEvent.click(await screen.findByRole('group', { name: 'Resultados de gato' }).then((g) => g.querySelector('button')!));
    await waitFor(() => expect(klipy.compartilhar).toHaveBeenCalledWith('gato-1', 'gato'));
    expect(aoEnviar).toHaveBeenCalledTimes(1);
    expect(podeSerComando([], { gif: GIF })).toBe(false);
    expect(podeSerComando([], {})).toBe(true);
  });

  it('CA-2: recusa do servidor aparece, o texto fica e nada é registrado na Klipy', async () => {
    const klipy = klipyFalsa();
    montar(
      vi.fn(async () => 'Seu cargo não permite enviar arquivos nos canais.'),
      klipy,
    );
    const campo = screen.getByLabelText('Mensagem para #geral') as HTMLTextAreaElement;
    fireEvent.change(campo, { target: { value: 'oi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar GIF' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Gato dançando' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Seu cargo não permite enviar arquivos nos canais.');
    expect(campo.value).toBe('oi');
    expect(klipy.compartilhar).not.toHaveBeenCalled();
  });

  it('CA-11: Esc fecha o painel e devolve o foco ao botão GIF', async () => {
    montar(
      vi.fn(async () => null),
      klipyFalsa(),
    );
    const botao = screen.getByRole('button', { name: 'Enviar GIF' });
    fireEvent.click(botao);
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Buscar GIF' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Escolher GIF' })).toBeNull();
    expect(document.activeElement).toBe(botao);
  });
});

describe('GIF na mensagem (T4)', () => {
  it('CA-12: mostra o texto sem o endereço, o GIF com tamanho e descrição, sem prévia do link; edição sem o endereço', () => {
    const m = msg(7, 2, { texto: `olha isso\n${GIF.url}`, gif: GIF });
    render(
      <ul>
        <ItemMensagem
          mensagem={m}
          autor={beto}
          servidorUrl="http://s"
          podeEditar
          podeApagar
          aoEditar={vi.fn(async () => null)}
          aoApagar={vi.fn(async () => null)}
        />
      </ul>,
    );
    const item = screen.getByRole('listitem');
    expect(item.querySelector('.mensagem-texto')!.textContent).toBe('olha isso');
    expect(item.textContent).not.toContain('static.klipy.com');
    const img = screen.getByRole('img', { name: 'Gato dançando' }) as HTMLImageElement;
    expect([img.getAttribute('src'), img.width, img.height]).toEqual([GIF.url, 300, 150]);
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect((screen.getByLabelText('Editar mensagem') as HTMLTextAreaElement).value).toBe('olha isso');
  });

  it('só GIF: sem parágrafo de texto; o texto pode ser apagado na edição', async () => {
    const aoEditar = vi.fn(async () => null);
    const m = msg(8, 1, { texto: GIF.url, gif: GIF });
    render(
      <ul>
        <ItemMensagem mensagem={m} autor={ana} servidorUrl="http://s" podeEditar podeApagar aoEditar={aoEditar} aoApagar={vi.fn(async () => null)} />
      </ul>,
    );
    expect(screen.getByRole('listitem').querySelector('.mensagem-texto')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(aoEditar).toHaveBeenCalledWith(8, ''));
  });

  it('GIF tirado do ar mostra "GIF indisponível"', () => {
    render(<GifMensagem gif={{ ...GIF, descricao: '' }} />);
    const img = screen.getByRole('img', { name: 'GIF' });
    fireEvent.error(img);
    expect(screen.getByText('GIF indisponível')).toBeTruthy();
  });

  it('notificação: texto sem o endereço; só GIF vira "GIF"', () => {
    const contexto = { euId: 1, usuarios: [ana, beto], canais: [canal], chaveAberta: null, focado: false };
    expect(decidirMensagemNova(msg(9, 2, { texto: GIF.url, gif: GIF }), contexto)?.notificacao?.corpo).toBe('GIF');
    expect(decidirMensagemNova(msg(10, 2, { texto: `oi\n${GIF.url}`, gif: GIF }), contexto)?.notificacao?.corpo).toBe('oi');
  });
});
