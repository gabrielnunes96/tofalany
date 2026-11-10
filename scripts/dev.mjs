#!/usr/bin/env node
/**
 * Menu de desenvolvimento: sobe a mídia (LiveKit no Docker), o servidor e quantos apps quiser, cada um com a sua
 * pasta de dados em .dev/ (nada mexe no ToFalany instalado nem na VM). Tudo roda em segundo plano, com log em
 * .dev/logs/; "Parar tudo" derruba o que este menu subiu. Uso: `npm run dev` na raiz do repositório.
 */
/* eslint-disable no-console -- menu de terminal: a saída é para a pessoa */
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEV = join(RAIZ, '.dev');
const LOGS = join(DEV, 'logs');
const ESTADO = join(DEV, 'processos.json');
const LIVEKIT = 'tofalany-livekit-dev';
const IMAGEM_LIVEKIT = 'livekit/livekit-server:v1.13.11';
const CONVITE = 'teste';
const SERVIDORES = { 1: 3000, 2: 3001 };

mkdirSync(LOGS, { recursive: true });

// ---------- estado (o que este menu subiu) ----------
const ler = () => {
  try {
    return JSON.parse(readFileSync(ESTADO, 'utf8'));
  } catch {
    return { servidores: {}, apps: {} };
  }
};
const gravar = (e) => writeFileSync(ESTADO, JSON.stringify(e, null, 2));
const vivo = (pid) => {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
/** Tira do estado o que já terminou (app fechado, servidor que caiu). */
function limparMortos() {
  const e = ler();
  for (const grupo of ['servidores', 'apps']) for (const [k, pid] of Object.entries(e[grupo])) if (!vivo(pid)) delete e[grupo][k];
  gravar(e);
  return e;
}

// ---------- utilitários ----------
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const midiaNoAr = () => {
  try {
    return docker('ps', '-q', '--filter', `name=^${LIVEKIT}$`) !== '';
  } catch {
    return false;
  }
};
const respondendo = async (porta) => {
  try {
    const r = await fetch(`http://127.0.0.1:${porta}/api/servidor`, { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Roda em segundo plano, num grupo de processos próprio (para parar tudo junto), com o log num arquivo. */
function emSegundoPlano(nomeLog, comando, args, ambiente = {}) {
  const log = openSync(join(LOGS, `${nomeLog}.log`), 'a');
  const filho = spawn(comando, args, { cwd: RAIZ, env: { ...process.env, ...ambiente }, detached: true, stdio: ['ignore', log, log] });
  filho.unref();
  return filho.pid;
}
function parar(pid) {
  if (!vivo(pid)) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // já saiu
    }
  }
}

// ---------- ações ----------
async function subirMidia() {
  if (midiaNoAr()) return true;
  console.log('Subindo a mídia (LiveKit no Docker)…');
  try {
    docker('run', '-d', '--rm', '--name', LIVEKIT, '-p', '7880:7880', '-p', '7881:7881', '-p', '7882:7882/udp', IMAGEM_LIVEKIT, '--dev', '--bind', '0.0.0.0', '--node-ip', '127.0.0.1');
    return true;
  } catch (erro) {
    console.log(`Não foi possível subir a mídia: ${String(erro.stderr || erro.message).trim()}`);
    console.log('Confira se o Docker está rodando e se as portas 7880 a 7882 estão livres (o compose do servidor usa as mesmas).');
    return false;
  }
}

async function subirServidor(n) {
  const porta = SERVIDORES[n];
  const e = limparMortos();
  if (e.servidores[n] || (await respondendo(porta))) {
    console.log(`O servidor ${n} já está no ar em http://127.0.0.1:${porta}.`);
    return true;
  }
  if (!(await subirMidia())) return false;
  const pasta = join(DEV, `servidor-${n}`);
  mkdirSync(join(pasta, 'arquivos'), { recursive: true });
  console.log(`Subindo o servidor ${n} (porta ${porta})…`);
  e.servidores[n] = emSegundoPlano(`servidor-${n}`, 'npm', ['run', 'dev:server'], {
    PORTA: String(porta),
    HOST: '127.0.0.1',
    BANCO: join(pasta, 'tofalando.db'),
    ARQUIVOS: join(pasta, 'arquivos'),
    CODIGO_CONVITE: CONVITE,
    NOME_SERVIDOR: `Teste ${n}`,
    LIVEKIT_URL: 'ws://127.0.0.1:7880',
    LIVEKIT_API_KEY: 'devkey',
    LIVEKIT_API_SECRET: 'secret',
  });
  gravar(e);
  for (let i = 0; i < 90; i++) {
    if (await respondendo(porta)) {
      console.log(`Servidor ${n} no ar: http://127.0.0.1:${porta} (convite: ${CONVITE}).`);
      return true;
    }
    if (!vivo(e.servidores[n])) break;
    await esperar(1000);
  }
  console.log(`O servidor ${n} não respondeu. Veja o log: .dev/logs/servidor-${n}.log`);
  return false;
}

function abrirApp() {
  const e = limparMortos();
  let n = 1;
  while (e.apps[n]) n++;
  const pasta = join(DEV, `app-${n}`);
  mkdirSync(pasta, { recursive: true });
  e.apps[n] = emSegundoPlano(`app-${n}`, 'npm', ['run', 'dev:client'], { TOFALANDO_USER_DATA: pasta });
  gravar(e);
  console.log(`Abrindo o app ${n} (pessoa ${n}, dados em .dev/app-${n}).`);
  console.log(`Na primeira tela: servidor http://127.0.0.1:${SERVIDORES[1]} e convite "${CONVITE}". A primeira conta criada vira administradora.`);
}

function pararTudo() {
  const e = limparMortos();
  for (const pid of [...Object.values(e.apps), ...Object.values(e.servidores)]) parar(pid);
  gravar({ servidores: {}, apps: {} });
  if (midiaNoAr()) {
    try {
      docker('stop', LIVEKIT);
    } catch {
      // já parou
    }
  }
  console.log('Tudo parado.');
}

function zerarDados() {
  for (const n of Object.keys(SERVIDORES)) rmSync(join(DEV, `servidor-${n}`), { recursive: true, force: true });
  for (let n = 1; n <= 20; n++) rmSync(join(DEV, `app-${n}`), { recursive: true, force: true });
  rmSync(LOGS, { recursive: true, force: true });
  mkdirSync(LOGS, { recursive: true });
  console.log('Dados de teste apagados (contas, mensagens, configurações dos apps de teste e logs).');
}

/** Roda um comando na frente (testes), mostrando a saída; volta ao menu no fim. */
const naFrente = (comando, args) =>
  new Promise((resolve) => {
    const filho = spawn(comando, args, { cwd: RAIZ, stdio: 'inherit' });
    filho.on('exit', (codigo) => {
      console.log(codigo === 0 ? '\nTestes OK.' : `\nTestes terminaram com falha (código ${codigo}).`);
      resolve();
    });
  });

function verLog(nome) {
  const arquivo = join(LOGS, `${nome}.log`);
  if (!existsSync(arquivo)) return console.log('Ainda não há log.');
  const linhas = readFileSync(arquivo, 'utf8').trimEnd().split('\n');
  console.log(`--- últimas linhas de .dev/logs/${nome}.log ---`);
  console.log(linhas.slice(-40).join('\n'));
}

// ---------- menu ----------
async function situacao() {
  const e = limparMortos();
  const s = async (n) => (e.servidores[n] || (await respondendo(SERVIDORES[n])) ? `no ar (${SERVIDORES[n]})` : 'parado');
  const apps = Object.keys(e.apps).length;
  return [`  Mídia: ${midiaNoAr() ? 'no ar' : 'parada'}`, `  Servidor 1: ${await s(1)}`, `  Servidor 2: ${await s(2)}`, `  Apps abertos: ${apps}`].join('\n');
}

const OPCOES = [
  ['1', 'Subir tudo (mídia, servidor 1 e um app)'],
  ['2', 'Abrir mais um app (outra pessoa)'],
  ['3', 'Subir só o servidor 1'],
  ['4', 'Subir o servidor 2 (porta 3001, para testar dois servidores)'],
  ['5', 'Ver o log do servidor 1'],
  ['6', 'Rodar os testes unitários'],
  ['7', 'Rodar os testes de ponta a ponta (tela virtual, sem incomodar)'],
  ['8', 'Parar tudo'],
  ['9', 'Apagar os dados de teste'],
  ['0', 'Sair do menu (o que está no ar continua)'],
];

async function main() {
  const rl = createInterface({ input: process.stdin });
  // Linha a linha (funciona digitando e com a entrada vinda de um pipe); fim da entrada = sair.
  const linhas = rl[Symbol.asyncIterator]();
  const perguntar = async (texto) => {
    process.stdout.write(texto);
    const r = await linhas.next();
    return r.done ? null : r.value;
  };
  // Atalho sem menu: `npm run dev -- tudo` / `parar`.
  const direto = process.argv[2];
  if (direto === 'tudo') {
    if (await subirServidor(1)) abrirApp();
    return rl.close();
  }
  if (direto === 'parar') {
    pararTudo();
    return rl.close();
  }
  for (;;) {
    console.log(`\nToFalany — desenvolvimento\n${await situacao()}\n`);
    for (const [k, t] of OPCOES) console.log(`  ${k}  ${t}`);
    const lida = await perguntar('\nEscolha: ');
    if (lida === null) break;
    const escolha = lida.trim();
    console.log('');
    if (escolha === '1') {
      if (await subirServidor(1)) abrirApp();
    } else if (escolha === '2') {
      if (!(await respondendo(SERVIDORES[1]))) console.log('Dica: o servidor 1 está parado; suba com a opção 3 (ou 1).');
      abrirApp();
    } else if (escolha === '3') await subirServidor(1);
    else if (escolha === '4') {
      await subirServidor(2);
      console.log('Os dois servidores usam a mesma mídia: para testar voz, use um de cada vez.');
    } else if (escolha === '5') verLog('servidor-1');
    else if (escolha === '6') await naFrente('npm', ['test']);
    else if (escolha === '7') await naFrente('npm', ['run', 'test:e2e']);
    else if (escolha === '8') pararTudo();
    else if (escolha === '9') {
      const ok = ((await perguntar('Apagar contas, mensagens e configurações de teste? (s/N) ')) ?? '').trim().toLowerCase();
      if (ok === 's') {
        pararTudo();
        zerarDados();
      }
    } else if (escolha === '0') break;
    else console.log('Opção inválida.');
  }
  rl.close();
}

await main();
