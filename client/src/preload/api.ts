import type { AcaoAtalho, ConfiguracoesLocais, ConviteLink } from '@tofalando/shared';

/** Sessão guardada no computador: o token vale só para o servidor em que foi criado. */
export interface SessaoLocal {
  servidorUrl: string;
  token: string;
}

/** O que o preload expõe ao renderer em window.tofalando. */
export interface ApiTofalando {
  /** Versão do app instalado (ex.: 0.10.0). */
  versao: string;
  config: {
    ler(): Promise<ConfiguracoesLocais>;
    gravar(parcial: Partial<ConfiguracoesLocais>): Promise<ConfiguracoesLocais>;
  };
  /** Backlog v2, item 7: uma sessão por servidor. */
  sessao: {
    /** A sessão de um servidor; sem servidor, a do último em que a pessoa entrou. */
    ler(servidorUrl?: string): Promise<SessaoLocal | null>;
    gravar(sessao: SessaoLocal): Promise<void>;
    /** Apaga a sessão de um servidor (sair dele). */
    apagar(servidorUrl?: string): Promise<void>;
  };
  convite: {
    /** Convite que abriu o app (uma vez só). */
    pendente(): Promise<ConviteLink | null>;
    /** Convite aberto com o app já rodando. Devolve a função que para de ouvir. */
    aoChegar(fn: (convite: ConviteLink) => void): () => void;
  };
  areaTransferencia: {
    copiar(texto: string): Promise<void>;
  };
  notificacoes: {
    /** Pede ao sistema para avisar; o processo principal decide pelo foco da janela. */
    mostrar(p: { titulo: string; corpo: string; chave: string; conversaAberta: boolean; silencioso?: boolean }): Promise<boolean>;
    /** Clique na notificação: abre a conversa. Devolve a função que para de ouvir. */
    aoClicar(fn: (chave: string) => void): () => void;
  };
  /** RF-15: aperto/soltura dos atalhos globais. Devolve a função que para de ouvir. */
  atalhos: {
    aoEvento(fn: (e: { acao: AcaoAtalho; pressionado: boolean }) => void): () => void;
    /** Enquanto a tela captura um atalho novo, os globais não disparam. */
    pausar(sim: boolean): Promise<void>;
  };
  /** RN-25: o computador ficou ocioso (ou voltou). */
  presenca: {
    ausente(): Promise<boolean>;
    aoMudar(fn: (ausente: boolean) => void): () => void;
  };
  /** RF-26: fontes para transmitir (telas e janelas, com miniatura) e a escolhida. */
  captura: {
    fontes(): Promise<{ id: string; nome: string; tipo: 'tela' | 'janela'; miniatura: string; largura?: number; altura?: number }[]>;
    /** true: o som do sistema vai pelo microfone virtual do Linux (a janela o captura e publica). */
    escolher(fonteId: string, audio: boolean): Promise<boolean>;
    /** RF-29: áudio do sistema no Windows; no Linux, com PipeWire (backlog v2, item 13). */
    audioDisponivel: boolean;
    /** Desfaz o microfone virtual do Linux (fim da transmissão). */
    pararSom(): Promise<void>;
    /** A tela transmitida é a mesma em que o app está (a prévia viraria espelho). */
    mesmaTela(): Promise<boolean>;
  };
  /** CA-46: servidor de um convite em andamento (já testado) pode ser usado antes de virar o salvo. */
  rede: {
    servidorPendente(url: string | null): Promise<void>;
    /** Backlog v2, item 10b: um player do YouTube abriu (true) ou fechou (false). */
    video(aberto: boolean): Promise<void>;
  };
  /** Backlog v2, 1d: versão nova (baixada, para reiniciar; ou só disponível, para baixar pela página). */
  atualizacao: {
    estado(): Promise<{ versao: string; modo: 'reiniciar' | 'pagina' } | null>;
    aoMudar(fn: (e: { versao: string; modo: 'reiniciar' | 'pagina' }) => void): () => void;
    instalar(): Promise<void>;
    abrirPagina(): Promise<void>;
  };
  arquivos: {
    /** Pergunta onde salvar e baixa; null se a pessoa cancelar. */
    baixar(url: string, nome: string): Promise<string | null>;
    /** Abre com o programa do sistema um arquivo baixado por aqui. */
    abrir(caminho: string): Promise<void>;
  };
}
