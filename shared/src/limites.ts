/** Limites de negócio da funcional. RN-2: contas por servidor (configurável pelo host). */
export const LIMITE_CONTAS_PADRAO = 20;

/** RF-2: senha com no mínimo 8 caracteres (máximo para limitar o custo do hash). */
export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

/** Nome de usuário (login): 3 a 32 caracteres. */
export const USUARIO_MIN = 3;
export const USUARIO_MAX = 32;

/** RN-15: avatar até 8 MB, gravado em 256×256. */
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
export const AVATAR_LADO = 256;
export const FORMATOS_AVATAR = ['png', 'jpeg', 'gif', 'webp'] as const;
/** Teto de resolução ao decodificar imagens (evita "bomba de descompressão"). */
export const IMAGEM_MAX_PIXELS = 4096 * 4096;

/** Nome de exibição (pode repetir, RN-3). */
export const NOME_EXIBICAO_MAX = 32;

/** Nome de canal: 1 a 32 caracteres. */
export const NOME_CANAL_MAX = 32;

/** Mensagem de texto: até 4000 caracteres. Página do histórico: 50. */
export const MENSAGEM_MAX = 4000;
export const PAGINA_MENSAGENS = 50;

/** Reações: até 20 emojis diferentes por mensagem; até 20 pedidos a cada 10 s por conexão. */
export const REACOES_POR_MENSAGEM = 20;
export const REACOES_RAJADA = { eventos: 20, janelaMs: 10_000 } as const;
/** Resposta: trecho da original com até 100 caracteres; ir até a original carrega no máximo 1000 mensagens. */
export const TRECHO_RESPOSTA = 100;
export const HISTORICO_ATE_MAX = 1000;
/** chat-fixar-e-buscar: ir até uma mensagem abre 25 antes e 25 depois dela. */
export const JANELA_MENSAGENS = 25;
/** chat-fixar-e-buscar: até 50 fixadas por conversa (RN-3); até 5 fixar/desafixar a cada 30 s por conexão. */
export const FIXADAS_POR_CONVERSA = 50;
export const FIXAR_RAJADA = { eventos: 5, janelaMs: 30_000 } as const;
/** Linha "fulano fixou" repetida (mesma pessoa, mesma mensagem) só depois de 10 min. */
export const LINHA_FIXOU_INTERVALO_MS = 10 * 60_000;
/** Emoji de reação: no máximo 32 bytes em UTF-8. */
export const EMOJI_MAX_BYTES = 32;
/** Mini perfil: "sobre mim" com até 190 caracteres e 3 linhas; fundo enviado em até 600×240 (animado: até 150 quadros e 60 Mpx somados; saída até 3 MB). */
export const SOBRE_MIM_MAX = 190;
export const SOBRE_MIM_LINHAS = 3;
export const FUNDO_LARGURA = 600;
export const FUNDO_ALTURA = 240;
export const FUNDO_MAX_QUADROS = 150;
export const FUNDO_MAX_PIXELS_ANIMACAO = 60_000_000;
export const FUNDO_SAIDA_MAX_BYTES = 3 * 1024 * 1024;
/** Busca de GIF: endereço até 512 caracteres, descrição até 200, lado até 4096 px; 24 por página, filtro médio da Klipy. */
export const GIF_URL_MAX = 512;
export const GIF_DESCRICAO_MAX = 200;
export const GIF_LADO_MAX = 4096;
export const GIF_POR_PAGINA = 24;
export const GIF_FILTRO = 'medium';

/** CA-17: o aviso "digitando" some 5 s depois do último sinal; o app reenvia o sinal a cada 3 s. */
export const DIGITANDO_DURACAO_MS = 5000;
export const DIGITANDO_INTERVALO_MS = 3000;

/** RN-19: anexo até 25 MB; até 10 por mensagem; imagem decodificada até ~40 megapixels. */
export const ANEXO_MAX_BYTES = 25 * 1024 * 1024;
export const ANEXOS_POR_MENSAGEM = 10;
export const ANEXO_IMAGEM_MAX_PIXELS = 40_000_000;
export const EXTENSOES_ANEXO = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'zip'] as const;

/** RN-11: soundboard com até 5 sons de até 10 s (arquivo até 2 MB). */
export const SONS_MAX = 5;
export const SOM_DURACAO_MAX_MS = 10_000;
export const SOM_MAX_BYTES = 2 * 1024 * 1024;
export const NOME_SOM_MAX = 32;

/** Cores sorteadas para o perfil de quem acabou de se cadastrar (o usuário troca no perfil, T5). */
export const CORES_PERFIL = ['#00f0ff', '#ff2a6d', '#fcee0a', '#3dffb0', '#b14bff', '#ff8a00', '#4d7cff', '#ff4dd2'];

/** RN-13: intervalo mínimo entre dois sons do soundboard da mesma pessoa. */
export const SOM_INTERVALO_MS = 3000;
