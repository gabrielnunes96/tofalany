import { contextBridge, ipcRenderer } from 'electron';
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
};

contextBridge.exposeInMainWorld('tofalando', api);
