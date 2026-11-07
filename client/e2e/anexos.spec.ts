import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import type { FastifyInstance } from 'fastify';

const principal = join(__dirname, '../out/main/index.js');
const CONVITE = 'convite-e2e';
const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');

let pasta: string;
let servidor: FastifyInstance;
let url: string;

test.beforeEach(async () => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-anexos-'));
  const { construirApp } = await import('../../server/dist/app.js');
  const { lerConfig } = await import('../../server/dist/config.js');
  servidor = await construirApp(lerConfig({ LOG: 'false', BANCO: ':memory:', CODIGO_CONVITE: CONVITE, TENTATIVAS_POR_MINUTO: '1000' }));
  await servidor.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(servidor.server.address() as AddressInfo).port}`;
});

test.afterEach(async () => {
  await servidor.close();
  rmSync(pasta, { recursive: true, force: true });
});

async function entrar(nome: string, criar: boolean): Promise<{ app: ElectronApplication; janela: Page }> {
  const app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: join(pasta, nome) } });
  const janela = await app.firstWindow();
  await janela.getByLabel('Endereço do servidor').fill(url);
  await janela.getByRole('button', { name: 'Conectar' }).click();
  if (criar) {
    await janela.getByRole('button', { name: 'Tenho um convite' }).click();
    await janela.getByLabel('Código de convite').fill(CONVITE);
  }
  await janela.getByLabel('Nome de usuário').fill(nome);
  await janela.getByLabel('Senha', { exact: true }).fill('Senha-forte-1');
  if (await janela.getByLabel('Confirmar senha').count()) await janela.getByLabel('Confirmar senha').fill('Senha-forte-1');
  await janela.getByRole('button', { name: criar ? 'Criar conta' : 'Entrar' }).click();
  await expect(janela.getByLabel('Mensagem para #geral')).toBeVisible();
  return { app, janela };
}

test('CA-16, CA-16a e CA-16b: imagem no chat, documentos para baixar idênticos, recusas', async () => {
  test.setTimeout(120_000);
  const dono = await entrar('dono', true);
  await servidor.inject({ method: 'POST', url: '/api/auth/cadastro', payload: { convite: CONVITE, usuario: 'ana', senha: 'Senha-forte-1' } });
  const ana = await entrar('ana', false);
  const listaDono = dono.janela.getByRole('list', { name: 'Mensagens de #geral' });

  // CA-16: PNG de 2 MB aparece no chat do dono e amplia ao clicar.
  const { default: sharp } = await import('sharp');
  const png = await sharp(randomBytes(840 * 800 * 3), { raw: { width: 840, height: 800, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  await ana.janela.getByLabel('Arquivos para anexar').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png });
  await expect(ana.janela.getByRole('list', { name: 'Anexos a enviar' })).toContainText('foto.png');
  await expect(ana.janela.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  await ana.janela.getByLabel('Mensagem para #geral').fill('olha a foto');
  await ana.janela.getByRole('button', { name: 'Enviar' }).click();
  const imagem = listaDono.getByRole('button', { name: 'Ampliar imagem foto.png' });
  await expect(imagem).toBeVisible();
  await expect.poll(() => imagem.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(840);
  await imagem.click();
  await expect(dono.janela.getByRole('dialog', { name: 'Imagem foto.png' })).toBeVisible();
  await dono.janela.keyboard.press('Escape');
  await expect(dono.janela.getByRole('dialog')).toHaveCount(0);

  // CA-16a: PDF de 5 MB e ZIP de 20 MB chegam como cartões; o PDF baixado é idêntico.
  const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(5 * 1024 * 1024)]);
  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), randomBytes(20 * 1024 * 1024)]);
  await ana.janela.getByLabel('Arquivos para anexar').setInputFiles([
    { name: 'relatório.pdf', mimeType: 'application/pdf', buffer: pdf },
    { name: 'fotos.zip', mimeType: 'application/zip', buffer: zip },
  ]);
  await expect(ana.janela.getByRole('list', { name: 'Anexos a enviar' })).not.toContainText('enviando', { timeout: 30_000 });
  await ana.janela.getByRole('button', { name: 'Enviar' }).click();
  const cartaoPdf = listaDono.getByRole('group', { name: 'Arquivo relatório.pdf' });
  await expect(cartaoPdf).toContainText('5 MB');
  await expect(listaDono.getByRole('group', { name: 'Arquivo fotos.zip' })).toContainText('20 MB');

  // "Salvar como" simulado no processo principal do dono.
  const destino = join(pasta, 'baixado.pdf');
  await dono.app.evaluate(({ dialog }, caminho) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: caminho })) as typeof dialog.showSaveDialog;
  }, destino);
  await cartaoPdf.getByRole('button', { name: 'Baixar' }).click();
  await expect(cartaoPdf.getByRole('status')).toContainText(`Salvo em ${destino}`);
  await expect(cartaoPdf.getByRole('button', { name: 'Abrir' })).toBeVisible();
  expect(hash(readFileSync(destino))).toBe(hash(pdf));

  // CA-16b: 30 MB é recusado no app; .exe renomeado é recusado pelo servidor; nada é enviado.
  await ana.janela.getByLabel('Arquivos para anexar').setInputFiles({ name: 'grande.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(30 * 1024 * 1024) }, { timeout: 90_000 });
  await expect(ana.janela.getByRole('list', { name: 'Anexos a enviar' })).toContainText('O arquivo deve ter no máximo 25 MB.');
  await ana.janela.getByLabel('Arquivos para anexar').setInputFiles({
    name: 'documento.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.concat([Buffer.from('MZ\x90\x00'), randomBytes(2000)]),
  });
  await expect(ana.janela.getByRole('list', { name: 'Anexos a enviar' })).toContainText('Formato não aceito', { timeout: 10_000 });
  await expect(ana.janela.getByRole('button', { name: 'Enviar' })).toBeDisabled();
  expect((servidor.banco.prepare("SELECT COUNT(*) AS n FROM anexos WHERE nome_original IN ('grande.pdf', 'documento.pdf')").get() as { n: number }).n).toBe(0);

  await ana.app.close();
  await dono.app.close();
});

test('colar um print com Ctrl+V vira anexo e chega como imagem (backlog v2, item 1b)', async () => {
  const dono = await entrar('dono', true);
  const { default: sharp } = await import('sharp');
  const png = await sharp({ create: { width: 320, height: 200, channels: 3, background: { r: 255, g: 0, b: 128 } } })
    .png()
    .toBuffer();
  // A imagem vai para a área de transferência do sistema, como um print de tela.
  await dono.app.evaluate(
    ({ clipboard, ClipboardItem }, b64) => clipboard.write([new ClipboardItem({ 'image/png': new Blob([Buffer.from(b64, 'base64')], { type: 'image/png' }) })]),
    png.toString('base64'),
  );
  const campo = dono.janela.getByLabel('Mensagem para #geral');
  await campo.click();
  await dono.janela.keyboard.press('Control+V');
  await expect(dono.janela.getByRole('list', { name: 'Anexos a enviar' })).toContainText(/print-.*\.png/);
  await expect(dono.janela.getByRole('button', { name: 'Enviar' })).toBeEnabled();
  await dono.janela.getByRole('button', { name: 'Enviar' }).click();
  const imagem = dono.janela.getByRole('list', { name: 'Mensagens de #geral' }).getByRole('button', { name: /Ampliar imagem print-/ });
  await expect(imagem).toBeVisible();
  await expect.poll(() => imagem.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(320);
  await dono.janela.screenshot({ path: join(__dirname, '../../docs/demandas/to-falando-v2/prints/1b-print-colado.png') });
  await dono.app.close();
});
