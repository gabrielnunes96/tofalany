import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { abrirEsperaAtualizacao, ARQUIVOS_ESPERA, avisarAtualizacaoPronta, SCRIPT_ESPERA, SCRIPT_ESPERA_LINUX } from './espera-atualizacao';

const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});
const pastaTemp = () => {
  const p = mkdtempSync(join(tmpdir(), 'tofalany-espera-'));
  pastas.push(p);
  return p;
};

describe('janela de espera da atualização (backlog 18)', () => {
  it('só no Windows: grava o script e o ícone na pasta temporária e abre o PowerShell sem janela de console', () => {
    const pasta = pastaTemp();
    const icone = join(pasta, 'origem.png');
    writeFileSync(icone, 'png');
    writeFileSync(join(pasta, ARQUIVOS_ESPERA.pronto), 'velho');
    const iniciar = vi.fn();
    expect(abrirEsperaAtualizacao({ plataforma: 'linux', icone, pasta, iniciar })).toBe(false);
    expect(iniciar).not.toHaveBeenCalled();
    expect(abrirEsperaAtualizacao({ plataforma: 'win32', icone, pasta, iniciar })).toBe(true);
    expect(readFileSync(join(pasta, ARQUIVOS_ESPERA.script), 'utf8')).toBe(SCRIPT_ESPERA);
    expect(readFileSync(join(pasta, ARQUIVOS_ESPERA.icone), 'utf8')).toBe('png');
    // Uma marca "pronto" velha não pode fechar a janela nova na hora.
    expect(existsSync(join(pasta, ARQUIVOS_ESPERA.pronto))).toBe(false);
    const [comando, argumentos] = iniciar.mock.calls[0]!;
    expect(comando).toBe('powershell.exe');
    expect(argumentos).toEqual(expect.arrayContaining(['-WindowStyle', 'Hidden', '-STA', '-File', join(pasta, ARQUIVOS_ESPERA.script), '-Icone', join(pasta, ARQUIVOS_ESPERA.icone), '-Pronto', join(pasta, ARQUIVOS_ESPERA.pronto)]));
  });

  it('o script fecha com a marca "pronto" ou em 90 s, e não leva caminhos dentro do texto', () => {
    expect(SCRIPT_ESPERA).toContain('param([string]$Icone, [string]$Pronto)');
    expect(SCRIPT_ESPERA).toContain('Test-Path -LiteralPath $Pronto');
    expect(SCRIPT_ESPERA).toContain('-gt 90');
    expect(SCRIPT_ESPERA).toContain('RotateTransform');
    expect(SCRIPT_ESPERA).not.toMatch(/[A-Z]:\\|\/tmp\//);
  });

  it('falha ao preparar a janela não impede a atualização', () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(abrirEsperaAtualizacao({ plataforma: 'win32', icone: '/nao/existe.png', pasta: '/nao/existe', iniciar: vi.fn() })).toBe(false);
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it('a versão nova, ao abrir, cria a marca "pronto" e limpa o resto; sem atualização em andamento, nada', () => {
    const pasta = pastaTemp();
    avisarAtualizacaoPronta(pasta);
    expect(existsSync(join(pasta, ARQUIVOS_ESPERA.pronto))).toBe(false);
    writeFileSync(join(pasta, ARQUIVOS_ESPERA.script), 'x');
    writeFileSync(join(pasta, ARQUIVOS_ESPERA.icone), 'x');
    avisarAtualizacaoPronta(pasta);
    expect(existsSync(join(pasta, ARQUIVOS_ESPERA.pronto))).toBe(true);
    expect(existsSync(join(pasta, ARQUIVOS_ESPERA.script))).toBe(false);
    expect(existsSync(join(pasta, ARQUIVOS_ESPERA.icone))).toBe(false);
  });

  it('Linux: só no .deb, com o zenity (barra pulsando), fechando com a marca "pronto" ou em 90 s (backlog 21)', () => {
    const pasta = pastaTemp();
    const icone = join(pasta, 'origem.png');
    writeFileSync(icone, 'png');
    const iniciar = vi.fn();
    expect(abrirEsperaAtualizacao({ plataforma: 'linux', icone, pasta, iniciar })).toBe(false);
    expect(abrirEsperaAtualizacao({ plataforma: 'linux', icone, pacote: 'deb', pasta, iniciar })).toBe(true);
    const script = join(pasta, ARQUIVOS_ESPERA.scriptLinux);
    expect(readFileSync(script, 'utf8')).toBe(SCRIPT_ESPERA_LINUX);
    expect(iniciar).toHaveBeenCalledWith('sh', [script, join(pasta, ARQUIVOS_ESPERA.icone), join(pasta, ARQUIVOS_ESPERA.pronto)]);
    expect(SCRIPT_ESPERA_LINUX).toContain('command -v zenity');
    expect(SCRIPT_ESPERA_LINUX).toContain('-lt 90');
    expect(SCRIPT_ESPERA_LINUX).toContain('--no-cancel');
    expect(SCRIPT_ESPERA_LINUX).not.toMatch(/\/tmp\//);
    avisarAtualizacaoPronta(pasta);
    expect(existsSync(join(pasta, ARQUIVOS_ESPERA.pronto))).toBe(true);
    expect(existsSync(script)).toBe(false);
  });
});
