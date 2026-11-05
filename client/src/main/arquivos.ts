import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { app, dialog, net, shell, type BrowserWindow } from 'electron';

/** Nome seguro para sugerir no "Salvar como" (sem caminho nem caracteres proibidos no Windows). */
export function nomeParaSalvar(nome: string): string {
  // eslint-disable-next-line no-control-regex
  const limpo = basename(nome.replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"/\\|?*]/g, '_').trim();
  return limpo || 'anexo';
}

/** Só abre pelo programa do sistema o que é imagem, PDF ou ZIP (nunca algo executável). */
export const EXTENSOES_ABRIVEIS = ['pdf', 'zip', 'jpg', 'jpeg', 'png', 'gif', 'webp'];

export function podeAbrir(caminho: string): boolean {
  const ext = caminho.toLowerCase().split('.').pop() ?? '';
  return EXTENSOES_ABRIVEIS.includes(ext);
}

/** A URL precisa ser /files/<id> do servidor configurado (o renderer não escolhe de onde baixar). */
export function urlPermitida(url: string, servidorUrl: string | null): boolean {
  if (!servidorUrl) return false;
  try {
    const u = new URL(url);
    return u.origin === new URL(servidorUrl).origin && /^\/files\/[0-9a-f]{32}\.[a-z0-9]{2,4}$/.test(u.pathname);
  } catch {
    return false;
  }
}

/**
 * RF-9: documento é salvo onde a pessoa escolher e aberto pelo programa do sistema, nunca dentro do app.
 * Só abre o que este processo salvou.
 */
export function criarArquivos(obterJanela: () => BrowserWindow | undefined, servidorUrl: () => string | null) {
  const salvos = new Set<string>();
  return {
    async baixar(url: string, nome: string): Promise<string | null> {
      if (!urlPermitida(url, servidorUrl())) throw new Error('Endereço de arquivo não permitido.');
      const janela = obterJanela();
      const opcoes = { defaultPath: join(app.getPath('downloads'), nomeParaSalvar(nome)) };
      const escolha = janela ? await dialog.showSaveDialog(janela, opcoes) : await dialog.showSaveDialog(opcoes);
      if (escolha.canceled || !escolha.filePath) return null;
      const resposta = await net.fetch(url);
      if (!resposta.ok) throw new Error(`O servidor respondeu ${resposta.status}.`);
      await writeFile(escolha.filePath, Buffer.from(await resposta.arrayBuffer()));
      salvos.add(escolha.filePath);
      return escolha.filePath;
    },
    async abrir(caminho: string): Promise<void> {
      if (!salvos.has(caminho)) throw new Error('Só é possível abrir arquivos baixados por aqui.');
      if (!podeAbrir(caminho)) throw new Error('Por segurança, só PDF, ZIP e imagens são abertos pelo app.');
      const erro = await shell.openPath(caminho);
      if (erro) throw new Error(erro);
    },
  };
}
