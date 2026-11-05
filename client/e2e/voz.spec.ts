import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';
/** Prints das telas principais, para conferir a olho (ficam em docs/demandas/.../prints). */
const PRINTS = join(__dirname, '../../docs/demandas/to-falando-v1/prints');
const print = (janela: Page, nome: string) => janela.screenshot({ path: join(PRINTS, `${nome}.png`) });

let pasta: string;
let servidor: FastifyInstance;
let url: string;

const LIVEKIT_HTTP = 'http://127.0.0.1:7880';
const CONTEINER = 'tofalany-livekit-e2e';
let subiuLivekit = false;

async function livekitNoAr(): Promise<boolean> {
  try {
    return (await fetch(LIVEKIT_HTTP, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

// LiveKit em modo dev (chaves devkey/secret) no Docker; reaproveita um que já esteja no ar.
test.beforeAll(async () => {
  test.setTimeout(60_000);
  if (await livekitNoAr()) return;
  execFileSync('docker', ['run', '-d', '--rm', '--name', CONTEINER, '-p', '7880:7880', '-p', '7881:7881', '-p', '7882:7882/udp', 'livekit/livekit-server:v1.13.11', '--dev', '--bind', '0.0.0.0', '--node-ip', '127.0.0.1']);
  subiuLivekit = true;
  for (let i = 0; i < 40 && !(await livekitNoAr()); i++) await new Promise((r) => setTimeout(r, 250));
});

test.afterAll(() => {
  if (subiuLivekit) execFileSync('docker', ['stop', CONTEINER]);
});

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-voz-'));
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(
    lerConfig({
      LOG: 'false',
      BANCO: ':memory:',
      CODIGO_CONVITE: CONVITE,
      TENTATIVAS_POR_MINUTO: '1000',
      LIVEKIT_URL: 'ws://127.0.0.1:7880',
      LIVEKIT_API_KEY: 'devkey',
      LIVEKIT_API_SECRET: 'secret',
    }),
  );
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterEach(async () => {
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

async function abrirApp(nome: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome), TOFALANDO_MIDIA_FALSA: '1' } });
  return { app, janela: await app.firstWindow() };
}

async function entrar(nome: string, criar: boolean): Promise<{ app: ElectronApplication; janela: Page }> {
  const { app, janela } = await abrirApp(nome);
  await janela.getByLabel('Endereço do servidor').fill(url);
  await janela.getByRole('button', { name: 'Conectar' }).click();
  if (criar) {
    await janela.getByRole('button', { name: 'Tenho um convite' }).click();
    await janela.getByLabel('Código de convite').fill(CONVITE);
  }
  await janela.getByLabel('Nome de usuário').fill(nome);
  await janela.getByLabel('Senha').fill('senha-forte-1');
  await janela.getByRole('button', { name: criar ? 'Criar conta' : 'Entrar' }).click();
  await expect(janela.getByRole('list', { name: 'Membros' })).toBeVisible();
  return { app, janela };
}

test('CA-20, CA-49: dois apps no canal de voz; um ouve o outro, o indicador de fala acende e a auditoria registra', async () => {
  test.setTimeout(90_000);
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);

  await dono.janela.getByRole('button', { name: 'Criar canal de voz' }).click();
  await dono.janela.getByLabel('Nome do novo canal de voz').fill('Papo');
  await dono.janela.getByRole('button', { name: 'Criar', exact: true }).click();

  for (const p of [dono, ana]) {
    await p.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
    await expect(p.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 15_000 });
  }
  const naVozDaAna = ana.janela.getByRole('list', { name: 'Na voz em Papo' });
  await expect(naVozDaAna.getByRole('listitem')).toHaveCount(2);
  await expect(dono.janela.getByRole('button', { name: 'Papo, você está aqui' })).toBeVisible();

  // A ana recebe o áudio do dono (faixa assinada) e vê o indicador de fala dele (o microfone falso apita).
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(1, { timeout: 15_000 });
  await expect(naVozDaAna.getByRole('listitem', { name: 'dono, falando' })).toBeVisible({ timeout: 15_000 });
  await print(ana.janela, 'T14-voz-ana-ve-dono-falando');
  await print(dono.janela, 'T14-voz-dono-conectado');

  await ana.janela.getByRole('button', { name: 'Sair da voz' }).click();
  await expect(dono.janela.getByRole('list', { name: 'Na voz em Papo' }).getByRole('listitem')).toHaveCount(1);
  await expect(dono.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(0, { timeout: 15_000 });

  // Trocar de canal: a ana vê o dono no canal novo e o antigo fica vazio.
  await dono.janela.getByRole('button', { name: 'Criar canal de voz' }).click();
  await dono.janela.getByLabel('Nome do novo canal de voz').fill('Jogo');
  await dono.janela.getByRole('button', { name: 'Criar', exact: true }).click();
  await dono.janela.getByRole('button', { name: 'Entrar no canal de voz Jogo' }).click();
  await expect(dono.janela.getByRole('button', { name: 'Jogo, você está aqui' })).toBeVisible({ timeout: 15_000 });
  await expect(ana.janela.getByRole('list', { name: 'Na voz em Jogo' }).getByRole('listitem')).toHaveCount(1);
  await expect(ana.janela.getByRole('list', { name: 'Na voz em Papo' })).toHaveCount(0);

  const registros = servidor.banco.prepare("SELECT tipo, detalhes FROM auditoria WHERE tipo LIKE 'voz_%' ORDER BY id").all() as { tipo: string; detalhes: string }[];
  expect(registros.map((r) => [r.tipo, JSON.parse(r.detalhes).canalNome])).toEqual([
    ['voz_entrou', 'Papo'],
    ['voz_entrou', 'Papo'],
    ['voz_saiu', 'Papo'],
    ['voz_saiu', 'Papo'],
    ['voz_entrou', 'Jogo'],
  ]);

  await dono.app.close();
  await ana.app.close();
});

test('CA-25, CA-28, CA-30: teste de microfone com RNNoise, troca de microfone na chamada e escolhas guardadas', async () => {
  test.setTimeout(120_000);
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  const j = dono.janela;

  // CA-28: o medidor se mexe com o microfone (falso, que apita) e a supressão forte carrega no app empacotado.
  await j.getByRole('button', { name: 'Configurações' }).click();
  await j.getByRole('button', { name: 'Testar microfone' }).click();
  await expect(j.getByRole('status').filter({ hasText: 'Supressão de ruído' })).toContainText('forte (RNNoise)', { timeout: 10_000 });
  const medidor = j.getByRole('meter', { name: 'Nível do microfone' });
  await expect.poll(async () => Number(await medidor.getAttribute('aria-valuenow')), { timeout: 10_000 }).toBeGreaterThan(-90);
  await print(j, 'T15-configuracoes-teste-microfone');
  await j.getByRole('button', { name: 'Parar teste' }).click();

  // Na chamada, troca o microfone (e desliga o eco): continua conectado e a ana continua ouvindo.
  await j.getByRole('button', { name: 'Criar canal de voz' }).click();
  await j.getByLabel('Nome do novo canal de voz').fill('Papo');
  await j.getByRole('button', { name: 'Criar', exact: true }).click();
  for (const p of [dono, ana]) {
    await p.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
    await expect(p.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 15_000 });
  }
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(1, { timeout: 15_000 });
  // Em chamada, o teste mede o microfone da própria chamada e mostra qual dispositivo ela usa.
  await j.getByRole('button', { name: 'Testar microfone' }).click();
  const status = j.getByRole('status').filter({ hasText: 'Medindo o microfone da chamada' });
  await expect(status).toBeVisible({ timeout: 10_000 });
  const emUso = await status.getAttribute('data-dispositivo');
  const entradas = await j.getByLabel('Microfone', { exact: true }).locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  const escolhida = entradas.find((id) => id !== emUso);
  expect(escolhida, `o Chromium falso deveria ter mais de um microfone (em uso: ${emUso}, lista: ${entradas.join(', ')})`).toBeTruthy();
  await j.getByLabel('Microfone', { exact: true }).selectOption(escolhida!);
  // A chamada passou a usar o microfone escolhido (troca a quente, sem sair da voz).
  await expect(status).toHaveAttribute('data-dispositivo', escolhida!, { timeout: 10_000 });
  await print(j, 'T15-troca-microfone-na-chamada');
  const saidas = await j.getByLabel('Saída de áudio').locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  if (saidas.length > 0) await j.getByLabel('Saída de áudio').selectOption(saidas[0]!);
  await j.getByLabel('Cancelamento de eco').uncheck();
  await expect(j.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada');
  // Volta ao padrão e desliga a supressão (o RNNoise abafa o apito do microfone falso, e o indicador de
  // fala do LiveKit quase não acende com ele): a ana volta a ver o dono falando depois das trocas a quente.
  // O que apita é o padrão do Chromium ("default"), que na lista é a opção "Padrão do sistema".
  const voltar = entradas.includes(emUso!) ? emUso! : '';
  await j.getByLabel('Microfone', { exact: true }).selectOption(voltar);
  await expect(status).toHaveAttribute('data-dispositivo', emUso!, { timeout: 10_000 });
  await j.getByLabel('Supressão de ruído').uncheck();
  await expect(ana.janela.getByRole('list', { name: 'Na voz em Papo' }).getByRole('listitem', { name: 'dono, falando' })).toBeVisible({ timeout: 15_000 });
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(1);
  await print(ana.janela, 'T15-ana-ouve-dono-depois-das-trocas');

  // CA-30: reabrir o app mantém as escolhas.
  await dono.app.close();
  const reaberto = await abrirApp('dono');
  await reaberto.janela.getByRole('button', { name: 'Configurações' }).click();
  await expect(reaberto.janela.getByLabel('Microfone', { exact: true })).toHaveValue(voltar);
  await expect(reaberto.janela.getByLabel('Cancelamento de eco')).not.toBeChecked();
  await expect(reaberto.janela.getByLabel('Supressão de ruído')).not.toBeChecked();
  await expect(reaberto.janela.getByLabel('Controle automático de ganho')).toBeChecked();
  await print(reaberto.janela, 'T15-escolhas-guardadas-apos-reabrir');

  await reaberto.app.close();
  await ana.app.close();
});
