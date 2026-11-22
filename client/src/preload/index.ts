import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AcaoAtalho, ConviteLink } from '@tofalando/shared';
import type { ApiTofalando } from './api';

const api: ApiTofalando = {
  versao: String(ipcRenderer.sendSync('app:versao') ?? ''),
  modoTeste: ipcRenderer.sendSync('app:modo-teste') === true,
  config: {
    ler: () => ipcRenderer.invoke('config:ler'),
    gravar: (parcial) => ipcRenderer.invoke('config:gravar', parcial),
  },
  sessao: {
    ler: (url) => ipcRenderer.invoke('sessao:ler', url),
    gravar: (sessao) => ipcRenderer.invoke('sessao:gravar', sessao),
    apagar: (url) => ipcRenderer.invoke('sessao:apagar', url),
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
    ociosoSegundos: () => ipcRenderer.invoke('presenca:ocioso-segundos'),
    aoMudar: (fn) => {
      const ouvinte = (_e: IpcRendererEvent, ausente: boolean) => fn(ausente === true);
      ipcRenderer.on('presenca:ociosidade', ouvinte);
      return () => ipcRenderer.removeListener('presenca:ociosidade', ouvinte);
    },
  },
  atividade: {
    atual: () => ipcRenderer.invoke('atividade:atual'),
    aoMudar: (fn) => {
      const ouvinte = (_e: IpcRendererEvent, a: unknown) => fn((a ?? null) as never);
      ipcRenderer.on('atividade:mudou', ouvinte);
      return () => ipcRenderer.removeListener('atividade:mudou', ouvinte);
    },
  },
  captura: {
    fontes: () => ipcRenderer.invoke('captura:fontes'),
    escolher: (fonteId, audio) => ipcRenderer.invoke('captura:escolher', { fonteId, audio }),
    audioDisponivel: ipcRenderer.sendSync('captura:som-disponivel') === true,
    // Item 31 (contorno): no Windows o som do sistema leva também a voz da chamada.
    somLevaChamada: process.platform === 'win32',
    pararSom: () => ipcRenderer.invoke('captura:som-parar'),
    mesmaTela: () => ipcRenderer.invoke('captura:mesma-tela'),
  },
  rede: {
    servidorPendente: (url) => ipcRenderer.invoke('rede:pendente', url),
    video: (aberto) => ipcRenderer.invoke('rede:video', aberto === true),
    gif: (servidor, ligado) => ipcRenderer.invoke('rede:gif', servidor, ligado === true),
  },
  atualizacao: {
    estado: () => ipcRenderer.invoke('atualizacao:estado'),
    aoMudar: (fn) => {
      const ouvinte = (_e: IpcRendererEvent, estado: { versao: string; modo: 'reiniciar' | 'pagina'; pedido?: boolean }) => fn(estado);
      ipcRenderer.on('atualizacao:estado', ouvinte);
      return () => ipcRenderer.removeListener('atualizacao:estado', ouvinte);
    },
    instalar: () => ipcRenderer.invoke('atualizacao:instalar'),
    abrirPagina: () => ipcRenderer.invoke('atualizacao:pagina'),
    procurar: () => ipcRenderer.invoke('atualizacao:procurar'),
    agora: () => ipcRenderer.invoke('atualizacao:agora'),
    recusar: () => ipcRenderer.invoke('atualizacao:recusar'),
    aoProgresso: (fn) => {
      const ouvinte = (_e: IpcRendererEvent, percentual: number) => fn(percentual);
      ipcRenderer.on('atualizacao:progresso', ouvinte);
      return () => ipcRenderer.removeListener('atualizacao:progresso', ouvinte);
    },
    aoFalhar: (fn) => {
      const ouvinte = () => fn();
      ipcRenderer.on('atualizacao:falhou', ouvinte);
      return () => ipcRenderer.removeListener('atualizacao:falhou', ouvinte);
    },
  },
  arquivos: {
    baixar: (url, nome) => ipcRenderer.invoke('arquivo:baixar', url, nome),
    abrir: (caminho) => ipcRenderer.invoke('arquivo:abrir', caminho),
  },
};

contextBridge.exposeInMainWorld('tofalando', api);
