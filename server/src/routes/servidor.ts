import type { FastifyInstance } from 'fastify';
import { APP_ID, type SaudeInfo, type ServidorInfo } from '@tofalando/shared';
import type { Config } from '../config.js';
import type { Banco } from '../db/banco.js';
import { contarContasAtivas } from '../dominio/usuarios.js';
import { nomeComunidade } from '../dominio/comunidades.js';

export function registrarRotasServidor(app: FastifyInstance, banco: Banco, config: Config): void {
  app.get('/api/servidor', async (req): Promise<ServidorInfo> => ({
    app: APP_ID,
    // O nome do servidor do endereço (/c/<id> para os criados depois).
    nome: nomeComunidade(banco, req.comunidadeId, config.nomeServidor) ?? config.nomeServidor,
    versao: config.versao,
    contas: contarContasAtivas(banco),
    limiteContas: config.limiteContas,
  }));

  // Healthcheck do docker-compose: banco e LiveKit (a mídia fora não derruba o servidor).
  app.get('/api/saude', async (): Promise<SaudeInfo> => {
    banco.prepare('SELECT 1').get();
    return { ok: true, sqlite: true, livekit: await saudeLivekit(config) };
  });
}

/** A rota é pública: o status do LiveKit fica guardado 10 s (cada chamada não vira uma ida ao LiveKit). */
let ultimaSaude: { em: number; url: string; valor: SaudeInfo['livekit'] } | undefined;

async function saudeLivekit(config: Config): Promise<SaudeInfo['livekit']> {
  if (!config.livekit) return 'sem_config';
  const url = config.livekit.urlInterna;
  if (ultimaSaude && ultimaSaude.url === url && Date.now() - ultimaSaude.em < 10_000) return ultimaSaude.valor;
  const valor = await consultarLivekit(url);
  ultimaSaude = { em: Date.now(), url, valor };
  return valor;
}

async function consultarLivekit(urlInterna: string): Promise<SaudeInfo['livekit']> {
  try {
    const url = urlInterna.replace(/^ws/, 'http');
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.ok ? 'ok' : 'fora';
  } catch {
    return 'fora';
  }
}
