import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { ESQUEMA_LINK } from '@tofalando/shared';

export const ID_APP = 'com.tofalany.app';
const ARQUIVO_DESKTOP = 'tofalany-appimage.desktop';

/**
 * Argumento de Exec= na especificação Desktop Entry: entre aspas, com \ " ` $ escapados por barra; depois o valor
 * de texto dobra as barras; % vira %%. Caminho com quebra de linha não é aceito (quebraria o arquivo).
 */
export function argumentoExec(caminho: string): string {
  if (/[\r\n]/.test(caminho)) throw new Error('caminho do AppImage com quebra de linha');
  const citado = `"${caminho.replace(/[\\"`$]/g, (c) => `\\${c}`)}"`;
  return citado.replace(/\\/g, '\\\\').replace(/%/g, '%%');
}

/** Atalho do AppImage com o tratador do link tofalany:// (R-6). */
export function desktopAppImage(caminhoAppImage: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Name=ToFalany',
    'Comment=Voz, chat e tela para o seu grupo',
    `Exec=${argumentoExec(caminhoAppImage)} %u`,
    'Icon=tofalany',
    'StartupWMClass=ToFalany',
    'Terminal=false',
    'Categories=Network;',
    `MimeType=x-scheme-handler/${ESQUEMA_LINK};`,
    'NoDisplay=false',
    '',
  ].join('\n');
}

type Executar = (comando: string, argumentos: string[]) => void;
const executarPadrao: Executar = (comando, argumentos) => {
  execFile(comando, argumentos, () => undefined);
};

/**
 * Integração com o sistema, só no app empacotado:
 * - Windows: o AppUserModelId faz as notificações aparecerem (e o clique voltar ao app) — pendência da T13;
 * - AppImage: o .deb e o .exe registram o link tofalany:// na instalação; o AppImage não instala nada, então
 *   registra o próprio atalho na primeira execução (e de novo se o arquivo mudou de lugar). Com o .deb também
 *   instalado, o último AppImage aberto fica com o link.
 */
export function integrarSistema(opcoes: {
  empacotado: boolean;
  plataforma: NodeJS.Platform;
  appImage?: string;
  definirId: (id: string) => void;
  pasta?: string;
  executar?: Executar;
}) {
  if (!opcoes.empacotado) return;
  if (opcoes.plataforma === 'win32') opcoes.definirId(ID_APP);
  if (opcoes.plataforma !== 'linux' || !opcoes.appImage) return;
  const pasta = opcoes.pasta ?? join(homedir(), '.local', 'share', 'applications');
  const executar = opcoes.executar ?? executarPadrao;
  const arquivo = join(pasta, ARQUIVO_DESKTOP);
  try {
    const conteudo = desktopAppImage(opcoes.appImage);
    let atual: string;
    try {
      atual = readFileSync(arquivo, 'utf8');
    } catch {
      atual = '';
    }
    if (atual === conteudo) return;
    mkdirSync(pasta, { recursive: true });
    writeFileSync(arquivo, conteudo, 'utf8');
    executar('xdg-mime', ['default', ARQUIVO_DESKTOP, `x-scheme-handler/${ESQUEMA_LINK}`]);
    executar('update-desktop-database', [pasta]);
  } catch (erro) {
    console.warn('Não foi possível registrar o link tofalany:// do AppImage:', erro);
  }
}
