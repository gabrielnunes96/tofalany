import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';

/**
 * CA-44 (RF-33): o app conecta num servidor do docker-compose já no ar (PC, Tailscale ou VPS) e a voz funciona.
 * Pulado na suíte normal. Para rodar:
 *   TOFALANDO_COMPOSE_URL=http://127.0.0.1:3999 TOFALANDO_COMPOSE_CONVITE=<código> npx playwright test e2e/implantacao.spec.ts
 */
const ambiente = globalThis.process['env'];
const URL_SERVIDOR = ambiente['TOFALANDO_COMPOSE_URL'];
const CONVITE = ambiente['TOFALANDO_COMPOSE_CONVITE'] ?? '';
const principal = join(__dirname, '../out/main/index.js');

test.skip(!URL_SERVIDOR, 'defina TOFALANDO_COMPOSE_URL para testar um servidor do docker-compose');

let pasta: string;
const abertos: ElectronApplication[] = [];
test.beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-compose-'));
});
test.afterEach(async () => {
  await Promise.all(abertos.splice(0).map((a) => a.close().catch(() => undefined)));
  rmSync(pasta, { recursive: true, force: true });
});

async function cadastrar(nome: string): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...ambiente, TOFALANDO_USER_DATA: join(pasta, nome), TOFALANDO_MIDIA_FALSA: '1' } });
  abertos.push(app);
  const janela = await app.firstWindow();
  await janela.getByLabel('Endereço do servidor').fill(URL_SERVIDOR!);
  await janela.getByRole('button', { name: 'Conectar' }).click();
  await janela.getByRole('button', { name: 'Tenho um convite' }).click();
  await janela.getByLabel('Código de convite').fill(CONVITE);
  await janela.getByLabel('Nome de usuário').fill(nome);
  await janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  if (await janela.getByLabel('Confirmar senha').count()) await janela.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await janela.getByRole('button', { name: 'Criar conta' }).click();
  await expect(janela.getByRole('list', { name: 'Membros' })).toBeVisible();
  return { app, janela };
}

test('CA-44: dois apps entram no servidor do compose, conversam e se ouvem na voz', async () => {
  test.setTimeout(120_000);
  const sufixo = Date.now().toString(36).slice(-5);
  const a = await cadastrar(`a${sufixo}`);
  const b = await cadastrar(`b${sufixo}`);
  const canal = `voz${sufixo}`;
  await a.janela.getByRole('button', { name: 'Criar canal de voz' }).click();
  await a.janela.getByLabel('Nome do novo canal de voz').fill(canal);
  await a.janela.getByRole('button', { name: 'Criar', exact: true }).click();
  for (const p of [a, b]) {
    await p.janela.getByRole('button', { name: `Entrar no canal de voz ${canal}` }).click();
    await expect(p.janela.getByRole('region', { name: 'Conexão de voz' })).toContainText('Voz conectada', { timeout: 20_000 });
  }
  // O áudio de A chega em B pelo LiveKit do compose.
  await expect(b.janela.locator('[data-testid="audios-voz"] audio')).toHaveCount(1, { timeout: 20_000 });
  await a.janela.getByLabel('Mensagem para #geral').fill(`oi ${sufixo}`);
  await a.janela.getByLabel('Mensagem para #geral').press('Enter');
  await expect(b.janela.getByText(`oi ${sufixo}`)).toBeVisible();
  await b.janela.screenshot({ path: test.info().outputPath('app-no-servidor-do-compose.png') });
});
