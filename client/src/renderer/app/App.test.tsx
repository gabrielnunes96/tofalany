// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ATALHOS_PADRAO,
  AUDIO_PADRAO,
  NOTIFICACOES_PADRAO,
  TELA_PADRAO,
  SONS_PADRAO,
  type ConfiguracoesLocais,
  type ConviteLink,
  type ServidorInfo,
  type UsuarioDto,
} from '@tofalando/shared';
import type { ApiTofalando, SessaoLocal } from '../../preload/api';
import type { ServidorConhecido } from '@tofalando/shared';

// A tela principal abre o tempo real; aqui só importa saber que chegou nela.
const montagens = vi.fn();
vi.mock('../telas/TelaPrincipal', async () => {
  const { useEffect } = await import('react');
  return {
    TelaPrincipal: (p: {
      servidorUrl: string;
      oculta?: boolean;
      adminDaInstalacao?: boolean;
      aoConvite?: (c: { servidor: string; codigo: string }) => Promise<string | null>;
      aoAtualizarApp?: () => void;
      pedidoSairVoz?: number;
      aoVoz?: (v: { canal: string; servidor: string } | null) => void;
      vozEmOutro?: { canal: string; servidor: string; aoVoltar(): void; aoDesconectar(): void } | null;
    }) => {
      useEffect(() => {
        montagens(p.servidorUrl);
      }, [p.servidorUrl]);
      return (
        <div>
          <p>
            PRINCIPAL {p.servidorUrl}
            {p.oculta ? ' (escondida)' : ''}
            {p.pedidoSairVoz ? ` sair:${p.pedidoSairVoz}` : ''}
            {p.adminDaInstalacao ? ' (admin da instalação)' : ''}
          </p>
          <button type="button" onClick={() => void p.aoConvite?.({ servidor: `${p.servidorUrl.replace(/\/c\/\d+$/, '')}/c/2`, codigo: 'familia-1' })}>
            convite {p.servidorUrl}
          </button>
          <button type="button" onClick={() => p.aoAtualizarApp?.()}>
            atualizar o app {p.servidorUrl}
          </button>
          <button type="button" onClick={() => p.aoVoz?.({ canal: 'Papo', servidor: 'Turma' })}>
            entrar na voz {p.servidorUrl}
          </button>
          <button type="button" onClick={() => p.aoVoz?.(null)}>
            sair da voz {p.servidorUrl}
          </button>
          {p.vozEmOutro && (
            <>
              <span>voz em {p.vozEmOutro.canal}</span>
              <button type="button" onClick={p.vozEmOutro.aoDesconectar}>
                desconectar
              </button>
            </>
          )}
        </div>
      );
    },
  };
});
const testar = vi.fn();
/** Lista de servidores da instalação: por padrão, falha (os testes antigos não dependem dela). */
const entrarDe = vi.fn(async (_url: string, _codigo: string) => ({ id: 2, nome: 'Família', url: '', iconeUrl: null }));
const comunidadesDe = vi.fn(async (): Promise<unknown[]> => Promise.reject(new Error('sem lista')));
// O teste real devolve o endereço a guardar; os casos aqui só dizem ok/erro (o endereço é o mesmo pedido).
vi.mock('../servicos/servidor', () => ({
  testarServidor: async (url: string) => {
    const r = (await testar(url)) as { ok: boolean; valor?: object; erro?: string } | undefined;
    if (!r) return { ok: false, erro: 'sem resposta' };
    return r.ok ? { ...r, valor: { endereco: url, ...r.valor } } : r;
  },
}));
// Quem responde "eu" (servidor fora do ar = erro de conexão), por endereço.
const euDe = vi.fn(async (_url: string): Promise<UsuarioDto> => eu);
const eu: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'ana', cor: '#fff', avatarUrl: null, cargo: 'membro' };
vi.mock('../servicos/api', async (original) => ({
  ...(await original<typeof import('../servicos/api')>()),
  criarApi: (url: string) => ({
    eu: async () => euDe(url),
    sair: async () => undefined,
    cadastrar: async () => ({ token: 'novo', usuario: eu }),
    comunidades: () => comunidadesDe(),
    entrarComunidade: (codigo: string) => entrarDe(url, codigo),
  }),
}));

const { App } = await import('./App');

const info: ServidorInfo = { app: 'tofalany', nome: 'B', versao: '0.1.0', contas: 1, limiteContas: 20 };
const A = 'http://servidor-a:3000';
const B = 'http://servidor-b:3000';

function ponteFalsa(estado: {
  servidorUrl: string | null;
  sessao: SessaoLocal | null;
  pendente: ConviteLink | null;
  /** Modo armazém: uma sessão por endereço (como o de verdade). */
  sessoes?: Record<string, SessaoLocal>;
  servidores?: ServidorConhecido[];
}) {
  const gravarConfig = vi.fn(async (p: { servidorUrl?: string | null; servidores?: ServidorConhecido[] }): Promise<ConfiguracoesLocais> => {
    if (p.servidorUrl !== undefined) estado.servidorUrl = p.servidorUrl;
    if (p.servidores !== undefined) estado.servidores = p.servidores;
    return {
      servidorUrl: estado.servidorUrl,
      servidores: estado.servidores,
      audio: AUDIO_PADRAO,
      atalhos: ATALHOS_PADRAO,
      pessoas: {},
      sons: SONS_PADRAO,
      notificacoes: NOTIFICACOES_PADRAO,
      tela: TELA_PADRAO,
    };
  });
  const api: ApiTofalando = {
    versao: '0.0.0-teste',
    modoTeste: false,
    atalhos: { aoEvento: () => () => undefined, pausar: async () => undefined },
    presenca: { ausente: async () => false, aoMudar: () => () => undefined },
    captura: {
      fontes: async () => [],
      escolher: async () => 'nenhum' as const,
      audioDisponivel: { disponivel: false },
      pararSom: async () => undefined,
      mesmaTela: async () => false,
    },
    rede: { servidorPendente: async () => undefined, video: async () => undefined, gif: async () => undefined },
    atualizacao: {
      estado: async () => null,
      aoMudar: () => () => undefined,
      instalar: async () => undefined,
      abrirPagina: async () => undefined,
      procurar: async () => ({ situacao: 'atualizado' as const }),
      agora: async () => ({ situacao: 'atualizado' as const }),
      recusar: async () => undefined,
      aoProgresso: () => () => undefined,
      aoFalhar: () => () => undefined,
    },
    config: {
      ler: async () => ({
        servidorUrl: estado.servidorUrl,
        servidores: estado.servidores,
        audio: AUDIO_PADRAO,
        atalhos: ATALHOS_PADRAO,
        pessoas: {},
        sons: SONS_PADRAO,
        notificacoes: NOTIFICACOES_PADRAO,
        tela: TELA_PADRAO,
      }),
      gravar: gravarConfig,
    },
    sessao: estado.sessoes
      ? {
          ler: async (url?: string) => (url ? (estado.sessoes![url] ?? null) : null),
          gravar: async (s) => void (estado.sessoes![s.servidorUrl] = s),
          apagar: async (url?: string) => void (url && delete estado.sessoes![url]),
        }
      : {
          ler: async (url?: string) => (estado.sessao && (!url || estado.sessao.servidorUrl === url) ? estado.sessao : null),
          gravar: async (s) => void (estado.sessao = s),
          // Como o armazém de verdade: apaga só a sessão do endereço pedido (sem endereço, a atual).
          apagar: async (url?: string) => void (!url || estado.sessao?.servidorUrl === url ? (estado.sessao = null) : undefined),
        },
    convite: { pendente: async () => estado.pendente, aoChegar: () => () => undefined },
    areaTransferencia: { copiar: async () => undefined },
    arquivos: { baixar: async () => null, abrir: async () => undefined },
    notificacoes: { mostrar: async () => false, aoClicar: () => () => undefined },
  };
  window.tofalando = api;
  return { gravarConfig, estado };
}

beforeEach(() => {
  testar.mockReset();
  euDe.mockReset();
  euDe.mockImplementation(async () => eu);
});
afterEach(cleanup);

describe('App — link de convite (RF-1a)', () => {
  it('com sessão no mesmo servidor, só entra (sem tela de cadastro)', async () => {
    testar.mockResolvedValue({ ok: true, valor: info });
    ponteFalsa({ servidorUrl: B, sessao: { servidorUrl: B, token: 't' }, pendente: { servidor: B, codigo: 'turma-2026' } });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${B}`)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Criar conta' })).toBeNull();
  });

  it('sem sessão: abre o cadastro com o código, NÃO troca o servidor salvo; cancelar volta ao anterior', async () => {
    testar.mockResolvedValue({ ok: true, valor: info });
    const { gravarConfig, estado } = ponteFalsa({ servidorUrl: A, sessao: { servidorUrl: A, token: 't' }, pendente: null });
    let chegar: (c: ConviteLink) => void = () => undefined;
    window.tofalando.convite.aoChegar = (fn) => ((chegar = fn), () => undefined);
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${A}`)).toBeTruthy();

    chegar({ servidor: B, codigo: 'turma-2026' });
    expect(await screen.findByRole('heading', { name: 'Criar conta' })).toBeTruthy();
    expect((screen.getByLabelText('Código de convite') as HTMLInputElement).value).toBe('turma-2026');
    expect(gravarConfig).not.toHaveBeenCalledWith(expect.objectContaining({ servidorUrl: expect.anything() }));
    expect(estado.servidorUrl).toBe(A);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar convite' }));
    expect(await screen.findByText(`PRINCIPAL ${A}`)).toBeTruthy();
  });

  it('servidor só vira o padrão depois de entrar', async () => {
    testar.mockResolvedValue({ ok: true, valor: info });
    const { estado } = ponteFalsa({ servidorUrl: null, sessao: null, pendente: { servidor: B, codigo: 'turma-2026' } });
    render(<App />);
    await screen.findByRole('heading', { name: 'Criar conta' });
    expect(estado.servidorUrl).toBeNull();
    fireEvent.change(screen.getByLabelText('Nome de usuário'), { target: { value: 'ana' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'Senha-forte-1' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'Senha-forte-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    expect(await screen.findByText(`PRINCIPAL ${B}`)).toBeTruthy();
    expect(estado.servidorUrl).toBe(B);
  });

  it('servidor fora do ar: "sem conexão"; "Tentar de novo" mantém o convite', async () => {
    testar.mockResolvedValueOnce({ ok: false, erro: 'Não foi possível conectar.' }).mockResolvedValue({ ok: true, valor: info });
    ponteFalsa({ servidorUrl: null, sessao: null, pendente: { servidor: B, codigo: 'turma-2026' } });
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sem conexão' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect((screen.getByLabelText('Código de convite') as HTMLInputElement).value).toBe('turma-2026'));
  });
});

describe('App — voz continua ao olhar outro servidor', () => {
  it('a tela do servidor com voz fica montada e escondida; a outra mostra a barra; desconectar pede a saída; sair da voz a desmonta', async () => {
    const A2 = `${A}/c/2`;
    const { gravarConfig } = ponteFalsa({ servidorUrl: A, sessao: { servidorUrl: A, token: 't' }, pendente: null });
    testar.mockResolvedValue({ ok: true, valor: info });
    const config = window.tofalando.config.ler;
    window.tofalando.config.ler = async () => ({
      ...(await config()),
      servidores: [
        { url: A, nome: 'Turma' },
        { url: A2, nome: 'Família' },
      ],
    });
    window.tofalando.sessao.ler = async (url?: string) => ({ servidorUrl: url ?? A, token: 't' });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${A}`)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `entrar na voz ${A}` }));

    // Vai para o outro servidor: a tela de A continua (escondida), sem remontar.
    montagens.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /Família/ }));
    expect(await screen.findByText(`PRINCIPAL ${A2}`)).toBeTruthy();
    expect(screen.getByText(`PRINCIPAL ${A} (escondida)`)).toBeTruthy();
    expect(montagens).not.toHaveBeenCalledWith(A);
    expect(screen.getByText('voz em Papo')).toBeTruthy();

    // Desconectar daqui pede à tela de A que saia da voz; quando ela sai, é desmontada.
    fireEvent.click(screen.getByRole('button', { name: 'desconectar' }));
    expect(screen.getByText(/sair:1/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `sair da voz ${A}`, hidden: true }));
    await waitFor(() => expect(screen.queryByText(/^PRINCIPAL http:\/\/servidor-a:3000( \(escondida\))?( sair:\d+)?$/)).toBeNull());
    expect(screen.queryByText('voz em Papo')).toBeNull();
    expect(gravarConfig).toHaveBeenCalled();
  });
});

describe('App — novidades da versão', () => {
  it('depois de atualizar mostra as notas uma vez; "Entendi" guarda a versão vista', async () => {
    const { gravarConfig } = ponteFalsa({ servidorUrl: A, sessao: { servidorUrl: A, token: 't' }, pendente: null });
    testar.mockResolvedValue({ ok: true, valor: info });
    window.tofalando.versao = '0.14.0';
    const ler = window.tofalando.config.ler;
    window.tofalando.config.ler = async () => ({ ...(await ler()), novidadesVistas: '0.13.0' });
    render(<App />);
    const janela = await screen.findByRole('dialog', { name: 'Novidades da versão 0.14.0' });
    expect(janela.textContent).toContain('Várias transmissões');
    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));
    expect(screen.queryByRole('dialog', { name: /Novidades/ })).toBeNull();
    expect(gravarConfig).toHaveBeenCalledWith({ novidadesVistas: '0.14.0' });
  });

  it('instalação nova não mostra, só guarda a versão', async () => {
    const { gravarConfig } = ponteFalsa({ servidorUrl: null, sessao: null, pendente: null });
    window.tofalando.versao = '0.14.0';
    render(<App />);
    await waitFor(() => expect(gravarConfig).toHaveBeenCalledWith({ novidadesVistas: '0.14.0' }));
    expect(screen.queryByRole('dialog', { name: /Novidades/ })).toBeNull();
  });
});

describe('App — servidor que mudou de endereço (item 41)', () => {
  const ANTIGO = 'http://servidor-velho:3000';
  function comLista(servidorUrl: string, servidores: { url: string; nome: string }[]) {
    const r = ponteFalsa({ servidorUrl, sessao: { servidorUrl, token: 't' }, pendente: null });
    const ler = window.tofalando.config.ler;
    window.tofalando.config.ler = async () => ({ ...(await ler()), servidores });
    window.tofalando.sessao.ler = async (url?: string) => ({ servidorUrl: url ?? servidorUrl, token: 't' });
    testar.mockImplementation(async (url?: string) => (String(url).startsWith(ANTIGO) ? { ok: false, erro: 'fora do ar' } : { ok: true, valor: info }));
    return r;
  }
  const lista = [
    { url: A, nome: 'Turma' },
    { url: ANTIGO, nome: 'Turma' },
    { url: `${ANTIGO}/c/2`, nome: 'Família' },
  ];

  it('o mesmo servidor noutro endereço que não responde: pergunta, com o foco em "Manter"; "Tirar da lista" tira o endereço antigo inteiro sem trocar de tela', async () => {
    const { gravarConfig } = comLista(A, lista);
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${A}`)).toBeTruthy();
    const janela = await screen.findByRole('alertdialog', { name: 'O servidor mudou de endereço?' });
    expect(janela.textContent).toContain('servidor-velho:3000');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Manter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tirar da lista' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /servidor-velho/ })).toBeNull());
    expect(gravarConfig).toHaveBeenCalledWith({ servidores: [{ url: A, nome: 'Turma' }] });
    expect(screen.getByText(`PRINCIPAL ${A}`)).toBeTruthy();
    expect(testar).toHaveBeenCalledWith(ANTIGO);
  });

  it('"Manter" não tira nada', async () => {
    const { gravarConfig } = comLista(A, lista);
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: 'Manter' }));
    expect(screen.queryByRole('alertdialog', { name: /mudou de endereço/ })).toBeNull();
    expect(screen.getAllByRole('button', { name: /servidor-velho/ })).toHaveLength(2);
    expect(gravarConfig).not.toHaveBeenCalledWith(expect.objectContaining({ servidores: expect.anything() }));
  });

  it('endereço antigo que ainda responde: não pergunta', async () => {
    comLista(A, lista);
    testar.mockResolvedValue({ ok: true, valor: info });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${A}`)).toBeTruthy();
    await waitFor(() => expect(testar).toHaveBeenCalledWith(ANTIGO));
    expect(screen.queryByRole('alertdialog', { name: /mudou de endereço/ })).toBeNull();
  });

  it('"Sem conexão": "Tirar da lista" tira o servidor aberto e vai para outro', async () => {
    const { gravarConfig } = comLista(ANTIGO, [
      { url: ANTIGO, nome: 'Velho' },
      { url: A, nome: 'Turma' },
    ]);
    const { ErroApiCliente } = await import('../servicos/api');
    euDe.mockImplementation(async (url: string) => {
      if (url.startsWith(ANTIGO)) throw new ErroApiCliente(0, 'sem_conexao', 'Sem conexão com o servidor.');
      return eu;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sem conexão' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tirar da lista' }));
    expect(await screen.findByText(`PRINCIPAL ${A}`)).toBeTruthy();
    expect(gravarConfig).toHaveBeenCalledWith({ servidores: [{ url: A, nome: 'Turma' }], servidorUrl: A });
    vi.restoreAllMocks();
  });
});

describe('App — ToOuvini de qualquer servidor (qualidade-de-vida, RF-1)', () => {
  it('CA-1: num servidor que não é o principal, o administrador do principal recebe adminDaInstalacao', async () => {
    comunidadesDe.mockResolvedValueOnce([{ id: 2, nome: 'Família', url: `${B}/c/2`, iconeUrl: null }]);
    euDe.mockImplementation(async (url: string) => ({ ...eu, cargo: url === B ? 'admin' : 'membro' }));
    ponteFalsa({ servidorUrl: `${B}/c/2`, sessao: { servidorUrl: `${B}/c/2`, token: 't' }, pendente: null });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${B}/c/2 (admin da instalação)`)).toBeTruthy();
  });

  it('CA-2: administrador só do servidor aberto (membro no principal) não recebe', async () => {
    comunidadesDe.mockResolvedValueOnce([{ id: 2, nome: 'Família', url: `${B}/c/2`, iconeUrl: null }]);
    euDe.mockImplementation(async (url: string) => ({ ...eu, cargo: url === B ? 'membro' : 'admin' }));
    ponteFalsa({ servidorUrl: `${B}/c/2`, sessao: { servidorUrl: `${B}/c/2`, token: 't' }, pendente: null });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${B}/c/2`)).toBeTruthy();
    // Espera a conferência na base terminar antes de dizer que a prop não veio.
    await waitFor(() => expect(euDe).toHaveBeenCalledWith(B));
    await act(async () => undefined);
    expect(screen.queryByText(/admin da instalação/)).toBeNull();
  });
});

describe('App — convite clicado numa mensagem e "Atualizar o app" (qualidade-de-vida)', () => {
  it('RF-4 (segurança): a confirmação diz o nome do servidor; recusar não entra; aceitar entra', async () => {
    testar.mockResolvedValue({ ok: true, valor: { ...info, nome: 'Família' } });
    ponteFalsa({ servidorUrl: B, sessao: { servidorUrl: B, token: 't' }, pendente: null });
    render(<App />);
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(await screen.findByRole('button', { name: `convite ${B}` }));
    await waitFor(() => expect(confirmar).toHaveBeenCalledWith('Entrar no servidor «Família»? Os membros de lá vão ver seu status e sua atividade.'));
    expect(entrarDe).not.toHaveBeenCalled();
    confirmar.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: `convite ${B}` }));
    await waitFor(() => expect(entrarDe).toHaveBeenCalledWith(`${B}/c/2`, 'familia-1'));
    confirmar.mockRestore();
  });

  it('RF-5: "Atualizar o app" do menu chega ao processo principal', async () => {
    ponteFalsa({ servidorUrl: B, sessao: { servidorUrl: B, token: 't' }, pendente: null });
    const agora = vi.fn(async () => ({ situacao: 'atualizado' as const }));
    window.tofalando.atualizacao.agora = agora;
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: `atualizar o app ${B}` }));
    await waitFor(() => expect(agora).toHaveBeenCalled());
    expect(await screen.findByText('Você já está na versão mais nova.')).toBeTruthy();
  });
});

describe('App — endereço que mudou para o fixo (infra-e-atualizacao, CA-4)', () => {
  const DE = 'https://168-138-133-232.sslip.io';
  const PARA = 'https://tofalany.duckdns.org';

  it('abre no endereço novo com a mesma sessão (sem novo login)', async () => {
    testar.mockImplementation(async (url: string) => ({ ok: true, valor: { ...info, nome: 'ToFalany', endereco: url.replace(/\/+$/, '') } }));
    const { estado, gravarConfig } = ponteFalsa({ servidorUrl: DE, sessao: { servidorUrl: DE, token: 'mesmo-token' }, pendente: null });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${PARA}`)).toBeTruthy();
    expect(estado.sessao).toEqual({ servidorUrl: PARA, token: 'mesmo-token' });
    expect(gravarConfig).toHaveBeenCalledWith(expect.objectContaining({ servidorUrl: PARA }));
  });

  it('várias entradas do endereço antigo (servidores e sessões): todas vão para o novo; o que já estava no novo fica', async () => {
    testar.mockImplementation(async (url: string) => ({ ok: true, valor: { ...info, nome: 'ToFalany', endereco: url.replace(/\/+$/, '') } }));
    const sessoes: Record<string, SessaoLocal> = {
      [DE]: { servidorUrl: DE, token: 't1' },
      [`${DE}/c/2`]: { servidorUrl: `${DE}/c/2`, token: 't2' },
      [`${PARA}/c/2`]: { servidorUrl: `${PARA}/c/2`, token: 'ja-no-novo' },
    };
    const { estado } = ponteFalsa({
      servidorUrl: DE,
      sessao: null,
      pendente: null,
      sessoes,
      servidores: [
        { url: DE, nome: 'ToFalany' },
        { url: `${DE}/c/2`, nome: 'Família antigo' },
        { url: `${PARA}/c/2`, nome: 'Família' },
      ],
    });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${PARA}`)).toBeTruthy();
    expect(estado.servidores!.map((s) => s.url).sort()).toEqual([PARA, `${PARA}/c/2`]);
    expect(estado.servidores!.find((s) => s.url === `${PARA}/c/2`)!.nome).toBe('Família');
    expect(sessoes[PARA]).toEqual({ servidorUrl: PARA, token: 't1' });
    expect(sessoes[`${PARA}/c/2`]!.token).toBe('ja-no-novo');
    expect(sessoes[DE]).toBeUndefined();
    expect(sessoes[`${DE}/c/2`]).toBeUndefined();
  });

  it('endereço antigo fora do ar: troca mesmo assim (o mapa no código é a autoridade)', async () => {
    testar.mockImplementation(async (url: string) =>
      url.includes('sslip') ? { ok: false, erro: 'sem conexão' } : { ok: true, valor: { ...info, nome: 'ToFalany', endereco: url.replace(/\/+$/, '') } },
    );
    const sessoes: Record<string, SessaoLocal> = { [DE]: { servidorUrl: DE, token: 't1' } };
    ponteFalsa({ servidorUrl: DE, sessao: null, pendente: null, sessoes, servidores: [{ url: DE, nome: 'ToFalany' }] });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${PARA}`)).toBeTruthy();
    expect(sessoes[PARA]?.token).toBe('t1');
  });

  it('configuração que não grava: nada muda (nem as sessões)', async () => {
    testar.mockImplementation(async (url: string) => ({ ok: true, valor: { ...info, nome: 'ToFalany', endereco: url.replace(/\/+$/, '') } }));
    const sessoes: Record<string, SessaoLocal> = { [DE]: { servidorUrl: DE, token: 't1' } };
    const { gravarConfig } = ponteFalsa({ servidorUrl: DE, sessao: null, pendente: null, sessoes, servidores: [{ url: DE, nome: 'ToFalany' }] });
    // Falha só na gravação da troca (outras gravações do início, como a versão vista, seguem).
    const original = gravarConfig.getMockImplementation()!;
    gravarConfig.mockImplementation(async (p) => {
      if (p.servidores?.some((s) => s.url.startsWith(PARA))) throw new Error('disco cheio');
      return original(p);
    });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${DE}`)).toBeTruthy();
    expect(sessoes[DE]?.token).toBe('t1');
    expect(sessoes[PARA]).toBeUndefined();
  });

  it('nome da instalação diferente no endereço novo: não troca', async () => {
    testar.mockImplementation(async (url: string) => ({
      ok: true,
      valor: { ...info, nome: url.includes('duckdns') ? 'Outro' : 'ToFalany', endereco: url.replace(/\/+$/, '') },
    }));
    ponteFalsa({ servidorUrl: DE, sessao: { servidorUrl: DE, token: 'mesmo-token' }, pendente: null });
    render(<App />);
    expect(await screen.findByText(`PRINCIPAL ${DE}`)).toBeTruthy();
  });
});
