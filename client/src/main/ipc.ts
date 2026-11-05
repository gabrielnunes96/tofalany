import { ipcMain } from 'electron';
import type { ConfiguracoesLocais } from '@tofalando/shared';
import type { SessaoLocal } from '../preload/api';
import type { ArmazemConfiguracoes } from './configuracoes';
import type { ArmazemSessao } from './sessao';

export function registrarIpc(configuracoes: ArmazemConfiguracoes, sessao: ArmazemSessao): void {
  ipcMain.handle('config:ler', () => configuracoes.ler());
  ipcMain.handle('config:gravar', (_evento, parcial: Partial<ConfiguracoesLocais>) => configuracoes.gravar(parcial));
  ipcMain.handle('sessao:ler', () => sessao.ler());
  ipcMain.handle('sessao:gravar', (_evento, nova: SessaoLocal) => sessao.gravar(nova));
  ipcMain.handle('sessao:apagar', () => sessao.apagar());
}
