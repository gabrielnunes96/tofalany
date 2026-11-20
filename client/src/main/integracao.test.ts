import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { argumentoExec, desktopAppImage, ID_APP, integrarSistema, TAMANHOS_ICONE } from './integracao';

const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

describe('integração com o sistema (T24)', () => {
  it('atalho do AppImage trata o link tofalany://', () => {
    const d = desktopAppImage('/home/ana/Apps/ToFalany-0.1.0.AppImage');
    expect(d).toContain('Exec="/home/ana/Apps/ToFalany-0.1.0.AppImage" %u');
    expect(d).toContain('MimeType=x-scheme-handler/tofalany;');
    expect(d).toContain('StartupWMClass=ToFalany');
  });

  it('escapa o caminho como manda a especificação Desktop Entry', () => {
    expect(argumentoExec('/a/b c')).toBe('"/a/b c"');
    // " vira \" e a barra é dobrada no valor de texto: \\"
    expect(argumentoExec('/a/"x"')).toBe('"/a/\\\\"x\\\\""');
    expect(argumentoExec('/a/$HOME`x`')).toBe('"/a/\\\\$HOME\\\\`x\\\\`"');
    expect(argumentoExec('/a/100%')).toBe('"/a/100%%"');
    expect(argumentoExec('/a\\b')).toBe('"/a\\\\\\\\b"');
    expect(() => argumentoExec('/a\nExec=rm')).toThrow();
  });

  it('Windows empacotado define o AppUserModelId; fora do empacotado, nada', () => {
    const definirId = vi.fn();
    integrarSistema({ empacotado: false, plataforma: 'win32', definirId });
    expect(definirId).not.toHaveBeenCalled();
    integrarSistema({ empacotado: true, plataforma: 'win32', definirId });
    expect(definirId).toHaveBeenCalledWith(ID_APP);
  });

  it('AppImage grava o atalho e registra o link uma vez; de novo só se mudou de lugar', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'tofalany-desktop-'));
    pastas.push(pasta);
    const executar = vi.fn();
    const base = { empacotado: true, plataforma: 'linux' as const, definirId: vi.fn(), pasta: join(pasta, 'apps'), executar };
    integrarSistema({ ...base, appImage: '/opt/ToFalany.AppImage' });
    expect(readFileSync(join(pasta, 'apps', 'tofalany.desktop'), 'utf8')).toContain('Exec="/opt/ToFalany.AppImage" %u');
    expect(executar).toHaveBeenCalledWith('xdg-mime', ['default', 'tofalany.desktop', 'x-scheme-handler/tofalany']);
    executar.mockClear();
    integrarSistema({ ...base, appImage: '/opt/ToFalany.AppImage' });
    expect(executar).not.toHaveBeenCalled();
    integrarSistema({ ...base, appImage: '/home/ana/ToFalany.AppImage' });
    expect(executar).toHaveBeenCalledTimes(2);
  });

  it('backlog 20: o atalho tem o nome da janela (tofalany.desktop), o antigo some, e os ícones vão para o tema do usuário em todos os tamanhos', () => {
    const pasta = mkdtempSync(join(tmpdir(), 'tofalany-icones-'));
    pastas.push(pasta);
    mkdirSync(join(pasta, 'apps'), { recursive: true });
    writeFileSync(join(pasta, 'apps', 'tofalany-appimage.desktop'), 'velho');
    const executar = vi.fn();
    const icone = vi.fn((t: number) => Buffer.from(`png-${t}`));
    const base = { empacotado: true, plataforma: 'linux' as const, definirId: vi.fn(), pasta: join(pasta, 'apps'), pastaIcones: join(pasta, 'hicolor'), executar, icone };
    integrarSistema({ ...base, appImage: '/opt/ToFalany.AppImage' });
    expect(existsSync(join(pasta, 'apps', 'tofalany-appimage.desktop'))).toBe(false);
    expect(readFileSync(join(pasta, 'apps', 'tofalany.desktop'), 'utf8')).toContain('Icon=tofalany');
    for (const t of TAMANHOS_ICONE) expect(readFileSync(join(pasta, 'hicolor', `${t}x${t}`, 'apps', 'tofalany.png'), 'utf8')).toBe(`png-${t}`);
    expect(executar).toHaveBeenCalledWith('gtk-update-icon-cache', ['-f', '-t', join(pasta, 'hicolor')]);
    // Na próxima abertura, nada é refeito.
    icone.mockClear();
    executar.mockClear();
    integrarSistema({ ...base, appImage: '/opt/ToFalany.AppImage' });
    expect(icone).not.toHaveBeenCalled();
    expect(executar).not.toHaveBeenCalled();
    // Sem AppImage (ex.: .deb), nada disso.
    integrarSistema({ ...base, appImage: undefined });
    expect(icone).not.toHaveBeenCalled();
  });

  it('caminho inválido não derruba o app', () => {
    const executar = vi.fn();
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    integrarSistema({ empacotado: true, plataforma: 'linux', definirId: vi.fn(), appImage: '/a\nb', pasta: '/nao/existe', executar });
    expect(executar).not.toHaveBeenCalled();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });

  it('o ID do app é o mesmo do electron-builder.yml', () => {
    const yml = readFileSync(join(__dirname, '../../electron-builder.yml'), 'utf8');
    expect(yml).toMatch(new RegExp(`^appId: ${ID_APP.replace(/\./g, '\\.')}$`, 'm'));
  });
});
