// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { AtualizarAgora } from './AtualizarAgora';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

type Estado = { versao: string; modo: 'reiniciar' | 'pagina'; pedido?: boolean };
type Resultado = { situacao: 'atualizado' | 'nova' | 'baixando' | 'pronta' | 'erro' | 'indisponivel'; versao?: string };

function ponte(resultado: Resultado, inicial: Estado | null = null) {
  const ouvintes: { estado?: (e: Estado) => void; progresso?: (p: number) => void; falha?: () => void } = {};
  const api = {
    estado: vi.fn(async () => inicial),
    aoMudar: vi.fn((fn: (e: Estado) => void) => ((ouvintes.estado = fn), () => undefined)),
    instalar: vi.fn(async () => undefined),
    abrirPagina: vi.fn(async () => undefined),
    procurar: vi.fn(async () => resultado),
    agora: vi.fn(async () => resultado),
    recusar: vi.fn(async () => undefined),
    aoProgresso: vi.fn((fn: (p: number) => void) => ((ouvintes.progresso = fn), () => undefined)),
    aoFalhar: vi.fn((fn: () => void) => ((ouvintes.falha = fn), () => undefined)),
  };
  return { api, ouvintes };
}

async function montar(resultado: Resultado, emChamada = false, inicial: Estado | null = null) {
  const p = ponte(resultado, inicial);
  const controle = createRef<(() => void) | null>() as { current: (() => void) | null };
  render(<AtualizarAgora atualizacao={p.api} controleRef={controle} emChamada={emChamada} />);
  await act(async () => undefined);
  return { ...p, clicar: () => act(async () => controle.current?.()) };
}

describe('Atualizar o app (qualidade-de-vida, RF-5, T-7)', () => {
  it('CA-8: baixando mostra o progresso; pronta fora de chamada instala sozinho', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { api, ouvintes, clicar } = await montar({ situacao: 'baixando', versao: '0.18.0' });
    await clicar();
    expect(screen.getByText(/Baixando a versão 0.18.0… 0%/)).toBeTruthy();
    act(() => ouvintes.progresso!(57));
    expect(screen.getByText(/57%/)).toBeTruthy();
    act(() => ouvintes.estado!({ versao: '0.18.0', modo: 'reiniciar', pedido: true }));
    await act(async () => undefined);
    expect(screen.getByText(/Atualizando o ToFalany para a versão 0.18.0/)).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(700));
    expect(api.instalar).toHaveBeenCalled();
  });

  it('clicar de novo durante o download não recomeça nem zera o progresso', async () => {
    const { api, ouvintes, clicar } = await montar({ situacao: 'baixando', versao: '0.18.0' });
    await clicar();
    act(() => ouvintes.progresso!(30));
    await clicar();
    expect(api.agora).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/30%/)).toBeTruthy();
  });

  it('CA-8b: em chamada, "Reiniciar agora" instala; o foco começa em "Depois" e Esc recusa', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const um = await montar({ situacao: 'baixando', versao: '0.18.0' }, true);
    await um.clicar();
    act(() => um.ouvintes.estado!({ versao: '0.18.0', modo: 'reiniciar', pedido: true }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Depois' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar agora' }));
    await act(async () => vi.advanceTimersByTimeAsync(700));
    expect(um.api.instalar).toHaveBeenCalled();
    cleanup();
    const outro = await montar({ situacao: 'baixando', versao: '0.18.0' }, true);
    await outro.clicar();
    act(() => outro.ouvintes.estado!({ versao: '0.18.0', modo: 'reiniciar', pedido: true }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Depois' }), { key: 'Escape' });
    expect(outro.api.recusar).toHaveBeenCalled();
    expect(outro.api.instalar).not.toHaveBeenCalled();
  });

  it('CA-8b: em chamada pergunta antes; "Depois" recusa e não instala', async () => {
    const { api, ouvintes, clicar } = await montar({ situacao: 'baixando', versao: '0.18.0' }, true);
    await clicar();
    act(() => ouvintes.estado!({ versao: '0.18.0', modo: 'reiniciar', pedido: true }));
    expect(screen.getByRole('alertdialog', { name: 'Atualizar o app' }).textContent).toContain('Reiniciar agora? Você vai sair da chamada.');
    fireEvent.click(screen.getByRole('button', { name: 'Depois' }));
    expect(api.recusar).toHaveBeenCalled();
    expect(api.instalar).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('versão pronta sem pedido (conferência automática) não é com ele: fica o aviso do canto', async () => {
    const { api, ouvintes } = await montar({ situacao: 'atualizado' });
    act(() => ouvintes.estado!({ versao: '0.18.0', modo: 'reiniciar' }));
    expect(screen.queryByText(/Atualizando/)).toBeNull();
    expect(api.instalar).not.toHaveBeenCalled();
  });

  it('CA-9 e CA-10: textos de "já na mais nova" e "só no app instalado"', async () => {
    const um = await montar({ situacao: 'atualizado' });
    await um.clicar();
    expect(screen.getByText('Você já está na versão mais nova.')).toBeTruthy();
    cleanup();
    const outro = await montar({ situacao: 'indisponivel' });
    await outro.clicar();
    expect(screen.getByText('A atualização só funciona no app instalado.')).toBeTruthy();
  });

  it('pacote que não se instala sozinho abre a página; falha do download avisa', async () => {
    const { api, ouvintes, clicar } = await montar({ situacao: 'nova', versao: '0.18.0' });
    await clicar();
    expect(api.abrirPagina).toHaveBeenCalled();
    expect(screen.getByText(/A versão 0.18.0 está disponível/)).toBeTruthy();
    act(() => ouvintes.falha!());
    expect(screen.getByText('Não deu para baixar a atualização. Tente de novo mais tarde.')).toBeTruthy();
  });

  it('janela recarregada com versão pronta do pedido: pergunta', async () => {
    await montar({ situacao: 'atualizado' }, false, { versao: '0.18.0', modo: 'reiniciar', pedido: true });
    expect(screen.getByRole('alertdialog', { name: 'Atualizar o app' })).toBeTruthy();
  });
});
