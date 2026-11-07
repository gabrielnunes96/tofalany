import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';

let pasta: string;
let servidor: FastifyInstance | undefined;
let porta = 0;

/** Sobe o servidor compilado com banco em arquivo; na segunda vez, na mesma porta e com o mesmo banco. */
async function subirServidor(): Promise<string> {
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(
    lerConfig({
      NOME_SERVIDOR: 'Turma E2E',
      LOG: 'false',
      BANCO: join(pasta, 'tofalando.db'),
      CODIGO_CONVITE: CONVITE,
      TENTATIVAS_POR_MINUTO: '1000',
      INTERVALO_SESSAO_MS: '300',
    }),
  );
  await servidor.listen({ port: porta, host: '127.0.0.1' });
  porta = (servidor.server.address() as AddressInfo).port;
  return `http://127.0.0.1:${porta}`;
}

async function derrubarServidor() {
  await servidor?.close();
  servidor = undefined;
}

test.beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-tr-'));
  porta = 0;
});

test.afterEach(async () => {
  await derrubarServidor();
  rmSync(pasta, { recursive: true, force: true });
});

async function abrirLogado(url: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, 'app') } });
  const janela = await app.firstWindow();
  await janela.getByLabel('Endereço do servidor').fill(url);
  await janela.getByRole('button', { name: 'Conectar' }).click();
  await janela.getByRole('button', { name: 'Tenho um convite' }).click();
  await janela.getByLabel('Código de convite').fill(CONVITE);
  await janela.getByLabel('Nome de usuário').fill('dono');
  await janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  if (await janela.getByLabel('Confirmar senha').count()) await janela.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await janela.getByRole('button', { name: 'Criar conta' }).click();
  await expect(janela.getByRole('list', { name: 'Membros' })).toContainText('dono');
  return { app, janela };
}

test('CA-42 (texto): queda do servidor mostra "reconectando" e o app volta sozinho', async () => {
  const url = await subirServidor();
  const { app, janela } = await abrirLogado(url);
  await expect(janela.getByTestId('faixa-conexao')).toBeHidden();

  await derrubarServidor();
  await expect(janela.getByTestId('faixa-conexao')).toHaveText('Sem conexão com o servidor. Reconectando…');

  await subirServidor();
  await expect(janela.getByTestId('faixa-conexao')).toBeHidden({ timeout: 15_000 });
  await expect(janela.getByTestId('usuario-logado')).toHaveText('Olá, dono');
  await expect(janela.getByRole('list', { name: 'Membros' })).toContainText('dono');
  await app.close();
});

/**
 * Intermediário TCP que simula o cabo puxado: ao cortar, segura os bytes sem fechar as conexões
 * (sem FIN/RST), como numa queda real de Wi-Fi; ao restaurar, descarta as conexões presas.
 */
async function criarIntermediario(portaDestino: number) {
  const { createServer, connect } = await import('node:net');
  let cortado = false;
  const presos = new Set<import('node:net').Socket>();
  const proxy = createServer((cliente) => {
    if (cortado) {
      cliente.pause();
      presos.add(cliente);
      return;
    }
    const destino = connect(portaDestino, '127.0.0.1');
    cliente.pipe(destino);
    destino.pipe(cliente);
    const fechar = () => {
      cliente.destroy();
      destino.destroy();
    };
    cliente.on('error', fechar);
    destino.on('error', fechar);
    cliente.on('close', () => !cortado && destino.destroy());
    destino.on('close', () => !cortado && cliente.destroy());
    pares.add([cliente, destino]);
  });
  const pares = new Set<[import('node:net').Socket, import('node:net').Socket]>();
  await new Promise<void>((r) => proxy.listen(0, '127.0.0.1', r));
  return {
    url: `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`,
    cortar() {
      cortado = true;
      for (const [a, b] of pares) {
        a.unpipe(b);
        b.unpipe(a);
        a.pause();
        b.pause();
        presos.add(a);
        presos.add(b);
      }
      pares.clear();
    },
    restaurar() {
      cortado = false;
      for (const s of presos) s.destroy();
      presos.clear();
    },
    fechar: () =>
      new Promise<void>((r) => {
        for (const s of presos) s.destroy();
        proxy.close(() => r());
      }),
  };
}

test('CA-42 (texto): queda de rede sem fechar a conexão (cabo puxado) por 10 s mostra o aviso e volta sozinho', async () => {
  test.setTimeout(90_000);
  await subirServidor();
  const rede = await criarIntermediario(porta);
  const { app, janela } = await abrirLogado(rede.url);
  await expect(janela.getByTestId('faixa-conexao')).toBeHidden();

  const inicio = Date.now();
  rede.cortar();
  // O batimento (5 s + 4 s de tolerância) percebe a queda antes de completar 10 s.
  await expect(janela.getByTestId('faixa-conexao')).toHaveText('Sem conexão com o servidor. Reconectando…', { timeout: 10_000 });
  const percebeuEm = Date.now() - inicio;
  expect(percebeuEm).toBeLessThan(10_000);

  // Rede volta depois de 10 s de queda.
  await janela.waitForTimeout(Math.max(0, 10_000 - percebeuEm));
  rede.restaurar();
  await expect(janela.getByTestId('faixa-conexao')).toBeHidden({ timeout: 15_000 });
  await expect(janela.getByRole('list', { name: 'Membros' })).toContainText('dono');
  await app.close();
  await rede.fechar();
});

test('sessão revogada no servidor (ex.: senha redefinida pelo comando) leva ao login com aviso', async () => {
  const url = await subirServidor();
  const { app, janela } = await abrirLogado(url);

  servidor!.banco.prepare('DELETE FROM sessoes').run();
  await expect(janela.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(janela.getByRole('status')).toHaveText('Sua sessão foi encerrada. Entre de novo.');
  await app.close();
});
