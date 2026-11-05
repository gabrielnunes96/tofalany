import { ipcMain } from 'electron';
import type { ConfiguracoesLocais } from '@tofalando/shared';
import type { ArmazemConfiguracoes } from './configuracoes';

export function registrarIpc(configuracoes: ArmazemConfiguracoes): void {
  ipcMain.handle('config:ler', () => configuracoes.ler());
  ipcMain.handle('config:gravar', (_evento, parcial: Partial<ConfiguracoesLocais>) => configuracoes.gravar(parcial));
}
