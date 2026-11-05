import { clipboard, ipcMain } from 'electron';
import type { ConfiguracoesLocais, ConviteLink } from '@tofalando/shared';
import type { SessaoLocal } from '../preload/api';
import type { ArmazemConfiguracoes } from './configuracoes';
import type { ArmazemSessao } from './sessao';

export function registrarIpc(
  configuracoes: ArmazemConfiguracoes,
  sessao: ArmazemSessao,
  pegarConvitePendente: () => ConviteLink | undefined,
): void {
  ipcMain.handle('config:ler', () => configuracoes.ler());
  ipcMain.handle('config:gravar', (_evento, parcial: Partial<ConfiguracoesLocais>) => configuracoes.gravar(parcial));
  ipcMain.handle('sessao:ler', () => sessao.ler());
  ipcMain.handle('sessao:gravar', (_evento, nova: SessaoLocal) => sessao.gravar(nova));
  ipcMain.handle('sessao:apagar', () => sessao.apagar());
  ipcMain.handle('deeplink:pendente', () => pegarConvitePendente() ?? null);
  ipcMain.handle('area:copiar', (_evento, texto: unknown) => {
    if (typeof texto !== 'string' || texto.length > 2048) throw new Error('Texto inválido.');
    clipboard.writeText(texto);
  });
}
