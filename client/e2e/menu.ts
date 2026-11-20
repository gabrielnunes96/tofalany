import type { Page } from '@playwright/test';

/** Backlog v2, item 8: as opções do usuário ficam no menu ⚙️ do painel; abre o menu (se fechado) e clica. */
export async function noMenu(janela: Page, nome: string): Promise<void> {
  const item = janela.locator('#menu-usuario').getByRole('button', { name: nome, exact: true });
  if (!(await item.isVisible())) await janela.getByRole('button', { name: 'Menu', exact: true }).click();
  await item.click();
}

/** O item existe no menu (para o administrador) ou não (membro)? Fecha o menu depois de olhar. */
export async function itensDoMenu(janela: Page): Promise<string[]> {
  await janela.getByRole('button', { name: 'Menu', exact: true }).click();
  const nomes = await janela.locator('#menu-usuario button').allTextContents();
  await janela.keyboard.press('Escape');
  return nomes.map((n) => n.trim());
}

/** Configurações abertas: vai a uma seção da navegação à esquerda. */
export async function secaoConfig(janela: Page, nome: string): Promise<void> {
  await janela.getByRole('dialog', { name: 'Configurações' }).getByRole('button', { name: nome, exact: true }).click();
}

/** Fecha a janela de configurações (o app por trás volta a receber cliques). */
export async function fecharConfig(janela: Page): Promise<void> {
  await janela.getByRole('button', { name: 'Fechar as configurações' }).click();
  await janela.getByRole('dialog', { name: 'Configurações' }).waitFor({ state: 'detached' });
}
