// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SeletorTela } from './SeletorTela';
import { PainelTransmissao } from './PainelTransmissao';

afterEach(cleanup);

const fontes = [
  { id: 'screen:1', nome: 'Tela 1', tipo: 'tela' as const, miniatura: 'data:,' },
  { id: 'window:2', nome: 'Jogo', tipo: 'janela' as const, miniatura: 'data:,' },
];

describe('SeletorTela (RF-26, RF-29)', () => {
  it('mostra telas e janelas, escolhe com o áudio; sem PipeWire o áudio fica desabilitado com o motivo; Esc cancela', async () => {
    const aoEscolher = vi.fn();
    const aoCancelar = vi.fn();
    render(<SeletorTela listar={async () => fontes} audioDisponivel={false} aoEscolher={aoEscolher} aoCancelar={aoCancelar} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }));
    const janela = await screen.findByRole('button', { name: 'Jogo' });
    expect(screen.getByRole('region', { name: 'Telas' })).toBeTruthy();
    expect((screen.getByLabelText('Incluir o áudio do sistema') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/precisa do PipeWire/)).toBeTruthy();
    fireEvent.click(janela);
    expect(aoEscolher).toHaveBeenCalledWith(fontes[1], false, '720p30');
    // CA-39a: membro só tem 720p30 (já selecionado).
    expect((screen.getByLabelText('1440p60') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('720p30') as HTMLInputElement).checked).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(aoCancelar).toHaveBeenCalled();
  });

  it('monitor 1080p: 1440p fica desligado com o motivo; escolher a tela usa a maior qualidade que cabe', async () => {
    const aoEscolher = vi.fn();
    const fonte = { id: 'screen:1', nome: 'Tela 1', tipo: 'tela' as const, miniatura: 'data:,', largura: 1920, altura: 1080 };
    render(
      <SeletorTela
        listar={async () => [fonte]}
        audioDisponivel={false}
        qualidades={['720p30', '1080p60', '1440p60']}
        qualidadePadrao="1440p60"
        aoEscolher={aoEscolher}
        aoCancelar={vi.fn()}
      />,
    );
    await screen.findByText('Tela 1');
    const q1440 = screen.getByLabelText(/1440p60/) as HTMLInputElement;
    expect(q1440.disabled).toBe(true);
    expect(q1440.closest('label')!.title).toContain('Não encontramos um monitor com 1440p');
    expect((screen.getByLabelText(/1080p60/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByText('Tela 1'));
    expect(aoEscolher).toHaveBeenCalledWith(fonte, false, '1080p60');
  });

  it('Windows: áudio do sistema pode ir junto; erro ao listar aparece', async () => {
    const aoEscolher = vi.fn();
    const { unmount } = render(
      <SeletorTela
        listar={async () => fontes}
        audioDisponivel
        qualidades={['720p30', '1080p60', '1440p60']}
        qualidadePadrao="1080p60"
        aoEscolher={aoEscolher}
        aoCancelar={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Incluir o áudio do sistema'));
    expect((screen.getByLabelText('1080p60') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('1440p60'));
    fireEvent.click(await screen.findByRole('button', { name: 'Tela 1' }));
    expect(aoEscolher).toHaveBeenCalledWith(fontes[0], true, '1440p60');
    unmount();
    render(<SeletorTela listar={async () => Promise.reject(new Error('x'))} audioDisponivel={false} aoEscolher={vi.fn()} aoCancelar={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível listar');
  });
});

describe('PainelTransmissao (RF-30)', () => {
  it('aviso com Assistir; grande com tela cheia; Fechar volta ao aviso', () => {
    const faixa = { attach: vi.fn(), detach: vi.fn() };
    const { rerender } = render(<PainelTransmissao nome="dono" faixa={undefined} />);
    expect((screen.getByRole('button', { name: 'Conectando…' }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<PainelTransmissao nome="dono" faixa={faixa} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assistir' }));
    expect(faixa.attach).toHaveBeenCalledWith(screen.getByLabelText('Tela de dono'));
    expect(screen.getByRole('button', { name: 'Tela cheia' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(faixa.detach).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Assistir' })).toBeTruthy();
  });

  it('quem assiste: avisa ao abrir e fechar; olho com o número e a lista de nomes', () => {
    const faixa = { attach: vi.fn(), detach: vi.fn() };
    const aoAssistir = vi.fn();
    const { rerender } = render(<PainelTransmissao nome="dono" faixa={faixa} espectadores={[]} aoAssistir={aoAssistir} />);
    expect(screen.getByRole('button', { name: 'Ninguém assistindo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Assistir' }));
    expect(aoAssistir).toHaveBeenLastCalledWith(true);
    rerender(<PainelTransmissao nome="dono" faixa={faixa} espectadores={['Zé', 'Ana']} aoAssistir={aoAssistir} />);
    fireEvent.click(screen.getByRole('button', { name: '2 pessoas assistindo' }));
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ana', 'Zé']);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(aoAssistir).toHaveBeenLastCalledWith(false);
    expect(aoAssistir).toHaveBeenCalledTimes(2);
  });
});
