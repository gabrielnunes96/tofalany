// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MensagemDto, PedidoBusca, ResultadoBusca, UsuarioDto } from '@tofalando/shared';
import { ErroApiCliente } from '../servicos/api';
import { PainelBusca } from './PainelBusca';

/** chat-fixar-e-buscar, T7: campo "Buscar" e painel de resultados. */
afterEach(cleanup);

const ana: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#00f0ff', avatarUrl: null, cargo: 'membro' };
const m = (id: number, texto: string, canalId = 1): MensagemDto => ({
  id,
  canalId,
  dmId: null,
  autorId: 1,
  texto,
  criadaEm: 1_700_000_000_000,
  editadaEm: null,
  anexos: [],
});
const canais = [
  { id: 1, tipo: 'texto' as const, nome: 'geral', posicao: 1 },
  { id: 2, tipo: 'texto' as const, nome: 'jogos', posicao: 2 },
];

function painel(props: Partial<Parameters<typeof PainelBusca>[0]> = {}) {
  const buscar = vi.fn(async (_p: PedidoBusca): Promise<{ resultados: ResultadoBusca[]; mais: boolean }> => ({ resultados: [], mais: false }));
  const aoAbrir = vi.fn();
  render(
    <PainelBusca
      conversa={{ canalId: 1 }}
      termo="voce jog"
      pedido={1}
      buscar={buscar}
      usuarios={[ana]}
      canais={canais}
      aoAbrir={aoAbrir}
      aoFechar={vi.fn()}
      {...props}
    />,
  );
  return { buscar: (props.buscar as typeof buscar | undefined) ?? buscar, aoAbrir };
}

describe('PainelBusca', () => {
  it('CA-8: busca na conversa aberta e destaca os trechos com <mark>, como texto', async () => {
    const texto = 'Você vai jogar hoje? <img src=x onerror=alert(1)>';
    const buscar = vi.fn(async () => ({
      resultados: [
        {
          mensagem: m(5, texto),
          destaques: [
            [0, 4],
            [9, 14],
          ] as [number, number][],
        },
      ],
      mais: false,
    }));
    painel({ buscar });
    await waitFor(() => expect(buscar).toHaveBeenCalledWith({ q: 'voce jog', onde: 'conversa', canalId: 1 }));
    await waitFor(() => expect(document.querySelectorAll('mark')).toHaveLength(2));
    expect([...document.querySelectorAll('mark')].map((x) => x.textContent)).toEqual(['Você', 'jogar']);
    expect(document.querySelector('.lista-resultados img')).toBeNull();
    expect(screen.getByText(/onerror/)).toBeTruthy();
  });

  it('CA-15: 1 letra sem filtro não chama o servidor e avisa', async () => {
    const { buscar } = painel({ termo: 'a' });
    expect(await screen.findByText('Digite pelo menos 2 letras.')).toBeTruthy();
    expect(buscar).not.toHaveBeenCalled();
  });

  it('CA-10/CA-11/CA-12: filtros vão no pedido; "todos os canais" mostra o nome do canal; mais resultados manda "antes"', async () => {
    const buscar = vi.fn(async (p: PedidoBusca) =>
      p.antes
        ? { resultados: [{ mensagem: m(3, 'churrasco antigo'), destaques: [] }], mais: false }
        : { resultados: [{ mensagem: m(9, 'churrasco', 2), destaques: [] }], mais: true },
    );
    painel({ buscar, termo: 'churrasco' });
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('Onde'), { target: { value: 'todos' } });
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith({ q: 'churrasco', onde: 'servidor' }));
    expect(await screen.findByText('#jogos')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('De quem'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Com anexo'));
    fireEvent.click(screen.getByLabelText('Com GIF'));
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith({ q: 'churrasco', onde: 'servidor', autorId: 1, comAnexo: true, comGif: true }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mais resultados' }));
    await waitFor(() => expect(buscar).toHaveBeenLastCalledWith(expect.objectContaining({ antes: 9 })));
    expect(await screen.findByText('churrasco antigo')).toBeTruthy();
  });

  it('na DM, "todas as minhas DMs"; clicar no resultado abre a mensagem; erro do servidor (429) aparece', async () => {
    const dmMsg = { ...m(4, 'oi'), canalId: null, dmId: 7 };
    let falhar = false;
    const buscar = vi.fn(async () => {
      if (falhar) throw new ErroApiCliente(429, 'muitas_tentativas', 'Muitas buscas seguidas. Espere alguns segundos.');
      return { resultados: [{ mensagem: dmMsg, destaques: [] }], mais: false };
    });
    const aoAbrir = vi.fn();
    render(
      <PainelBusca conversa={{ dmId: 7 }} termo="oi oi" pedido={1} buscar={buscar} usuarios={[ana]} canais={canais} aoAbrir={aoAbrir} aoFechar={vi.fn()} />,
    );
    expect(screen.getByRole('option', { name: 'Em todas as minhas DMs' })).toBeTruthy();
    fireEvent.click(await screen.findByText('oi'));
    expect(aoAbrir).toHaveBeenCalledWith(dmMsg);
    falhar = true;
    fireEvent.change(screen.getByLabelText('Onde'), { target: { value: 'todos' } });
    expect(await screen.findByText('Muitas buscas seguidas. Espere alguns segundos.')).toBeTruthy();
  });
});
