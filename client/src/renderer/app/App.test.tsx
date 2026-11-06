// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ATALHOS_PADRAO, AUDIO_PADRAO, NOTIFICACOES_PADRAO, TELA_PADRAO, SONS_PADRAO, type ConfiguracoesLocais, type ConviteLink, type ServidorInfo, type UsuarioDto } from '@tofalando/shared';
import type { ApiTofalando, SessaoLocal } from '../../preload/api';

// A tela principal abre o tempo real; aqui só importa saber que chegou nela.
vi.mock('../telas/TelaPrincipal', () => ({
  TelaPrincipal: ({ servidorUrl }: { servidorUrl: string }) => <p>PRINCIPAL {servidorUrl}</p>,
}));
const testar = vi.fn();
vi.mock('../servicos/servidor', () => ({ testarServidor: (url: string) => testar(url) }));
const eu: UsuarioDto = { id: 1, usuario: 'ana', nomeExibicao: 'ana', cor: '#fff', avatarUrl: null, cargo: 'membro' };
vi.mock('../servicos/api', async (original) => ({
  ...(await original<typeof import('../servicos/api')>()),
  criarApi: () => ({ eu: async () => eu, sair: async () => undefined, cadastrar: async () => ({ token: 'novo', usuario: eu }) }),
}));

const { App } = await import('./App');

const info: ServidorInfo = { app: 'tofalany', nome: 'B', versao: '0.1.0', contas: 1, limiteContas: 20 };
const A = 'http://servidor-a:3000';
const B = 'http://servidor-b:3000';

function ponteFalsa(estado: { servidorUrl: string | null; sessao: SessaoLocal | null; pendente: ConviteLink | null }) {
  const gravarConfig = vi.fn(async (p: { servidorUrl?: string | null }): Promise<ConfiguracoesLocais> => {
    if (p.servidorUrl !== undefined) estado.servidorUrl = p.servidorUrl;
    return { servidorUrl: estado.servidorUrl, audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO };
  });
  const api: ApiTofalando = {
    atalhos: { aoEvento: () => () => undefined, pausar: async () => undefined },
    presenca: { ausente: async () => false, aoMudar: () => () => undefined },
    captura: { fontes: async () => [], escolher: async () => undefined, audioDisponivel: false },
    rede: { servidorPendente: async () => undefined },
    config: { ler: async () => ({ servidorUrl: estado.servidorUrl, audio: AUDIO_PADRAO, atalhos: ATALHOS_PADRAO, pessoas: {}, sons: SONS_PADRAO, notificacoes: NOTIFICACOES_PADRAO, tela: TELA_PADRAO }), gravar: gravarConfig },
    sessao: {
      ler: async () => estado.sessao,
      gravar: async (s) => void (estado.sessao = s),
      apagar: async () => void (estado.sessao = null),
    },
    convite: { pendente: async () => estado.pendente, aoChegar: () => () => undefined },
    areaTransferencia: { copiar: async () => undefined },
    arquivos: { baixar: async () => null, abrir: async () => undefined },
    notificacoes: { mostrar: async () => false, aoClicar: () => () => undefined },
  };
  window.tofalando = api;
  return { gravarConfig, estado };
}

beforeEach(() => testar.mockReset());
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
    expect(gravarConfig).not.toHaveBeenCalled();
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
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-forte-1' } });
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
