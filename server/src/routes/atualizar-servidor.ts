import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { Banco } from '../db/banco.js';
import type { Config } from '../config.js';
import { ErroHttp } from '../erros.js';
import { exigirAdmin, exigirPrincipal, exigirSessao } from '../auth/sessao-http.js';
import { registrarAuditoria } from '../dominio/auditoria.js';

/** Entre um pedido e outro (a VM consulta o GitHub a cada pedido, e a API dele tem limite por hora). */
export const ESPERA_PEDIDO_MS = 5 * 60_000;

/**
 * infra-e-atualizacao, RF-5 (T-7): "Atualizar o servidor agora". O servidor (num contêiner) não roda nada na VM: só
 * cria o arquivo vazio `atualizar` na pasta montada (PEDIDOS). Um vigia do systemd na VM vê o arquivo e roda o mesmo
 * `vm.sh verificar` do timer. O conteúdo é vazio de propósito: a VM nunca lê nada dele.
 */
export function registrarRotasAtualizarServidor(app: FastifyInstance, banco: Banco, config: Config): void {
  let ultimoPedido = 0;
  app.post('/api/admin/servidor/atualizar', { preHandler: [exigirSessao(banco), exigirAdmin(banco), exigirPrincipal()] }, async (req, reply) => {
    if (!config.pastaPedidos) throw new ErroHttp(503, 'atualizacao_indisponivel', 'Este servidor não atualiza pelo app (só na VPS com o vm.sh).');
    if (Date.now() - ultimoPedido < ESPERA_PEDIDO_MS) throw new ErroHttp(429, 'muitas_tentativas', 'A atualização já foi pedida há pouco. Espere alguns minutos.');
    try {
      // 'wx': não segue um arquivo que já esteja lá (pedido ainda não atendido conta como feito).
      writeFileSync(join(config.pastaPedidos, 'atualizar'), '', { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    ultimoPedido = Date.now();
    registrarAuditoria(banco, { tipo: 'atualizacao_pedida', atorId: req.usuarioId! });
    reply.code(202);
    return { ok: true };
  });
}
