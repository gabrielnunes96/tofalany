// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TextoComLinks } from './Previa';
import { ContextoConvite } from './ContextoConvite';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const texto = 'Convite para o servidor Família: https://s.exemplo/c/2/convite/abc123 e outro https://outro.exemplo/convite/zzz';

function montar(abrir = vi.fn(async () => null as string | null), atual = 'https://s.exemplo') {
  render(
    <ContextoConvite.Provider value={{ base: 'https://s.exemplo', atual, abrir }}>
      <TextoComLinks texto={texto} />
    </ContextoConvite.Provider>,
  );
  return abrir;
}

describe('link de convite clicável (qualidade-de-vida, RF-4, CA-7)', () => {
  it('mesmo endereço: pede confirmação e abre o convite pelo app', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const abrir = montar();
    const link = screen.getByRole('link', { name: 'https://s.exemplo/c/2/convite/abc123' });
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(window.confirm).toHaveBeenCalledWith('Entrar no servidor por este convite?');
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ codigo: 'abc123' }));
  });

  it('recusar a confirmação não entra', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const abrir = montar();
    fireEvent.click(screen.getByRole('link', { name: 'https://s.exemplo/c/2/convite/abc123' }));
    expect(abrir).not.toHaveBeenCalled();
  });

  it('convite de outro endereço e sem o contexto: link comum (abre no navegador)', () => {
    const confirmar = vi.spyOn(window, 'confirm');
    const abrir = montar();
    const outro = screen.getByRole('link', { name: 'https://outro.exemplo/convite/zzz' });
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
    outro.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    expect(confirmar).not.toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
    cleanup();
    render(<TextoComLinks texto={texto} />);
    const semContexto = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByRole('link', { name: 'https://s.exemplo/c/2/convite/abc123' }).dispatchEvent(semContexto);
    expect(semContexto.defaultPrevented).toBe(false);
  });

  it('falha ao entrar: mostra o motivo e não troca de tela', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alerta = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    montar(vi.fn(async () => 'Código de convite inválido.'));
    fireEvent.click(screen.getByRole('link', { name: 'https://s.exemplo/c/2/convite/abc123' }));
    await vi.waitFor(() => expect(alerta).toHaveBeenCalledWith('Código de convite inválido.'));
  });

  it('convite para o próprio servidor aberto: link comum, sem confirmação', () => {
    const confirmar = vi.spyOn(window, 'confirm');
    const abrir = montar(undefined, 'https://s.exemplo/c/2');
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
    screen.getByRole('link', { name: 'https://s.exemplo/c/2/convite/abc123' }).dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(false);
    expect(confirmar).not.toHaveBeenCalled();
    expect(abrir).not.toHaveBeenCalled();
  });
});
