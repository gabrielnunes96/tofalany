import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { ConviteLink } from '@tofalando/shared';
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
};

contextBridge.exposeInMainWorld('tofalando', api);
