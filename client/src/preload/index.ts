import { contextBridge, ipcRenderer } from 'electron';
import type { ConfiguracoesLocais } from '@tofalando/shared';
import type { ApiTofalando } from './api';

const api: ApiTofalando = {
  config: {
    ler: () => ipcRenderer.invoke('config:ler') as Promise<ConfiguracoesLocais>,
    gravar: (parcial) => ipcRenderer.invoke('config:gravar', parcial) as Promise<ConfiguracoesLocais>,
  },
};

contextBridge.exposeInMainWorld('tofalando', api);
