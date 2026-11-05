import type { CadastroRequest, ErroApi, FiltroAuditoria, LoginRequest, PaginaAuditoria, SessaoResponse, UsuarioDto } from '@tofalando/shared';

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

/** Erro de chamada à API, com a mensagem do servidor (4xx) ou uma genérica (rede / 5xx). */
export class ErroApiCliente extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }

  get semConexao(): boolean {
    return this.status === 0;
  }
}

export interface ClienteApi {
  cadastrar(dados: CadastroRequest): Promise<SessaoResponse>;
  entrar(dados: LoginRequest): Promise<SessaoResponse>;
  sair(): Promise<void>;
  eu(): Promise<UsuarioDto>;
  auditoria(filtro: FiltroAuditoria): Promise<PaginaAuditoria>;
}

function consulta(filtro: object): string {
  const p = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtro)) if (valor !== undefined && valor !== '') p.set(chave, String(valor));
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}

export function criarApi(servidorUrl: string, token: string | null = null, buscar: Buscar = fetch): ClienteApi {
  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const cabecalhos: Record<string, string> = {};
    if (corpo !== undefined) cabecalhos['content-type'] = 'application/json';
    if (token) cabecalhos.authorization = `Bearer ${token}`;
    let resposta: Response;
    try {
      resposta = await buscar(`${servidorUrl}${caminho}`, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ErroApiCliente(0, 'sem_conexao', 'Sem conexão com o servidor.');
    }
    if (resposta.status === 204) return undefined as T;
    let dados: unknown;
    try {
      dados = await resposta.json();
    } catch {
      dados = undefined;
    }
    if (!resposta.ok) {
      const erro = dados as Partial<ErroApi> | undefined;
      if (resposta.status < 500 && erro?.mensagem) throw new ErroApiCliente(resposta.status, erro.erro ?? 'erro', erro.mensagem);
      throw new ErroApiCliente(resposta.status, erro?.erro ?? 'erro', 'O servidor teve um problema. Tente de novo em instantes.');
    }
    return dados as T;
  }

  return {
    cadastrar: (dados) => chamar('POST', '/api/auth/cadastro', dados),
    entrar: (dados) => chamar('POST', '/api/auth/login', dados),
    sair: () => chamar('POST', '/api/auth/sair'),
    eu: () => chamar('GET', '/api/eu'),
    auditoria: (filtro) => chamar('GET', `/api/admin/auditoria${consulta(filtro)}`),
  };
}
