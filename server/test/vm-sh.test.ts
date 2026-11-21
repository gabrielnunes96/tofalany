import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** deploy/vm.sh carregado com "source" numa pasta própria (só as funções, sem rodar o main), com comandos falsos no PATH. */
const ORIGINAL = join(__dirname, '../../deploy/vm.sh');
const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

function preparar() {
  const pasta = mkdtempSync(join(tmpdir(), 'tofalany-vmsh-'));
  pastas.push(pasta);
  copyFileSync(ORIGINAL, join(pasta, 'vm.sh'));
  const bin = join(pasta, 'bin');
  spawnSync('mkdir', [bin]);
  const rodar = (comando: string) =>
    spawnSync('bash', ['-c', `source ./vm.sh; ${comando}`], {
      cwd: pasta,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      encoding: 'utf8',
      timeout: 20_000,
    });
  const falso = (nome: string, script: string) => {
    writeFileSync(join(bin, nome), `#!/bin/sh\n${script}\n`);
    chmodSync(join(bin, nome), 0o755);
  };
  return { pasta, rodar, falso };
}

const TOKEN = '0123abcd-4567-89ef-0123-456789abcdef';

describe.skipIf(process.platform === 'win32')('vm.sh (infra-e-atualizacao)', () => {
  it('CA-8: com uma atualização em andamento, "nao-esperar" sai com aviso e "esperar" espera a outra terminar', async () => {
    const { pasta, rodar } = preparar();
    // A outra avisa quando já tem a trava (sem depender de quanto o sistema demora para começar).
    const pronto = join(pasta, 'pronto');
    const outra = spawn('flock', [join(pasta, '.atualizando.lock'), 'sh', '-c', `touch '${pronto}'; sleep 2`], { stdio: 'ignore' });
    await vi.waitFor(() => expect(existsSync(pronto)).toBe(true), { timeout: 10_000, interval: 20 });
    const sem = rodar('com_trava nao-esperar || echo "saiu=$?"');
    expect(sem.stdout).toContain('Já há uma atualização em andamento.');
    expect(sem.stdout).toContain('saiu=1');
    const inicio = Date.now();
    const com = rodar('com_trava esperar && echo pegou');
    expect(com.stdout).toContain('esperando ela terminar');
    expect(com.stdout).toContain('pegou');
    expect(Date.now() - inicio).toBeGreaterThan(500);
    outra.kill();
  });

  it('CA-3: dominio manda o token só pelo stdin do curl, confere OK e não mostra o token', () => {
    const { pasta, rodar, falso } = preparar();
    writeFileSync(join(pasta, 'duckdns.token'), `tofalany\n${TOKEN}\n`, { mode: 0o644 });
    falso('curl', `echo "$@" > '${pasta}/argv.txt'\ncat > '${pasta}/stdin.txt'\necho OK`);
    const r = rodar('dominio 168.138.133.232');
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toContain('tofalany.duckdns.org aponta para 168.138.133.232');
    expect(r.stdout + r.stderr).not.toContain(TOKEN);
    expect(readFileSync(join(pasta, 'argv.txt'), 'utf8')).not.toContain(TOKEN);
    expect(readFileSync(join(pasta, 'stdin.txt'), 'utf8')).toContain(`domains=tofalany&token=${TOKEN}&ip=168.138.133.232`);
    // O arquivo do token fica só para o dono.
    expect(spawnSync('stat', ['-c', '%a', join(pasta, 'duckdns.token')], { encoding: 'utf8' }).stdout.trim()).toBe('600');
  });

  it('dominio: resposta KO, token ou IP inválidos falham sem mostrar o token', () => {
    const { pasta, rodar, falso } = preparar();
    writeFileSync(join(pasta, 'duckdns.token'), `tofalany\n${TOKEN}\n`);
    falso('curl', 'cat > /dev/null\necho KO');
    const ko = rodar('dominio 168.138.133.232');
    expect(ko.status).not.toBe(0);
    expect(ko.stderr).toContain('recusou');
    expect(ko.stdout + ko.stderr).not.toContain(TOKEN);
    // IP inválido (injeção ou parte acima de 255): recusa antes de chamar o DuckDNS.
    falso('curl', `touch '${pasta}/chamou'\necho OK`);
    for (const ip of ['1.2.3.4; rm -rf /', '999.1.1.1', '1.2.3.256']) {
      const r = rodar(`dominio "${ip}"`);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain('IP inválido');
    }
    expect(existsSync(join(pasta, 'chamou'))).toBe(false);
    writeFileSync(join(pasta, 'duckdns.token'), 'tofalany\n$(touch /tmp/pwn)\n');
    expect(rodar('dominio 1.2.3.4').stderr).toContain('Token do DuckDNS inválido');
  });

  it('sem IP: usa o do checkip; checkip fora do ar dá a mensagem do script', () => {
    const { pasta, rodar, falso } = preparar();
    writeFileSync(join(pasta, 'duckdns.token'), `tofalany\n${TOKEN}\n`);
    falso('curl', `case "$*" in *checkip*) echo ' 168.138.133.232 ';; *) cat > '${pasta}/stdin.txt'; echo OK;; esac`);
    const r = rodar('dominio');
    expect(r.status).toBe(0);
    expect(readFileSync(join(pasta, 'stdin.txt'), 'utf8')).toContain('&ip=168.138.133.232"');
    falso('curl', 'exit 6');
    const fora = rodar('dominio');
    expect(fora.status).toBe(1);
    expect(fora.stderr).toContain('Não consegui descobrir o IP público');
  });

  it.skipIf(process.getuid?.() === 0)('trava que não abre (dono root): erro claro, não "em andamento"', () => {
    const { pasta, rodar } = preparar();
    writeFileSync(join(pasta, '.atualizando.lock'), '');
    chmodSync(join(pasta, '.atualizando.lock'), 0o000);
    const r = rodar('com_trava nao-esperar; echo "saiu=$?"');
    expect(r.stderr).toContain('Não consegui abrir a trava');
    expect(r.stdout).not.toContain('em andamento');
    expect(r.stdout).not.toContain('saiu=');
  });

  it('sem o arquivo do token: erro com a instrução', () => {
    const { rodar } = preparar();
    expect(rodar('dominio 1.2.3.4').stderr).toContain('linha 1: o nome');
  });
});
