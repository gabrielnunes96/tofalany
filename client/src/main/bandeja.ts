import { app, Menu, nativeImage, Tray } from 'electron';
import { join } from 'node:path';

/** Ícone da bandeja: no app empacotado vem em resources (extraResources); em desenvolvimento, da pasta build. */
export function caminhoIcone(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icone.png') : join(app.getAppPath(), 'build', 'icon.png');
}

/**
 * Backlog v2, 1e: ícone na bandeja do sistema. Fechar a janela só a esconde (a voz e as notificações seguem);
 * o menu abre, muta/desmuta e sai de verdade.
 */
export function criarBandeja(acoes: { abrir(): void; mutar(): void; sair(): void }): Tray | undefined {
  try {
    const icone = nativeImage.createFromPath(caminhoIcone()).resize({ width: 22, height: 22 });
    const bandeja = new Tray(icone);
    bandeja.setToolTip('ToFalany');
    bandeja.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir o ToFalany', click: acoes.abrir },
        { label: 'Mutar / desmutar o microfone', click: acoes.mutar },
        { type: 'separator' },
        { label: 'Sair', click: acoes.sair },
      ]),
    );
    bandeja.on('click', acoes.abrir);
    return bandeja;
  } catch (erro) {
    // Sem bandeja no sistema (alguns ambientes Linux): fechar a janela fecha o app, como antes.
    console.warn('Bandeja do sistema indisponível:', erro);
    return undefined;
  }
}
