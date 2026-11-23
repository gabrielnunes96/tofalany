import type { Menu } from 'electron';

/**
 * App instalado: sem o menu padrão do Electron (Ctrl+R recarregava a página, Ctrl+Shift+I e F12 abriam as ferramentas de
 * desenvolvedor) e sem ferramentas de desenvolvedor em janela nenhuma. Em desenvolvimento e nos testes E2E (fora do
 * empacotado) tudo continua como antes.
 *
 * Copiar, colar, recortar, desfazer e selecionar tudo nos campos de texto não dependem do menu no Linux nem no Windows
 * (os únicos alvos do instalador): o próprio Chromium trata esses atalhos nos campos editáveis.
 */

/** Opções a somar no webPreferences de toda janela do app: no empacotado, as ferramentas de desenvolvedor ficam desligadas. */
export function preferenciasDoEmpacotado(empacotado: boolean): { devTools?: false } {
  return empacotado ? { devTools: false } : {};
}

/** No empacotado, tira o menu padrão (e com ele os atalhos de recarregar, zoom e ferramentas de desenvolvedor). */
export function prepararMenu(empacotado: boolean, definirMenu: (menu: Menu | null) => void): void {
  if (empacotado) definirMenu(null);
}
