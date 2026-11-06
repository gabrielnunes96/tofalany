import type { AcaoAtalho, ConfiguracoesLocais, ConviteLink } from '@tofalando/shared';

/** Sessão guardada no computador: o token vale só para o servidor em que foi criado. */
export interface SessaoLocal {
  servidorUrl: string;
  token: string;
}

/** O que o preload expõe ao renderer em window.tofalando. */
export interface ApiTofalando {
  config: {
    ler(): Promise<ConfiguracoesLocais>;
    gravar(parcial: Partial<ConfiguracoesLocais>): Promise<ConfiguracoesLocais>;
  };
  sessao: {
    ler(): Promise<SessaoLocal | null>;
    gravar(sessao: SessaoLocal): Promise<void>;
    apagar(): Promise<void>;
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
    fontes(): Promise<{ id: string; nome: string; tipo: 'tela' | 'janela'; miniatura: string }[]>;
    escolher(fonteId: string, audio: boolean): Promise<void>;
    /** RF-29: áudio do sistema só existe no Windows. */
    audioDisponivel: boolean;
  };
  /** CA-46: servidor de um convite em andamento (já testado) pode ser usado antes de virar o salvo. */
  rede: {
    servidorPendente(url: string | null): Promise<void>;
  };
  arquivos: {
    /** Pergunta onde salvar e baixa; null se a pessoa cancelar. */
    baixar(url: string, nome: string): Promise<string | null>;
    /** Abre com o programa do sistema um arquivo baixado por aqui. */
    abrir(caminho: string): Promise<void>;
  };
}
