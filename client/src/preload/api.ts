import type { AcaoAtalho, ConfiguracoesLocais, ConviteLink, AtividadeDto } from '@tofalando/shared';

/** Sessão guardada no computador: o token vale só para o servidor em que foi criado. */
export interface SessaoLocal {
  servidorUrl: string;
  token: string;
}

/** O que o preload expõe ao renderer em window.tofalando. */
export interface ApiTofalando {
  /** Versão do app instalado (ex.: 0.10.0). */
  versao: string;
  /** E2E: modo de teste (só fora do app empacotado); liga ganchos de medição na janela. */
  modoTeste: boolean;
  /** celular: onde o app roda (sem valor: computador). */
  plataforma?: 'desktop' | 'android';
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
  /** Só no computador (o celular não tem atalhos globais). */
  atalhos?: {
    aoEvento(fn: (e: { acao: AcaoAtalho; pressionado: boolean }) => void): () => void;
    /** Enquanto a tela captura um atalho novo, os globais não disparam. */
    pausar(sim: boolean): Promise<void>;
    /** atalhos-de-sons: combinação de som apertada (ex.: "F1"); quem resolve o som é a tela na voz. */
    aoSom?(fn: (chave: string) => void): () => void;
  };
  /** RN-25: o computador ficou ocioso (ou voltou). */
  presenca: {
    ausente(): Promise<boolean>;
    aoMudar(fn: (ausente: boolean) => void): () => void;
    /** mover-e-afk: segundos sem teclado e mouse (app antigo da ponte não tem). */
    ociosoSegundos?(): Promise<number>;
  };
  /** Atividade (jogo, música) detectada no computador; null = nada ou desligada. */
  atividade?: {
    atual(): Promise<AtividadeDto | null>;
    aoMudar(fn: (a: AtividadeDto | null) => void): () => void;
  };
  /** RF-26: fontes para transmitir (telas e janelas, com miniatura) e a escolhida. */
  /** Só no computador (o celular não transmite a tela). */
  captura?: {
    fontes(): Promise<{ id: string; nome: string; tipo: 'tela' | 'janela'; miniatura: string; largura?: number; altura?: number }[]>;
    /**
     * De onde vem o som do sistema escolhido: microfone virtual (Linux), porta (Windows 11; chega por window.postMessage)
     * ou nada. "falhou": a captura não começou (som-sistema-windows, RN-4).
     */
    escolher(fonteId: string, audio: boolean): Promise<'nenhum' | 'microfone-virtual' | 'porta' | 'falhou'>;
    /** RF-29: som do sistema sem o som do app; desligado com o motivo (Windows 10, módulo ausente, Linux sem PipeWire). */
    audioDisponivel: { disponivel: boolean; motivo?: 'windows-antigo' | 'sem-modulo' | 'sem-pipewire' };
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
    /** Busca de GIF: este servidor tem a busca ligada (o filtro libera a Klipy enquanto ele for o atual). */
    gif(servidor: string, ligado: boolean): Promise<void>;
  };
  /** Backlog v2, 1d: versão nova (baixada, para reiniciar; ou só disponível, para baixar pela página). */
  atualizacao: {
    /** `pedido`: veio do "Atualizar o app" (quem conduz é o App; o aviso do canto não aparece). */
    estado(): Promise<{ versao: string; modo: 'reiniciar' | 'pagina'; pedido?: boolean } | null>;
    aoMudar(fn: (e: { versao: string; modo: 'reiniciar' | 'pagina'; pedido?: boolean }) => void): () => void;
    instalar(): Promise<void>;
    abrirPagina(): Promise<void>;
    /** Backlog 27: procura agora, sem esperar o intervalo automático. */
    procurar(): Promise<{ situacao: 'atualizado' | 'nova' | 'baixando' | 'pronta' | 'erro' | 'indisponivel'; versao?: string }>;
    /** qualidade-de-vida, RF-5: procura e, havendo versão, baixa com o progresso e a deixa pronta com `pedido`. */
    agora(): Promise<{ situacao: 'atualizado' | 'nova' | 'baixando' | 'pronta' | 'erro' | 'indisponivel'; versao?: string }>;
    /** Não reiniciar agora (em chamada): volta o aviso do canto. */
    recusar(): Promise<void>;
    /** Percentual do download (0–100) do pedido em andamento. */
    aoProgresso(fn: (percentual: number) => void): () => void;
    /** O download do pedido falhou. */
    aoFalhar(fn: () => void): () => void;
  };
  arquivos: {
    /** Pergunta onde salvar e baixa; null se a pessoa cancelar. */
    baixar(url: string, nome: string): Promise<string | null>;
    /** Abre com o programa do sistema um arquivo baixado por aqui. */
    abrir(caminho: string): Promise<void>;
  };
}
