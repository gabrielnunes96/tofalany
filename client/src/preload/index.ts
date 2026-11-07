import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AcaoAtalho, ConviteLink } from '@tofalando/shared';
import type { ApiTofalando } from './api';

const api: ApiTofalando = {
  config: {
    ler: () => ipcRenderer.invoke('config:ler'),
    gravar: (parcial) => ipcRenderer.invoke('config:gravar', parcial),
  },
  sessao: {
    ler: () => ipcRenderer.invoke('sessao:ler'),
    gravar: (sessao) => ipcRenderer.invoke('sessao:gravar', sessao),
    apagar: () => ipcRenderer.invoke('sessao:apagar'),
  },
  convite: {
    pendente: () => ipcRenderer.invoke('deeplink:pendente'),
    aoChegar: (fn) => {
      const ouvinte = (_e: IpcRendererEvent, convite: ConviteLink) => fn(convite);
      ipcRenderer.on('deeplink:convite', ouvinte);
      return () => ipcRenderer.removeListener('deeplink:convite', ouvinte);
    },
  },
  areaTransferencia: {
    copiar: (texto) => ipcRenderer.invoke('area:copiar', texto),
  },
  notificacoes: {
    mostrar: (p) => ipcRenderer.invoke('notificar', p),
    aoClicar: (fn) => {
      const ouvinte = (_e: IpcRendererEvent, chave: string) => fn(chave);
      ipcRenderer.on('notificacao:abrir', ouvinte);
      return () => ipcRenderer.removeListener('notificacao:abrir', ouvinte);
    },
  },
  atalhos: {
    aoEvento: (fn) => {
      const ouvinte = (_e: IpcRendererEvent, ev: { acao: AcaoAtalho; pressionado: boolean }) => fn(ev);
      ipcRenderer.on('atalhos:evento', ouvinte);
      return () => ipcRenderer.removeListener('atalhos:evento', ouvinte);
    },
    pausar: (sim) => ipcRenderer.invoke('atalhos:pausar', sim),
  },
  presenca: {
    ausente: () => ipcRenderer.invoke('presenca:ausente'),
    aoMudar: (fn) => {
      const ouvinte = (_e: IpcRendererEvent, ausente: boolean) => fn(ausente === true);
      ipcRenderer.on('presenca:ociosidade', ouvinte);
      return () => ipcRenderer.removeListener('presenca:ociosidade', ouvinte);
    },
  },
  captura: {
    fontes: () => ipcRenderer.invoke('captura:fontes'),
    escolher: (fonteId, audio) => ipcRenderer.invoke('captura:escolher', { fonteId, audio }),
    audioDisponivel: process.platform === 'win32',
  },
  rede: {
    servidorPendente: (url) => ipcRenderer.invoke('rede:pendente', url),
  },
  atualizacao: {
    estado: () => ipcRenderer.invoke('atualizacao:estado'),
    aoMudar: (fn) => {
      const ouvinte = (_e: IpcRendererEvent, estado: { versao: string; modo: 'reiniciar' | 'pagina' }) => fn(estado);
      ipcRenderer.on('atualizacao:estado', ouvinte);
      return () => ipcRenderer.removeListener('atualizacao:estado', ouvinte);
    },
    instalar: () => ipcRenderer.invoke('atualizacao:instalar'),
    abrirPagina: () => ipcRenderer.invoke('atualizacao:pagina'),
  },
  arquivos: {
    baixar: (url, nome) => ipcRenderer.invoke('arquivo:baixar', url, nome),
    abrir: (caminho) => ipcRenderer.invoke('arquivo:abrir', caminho),
  },
};

contextBridge.exposeInMainWorld('tofalando', api);
