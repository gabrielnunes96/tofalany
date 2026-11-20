import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: {} }));
const { conviteDosArgumentos } = await import('./deeplink');

describe('conviteDosArgumentos', () => {
  it('acha o link válido entre os argumentos (Linux/Windows)', () => {
    const argv = ['/usr/bin/tofalany', '--no-sandbox', 'tofalany://convite?servidor=http%3A%2F%2F100.64.0.1%3A3000&codigo=turma-2026'];
    expect(conviteDosArgumentos(argv)).toEqual({ servidor: 'http://100.64.0.1:3000', codigo: 'turma-2026' });
  });
  it('ignora argumentos comuns e links inválidos', () => {
    expect(conviteDosArgumentos(['/usr/bin/tofalany', '.'])).toBeUndefined();
    expect(conviteDosArgumentos(['tofalany://convite?servidor=ftp://x&codigo=turma-2026'])).toBeUndefined();
  });
});
