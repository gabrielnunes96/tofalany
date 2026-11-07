/**
 * Backlog v2, item 15: olhar o banco sem risco, em desenvolvimento e em produção.
 *
 *   banco tabelas                 tabelas e quantas linhas cada uma tem
 *   banco consulta "<SELECT…>"    roda uma consulta só de leitura (até 200 linhas)
 *   banco copia <arquivo.db>      cópia do banco sem senhas, sessões e códigos de redefinição,
 *                                 para abrir no DB Browser for SQLite
 *
 * Desenvolvimento: npm run banco -w server -- tabelas   (banco server/data/tofalando.db)
 * Produção (VM):   ./vm.sh consulta "SELECT …"  e  ./vm.sh copia-banco
 *
 * O banco é aberto só para leitura: nada aqui altera o banco do servidor. Colunas com hash, token ou
 * segredo aparecem mascaradas na consulta. Saída: 0 = ok, 1 = uso ou consulta inválida, 2 = sem banco.
 */
import { existsSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { lerConfig } from '../config.js';

export const SAIDA = { ok: 0, uso: 1, semBanco: 2 } as const;
export const LIMITE_LINHAS = 200;
const LARGURA_MAXIMA = 60;

export interface Saida {
  escrever(texto: string): void;
  erro(texto: string): void;
}

/** Colunas que nunca aparecem na consulta: hashes de senha, tokens de sessão e códigos. */
export function colunaSensivel(nome: string): boolean {
  return /hash|token|segredo|secret|senha/i.test(nome);
}

function textoDaCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return '∅';
  if (Buffer.isBuffer(valor)) return `<${valor.length} bytes>`;
  const texto = String(valor).replace(/\s+/g, ' ');
  return texto.length > LARGURA_MAXIMA ? `${texto.slice(0, LARGURA_MAXIMA - 1)}…` : texto;
}

/** Tabela alinhada em texto puro (sem dependências), com as colunas sensíveis mascaradas. */
export function formatarTabela(linhas: Record<string, unknown>[], colunas: string[]): string {
  const celulas = linhas.map((l) => colunas.map((c) => (colunaSensivel(c) ? '•••' : textoDaCelula(l[c]))));
  const larguras = colunas.map((c, i) => Math.max(c.length, ...celulas.map((linha) => linha[i]!.length)));
  const montar = (valores: string[]) => valores.map((v, i) => v.padEnd(larguras[i]!)).join(' │ ').trimEnd();
  return [montar(colunas), larguras.map((l) => '─'.repeat(l)).join('─┼─'), ...celulas.map(montar)].join('\n');
}

export function tabelas(banco: Database.Database, saida: Saida): number {
  const nomes = banco
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .pluck()
    .all() as string[];
  const linhas = nomes.map((nome) => ({
    tabela: nome,
    linhas: banco.prepare(`SELECT COUNT(*) FROM "${nome.replaceAll('"', '""')}"`).pluck().get(),
  }));
  saida.escrever(formatarTabela(linhas, ['tabela', 'linhas']));
  saida.escrever(`\nVersão do banco: ${String(banco.pragma('user_version', { simple: true }))}`);
  return SAIDA.ok;
}

export function consulta(banco: Database.Database, sql: string, saida: Saida): number {
  let comando: Database.Statement;
  try {
    comando = banco.prepare(sql);
  } catch (erro) {
    saida.erro(`Consulta inválida: ${(erro as Error).message}`);
    return SAIDA.uso;
  }
  if (!comando.reader) {
    saida.erro('Só consultas de leitura (SELECT, WITH… SELECT, PRAGMA de leitura).');
    return SAIDA.uso;
  }
  const colunas = comando.columns().map((c) => c.name);
  const linhas: Record<string, unknown>[] = [];
  let mais = false;
  for (const linha of comando.iterate() as Iterable<Record<string, unknown>>) {
    if (linhas.length === LIMITE_LINHAS) {
      mais = true;
      break;
    }
    linhas.push(linha);
  }
  saida.escrever(formatarTabela(linhas, colunas));
  saida.escrever(`\n${linhas.length} linha(s)${mais ? ` (mostrando as primeiras ${LIMITE_LINHAS}; use LIMIT/OFFSET)` : ''}`);
  return SAIDA.ok;
}

/** Cópia consistente (backup online do SQLite) sem o que dá acesso às contas. */
export async function copia(banco: Database.Database, destino: string, saida: Saida): Promise<number> {
  if (existsSync(destino)) {
    saida.erro(`${destino} já existe; escolha outro nome ou apague o arquivo antes.`);
    return SAIDA.uso;
  }
  await banco.backup(destino);
  const copiado = new Database(destino);
  try {
    copiado.pragma('journal_mode = DELETE');
    copiado.transaction(() => {
      copiado.prepare("UPDATE usuarios SET senha_hash = ''").run();
      copiado.prepare('DELETE FROM sessoes').run();
      const temRedefinicoes = copiado.prepare("SELECT 1 FROM sqlite_master WHERE name = 'redefinicoes_senha'").get();
      if (temRedefinicoes) copiado.prepare('DELETE FROM redefinicoes_senha').run();
    })();
    copiado.exec('VACUUM');
  } finally {
    copiado.close();
  }
  saida.escrever(`Cópia em ${destino} (sem senhas, sessões e códigos de redefinição).`);
  return SAIDA.ok;
}

export async function executar(args: string[], caminhoBanco: string, saida: Saida): Promise<number> {
  const [acao, ...resto] = args;
  const uso = () => {
    saida.erro('Uso: banco tabelas | banco consulta "<SELECT…>" | banco copia <arquivo.db>');
    return SAIDA.uso;
  };
  if (acao !== 'tabelas' && acao !== 'consulta' && acao !== 'copia') return uso();
  if ((acao === 'tabelas' && resto.length !== 0) || (acao !== 'tabelas' && resto.length !== 1) || resto[0]?.trim() === '') return uso();
  if (!existsSync(caminhoBanco)) {
    saida.erro(`Banco não encontrado em ${caminhoBanco}.`);
    return SAIDA.semBanco;
  }
  const banco = new Database(caminhoBanco, { readonly: true, fileMustExist: true });
  try {
    if (acao === 'tabelas') return tabelas(banco, saida);
    if (acao === 'consulta') return consulta(banco, resto[0]!, saida);
    return await copia(banco, resto[0]!, saida);
  } finally {
    banco.close();
  }
}

function ehPontoDeEntrada(): boolean {
  const script = process.argv[1];
  if (!script) return false;
  try {
    return realpathSync(script) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (ehPontoDeEntrada()) {
  executar(process.argv.slice(2), lerConfig().caminhoBanco, {
    escrever: (t) => process.stdout.write(`${t}\n`),
    erro: (t) => console.error(t),
  })
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((erro: unknown) => {
      console.error('Erro:', (erro as Error).message);
      process.exitCode = SAIDA.uso;
    });
}
