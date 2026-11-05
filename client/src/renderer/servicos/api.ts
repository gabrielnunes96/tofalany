import type { AnexoDto, AtualizarPerfilRequest, CadastroRequest, Cargo, ConviteDto, ErroApi, PaginaMensagens, UsuarioAdminDto, FiltroAuditoria, LoginRequest, PaginaAuditoria, SessaoResponse, SomDto, UsuarioDto } from '@tofalando/shared';

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
  atualizarPerfil(dados: AtualizarPerfilRequest): Promise<UsuarioDto>;
  enviarAvatar(arquivo: Blob, nome: string): Promise<{ avatarUrl: string }>;
  usuariosAdmin(): Promise<UsuarioAdminDto[]>;
  mudarCargo(id: number, cargo: Cargo): Promise<UsuarioDto>;
  removerConta(id: number): Promise<void>;
  lerConvite(): Promise<ConviteDto>;
  trocarConvite(codigo: string): Promise<ConviteDto>;
  mensagensCanal(canalId: number, antes?: number): Promise<PaginaMensagens>;
  mensagensDm(dmId: number, antes?: number): Promise<PaginaMensagens>;
  enviarAnexo(arquivo: Blob, nome: string): Promise<AnexoDto>;
  sons(): Promise<SomDto[]>;
  cadastrarSom(nome: string, arquivo: Blob, nomeArquivo: string): Promise<SomDto>;
  trocarSom(id: number, mudanca: { nome?: string; arquivo?: { dados: Blob; nome: string } }): Promise<SomDto>;
  removerSom(id: number): Promise<void>;
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
    const formulario = corpo instanceof FormData;
    if (corpo !== undefined && !formulario) cabecalhos['content-type'] = 'application/json';
    if (token) cabecalhos.authorization = `Bearer ${token}`;
    let resposta: Response;
    try {
      resposta = await buscar(`${servidorUrl}${caminho}`, {
        method: metodo,
        headers: cabecalhos,
        body: corpo === undefined ? undefined : formulario ? corpo : JSON.stringify(corpo),
        signal: AbortSignal.timeout(formulario ? 120_000 : 15_000),
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
    atualizarPerfil: (dados) => chamar('PATCH', '/api/eu', dados),
    usuariosAdmin: () => chamar('GET', '/api/admin/usuarios'),
    mudarCargo: (id, cargo) => chamar('PATCH', `/api/admin/usuarios/${id}/cargo`, { cargo }),
    removerConta: (id) => chamar('DELETE', `/api/admin/usuarios/${id}`),
    lerConvite: () => chamar('GET', '/api/admin/convite'),
    trocarConvite: (codigo) => chamar('PUT', '/api/admin/convite', { codigo }),
    enviarAnexo: (arquivo, nome) => {
      const form = new FormData();
      form.append('arquivo', arquivo, nome);
      return chamar('POST', '/api/anexos', form);
    },
    sons: () => chamar('GET', '/api/sons'),
    cadastrarSom: (nome, arquivo, nomeArquivo) => {
      const form = new FormData();
      form.append('nome', nome);
      form.append('arquivo', arquivo, nomeArquivo);
      return chamar('POST', '/api/admin/sons', form);
    },
    trocarSom: (id, mudanca) => {
      const form = new FormData();
      if (mudanca.nome !== undefined) form.append('nome', mudanca.nome);
      if (mudanca.arquivo) form.append('arquivo', mudanca.arquivo.dados, mudanca.arquivo.nome);
      return chamar('PUT', `/api/admin/sons/${id}`, form);
    },
    removerSom: (id) => chamar('DELETE', `/api/admin/sons/${id}`),
    mensagensDm: (dmId, antes) => chamar('GET', `/api/dms/${dmId}/mensagens${consulta({ antes })}`),
    mensagensCanal: (canalId, antes) => chamar('GET', `/api/canais/${canalId}/mensagens${consulta({ antes })}`),
    enviarAvatar: (arquivo, nome) => {
      const form = new FormData();
      form.append('arquivo', arquivo, nome);
      return chamar('PUT', '/api/eu/avatar', form);
    },
  };
}
