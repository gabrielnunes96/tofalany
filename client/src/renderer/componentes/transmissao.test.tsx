// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SeletorTela, somParaLembrar } from './SeletorTela';
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

  it('cinco qualidades: 720p60 e 1080p30 liberadas; num monitor 1080p com 1440p60 salvo, cai para 1080p60 (não 1080p30)', async () => {
    const aoEscolher = vi.fn();
    const fonte = { id: 'screen:1', nome: 'Tela 1', tipo: 'tela' as const, miniatura: 'data:,', largura: 1920, altura: 1080 };
    render(
      <SeletorTela
        listar={async () => [fonte]}
        audioDisponivel={false}
        qualidades={['720p30', '720p60', '1080p30', '1080p60', '1440p60']}
        qualidadePadrao="1440p60"
        aoEscolher={aoEscolher}
        aoCancelar={vi.fn()}
      />,
    );
    await screen.findByText('Tela 1');
    expect((screen.getByLabelText('720p60') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText('1080p30') as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText(/1440p60/) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByText('Tela 1'));
    expect(aoEscolher).toHaveBeenCalledWith(fonte, false, '1080p60');
  });

  it('CA-15: com loja e sem vale, só 720p30; as outras dizem que dá para liberar na loja (2K só pelo cargo)', async () => {
    render(<SeletorTela listar={async () => fontes} audioDisponivel={false} comLoja qualidades={['720p30']} aoEscolher={vi.fn()} aoCancelar={vi.fn()} />);
    await screen.findByText('Tela 1');
    for (const q of ['720p60', '1080p30', '1080p60']) {
      const opcao = screen.getByLabelText(new RegExp(q)) as HTMLInputElement;
      expect(opcao.disabled).toBe(true);
      expect(opcao.closest('label')!.textContent).toContain('(libere na loja)');
    }
    expect(screen.getByLabelText(/1440p60/).closest('label')!.textContent).not.toContain('loja');
    expect(screen.getByText('Acima de 720p30: com um vale da loja ou com o cargo que libera.')).toBeTruthy();
  });

  it('CA-14: com o vale de 1080p60, as quatro primeiras liberadas e o 2K bloqueado', async () => {
    render(
      <SeletorTela
        listar={async () => fontes}
        audioDisponivel={false}
        comLoja
        qualidades={['720p30', '720p60', '1080p30', '1080p60']}
        aoEscolher={vi.fn()}
        aoCancelar={vi.fn()}
      />,
    );
    await screen.findByText('Tela 1');
    for (const q of ['720p30', '720p60', '1080p30', '1080p60']) expect((screen.getByLabelText(new RegExp(q)) as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText(/1440p60/) as HTMLInputElement).disabled).toBe(true);
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
    // Marcado por padrão (o app lembra a última escolha).
    expect((screen.getByLabelText('Incluir o áudio do sistema') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('1080p60') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText('1440p60'));
    fireEvent.click(await screen.findByRole('button', { name: 'Tela 1' }));
    expect(aoEscolher).toHaveBeenCalledWith(fontes[0], true, '1440p60');
    unmount();
    // Quem desmarcou da última vez abre desmarcado.
    const outro = render(<SeletorTela listar={async () => fontes} audioDisponivel audioPadrao={false} aoEscolher={vi.fn()} aoCancelar={vi.fn()} />);
    expect((screen.getByLabelText('Incluir o áudio do sistema') as HTMLInputElement).checked).toBe(false);
    outro.unmount();
    render(<SeletorTela listar={async () => Promise.reject(new Error('x'))} audioDisponivel={false} aoEscolher={vi.fn()} aoCancelar={vi.fn()} />);
    expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível listar');
  });

  it('CA-13/CA-13b: no Windows o som abre desmarcado (mesmo com a última escolha marcada), com o aviso, e dá para marcar', async () => {
    const aoEscolher = vi.fn();
    render(<SeletorTela listar={async () => fontes} audioDisponivel audioPadrao avisoSomChamada aoEscolher={aoEscolher} aoCancelar={vi.fn()} />);
    const caixa = screen.getByLabelText('Incluir o áudio do sistema') as HTMLInputElement;
    expect(caixa.checked).toBe(false);
    expect(caixa.disabled).toBe(false);
    expect(screen.getByText(/quem está na chamada vai se ouvir/)).toBeTruthy();
    fireEvent.click(caixa);
    fireEvent.click(await screen.findByRole('button', { name: 'Tela 1' }));
    expect(aoEscolher).toHaveBeenCalledWith(fontes[0], true, '720p30');
  });

  it('CA-14: sem o aviso (Linux com PipeWire), igual a antes: marcado e sem o texto da chamada', () => {
    render(<SeletorTela listar={async () => fontes} audioDisponivel aoEscolher={vi.fn()} aoCancelar={vi.fn()} />);
    expect((screen.getByLabelText('Incluir o áudio do sistema') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByText(/quem está na chamada vai se ouvir/)).toBeNull();
  });

  it('CA-13b: no Windows a escolha do som não é guardada; no Linux, só quando muda', () => {
    expect(somParaLembrar({ audioDisponivel: true, somLevaChamada: true }, true, undefined)).toBeUndefined();
    expect(somParaLembrar({ audioDisponivel: true, somLevaChamada: true }, false, true)).toBeUndefined();
    expect(somParaLembrar({ audioDisponivel: true, somLevaChamada: false }, false, undefined)).toBe(false);
    expect(somParaLembrar({ audioDisponivel: true, somLevaChamada: false }, true, undefined)).toBeUndefined();
    expect(somParaLembrar({ audioDisponivel: false, somLevaChamada: false }, false, true)).toBeUndefined();
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

  it('item 39: Fechar em tela cheia sai da tela cheia e não reaproveita o elemento do vídeo para o aviso', () => {
    const faixa = { attach: vi.fn(), detach: vi.fn() };
    let emTelaCheia: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => emTelaCheia });
    const sair = vi.fn(async () => {
      emTelaCheia = null;
    });
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: sair });
    try {
      render(<PainelTransmissao nome="dono" faixa={faixa} />);
      fireEvent.click(screen.getByRole('button', { name: 'Assistir' }));
      const grande = screen.getByRole('region', { name: 'Transmissão de dono' });
      emTelaCheia = grande;
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
      expect(sair).toHaveBeenCalledTimes(1);
      const aviso = screen.getByRole('region', { name: 'Transmissão de dono' });
      expect(aviso).not.toBe(grande);
      expect(screen.getByRole('button', { name: 'Assistir' })).toBeTruthy();
    } finally {
      delete (document as unknown as Record<string, unknown>).fullscreenElement;
      delete (document as unknown as Record<string, unknown>).exitFullscreen;
    }
  });

  it('item 39: fechar fora da tela cheia (ou com outra coisa em tela cheia) não mexe na tela cheia', () => {
    const faixa = { attach: vi.fn(), detach: vi.fn() };
    const outro = document.createElement('div');
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => outro });
    const sair = vi.fn(async () => undefined);
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: sair });
    try {
      render(<PainelTransmissao nome="dono" faixa={faixa} />);
      fireEvent.click(screen.getByRole('button', { name: 'Assistir' }));
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
      expect(sair).not.toHaveBeenCalled();
    } finally {
      delete (document as unknown as Record<string, unknown>).fullscreenElement;
      delete (document as unknown as Record<string, unknown>).exitFullscreen;
    }
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

  it('volume da transmissão: só assistindo; mutar, voltar e arrastar', () => {
    const faixa = { attach: vi.fn(), detach: vi.fn() };
    const aoSom = vi.fn();
    const { unmount } = render(<PainelTransmissao nome="dono" faixa={faixa} aoSom={aoSom} />);
    expect(aoSom).toHaveBeenLastCalledWith({ assistindo: false, volume: 1 });
    expect(screen.queryByLabelText('Volume da transmissão')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Assistir' }));
    expect(aoSom).toHaveBeenLastCalledWith({ assistindo: true, volume: 1 });
    fireEvent.change(screen.getByLabelText('Volume da transmissão'), { target: { value: '40' } });
    expect(aoSom).toHaveBeenLastCalledWith({ assistindo: true, volume: 0.4 });
    fireEvent.click(screen.getByRole('button', { name: 'Mutar o som da transmissão' }));
    expect(aoSom).toHaveBeenLastCalledWith({ assistindo: true, volume: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Ligar o som da transmissão' }));
    expect(aoSom).toHaveBeenLastCalledWith({ assistindo: true, volume: 0.4 });
    unmount();
    expect(aoSom).toHaveBeenLastCalledWith({ assistindo: false, volume: 1 });
  });
});

describe('modo teatro e barra de controles (video-teatro-cameras-e-sons, T4)', () => {
  const abrir = () => {
    const faixa = { attach: vi.fn(), detach: vi.fn() };
    const r = render(
      <main className="conteudo">
        <PainelTransmissao nome="dono" faixa={faixa} />
      </main>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Assistir' }));
    return { faixa, ...r };
  };

  it('CA-8: quem assiste tem volume, modo teatro, tela cheia e fechar (sem prévia)', () => {
    abrir();
    for (const nome of ['Volume da transmissão', 'Modo teatro', 'Tela cheia', 'Fechar']) expect(screen.getByLabelText(nome)).toBeTruthy();
    expect(screen.queryByLabelText(/prévia/i)).toBeNull();
  });

  it('CA-6: modo teatro desenhado no <body> (fora do painel do meio); a faixa vai para o vídeo novo; Esc e clique fora saem', () => {
    const { faixa, container } = abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Modo teatro' }));
    const grande = screen.getByRole('region', { name: 'Transmissão de dono' });
    expect(container.contains(grande)).toBe(false);
    expect(grande.closest('.teatro-fundo')?.parentElement).toBe(document.body);
    expect(faixa.attach).toHaveBeenLastCalledWith(screen.getByLabelText('Tela de dono'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.contains(screen.getByRole('region', { name: 'Transmissão de dono' }))).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Modo teatro' }));
    // Clicar no vídeo não sai; clicar no fundo sai.
    fireEvent.click(screen.getByLabelText('Tela de dono'));
    expect(document.querySelector('.teatro-fundo')).toBeTruthy();
    fireEvent.click(document.querySelector('.teatro-fundo')!);
    expect(document.querySelector('.teatro-fundo')).toBeNull();
  });

  it('CA-9: no modo teatro os controles somem com o mouse parado por 3 s e voltam ao mexer', () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Modo teatro' }));
    vi.useFakeTimers();
    try {
      const grande = screen.getByRole('region', { name: 'Transmissão de dono' });
      fireEvent.mouseMove(grande);
      act(() => vi.advanceTimersByTime(2900));
      expect(grande.className).not.toContain('controles-ocultos');
      act(() => vi.advanceTimersByTime(200));
      expect(grande.className).toContain('controles-ocultos');
      fireEvent.mouseMove(grande);
      expect(grande.className).not.toContain('controles-ocultos');
    } finally {
      vi.useRealTimers();
    }
  });

  it('RN-6: entrando no modo teatro sem mexer o mouse, os controles somem sozinhos em 3 s', () => {
    abrir();
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Modo teatro' }));
      const grande = screen.getByRole('region', { name: 'Transmissão de dono' });
      act(() => vi.advanceTimersByTime(3100));
      expect(grande.className).toContain('controles-ocultos');
    } finally {
      vi.useRealTimers();
    }
  });

  it('RF-4: duplo clique no vídeo do painel abre o modo teatro', () => {
    abrir();
    fireEvent.doubleClick(screen.getByLabelText('Tela de dono'));
    expect(document.querySelector('.teatro-fundo')).toBeTruthy();
  });

  it('CA-10: fechar no modo teatro sai do teatro e volta ao aviso', () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Modo teatro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(document.querySelector('.teatro-fundo')).toBeNull();
    expect(screen.getByRole('button', { name: 'Assistir' })).toBeTruthy();
  });
});

describe('transmissão em janela própria (video-teatro-cameras-e-sons, T5)', () => {
  function janelaFalsa() {
    const doc = document.implementation.createHTMLDocument('');
    const ouvintes = new Map<string, () => void>();
    const filha = { document: doc, closed: false, close: vi.fn(), addEventListener: (t: string, f: () => void) => ouvintes.set(t, f), removeEventListener: vi.fn() };
    return { filha, doc, fecharPeloSistema: () => ouvintes.get('pagehide')?.() };
  }

  it('CA-5: abre a transmissão na janela (mesma barra), o app mostra o aviso; fechar a janela volta ao painel; Fechar fecha a janela', async () => {
    const { filha, doc, fecharPeloSistema } = janelaFalsa();
    const abrirJanela = vi.spyOn(window, 'open').mockReturnValue(filha as never);
    const faixa = { attach: vi.fn(), detach: vi.fn() };
    render(<PainelTransmissao id={7} nome="dono" faixa={faixa} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assistir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir em janela própria' }));
    expect(abrirJanela).toHaveBeenCalledWith('about:blank', 'tofalany-transmissao-7', 'popup');
    await vi.waitFor(() => expect(doc.querySelector('[aria-label="Tela de dono"]')).toBeTruthy());
    expect(doc.querySelector('[aria-label="Volume da transmissão"]')).toBeTruthy();
    expect(doc.querySelector('[aria-label="Modo teatro"]')).toBeNull();
    expect(screen.getByText(/numa janela própria/)).toBeTruthy();
    act(() => fecharPeloSistema());
    expect(screen.getByLabelText('Tela de dono')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir em janela própria' }));
    await vi.waitFor(() => expect(doc.querySelectorAll('[aria-label="Tela de dono"]').length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(filha.close).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Assistir' })).toBeTruthy();
    abrirJanela.mockRestore();
  });

  it('a transmissão acabou (o painel sai) com ela numa janela própria: a janela fecha', async () => {
    const { filha, doc } = janelaFalsa();
    vi.spyOn(window, 'open').mockReturnValue(filha as never);
    const { unmount } = render(<PainelTransmissao id={7} nome="dono" faixa={{ attach: vi.fn(), detach: vi.fn() }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Assistir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir em janela própria' }));
    await vi.waitFor(() => expect(doc.querySelector('video')).toBeTruthy());
    unmount();
    expect(filha.close).toHaveBeenCalled();
    vi.restoreAllMocks();
  });
});
