import { validarNomeCanal, type TipoCanal } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarPorId } from '../dominio/usuarios.js';
import { buscarCanal, criarCanal, removerCanal, renomearCanal } from '../dominio/canais.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { comAck } from './acoes.js';
import { arquivosDoCanal } from '../dominio/anexos.js';
import type { Armazem } from '../arquivos/armazem.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function lerNome(dados: unknown): string {
  const nome = validarNomeCanal(ehObjeto(dados) && typeof dados.nome === 'string' ? dados.nome : '');
  if (!nome.ok) throw new ErroHttp(400, 'dados_invalidos', nome.erro);
  return nome.valor;
}

function lerId(dados: unknown): number {
  const id = ehObjeto(dados) ? dados.id : undefined;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) throw new ErroHttp(400, 'dados_invalidos', 'Canal inválido.');
  return id;
}

/** RF-7: canais criados, renomeados e removidos em tempo real (RN-7, RN-8), com auditoria (CA-50). */
export function registrarEventosCanais(
  io: ServidorTempoReal,
  socket: SocketTofalando,
  banco: Banco,
  armazem: Armazem,
  registrarErro: (e: unknown) => void,
) {
  const usuarioId = socket.data.usuarioId;

  socket.on(
    'canal:criar',
    comAck(registrarErro, (dados: unknown) => {
      const tipo = ehObjeto(dados) ? dados.tipo : undefined;
      if (tipo !== 'texto' && tipo !== 'voz') throw new ErroHttp(400, 'dados_invalidos', 'Tipo de canal inválido.');
      const nome = lerNome(dados);
      const canal = banco.transaction(() => {
        const novo = criarCanal(banco, tipo as TipoCanal, nome, usuarioId);
        registrarAuditoria(banco, { tipo: 'canal_criado', atorId: usuarioId, canal: novo, detalhes: { tipoCanal: tipo } });
        return novo;
      })();
      io.emit('canal:criado', canal);
      return canal;
    }),
  );

  socket.on(
    'canal:renomear',
    comAck(registrarErro, (dados: unknown) => {
      const id = lerId(dados);
      const nome = lerNome(dados);
      const canal = banco.transaction(() => {
        const antes = buscarCanal(banco, id);
        if (!antes) throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
        const depois = renomearCanal(banco, id, nome)!;
        if (antes.nome !== depois.nome) {
          registrarAuditoria(banco, { tipo: 'canal_renomeado', atorId: usuarioId, canal: depois, detalhes: { nomeAnterior: antes.nome } });
        }
        return depois;
      })();
      io.emit('canal:renomeado', canal);
      return canal;
    }),
  );

  socket.on(
    'canal:remover',
    comAck(registrarErro, (dados: unknown) => {
      const id = lerId(dados);
      let arquivos: string[] = [];
      banco.transaction(() => {
        if (buscarPorId(banco, usuarioId)?.cargo !== 'admin') {
          throw new ErroHttp(403, 'sem_permissao', 'Só administradores removem canais.');
        }
        const canal = buscarCanal(banco, id);
        if (!canal) throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
        registrarAuditoria(banco, { tipo: 'canal_removido', atorId: usuarioId, canal, detalhes: { tipoCanal: canal.tipo } });
        // RN-8: mensagens e anexos saem em cascata; os arquivos são apagados depois do commit.
        arquivos = arquivosDoCanal(banco, id);
        removerCanal(banco, id);
      })();
      for (const a of arquivos) armazem.apagar(a);
      io.emit('canal:removido', { id });
      return undefined;
    }),
  );
}
