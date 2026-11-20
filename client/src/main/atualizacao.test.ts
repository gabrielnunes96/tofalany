import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false }, ipcMain: {}, shell: {} }));
vi.mock('electron-updater', () => ({ autoUpdater: {} }));
const { podeAtualizarSozinho } = await import('./atualizacao');

describe('podeAtualizarSozinho (backlog v2, item 1d)', () => {
  it('Windows, AppImage e .deb se atualizam sozinhos; outros pacotes só avisam', () => {
    expect(podeAtualizarSozinho('win32', undefined)).toBe(true);
    expect(podeAtualizarSozinho('linux', '/home/x/ToFalany.AppImage')).toBe(true);
    expect(podeAtualizarSozinho('linux', undefined, 'deb')).toBe(true);
    expect(podeAtualizarSozinho('linux', undefined, 'rpm')).toBe(false);
    expect(podeAtualizarSozinho('linux', undefined)).toBe(false);
  });
});
