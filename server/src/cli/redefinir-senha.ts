/**
 * Redefine a senha de uma conta (RF-4) e encerra as sessões dela.
 * Uso: npm run redefinir-senha -w server -- <usuario>
 *      docker compose exec server npm run redefinir-senha -- <usuario>
 * A senha nova é pedida duas vezes no terminal (sem aparecer) ou lida das duas primeiras linhas
 * da entrada padrão (senha e confirmação); nunca por argumento, para não ficar no histórico do shell.
 * Saída: 0 = ok, 1 = uso/senha inválida, 2 = usuário não encontrado, 3 = erro interno, 130 = cancelado.
 */
import { createInterface } from 'node:readline';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validarSenha } from '@tofalando/shared';
import { lerConfig } from '../config.js';
import { abrirBanco, type Banco } from '../db/banco.js';
import { gerarHashSenha } from '../auth/senha.js';
import { buscarPorLogin } from '../dominio/usuarios.js';
import { revogarSessoesDoUsuario } from '../dominio/sessoes.js';
import { registrarAuditoria } from '../dominio/auditoria.js';

export const SAIDA = { ok: 0, uso: 1, naoEncontrado: 2, erroInterno: 3, cancelado: 130 } as const;

/** Lançado por Io.lerSenha quando a pessoa cancela (Ctrl+C / Ctrl+D). */
export class Cancelado extends Error {}

export interface Io {
  lerSenha(pergunta: string): Promise<string>;
  escrever(texto: string): void;
  erro(texto: string): void;
}

/** Grava o hash e revoga as sessões numa transação; undefined se a conta não existe (ou foi removida). */
export async function redefinirSenha(banco: Banco, usuario: string, senha: string): Promise<number | undefined> {
  const hash = await gerarHashSenha(senha);
  return banco.transaction(() => {
    const linha = buscarPorLogin(banco, usuario);
    if (!linha) return undefined;
    banco.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hash, linha.id);
    revogarSessoesDoUsuario(banco, linha.id);
    registrarAuditoria(banco, { tipo: 'senha_redefinida', atorId: null, alvoUsuarioId: linha.id });
    return linha.id;
  })();
}

export async function executar(args: string[], banco: Banco, io: Io): Promise<number> {
  const usuario = args[0]?.trim();
  if (!usuario || args.length !== 1) {
    io.erro('Uso: redefinir-senha <usuario>');
    return SAIDA.uso;
  }
  const naoEncontrado = () => {
    io.erro(`Usuário "${usuario}" não encontrado.`);
    return SAIDA.naoEncontrado;
  };
  if (!buscarPorLogin(banco, usuario)) return naoEncontrado();
  try {
    const senha = await io.lerSenha(`Nova senha para ${usuario}: `);
    const valida = validarSenha(senha);
    if (!valida.ok) {
      io.erro(valida.erro);
      return SAIDA.uso;
    }
    const confirmacao = await io.lerSenha('Repita a nova senha: ');
    if (confirmacao !== senha) {
      io.erro('As senhas não conferem.');
      return SAIDA.uso;
    }
    // A conta pode ter sido removida pelo servidor enquanto a senha era digitada.
    if ((await redefinirSenha(banco, usuario, senha)) === undefined) return naoEncontrado();
  } catch (erro) {
    if (erro instanceof Cancelado) {
      io.erro('Cancelado. A senha não foi alterada.');
      return SAIDA.cancelado;
    }
    throw erro;
  }
  io.escrever(`Senha de ${usuario} redefinida; as sessões abertas foram encerradas.`);
  return SAIDA.ok;
}

/** Terminal: pede sem ecoar. Entrada redirecionada: lê linha a linha (senha e confirmação). */
function ioDoProcesso(): Io {
  const linhas = process.stdin.isTTY ? undefined : createInterface({ input: process.stdin })[Symbol.asyncIterator]();
  return {
    async lerSenha(pergunta) {
      if (linhas) {
        const { value, done } = await linhas.next();
        if (done) throw new Cancelado();
        return String(value);
      }
      const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
      const comSaida = rl as unknown as { _writeToOutput: (s: string) => void };
      process.stdout.write(pergunta);
      comSaida._writeToOutput = () => undefined;
      try {
        return await new Promise<string>((resolver, rejeitar) => {
          let respondeu = false;
          rl.on('SIGINT', () => rejeitar(new Cancelado()));
          rl.on('close', () => {
            if (!respondeu) rejeitar(new Cancelado());
          });
          rl.question('', (resposta) => {
            respondeu = true;
            resolver(resposta);
          });
        });
      } finally {
        rl.close();
        process.stdout.write('\n');
      }
    },
    escrever: (t) => process.stdout.write(`${t}\n`),
    erro: (t) => console.error(t),
  };
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
  const banco = abrirBanco(lerConfig().caminhoBanco);
  executar(process.argv.slice(2), banco, ioDoProcesso())
    .then((codigo) => {
      process.exitCode = codigo;
    })
    .catch((erro: unknown) => {
      console.error('Erro interno:', erro);
      process.exitCode = SAIDA.erroInterno;
    })
    .finally(() => banco.close());
}
