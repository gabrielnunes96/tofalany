/** Limites de negócio da funcional. RN-2: contas por servidor (configurável pelo host). */
export const LIMITE_CONTAS_PADRAO = 20;

/** RF-2: senha com no mínimo 8 caracteres (máximo para limitar o custo do hash). */
export const SENHA_MIN = 8;
export const SENHA_MAX = 128;

/** Nome de usuário (login): 3 a 32 caracteres. */
export const USUARIO_MIN = 3;
export const USUARIO_MAX = 32;

/** Cores sorteadas para o perfil de quem acabou de se cadastrar (o usuário troca no perfil, T5). */
export const CORES_PERFIL = ['#5865f2', '#57f287', '#fee75c', '#eb459e', '#ed4245', '#f0b232', '#3ba55d', '#00a8fc'];
