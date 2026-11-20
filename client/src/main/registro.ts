import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Registra uma linha ("área: motivo"). Nunca lança: o log não pode derrubar quem registra. */
export type Registrar = (area: string, motivo: string) => void;

/**
 * Log do processo principal em arquivo (correcoes-atividade, T-3). No Windows empacotado o `console` se perde, e o
 * relato de um amigo precisa de algo para mandar. Grava em `<pasta>/tofalany.log`; acima de `maxBytes` (1 MB) o atual
 * vira `tofalany.old.log` (guarda um só). A mesma linha não se repete seguida para a mesma parte (a leitura da
 * atividade roda a cada 20 s).
 * Quem chama passa só motivos fixos: nada de nomes de processo, títulos de janela ou músicas (RN-9).
 */
export function criarRegistro(pasta: string, { agora = () => new Date(), maxBytes = 1024 * 1024 } = {}): Registrar {
  const arquivo = join(pasta, 'tofalany.log');
  // Última linha de cada parte ("atividade: jogo", "atividade: musica"): falhas de partes diferentes na mesma rodada
  // não se alternam no arquivo a cada 20 s.
  const ultimas = new Map<string, string>();
  return (area, motivo) => {
    // Uma linha por evento: quebras viram espaço e o motivo tem no máximo 200 caracteres.
    const linha = `${area}: ${motivo}`.replace(/[\r\n]+/g, ' ').slice(0, 200);
    const parte = `${area}: ${motivo.split(':')[0]}`;
    if (ultimas.get(parte) === linha) return;
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
      appendFileSync(arquivo, `${dataLocal(agora())} ${linha}\n`);
      // Só depois de gravar: uma falha passageira (arquivo travado) não faz a mesma linha ser descartada depois.
      ultimas.set(parte, linha);
    } catch {
      // Sem onde gravar (pasta sem permissão, disco cheio): segue sem log.
    }
  };
}

/** "AAAA-MM-DD HH:MM:SS" na hora local (o relato do amigo diz "às 19h", não em UTC). */
function dataLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
