import type { AnexoDto, AtualizarPerfilRequest, CadastroRequest, Cargo, ConviteDto, ErroApi, PaginaMensagens, UsuarioAdminDto, FiltroAuditoria, LoginRequest, PaginaAuditoria, PreviaLink, RedefinicaoDto, RedefinirSenhaRequest, SessaoResponse, SomDto, TokenVozResponse, UsuarioDto, FuncaoDto, ResumoNaoLidas, ComunidadeDto, BanimentoDto, CatalogoLojaDto, ItemLoja, LojaEstadoDto, MovimentoDto, DoisFatoresDto, InicioDoisFatoresDto } from '@tofalando/shared';

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

/** Erros 5xx cuja mensagem é para a pessoa ler (não é detalhe interno). */
const ERROS_5XX_COM_MENSAGEM = new Set<string>(['voz_indisponivel']);

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
  /** Backlog v2: total de não lidas neste servidor (número no ícone da coluna de servidores). */
  naoLidas(): Promise<ResumoNaoLidas>;
  /** Vários servidores na mesma instalação: os meus, criar (administrador do principal), entrar com convite, sair e excluir. */
  comunidades(): Promise<ComunidadeDto[]>;
  criarComunidade(nome: string): Promise<ComunidadeDto>;
  entrarComunidade(codigo: string): Promise<ComunidadeDto>;
  sairComunidade(): Promise<void>;
  excluirComunidade(): Promise<void>;
  /** Administrador: nome e imagem do servidor do endereço. */
  renomearComunidade(nome: string): Promise<ComunidadeDto>;
  /** Moderação (administrador ou cargo com "Moderar membros"). */
  castigar(id: number, minutos: number, motivo: string | null): Promise<UsuarioDto>;
  tirarCastigo(id: number): Promise<UsuarioDto>;
  expulsar(id: number, motivo: string | null): Promise<void>;
  banir(id: number, motivo: string | null): Promise<void>;
  banidos(): Promise<BanimentoDto[]>;
  desbanir(id: number): Promise<void>;
  enviarIconeComunidade(arquivo: Blob, nome: string): Promise<ComunidadeDto>;
  removerIconeComunidade(): Promise<ComunidadeDto>;
  /** ToOuvini: cookies do YouTube (administrador do principal). */
  situacaoMusica(): Promise<{ cookies: boolean; atualizadoEm: number | null }>;
  enviarCookiesMusica(conteudo: string): Promise<{ cookies: boolean; atualizadoEm: number | null }>;
  removerCookiesMusica(): Promise<void>;
  auditoria(filtro: FiltroAuditoria): Promise<PaginaAuditoria>;
  atualizarPerfil(dados: AtualizarPerfilRequest): Promise<UsuarioDto>;
  enviarAvatar(arquivo: Blob, nome: string): Promise<{ avatarUrl: string }>;
  usuariosAdmin(): Promise<UsuarioAdminDto[]>;
  mudarCargo(id: number, cargo: Cargo): Promise<UsuarioDto>;
  removerConta(id: number): Promise<void>;
  /** Backlog v2, item 10c: cargos personalizados (só administrador). */
  criarFuncao(f: Omit<FuncaoDto, 'id'>): Promise<FuncaoDto>;
  editarFuncao(id: number, f: Omit<FuncaoDto, 'id'>): Promise<FuncaoDto>;
  removerFuncao(id: number): Promise<void>;
  definirFuncao(usuarioId: number, funcaoId: number | null): Promise<UsuarioDto>;
  /** Backlog v2, item 10b: prévia de um link (undefined quando não há). */
  previa(url: string): Promise<PreviaLink | undefined>;
  /** Backlog v2, item 3: código de redefinição de senha (só administrador). */
  gerarRedefinicao(id: number): Promise<RedefinicaoDto>;
  /** Backlog v2, item 3: "Esqueci a senha" com o código recebido. */
  redefinirSenha(dados: RedefinirSenhaRequest): Promise<void>;
  lerConvite(): Promise<ConviteDto>;
  trocarConvite(codigo: string): Promise<ConviteDto>;
  mensagensCanal(canalId: number, antes?: number): Promise<PaginaMensagens>;
  mensagensDm(dmId: number, antes?: number): Promise<PaginaMensagens>;
  enviarAnexo(arquivo: Blob, nome: string): Promise<AnexoDto>;
  sons(): Promise<SomDto[]>;
  cadastrarSom(nome: string, arquivo: Blob, nomeArquivo: string): Promise<SomDto>;
  trocarSom(id: number, mudanca: { nome?: string; arquivo?: { dados: Blob; nome: string } }): Promise<SomDto>;
  removerSom(id: number): Promise<void>;
  /** RF-13: token do LiveKit para o canal de voz. */
  tokenVoz(canalVozId: number): Promise<TokenVozResponse>;
  /** Pontos e loja: catálogo com preços e o meu estado; comprar; extrato (do mais novo para o mais antigo). */
  loja(): Promise<CatalogoLojaDto>;
  comprarNaLoja(item: ItemLoja): Promise<LojaEstadoDto>;
  extratoLoja(antes?: number): Promise<{ movimentos: MovimentoDto[] }>;
  /** Autenticação em dois fatores da minha conta; o administrador desliga a de alguém. */
  doisFatores(): Promise<DoisFatoresDto>;
  iniciarDoisFatores(senha: string): Promise<InicioDoisFatoresDto>;
  ativarDoisFatores(codigo: string): Promise<{ codigos: string[] }>;
  desativarDoisFatores(senha: string, codigo: string): Promise<DoisFatoresDto>;
  desligarDoisFatoresDe(usuarioId: number): Promise<void>;
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
      // 5xx esconde o detalhe interno, exceto os avisos que o servidor dá de propósito (ex.: voz sem LiveKit configurado).
      if ((resposta.status < 500 || (erro?.erro !== undefined && ERROS_5XX_COM_MENSAGEM.has(erro.erro))) && erro?.mensagem) throw new ErroApiCliente(resposta.status, erro.erro ?? 'erro', erro.mensagem);
      // 502/503/504 sem mensagem própria: é o proxy na frente de um servidor reiniciando (atualização automática).
      if (resposta.status >= 502 && resposta.status <= 504)
        throw new ErroApiCliente(resposta.status, erro?.erro ?? 'erro', 'O servidor está reiniciando (provavelmente atualizando). Tente de novo em alguns segundos.');
      throw new ErroApiCliente(resposta.status, erro?.erro ?? 'erro', 'O servidor teve um problema. Tente de novo em instantes.');
    }
    return dados as T;
  }

  return {
    cadastrar: (dados) => chamar('POST', '/api/auth/cadastro', dados),
    entrar: (dados) => chamar('POST', '/api/auth/login', dados),
    sair: () => chamar('POST', '/api/auth/sair'),
    eu: () => chamar('GET', '/api/eu'),
    naoLidas: () => chamar('GET', '/api/nao-lidas'),
    comunidades: () => chamar('GET', '/api/comunidades'),
    criarComunidade: (nome) => chamar('POST', '/api/comunidades', { nome }),
    entrarComunidade: (codigo) => chamar('POST', '/api/comunidades/entrar', { codigo }),
    sairComunidade: () => chamar('POST', '/api/comunidade/sair'),
    excluirComunidade: () => chamar('DELETE', '/api/comunidade'),
    renomearComunidade: (nome) => chamar('PATCH', '/api/comunidade', { nome }),
    castigar: (id, minutos, motivo) => chamar('POST', `/api/moderacao/${id}/castigo`, { minutos, motivo }),
    tirarCastigo: (id) => chamar('DELETE', `/api/moderacao/${id}/castigo`),
    expulsar: (id, motivo) => chamar('POST', `/api/moderacao/${id}/expulsar`, { motivo }),
    banir: (id, motivo) => chamar('POST', `/api/moderacao/${id}/banir`, { motivo }),
    banidos: () => chamar('GET', '/api/moderacao/banidos'),
    desbanir: (id) => chamar('DELETE', `/api/moderacao/banidos/${id}`),
    enviarIconeComunidade: (arquivo, nome) => {
      const form = new FormData();
      form.append('arquivo', arquivo, nome);
      return chamar('PUT', '/api/comunidade/icone', form);
    },
    removerIconeComunidade: () => chamar('DELETE', '/api/comunidade/icone'),
    situacaoMusica: () => chamar('GET', '/api/admin/musica'),
    enviarCookiesMusica: (conteudo) => chamar('PUT', '/api/admin/musica/cookies', { conteudo }),
    removerCookiesMusica: () => chamar('DELETE', '/api/admin/musica/cookies'),
    auditoria: (filtro) => chamar('GET', `/api/admin/auditoria${consulta(filtro)}`),
    atualizarPerfil: (dados) => chamar('PATCH', '/api/eu', dados),
    usuariosAdmin: () => chamar('GET', '/api/admin/usuarios'),
    mudarCargo: (id, cargo) => chamar('PATCH', `/api/admin/usuarios/${id}/cargo`, { cargo }),
    removerConta: (id) => chamar('DELETE', `/api/admin/usuarios/${id}`),
    gerarRedefinicao: (id) => chamar('POST', `/api/admin/usuarios/${id}/redefinicao`),
    previa: (url) => chamar('GET', `/api/previa?url=${encodeURIComponent(url)}`),
    criarFuncao: (f) => chamar('POST', '/api/admin/funcoes', f),
    editarFuncao: (id, f) => chamar('PUT', `/api/admin/funcoes/${id}`, f),
    removerFuncao: (id) => chamar('DELETE', `/api/admin/funcoes/${id}`),
    definirFuncao: (usuarioId, funcaoId) => chamar('PATCH', `/api/admin/usuarios/${usuarioId}/funcao`, { funcaoId }),
    redefinirSenha: (dados) => chamar('POST', '/api/auth/redefinir', dados),
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
    tokenVoz: (canalVozId) => chamar('POST', '/api/livekit/token', { canalVozId }),
    loja: () => chamar('GET', '/api/loja'),
    comprarNaLoja: (item) => chamar('POST', '/api/loja/comprar', item),
    extratoLoja: (antes) => chamar('GET', `/api/loja/extrato${consulta({ antes })}`),
    doisFatores: () => chamar('GET', '/api/conta/2fa'),
    iniciarDoisFatores: (senha) => chamar('POST', '/api/conta/2fa/iniciar', { senha }),
    ativarDoisFatores: (codigo) => chamar('POST', '/api/conta/2fa/ativar', { codigo }),
    desativarDoisFatores: (senha, codigo) => chamar('POST', '/api/conta/2fa/desativar', { senha, codigo }),
    desligarDoisFatoresDe: async (usuarioId) => {
      await chamar('POST', `/api/admin/usuarios/${usuarioId}/2fa/desligar`);
    },
    mensagensDm: (dmId, antes) => chamar('GET', `/api/dms/${dmId}/mensagens${consulta({ antes })}`),
    mensagensCanal: (canalId, antes) => chamar('GET', `/api/canais/${canalId}/mensagens${consulta({ antes })}`),
    enviarAvatar: (arquivo, nome) => {
      const form = new FormData();
      form.append('arquivo', arquivo, nome);
      return chamar('PUT', '/api/eu/avatar', form);
    },
  };
}
