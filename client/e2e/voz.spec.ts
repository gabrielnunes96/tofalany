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
  // O microfone falso é um apito: o RNNoise o abafa e a detecção de voz quase não abre. Sem supressão, ele passa.
  await dono.janela.getByRole('button', { name: 'Configurações' }).click();
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
  await j.getByRole('button', { name: 'Configurações' }).click();
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
  await reaberto.janela.getByRole('button', { name: 'Configurações' }).click();
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
  await ana2.janela.getByRole('button', { name: 'Configurações' }).click();
  await ana2.janela.getByLabel('Sons de entrar e sair da voz e de mute').uncheck();
  const semSom = await somDa(ana2.janela);
  await dono.janela.getByRole('button', { name: 'Sair da voz' }).click();
  await expect(ana2.janela.getByRole('list', { name: 'Na voz em Papo' }).getByRole('listitem')).toHaveCount(1);
  await ana2.janela.waitForTimeout(500);
  expect(await somDa(ana2.janela)).toBe(semSom);

  await dono.app.close();
  await ana2.app.close();
});
