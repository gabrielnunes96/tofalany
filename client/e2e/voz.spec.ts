import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';
import { noMenu } from './menu';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';
/** Prints das telas principais, para conferir a olho (ficam em docs/demandas/.../prints). */
const PRINTS = join(__dirname, '../../docs/demandas/to-falando-v1/prints');
const print = (janela: Page, nome: string) => janela.screenshot({ path: join(PRINTS, `${nome}.png`) });

// O indicador de fala vem da detecção do LiveKit, que fica lenta com a máquina carregada (suíte inteira):
// uma repetição em caso de falha (registrado para a T23).
test.describe.configure({ retries: 1 });

let pasta: string;
/** Apps abertos no teste; os que sobrarem (teste que falhou no meio) são fechados no afterEach. */
const abertos: ElectronApplication[] = [];
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
      // Offline/saída da voz em 1,5 s (o padrão de 30 s deixaria os testes lentos).
      CARENCIA_OFFLINE_MS: '1500',
    }),
  );
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.close().catch(() => undefined)));
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

async function abrirApp(nome: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome), TOFALANDO_MIDIA_FALSA: '1' } });
  abertos.push(app);
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
  // O microfone falso é um apito: o RNNoise o abafa e a detecção de voz quase não abre. Sem supressão, ele passa.
  await noMenu(dono.janela, 'Configurações');
  await dono.janela.getByLabel('Supressão de ruído').uncheck();
  await dono.janela.getByRole('button', { name: 'Voltar' }).click();

  for (const p of [dono, ana]) {
    await p.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
    await expect(p.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 15_000 });
  }
  const naVozDaAna = ana.janela.getByRole('list', { name: 'Na voz em Papo' });
  await expect(naVozDaAna.getByRole('listitem')).toHaveCount(2);
  await expect(dono.janela.getByRole('button', { name: 'Papo, você está aqui' })).toBeVisible();

  // A ana recebe o áudio do dono (faixa assinada) e vê o indicador de fala dele (o microfone falso apita).
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(1, { timeout: 15_000 });
  // O portão do dono abre na hora; o "falando" depende da detecção do LiveKit, mais lenta sob carga.
  await expect(dono.janela.getByRole('img', { name: 'Transmitindo' })).toBeVisible({ timeout: 10_000 });
  await expect(naVozDaAna.getByRole('listitem', { name: 'dono, falando' })).toBeVisible({ timeout: 25_000 });
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
  await noMenu(j, 'Configurações');
  // O apito do microfone falso é baixo: sem o ganho automático (desligado por padrão desde 07/11), o RNNoise o apaga.
  await j.getByLabel('Controle automático de ganho').check();
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
  await noMenu(reaberto.janela, 'Configurações');
  await expect(reaberto.janela.getByLabel('Microfone', { exact: true })).toHaveValue(voltar);
  await expect(reaberto.janela.getByLabel('Cancelamento de eco')).not.toBeChecked();
  await expect(reaberto.janela.getByLabel('Supressão de ruído')).not.toBeChecked();
  // Ligado no começo do teste: a escolha fica guardada.
  await expect(reaberto.janela.getByLabel('Controle automático de ganho')).toBeChecked();
  await print(reaberto.janela, 'T15-escolhas-guardadas-apos-reabrir');

  await reaberto.app.close();
  await ana.app.close();
});

/** Simula o que o uiohook entregaria (tecla do sistema, com a janela em segundo plano). */
const teclaGlobal = (app: ElectronApplication, tipo: 'down' | 'up', codigo: string, mods: Record<string, boolean> = {}) =>
  app.evaluate((_e, [t, c, m]) => (globalThis as unknown as { __teclaGlobal: (...a: unknown[]) => void }).__teclaGlobal(t, c, m), [tipo, codigo, mods] as const);

test('CA-21, CA-22, CA-23, CA-24: sensibilidade, push-to-talk pelo atalho global, atalho trocado e deafen', async () => {
  test.setTimeout(150_000);
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  const j = dono.janela;
  const donoFalando = ana.janela.getByRole('list', { name: 'Na voz em Papo' }).getByRole('listitem', { name: 'dono, falando' });
  /** Fica `ms` sem ver o dono falando na janela da ana. */
  const semFalar = async (ms: number) => {
    for (let t = 0; t < ms; t += 200) {
      expect(await donoFalando.count()).toBe(0);
      await ana.janela.waitForTimeout(200);
    }
  };

  // O apito do microfone falso é abafado pelo RNNoise: desliga a supressão para medir o portão.
  await noMenu(j, 'Configurações');
  await j.getByLabel('Supressão de ruído').uncheck();
  await j.getByRole('button', { name: 'Criar canal de voz' }).click();
  await j.getByLabel('Nome do novo canal de voz').fill('Papo');
  await j.getByRole('button', { name: 'Criar', exact: true }).click();
  for (const p of [dono, ana]) {
    await p.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
    await expect(p.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 15_000 });
  }

  // CA-21: sensibilidade no máximo (0 dB) — o apito não abre o portão; baixando, abre.
  await j.getByLabel(/Sensibilidade da detecção de voz/).fill('0');
  await ana.janela.waitForTimeout(1500);
  await semFalar(3000);
  await j.getByLabel(/Sensibilidade da detecção de voz/).fill('-60');
  await expect(donoFalando).toBeVisible({ timeout: 15_000 });
  await expect(j.getByRole('img', { name: 'Transmitindo' })).toBeVisible();

  // CA-22: push-to-talk com a tecla ` (crase) definida pela tela; a tecla vem do sistema (janela sem foco).
  await j.getByRole('radio', { name: /Push-to-talk/ }).check();
  const linhaPtt = j.getByRole('listitem', { name: 'Push-to-talk' });
  await linhaPtt.getByRole('button', { name: /^Alterar atalho/ }).click();
  await j.keyboard.press('Backquote');
  await expect(j.getByTestId('atalho-ptt')).toHaveText('`');
  await ana.janela.waitForTimeout(1500);
  await semFalar(2000);
  await teclaGlobal(dono.app, 'down', 'Backquote');
  // O portão abre na hora (indicador local); o "falando" da ana depende da detecção do LiveKit, mais lenta sob carga.
  await expect(j.getByRole('img', { name: 'Transmitindo' })).toBeVisible({ timeout: 5_000 });
  await expect(donoFalando).toBeVisible({ timeout: 25_000 });
  await print(ana.janela, 'T16-ptt-segurado-ana-ve-dono-falando');
  await teclaGlobal(dono.app, 'up', 'Backquote');
  await expect(donoFalando).toHaveCount(0, { timeout: 10_000 });

  // CA-23: troca o atalho do mute para F8; o novo funciona, o antigo não (e continua depois de reiniciar).
  const linhaMudo = j.getByRole('listitem', { name: 'Mute (microfone)' });
  await linhaMudo.getByRole('button', { name: /^Alterar atalho/ }).click();
  await j.keyboard.press('Control+Shift+KeyD');
  await expect(j.getByRole('alert')).toContainText('já é o atalho de Deafen');
  await j.keyboard.press('F8');
  await expect(j.getByTestId('atalho-mudo')).toHaveText('F8');
  const botaoMute = j.getByRole('button', { name: 'Mutar microfone', exact: true });
  await teclaGlobal(dono.app, 'down', 'KeyM', { ctrl: true, shift: true });
  await teclaGlobal(dono.app, 'up', 'KeyM', { ctrl: true, shift: true });
  await expect(botaoMute).toHaveAttribute('aria-pressed', 'false');
  await teclaGlobal(dono.app, 'down', 'F8');
  await teclaGlobal(dono.app, 'up', 'F8');
  await expect(botaoMute).toHaveAttribute('aria-pressed', 'true');
  await expect(ana.janela.getByRole('list', { name: 'Na voz em Papo' }).getByLabel('microfone desligado')).toBeVisible();
  await teclaGlobal(dono.app, 'down', 'F8');
  await teclaGlobal(dono.app, 'up', 'F8');
  await expect(botaoMute).toHaveAttribute('aria-pressed', 'false');

  // CA-24: deafen pelo atalho (Ctrl+Shift+D): microfone também muda, e a ana vê os ícones.
  await teclaGlobal(dono.app, 'down', 'KeyD', { ctrl: true, shift: true });
  await teclaGlobal(dono.app, 'up', 'KeyD', { ctrl: true, shift: true });
  await expect(j.getByRole('button', { name: 'Desligar áudio', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(botaoMute).toHaveAttribute('aria-pressed', 'true');
  await expect(ana.janela.getByRole('list', { name: 'Na voz em Papo' }).getByLabel('sem áudio')).toBeVisible();
  // O dono não ouve ninguém: o áudio da ana fica com volume 0.
  const audiosDoDono = j.locator('[data-testid="audios-voz"] audio');
  await expect(audiosDoDono).toHaveCount(1);
  await expect(audiosDoDono).toHaveAttribute('data-volume', '0');
  // Com PTT apertado e deafen, nada sai.
  await teclaGlobal(dono.app, 'down', 'Backquote');
  await ana.janela.waitForTimeout(1500);
  await semFalar(2000);
  await teclaGlobal(dono.app, 'up', 'Backquote');
  await print(j, 'T16-painel-voz-deafen');
  await j.getByRole('button', { name: 'Desligar áudio', exact: true }).click();
  await expect(audiosDoDono).toHaveAttribute('data-volume', '1');
  await expect(j.getByRole('button', { name: 'Mutar microfone', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await dono.app.close();
  const reaberto = await abrirApp('dono');
  await noMenu(reaberto.janela, 'Configurações');
  await expect(reaberto.janela.getByTestId('atalho-mudo')).toHaveText('F8');
  await expect(reaberto.janela.getByTestId('atalho-ptt')).toHaveText('`');
  await expect(reaberto.janela.getByRole('radio', { name: /Push-to-talk/ })).toBeChecked();
  await print(reaberto.janela, 'T16-atalhos-depois-de-reiniciar');
  await reaberto.app.close();
  await ana.app.close();
});

test('CA-27, CA-29, CA-58: volume por pessoa só para quem ajustou, sons de entrar/sair e silenciar lembrado', async () => {
  test.setTimeout(150_000);
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  const somDa = (p: Page) => p.evaluate(() => document.documentElement.dataset.somVoz ?? '');

  await dono.janela.getByRole('button', { name: 'Criar canal de voz' }).click();
  await dono.janela.getByLabel('Nome do novo canal de voz').fill('Papo');
  await dono.janela.getByRole('button', { name: 'Criar', exact: true }).click();

  // CA-29: a ana está no canal; o dono entra e sai — ela ouve os sons.
  await ana.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
  await expect(ana.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 15_000 });
  await expect.poll(() => somDa(ana.janela)).toMatch(/^entrar:/);
  const antes = await somDa(ana.janela);
  await dono.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
  await expect(dono.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 15_000 });
  await expect.poll(() => somDa(ana.janela)).not.toBe(antes);
  expect(await somDa(ana.janela)).toMatch(/^entrar:/);

  // CA-27: a ana baixa o dono para 50%; só na máquina dela.
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(1, { timeout: 15_000 });
  await ana.janela.getByRole('button', { name: 'Ajustes de voz de dono' }).click();
  await ana.janela.getByLabel(/Volume de dono/).fill('150');
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveAttribute('data-volume', '1.5');
  await ana.janela.getByLabel(/Volume de dono/).fill('50');
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveAttribute('data-volume', '0.5');
  await expect(dono.janela.locator('[data-testid="audios-voz"] audio')).toHaveAttribute('data-volume', '1');
  await print(ana.janela, 'T17-volume-por-pessoa');

  // CA-58: a ana silencia o dono; ele não fica sabendo.
  await ana.janela.getByRole('button', { name: 'Silenciar dono' }).click();
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveAttribute('data-volume', '0');
  await expect(ana.janela.getByLabel('silenciado por você')).toBeVisible();
  await expect(dono.janela.getByLabel('silenciado por você')).toHaveCount(0);
  await expect(dono.janela.locator('[data-testid="audios-voz"] audio')).toHaveAttribute('data-volume', '1');

  // CA-29: o dono sai — a ana ouve o som de saída.
  const antesSaida = await somDa(ana.janela);
  await dono.janela.getByRole('button', { name: 'Sair da voz' }).click();
  await expect.poll(() => somDa(ana.janela)).not.toBe(antesSaida);
  expect(await somDa(ana.janela)).toMatch(/^sair:/);

  // Reabrir a ana: o dono continua silenciado e com o volume guardado.
  await ana.app.close();
  const ana2 = await abrirApp('ana');
  await ana2.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
  await dono.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
  await expect(ana2.janela.locator('[data-testid="audios-voz"] audio')).toHaveAttribute('data-volume', '0', { timeout: 15_000 });
  await ana2.janela.getByRole('button', { name: 'Ajustes de voz de dono' }).click();
  await expect(ana2.janela.getByLabel(/Volume de dono/)).toHaveValue('50');
  await expect(ana2.janela.getByRole('button', { name: 'Silenciar dono' })).toHaveAttribute('aria-pressed', 'true');
  await ana2.janela.getByRole('button', { name: 'Silenciar dono' }).click();
  await expect(ana2.janela.locator('[data-testid="audios-voz"] audio')).toHaveAttribute('data-volume', '0.5');
  await print(ana2.janela, 'T17-silenciar-lembrado-apos-reabrir');

  // Sons desligados nas Configurações: o dono sai e a ana não ouve nada.
  await noMenu(ana2.janela, 'Configurações');
  await ana2.janela.getByLabel('Sons de entrar e sair da voz e de mute').uncheck();
  const semSom = await somDa(ana2.janela);
  await dono.janela.getByRole('button', { name: 'Sair da voz' }).click();
  await expect(ana2.janela.getByRole('list', { name: 'Na voz em Papo' }).getByRole('listitem')).toHaveCount(1);
  await ana2.janela.waitForTimeout(500);
  expect(await somDa(ana2.janela)).toBe(semSom);

  await dono.app.close();
  await ana2.app.close();
});

/** WAV PCM 8 kHz mono com um tom de 440 Hz. */
function wavTom(segundos: number): Buffer {
  const amostras = 8000 * segundos;
  const b = Buffer.alloc(44 + amostras * 2);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(36 + amostras * 2, 4);
  b.write('WAVEfmt ', 8, 'latin1');
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36, 'latin1');
  b.writeUInt32LE(amostras * 2, 40);
  for (let i = 0; i < amostras; i++) b.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 8000)), 44 + i * 2);
  return b;
}

test('CA-32, CA-33, CA-34, CA-35: soundboard no canal de voz', async () => {
  test.setTimeout(120_000);
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  const j = dono.janela;
  const tocouNa = (p: Page) => p.evaluate(() => document.documentElement.dataset.somSoundboard ?? '');

  // O dono (admin) cadastra um som pela tela.
  await noMenu(j, 'Soundboard');
  await j.getByLabel('Nome do som').fill('Grilo');
  await j.getByLabel('Arquivo de áudio').setInputFiles({ name: 'grilo.wav', mimeType: 'audio/wav', buffer: wavTom(1) });
  await j.getByRole('button', { name: 'Cadastrar som' }).click();
  await expect(j.getByRole('status')).toContainText('cadastrado');
  await j.getByRole('button', { name: 'Voltar' }).click();

  // CA-33: fora da voz não dá para tocar (desde o painel compacto, o botão do soundboard fica na barra da voz).
  await expect(j.getByRole('button', { name: 'Tocar sons' })).toHaveCount(0);
  const painel = j.getByRole('region', { name: 'Soundboard' });

  await j.getByRole('button', { name: 'Criar canal de voz' }).click();
  await j.getByLabel('Nome do novo canal de voz').fill('Papo');
  await j.getByRole('button', { name: 'Criar', exact: true }).click();
  for (const p of [dono, ana]) {
    await p.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
    await expect(p.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 15_000 });
  }

  // CA-32: o dono toca; a ana ouve e vê quem tocou.
  await j.getByRole('button', { name: 'Tocar sons' }).click();
  await painel.getByRole('button', { name: 'Grilo' }).click();
  await expect(ana.janela.locator('.aviso-som')).toHaveText('🔊 dono tocou Grilo');
  await expect.poll(() => tocouNa(ana.janela)).toMatch(/^\d+:/);
  await print(ana.janela, 'T19-ana-ve-quem-tocou');
  // CA-34: logo depois, o botão descansa.
  await expect(painel.getByRole('button', { name: 'Grilo' })).toBeDisabled();
  await print(j, 'T19-painel-soundboard');

  // CA-35: a ana zera o volume do soundboard — vê o aviso, mas não toca.
  await ana.janela.getByRole('button', { name: 'Tocar sons' }).click();
  await ana.janela.getByLabel(/Volume do soundboard/).fill('0');
  const ultimo = await tocouNa(ana.janela);
  await expect(painel.getByRole('button', { name: 'Grilo' })).toBeEnabled({ timeout: 5_000 });
  await painel.getByRole('button', { name: 'Grilo' }).click();
  await expect(ana.janela.locator('.aviso-som')).toBeVisible();
  await ana.janela.waitForTimeout(800);
  expect(await tocouNa(ana.janela)).toBe(ultimo);
  // As vozes continuam: o áudio do dono segue chegando na ana.
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(1);

  // RN-12: com deafen, o som também não toca (volume de volta a 80%).
  await ana.janela.getByLabel(/Volume do soundboard/).fill('80');
  await ana.janela.getByRole('button', { name: 'Desligar áudio', exact: true }).click();
  const antesDeafen = await tocouNa(ana.janela);
  await expect(painel.getByRole('button', { name: 'Grilo' })).toBeEnabled({ timeout: 5_000 });
  await painel.getByRole('button', { name: 'Grilo' }).click();
  await ana.janela.waitForTimeout(800);
  expect(await tocouNa(ana.janela)).toBe(antesDeafen);

  await dono.app.close();
  await ana.app.close();
});

const ocioso = (app: ElectronApplication, segundos: number | undefined) =>
  app.evaluate((_e, s) => (globalThis as unknown as { __ociosoSegundos: (s: number | undefined) => void }).__ociosoSegundos(s), segundos);

test('CA-56, CA-57: status online, ausente e offline na lista de membros', async () => {
  test.setTimeout(90_000);
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  const membros = dono.janela.getByRole('list', { name: 'Membros' });

  await expect(membros.getByRole('listitem', { name: 'ana, online' })).toBeVisible();
  await expect(membros).toContainText('Online — 2');

  // CA-57: 10 min sem mexer (simulado) → ausente; mexeu → online.
  await ocioso(ana.app, 700);
  await expect(membros.getByRole('listitem', { name: 'ana, ausente' })).toBeVisible();
  await print(dono.janela, 'T28-ana-ausente');
  await ocioso(ana.app, 3);
  await expect(membros.getByRole('listitem', { name: 'ana, online' })).toBeVisible();

  // CA-56: fechou o app → offline depois da carência; abriu de novo → online.
  await ana.app.close();
  await expect(membros.getByRole('listitem', { name: 'ana, offline' })).toBeVisible({ timeout: 10_000 });
  await expect(membros).toContainText('Offline — 1');
  await print(dono.janela, 'T28-ana-offline');
  const ana2 = await abrirApp('ana');
  await expect(membros.getByRole('listitem', { name: 'ana, online' })).toBeVisible({ timeout: 15_000 });

  // Backlog v2, item 2: status escolhido pela ana, visto pelo dono; o invisível fica guardado ao reabrir.
  const meuStatus = ana2.janela.getByLabel('Meu status');
  await meuStatus.selectOption('naoIncomodar');
  await expect(membros.getByRole('listitem', { name: 'ana, não incomodar' })).toBeVisible();
  await meuStatus.selectOption('invisivel');
  await expect(membros.getByRole('listitem', { name: 'ana, offline' })).toBeVisible();
  await ana2.app.close();
  const ana3 = await abrirApp('ana');
  await expect(ana3.janela.getByLabel('Meu status')).toHaveValue('invisivel');
  // Reabriu invisível: segue offline para o dono (depois de a carência passar sem ela voltar).
  await ana3.janela.waitForTimeout(2500);
  await expect(membros.getByRole('listitem', { name: 'ana, offline' })).toBeVisible();
  await ana3.janela.getByLabel('Meu status').selectOption('auto');
  await expect(membros.getByRole('listitem', { name: 'ana, online' })).toBeVisible();

  await dono.app.close();
  await ana3.app.close();
});

test('CA-36: câmera ligada aparece para o outro e some ao desligar', async () => {
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

  await dono.janela.getByRole('button', { name: 'Câmera', exact: true }).click();
  await expect(dono.janela.getByRole('button', { name: 'Câmera', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // A prévia do dono e o vídeo dele na ana, com imagem de verdade (câmera falsa do Chromium).
  await expect(dono.janela.getByLabel('Vídeo de dono')).toBeVisible();
  const videoNaAna = ana.janela.getByLabel('Vídeo de dono');
  await expect(videoNaAna).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => videoNaAna.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(ana.janela.getByRole('list', { name: 'Na voz em Papo' }).getByLabel('câmera ligada')).toBeVisible();
  await print(ana.janela, 'T20-ana-ve-camera-do-dono');

  await dono.janela.getByRole('button', { name: 'Câmera', exact: true }).click();
  await expect(videoNaAna).toHaveCount(0, { timeout: 15_000 });
  await expect(ana.janela.getByRole('list', { name: 'Na voz em Papo' }).getByLabel('câmera ligada')).toHaveCount(0);

  await dono.app.close();
  await ana.app.close();
});

test('CA-37, CA-38, CA-41, CA-49: transmissão de tela com seletor, trava por canal e visualização grande', async () => {
  test.skip(!!globalThis.process['env'].TOFALANDO_E2E_ISOLADO, 'captura de tela: rode com npm run test:e2e:desktop');
  test.setTimeout(120_000);
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  const d = dono.janela;
  const a = ana.janela;
  await d.getByRole('button', { name: 'Criar canal de voz' }).click();
  await d.getByLabel('Nome do novo canal de voz').fill('Papo');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  for (const p of [dono, ana]) {
    await p.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
    await expect(p.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 15_000 });
  }

  // CA-37: seletor próprio com miniaturas; escolher a primeira tela.
  await d.getByRole('button', { name: 'Transmitir tela', exact: true }).click();
  const seletor = d.getByRole('dialog', { name: 'Transmitir tela' });
  await expect(seletor.getByRole('region', { name: 'Telas' }).getByRole('button').first()).toBeVisible({ timeout: 15_000 });
  await expect(seletor.getByLabel('Incluir o áudio do sistema')).toBeDisabled();
  await print(d, 'T21-seletor-de-tela');
  await seletor.getByRole('region', { name: 'Telas' }).getByRole('button').first().click();
  await expect(d.getByRole('region', { name: 'Sua transmissão' })).toBeVisible({ timeout: 15_000 });

  // CA-41: a ana vê o aviso, assiste grande, com imagem de verdade.
  const aviso = a.getByRole('region', { name: 'Transmissão de dono' });
  await expect(aviso.getByRole('button', { name: 'Assistir' })).toBeEnabled({ timeout: 15_000 });
  await aviso.getByRole('button', { name: 'Assistir' }).click();
  const tela = a.getByLabel('Tela de dono');
  await expect.poll(() => tela.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect(a.getByRole('button', { name: 'Tela cheia' })).toBeVisible();
  // Item 0b do backlog v2: o painel não pode ser espremido pelo chat (cortava o vídeo e escondia a barra).
  const caixa = await a.getByRole('region', { name: 'Transmissão de dono' }).boundingBox();
  const video = await tela.boundingBox();
  const barra = await a.getByRole('button', { name: 'Tela cheia' }).boundingBox();
  expect(caixa!.height).toBeGreaterThanOrEqual(video!.height + barra!.height);
  await expect(a.getByRole('list', { name: 'Na voz em Papo' }).getByLabel('transmitindo a tela')).toBeVisible();
  await print(a, 'T21-ana-assiste-tela-do-dono');

  // CA-38: a ana tenta transmitir no mesmo canal — aviso e nada inicia.
  await a.getByRole('button', { name: 'Transmitir tela', exact: true }).click();
  await expect(a.getByRole('alert')).toContainText('dono já está transmitindo neste canal.');
  await expect(a.getByRole('dialog', { name: 'Transmitir tela' })).toHaveCount(0);

  // O dono para; a ana consegue.
  await d.getByRole('button', { name: 'Parar transmissão' }).click();
  await expect(aviso).toHaveCount(0, { timeout: 15_000 });
  await a.getByRole('button', { name: 'Transmitir tela', exact: true }).click();
  await a.getByRole('dialog', { name: 'Transmitir tela' }).getByRole('region', { name: 'Telas' }).getByRole('button').first().click();
  await expect(a.getByRole('region', { name: 'Sua transmissão' })).toBeVisible({ timeout: 15_000 });
  await expect(d.getByRole('region', { name: 'Transmissão de ana' })).toBeVisible({ timeout: 15_000 });
  // RN-17: a transmissão da ana (membro, 720p30) chega dentro do teto.
  await d.getByRole('region', { name: 'Transmissão de ana' }).getByRole('button', { name: 'Assistir' }).click({ timeout: 15_000 });
  const telaAna = d.getByLabel('Tela de ana');
  await expect.poll(() => telaAna.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  const [w, h] = await telaAna.evaluate((v: HTMLVideoElement) => [v.videoWidth, v.videoHeight]);
  expect(Math.max(w!, h!)).toBeLessThanOrEqual(1280);
  expect(Math.min(w!, h!)).toBeLessThanOrEqual(720);

  // CA-49: auditoria com quem e o canal.
  const tipos = (servidor.banco.prepare("SELECT tipo, detalhes FROM auditoria WHERE tipo LIKE 'tela_%' ORDER BY id").all() as { tipo: string; detalhes: string }[]).map((r) => [r.tipo, JSON.parse(r.detalhes).atorNome, JSON.parse(r.detalhes).canalNome]);
  expect(tipos).toEqual([
    ['tela_iniciou', 'dono', 'Papo'],
    ['tela_parou', 'dono', 'Papo'],
    ['tela_iniciou', 'ana', 'Papo'],
  ]);

  await dono.app.close();
  await ana.app.close();
});

test('CA-39a, RF-28: membro só 720p30; administrador escolhe 1080p60 (e VP9) e transmite', async () => {
  test.skip(!!globalThis.process['env'].TOFALANDO_E2E_ISOLADO, 'captura de tela: rode com npm run test:e2e:desktop');
  test.setTimeout(120_000);
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'senha-forte-1' } });
  const ana = await entrar('ana', false);
  const d = dono.janela;
  const a = ana.janela;
  await noMenu(d, 'Configurações');
  await d.getByLabel('Codec').selectOption('vp9');
  await d.getByLabel('Qualidade padrão').selectOption('1080p60');
  await d.getByRole('button', { name: 'Voltar' }).click();
  await d.getByRole('button', { name: 'Criar canal de voz' }).click();
  await d.getByLabel('Nome do novo canal de voz').fill('Papo');
  await d.getByRole('button', { name: 'Criar', exact: true }).click();
  for (const p of [dono, ana]) {
    await p.janela.getByRole('button', { name: 'Entrar no canal de voz Papo' }).click();
    await expect(p.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 15_000 });
  }

  // CA-39a: a ana (membro) só tem 720p30, já selecionado.
  await a.getByRole('button', { name: 'Transmitir tela', exact: true }).click();
  const seletorAna = a.getByRole('dialog', { name: 'Transmitir tela' });
  await expect(seletorAna.getByLabel('720p30')).toBeChecked();
  await expect(seletorAna.getByLabel('1080p60')).toBeDisabled();
  await expect(seletorAna.getByLabel('1440p60')).toBeDisabled();
  await print(a, 'T22-membro-so-720p30');
  await seletorAna.getByRole('button', { name: 'Cancelar' }).click();

  // O dono (admin) vem com o padrão dele (1080p60) e transmite.
  await d.getByRole('button', { name: 'Transmitir tela', exact: true }).click();
  const seletor = d.getByRole('dialog', { name: 'Transmitir tela' });
  await expect(seletor.getByLabel('1080p60')).toBeChecked();
  await seletor.getByRole('region', { name: 'Telas' }).getByRole('button').first().click();
  await expect(d.getByRole('region', { name: 'Sua transmissão' })).toBeVisible({ timeout: 15_000 });
  const aviso = a.getByRole('region', { name: 'Transmissão de dono' });
  await aviso.getByRole('button', { name: 'Assistir' }).click({ timeout: 15_000 });
  const tela = a.getByLabel('Tela de dono');
  await expect.poll(() => tela.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 15_000 }).toBeGreaterThan(0);
  // Nunca acima de 1920×1080 (pode ser menor se a tela do computador for menor).
  expect(await tela.evaluate((v: HTMLVideoElement) => Math.max(v.videoWidth, v.videoHeight))).toBeLessThanOrEqual(1920);

  const registro = servidor.banco.prepare("SELECT detalhes FROM auditoria WHERE tipo = 'tela_iniciou' ORDER BY id DESC LIMIT 1").get() as { detalhes: string };
  expect(JSON.parse(registro.detalhes).qualidade).toBe('1080p60');

  await dono.app.close();
  await ana.app.close();
});

test('CA-42, CA-46: a voz volta sozinha depois de o servidor de mídia cair; só o servidor configurado na rede', async () => {
  test.setTimeout(150_000);
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
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(1, { timeout: 15_000 });

  // CA-42: o LiveKit reinicia (queda da mídia); o chat segue e a voz volta sem ação manual.
  const conteiner = execFileSync('docker', ['ps', '--filter', 'publish=7880', '--format', '{{.Names}}']).toString().trim().split('\n')[0]!;
  // O servidor de mídia fica fora do ar alguns segundos: aparece o aviso; volta e a sala reconecta sozinha.
  // (pause congela o processo: as conexões ficam penduradas, como numa queda de rede de verdade)
  execFileSync('docker', ['pause', conteiner]);
  try {
    await expect(dono.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Reconectando à voz', { timeout: 45_000 });
    await print(dono.janela, 'T23-reconectando-voz');
  } finally {
    execFileSync('docker', ['unpause', conteiner]);
  }
  await expect(dono.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 60_000 });
  await expect(ana.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 60_000 });
  await expect(ana.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(1, { timeout: 30_000 });
  await print(dono.janela, 'T23-voz-de-volta');
  // O chat de texto não caiu junto.
  await dono.janela.getByLabel('Mensagem para #geral').fill('ainda aqui');
  await dono.janela.getByLabel('Mensagem para #geral').press('Enter');
  await expect(ana.janela.getByText('ainda aqui')).toBeVisible();

  // CA-46: tudo o que o app pediu foi para o servidor configurado (127.0.0.1); nada bloqueado.
  const vistos = await dono.app.evaluate(() => (globalThis as unknown as { __redeVista: { url: string; ok: boolean }[] }).__redeVista);
  const deRede = vistos.filter((v) => /^(https?|wss?):/.test(v.url));
  expect(deRede.length).toBeGreaterThan(5);
  expect(deRede.filter((v) => !v.ok)).toEqual([]);
  expect([...new Set(deRede.map((v) => new URL(v.url).hostname))]).toEqual(['127.0.0.1']);

  await dono.app.close();
  await ana.app.close();
});

/** Ociosidade da medida de RAM (a especificação pede 5 min; o padrão aqui é 30 s). */
const OCIOSO_MS = Number(globalThis.process?.['env']?.['TOFALANDO_RAM_OCIOSO_MS'] ?? 30_000);

test('CA-45: app logado e ocioso usa menos de 300 MB somando os processos (PSS)', async () => {
  test.setTimeout(400_000);
  const dono = await entrar('dono', true);
  await dono.janela.waitForTimeout(OCIOSO_MS);
  const pids = await dono.app.evaluate(({ app }) => app.getAppMetrics().map((p) => p.pid));
  const { readFileSync } = await import('node:fs');
  // PSS: divide as páginas compartilhadas entre os processos (o workingSet as contaria várias vezes).
  const total = pids.reduce((soma, pid) => soma + Number(/Pss:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/smaps_rollup`, 'utf8'))![1]) / 1024, 0);
  test.info().annotations.push({ type: 'RAM ociosa (PSS)', description: `${Math.round(total)} MB após ${OCIOSO_MS / 1000} s` });
  expect(total).toBeLessThan(300);
  await dono.app.close();
});
