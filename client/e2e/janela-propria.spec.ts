import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';

/** video-teatro-cameras-e-sons, T1: a janela própria recebe o vídeo da principal (mesma faixa) e nasce sem a ponte. */
const principal = join(__dirname, '../out/main/index.js');
let pasta: string;
let app: ElectronApplication | undefined;

test.beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'tofalando-e2e-janela-'));
});
test.afterEach(async () => {
  await app?.close().catch(() => undefined);
  rmSync(pasta, { recursive: true, force: true });
});

test('janela própria: só about:blank com nome conhecido; vídeo da principal toca nela; sem a ponte; fecha com a principal', async () => {
  app = await electron.launch({ args: [principal], env: { ...process.env, TOFALANDO_USER_DATA: pasta } });
  const janela = await app.firstWindow();
  await janela.waitForLoadState('domcontentloaded');
  const quantas = () => app!.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  expect(await quantas()).toBe(1);

  // Nome desconhecido ou endereço que não é about:blank: nenhuma janela nova. (Um http(s) iria para o navegador do
  // sistema, que o teste não abre.)
  await janela.evaluate(() => {
    window.open('about:blank', 'outra-coisa');
    window.open('file:///etc/hostname', 'tofalany-cameras');
  });
  await janela.waitForTimeout(300);
  expect(await quantas()).toBe(1);

  // A janela das câmeras: a faixa de um canvas da principal toca num <video> da filha.
  const filhaPromessa = app.waitForEvent('window');
  await janela.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d')!;
    let quadro = 0;
    setInterval(() => {
      ctx.fillStyle = quadro++ % 2 ? '#f00' : '#00f';
      ctx.fillRect(0, 0, 320, 180);
    }, 50);
    const faixa = canvas.captureStream(20).getVideoTracks()[0]!;
    const filha = window.open('about:blank', 'tofalany-cameras')!;
    const video = filha.document.createElement('video');
    video.muted = true;
    video.autoplay = true;
    video.srcObject = new MediaStream([faixa]);
    filha.document.body.appendChild(video);
    (window as unknown as { __filha: Window }).__filha = filha;
  });
  const filha = await filhaPromessa;
  expect(await quantas()).toBe(2);
  await expect
    .poll(() => janela.evaluate(() => (window as unknown as { __filha: Window }).__filha.document.querySelector('video')!.videoWidth), { timeout: 10_000 })
    .toBe(320);
  expect(await filha.evaluate(() => typeof (window as unknown as { tofalando?: unknown }).tofalando)).toBe('undefined');
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map((j) => j.getTitle()))).toContain('ToFalany – Câmeras');
  // Abrir de novo só foca a mesma.
  await janela.evaluate(() => window.open('about:blank', 'tofalany-cameras'));
  await janela.waitForTimeout(200);
  expect(await quantas()).toBe(2);
  // A filha não navega para fora.
  await filha.evaluate(() => (location.href = 'https://exemplo.invalid/'));
  await janela.waitForTimeout(300);
  expect(await filha.evaluate(() => location.href)).toBe('about:blank');
  // Fechar a principal fecha a filha junto (A6): sem janelas, o app sai.
  const saiu = new Promise<void>((r) => app!.once('close', () => r()));
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((j) => j.getTitle() !== 'ToFalany – Câmeras')!
      .close(),
  );
  await saiu;
  app = undefined;
});
