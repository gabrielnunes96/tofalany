import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ Notification: {} }));
const { deveNotificar } = await import('./notificacoes');

describe('deveNotificar (RF-12)', () => {
  it('conversa fechada ou app sem foco: sim; conversa aberta com foco: não', () => {
    expect(deveNotificar(false, true)).toBe(true);
    expect(deveNotificar(true, false)).toBe(true);
    expect(deveNotificar(false, false)).toBe(true);
    expect(deveNotificar(true, true)).toBe(false);
  });
});
