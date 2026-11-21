import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ambienteMinimo, criarCookies, mascarar } from '../src/musica/cookies.js';
import { criarFonteYtDlp } from '../src/musica/fonte.js';
import { lerConfig } from '../src/config.js';

const pastas: string[] = [];
const pastaNova = () => {
  const p = mkdtempSync(join(tmpdir(), 'tofalany-teste-cookies-'));
  pastas.push(p);
  return p;
};
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

const VELHO = '# velho\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tvelho\n';
const NOVO = '# novo\n.youtube.com\tTRUE\t/\tTRUE\t0\tSID\tnovo\n';

function preparar() {
  const base = pastaNova();
  const arquivo = join(base, 'musica-cookies.txt');
  writeFileSync(arquivo, VELHO, { mode: 0o600 });
  const temp = join(base, 'tmp');
  mkdirSync(temp);
  return { arquivo, temp, cookies: criarCookies(arquivo, { pasta: temp }) };
}

describe('cookies do ToOuvini: cópia por execução (infra-e-atualizacao, CA-9, T-9)', () => {
  it('cópia 0600 numa pasta 0700; sucesso promove a cópia; a cópia some depois', async () => {
    const { arquivo, temp, cookies } = preparar();
    const uso = cookies.usar();
    const copia = uso.args[1]!;
    expect(uso.args[0]).toBe('--cookies');
    expect(statSync(copia).mode & 0o777).toBe(0o600);
    expect(statSync(join(copia, '..')).mode & 0o777).toBe(0o700);
    writeFileSync(copia, NOVO);
    await uso.terminar(true);
    expect(readFileSync(arquivo, 'utf8')).toBe(NOVO);
    expect(statSync(arquivo).mode & 0o777).toBe(0o600);
    expect(readdirSync(temp)).toEqual([]);
  });

  it('erro não promove (e a cópia some)', async () => {
    const { arquivo, temp, cookies } = preparar();
    const uso = cookies.usar();
    writeFileSync(uso.args[1]!, NOVO);
    await uso.terminar(false);
    expect(readFileSync(arquivo, 'utf8')).toBe(VELHO);
    expect(readdirSync(temp)).toEqual([]);
  });

  it('CA-9: duas execuções, a primeira com erro e a segunda bem: fica a da segunda', async () => {
    const { arquivo, cookies } = preparar();
    const a = cookies.usar();
    const b = cookies.usar();
    writeFileSync(a.args[1]!, '# a\n');
    writeFileSync(b.args[1]!, NOVO);
    await a.terminar(false);
    await b.terminar(true);
    expect(readFileSync(arquivo, 'utf8')).toBe(NOVO);
  });

  it('RN-7: envio do administrador no meio de uma execução vence; exclusão no meio continua apagada', async () => {
    const { arquivo, cookies } = preparar();
    const uso = cookies.usar();
    writeFileSync(uso.args[1]!, '# execução antiga\n');
    cookies.gravar(NOVO);
    await uso.terminar(true);
    expect(readFileSync(arquivo, 'utf8')).toBe(NOVO);
    const outro = cookies.usar();
    cookies.apagar();
    await outro.terminar(true);
    expect(existsSync(arquivo)).toBe(false);
  });

  it('conteúdo que não passa na conferência não é promovido; sem cookies guardados, nenhum argumento', async () => {
    const { arquivo, cookies } = preparar();
    cookies.conferirCom((c) => c.includes('youtube.com'));
    const uso = cookies.usar();
    writeFileSync(uso.args[1]!, 'lixo');
    await uso.terminar(true);
    expect(readFileSync(arquivo, 'utf8')).toBe(VELHO);
    cookies.apagar();
    expect(cookies.usar().args).toEqual([]);
  });

  it('sobras de uma execução anterior são apagadas ao iniciar', () => {
    const base = pastaNova();
    mkdirSync(join(base, 'tofalany-cookies-velho'));
    criarCookies(join(base, 'x.txt'), { pasta: base });
    expect(existsSync(join(base, 'tofalany-cookies-velho'))).toBe(false);
  });
});

describe('cookies fora de log e de ambiente (T-10)', () => {
  it('mascara cabeçalhos de credencial', () => {
    const t = 'baixando…\n[debug] Cookie: SID=abc; HSID=def\nSet-Cookie: x=1\nAuthorization: Bearer zzz\nok';
    const m = mascarar(t);
    expect(m).not.toMatch(/abc|def|x=1|zzz/);
    expect(m).toContain('baixando…');
    expect(m).toContain('ok');
  });

  it('ambiente mínimo: só PATH, HOME, LANG e TMPDIR', () => {
    expect(Object.keys(ambienteMinimo({ PATH: '/bin', HOME: '/h', LANG: 'pt_BR', TMPDIR: '/t', LIVEKIT_API_SECRET: 's', KLIPY_API_KEY: 'k' })).sort()).toEqual(['HOME', 'LANG', 'PATH', 'TMPDIR']);
  });

  it.skipIf(process.platform === 'win32')('o yt-dlp roda com a cópia, sem os segredos no ambiente, e o que ele grava promove os cookies', async () => {
    const { arquivo, temp, cookies } = preparar();
    const base = pastaNova();
    const ambienteVisto = join(base, 'env.txt');
    const falso = join(base, 'yt-dlp');
    // Grava o ambiente, regrava o arquivo de --cookies (como o yt-dlp faz) e devolve um resultado.
    writeFileSync(
      falso,
      `#!/bin/sh\nenv > '${ambienteVisto}'\nwhile [ $# -gt 0 ]; do if [ "$1" = "--cookies" ]; then printf '# novo\\n.youtube.com\\tTRUE\\t/\\tTRUE\\t0\\tSID\\tnovo\\n' > "$2"; fi; shift; done\necho '{"title":"Música","webpage_url":"https://www.youtube.com/watch?v=x","duration":10}'\n`,
    );
    chmodSync(falso, 0o755);
    process.env.LIVEKIT_API_SECRET = 'segredo-que-nao-pode-vazar';
    try {
      const fonte = criarFonteYtDlp({ ytdlp: falso, gestorCookies: cookies });
      await fonte.buscar('ytsearch1:algo uma busca de texto qualquer');
    } catch {
      // A busca rasa pode não achar no formato do falso; o que importa é o efeito nos cookies e no ambiente.
    } finally {
      delete process.env.LIVEKIT_API_SECRET;
    }
    expect(readFileSync(ambienteVisto, 'utf8')).not.toContain('segredo-que-nao-pode-vazar');
    expect(readFileSync(arquivo, 'utf8')).toBe(NOVO);
    expect(readdirSync(temp)).toEqual([]);
  });
});

describe('configuração do yt-dlp (T-10, T-11)', () => {
  it('recusa opções que imprimem os cookies; MUSICA_POT_URL vira o --extractor-args do gerador de token', () => {
    expect(() => lerConfig({ MUSICA_YTDLP_ARGS: '--js-runtimes node --verbose' })).toThrow(/--verbose/);
    expect(() => lerConfig({ MUSICA_YTDLP_ARGS: '--print-traffic' })).toThrow(/print-traffic/);
    expect(lerConfig({ MUSICA_YTDLP_ARGS: '--js-runtimes node', MUSICA_POT_URL: 'http://bgutil:4416' }).musica.extras).toEqual([
      '--js-runtimes',
      'node',
      '--extractor-args',
      'youtubepot-bgutilhttp:base_url=http://bgutil:4416',
    ]);
    expect(() => lerConfig({ MUSICA_POT_URL: 'bgutil:4416; rm -rf /' })).toThrow(/MUSICA_POT_URL/);
  });
});
