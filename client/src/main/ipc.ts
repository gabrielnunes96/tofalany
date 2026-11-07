import { clipboard, ipcMain } from 'electron';
import type { ConfiguracoesLocais, ConviteLink } from '@tofalando/shared';
import type { SessaoLocal } from '../preload/api';
import type { ArmazemConfiguracoes } from './configuracoes';
import type { ArmazemSessao } from './sessao';
import type { criarArquivos } from './arquivos';
import type { criarNotificacoes, PedidoNotificacao } from './notificacoes';

export function registrarIpc(
  configuracoes: ArmazemConfiguracoes,
  sessao: ArmazemSessao,
  pegarConvitePendente: () => ConviteLink | undefined,
  arquivos: ReturnType<typeof criarArquivos>,
  notificacoes: ReturnType<typeof criarNotificacoes>,
  aoMudarConfig: (c: ConfiguracoesLocais) => void = () => undefined,
): void {
  ipcMain.handle('notificar', (_e, p: PedidoNotificacao) => {
    if (!p || typeof p.titulo !== 'string' || typeof p.corpo !== 'string' || typeof p.chave !== 'string') throw new Error('Pedido inválido.');
    return notificacoes.mostrar({ titulo: p.titulo, corpo: p.corpo, chave: p.chave, conversaAberta: p.conversaAberta === true, silencioso: p.silencioso === true });
  });
  ipcMain.handle('config:ler', () => configuracoes.ler());
  ipcMain.handle('config:gravar', (_evento, parcial: Partial<ConfiguracoesLocais>) => {
    const novo = configuracoes.gravar(parcial);
    aoMudarConfig(novo);
    return novo;
  });
  ipcMain.handle('sessao:ler', (_e, url: unknown) => sessao.ler(typeof url === 'string' ? url : undefined));
  ipcMain.handle('sessao:gravar', (_evento, nova: SessaoLocal) => sessao.gravar(nova));
  ipcMain.handle('sessao:apagar', (_e, url: unknown) => sessao.apagar(typeof url === 'string' ? url : undefined));
  ipcMain.handle('deeplink:pendente', () => pegarConvitePendente() ?? null);
  ipcMain.handle('arquivo:baixar', (_e, url: unknown, nome: unknown) => {
    if (typeof url !== 'string' || typeof nome !== 'string') throw new Error('Pedido inválido.');
    return arquivos.baixar(url, nome);
  });
  ipcMain.handle('arquivo:abrir', (_e, caminho: unknown) => {
    if (typeof caminho !== 'string') throw new Error('Pedido inválido.');
    return arquivos.abrir(caminho);
  });
  ipcMain.handle('area:copiar', (_evento, texto: unknown) => {
    if (typeof texto !== 'string' || texto.length > 2048) throw new Error('Texto inválido.');
    return clipboard.writeText(texto);
  });
}
