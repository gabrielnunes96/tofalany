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

/** CA-17: o aviso "digitando" some 5 s depois do último sinal; o app reenvia o sinal a cada 3 s. */
export const DIGITANDO_DURACAO_MS = 5000;
export const DIGITANDO_INTERVALO_MS = 3000;

/** Cores sorteadas para o perfil de quem acabou de se cadastrar (o usuário troca no perfil, T5). */
export const CORES_PERFIL = ['#00f0ff', '#ff2a6d', '#fcee0a', '#3dffb0', '#b14bff', '#ff8a00', '#4d7cff', '#ff4dd2'];
