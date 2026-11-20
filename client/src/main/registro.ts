import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Registra uma linha ("área: motivo"). Nunca lança: o log não pode derrubar quem registra. */
export type Registrar = (area: string, motivo: string) => void;

/**
 * Log do processo principal em arquivo (correcoes-atividade, T-3). No Windows empacotado o `console` se perde, e o
 * relato de um amigo precisa de algo para mandar. Grava em `<pasta>/tofalany.log`; acima de `maxBytes` (1 MB) o atual
 * vira `tofalany.old.log` (guarda um só). A mesma linha seguida não se repete (a leitura da atividade roda a cada 20 s).
 * Quem chama passa só motivos fixos: nada de nomes de processo, títulos de janela ou músicas (RN-9).
 */
export function criarRegistro(pasta: string, { agora = () => new Date(), maxBytes = 1024 * 1024 } = {}): Registrar {
  const arquivo = join(pasta, 'tofalany.log');
  let ultima = '';
  return (area, motivo) => {
    const linha = `${area}: ${motivo}`;
    if (linha === ultima) return;
    ultima = linha;
    try {
      mkdirSync(pasta, { recursive: true });
      const tamanho = (() => {
        try {
          return statSync(arquivo).size;
        } catch {
          return 0;
        }
      })();
      if (tamanho > maxBytes) renameSync(arquivo, join(pasta, 'tofalany.old.log'));
      appendFileSync(arquivo, `${agora().toISOString()} ${linha}\n`);
    } catch {
      // Sem onde gravar (pasta sem permissão, disco cheio): segue sem log.
    }
  };
}
