import { validarTextoMensagem } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal } from '../dominio/canais.js';
import { apagarMensagem, buscarMensagem, criarMensagemCanal, editarMensagem } from '../dominio/mensagens.js';
import { buscarPorId } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { comAck } from './acoes.js';
import type { ServidorTempoReal, SocketTofalando } from './tempo-real.js';

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function lerTexto(dados: unknown): string {
  const texto = validarTextoMensagem(ehObjeto(dados) && typeof dados.texto === 'string' ? dados.texto : '');
  if (!texto.ok) throw new ErroHttp(400, 'dados_invalidos', texto.erro);
  return texto.valor;
}

function lerId(dados: unknown): number {
  const id = ehObjeto(dados) ? dados.id : undefined;
  if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) throw new ErroHttp(400, 'dados_invalidos', 'Mensagem inválida.');
  return id;
}

function lerCanalTexto(banco: Banco, dados: unknown): number {
  const destino = ehObjeto(dados) && ehObjeto(dados.destino) ? dados.destino : undefined;
  const canalId = destino?.canalId;
  if (typeof canalId !== 'number' || !Number.isInteger(canalId)) throw new ErroHttp(400, 'dados_invalidos', 'Destino inválido.');
  const canal = buscarCanal(banco, canalId);
  if (!canal || canal.tipo !== 'texto') throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
  return canalId;
}

/** RF-8, RF-10, RF-11: enviar, editar, apagar e "digitando" em canal de texto (DMs na T12). */
export function registrarEventosMensagens(io: ServidorTempoReal, socket: SocketTofalando, banco: Banco, registrarErro: (e: unknown) => void) {
  const usuarioId = socket.data.usuarioId;

  socket.on(
    'mensagem:enviar',
    comAck(registrarErro, (dados: unknown) => {
      const canalId = lerCanalTexto(banco, dados);
      const mensagem = criarMensagemCanal(banco, canalId, usuarioId, lerTexto(dados));
      io.emit('mensagem:nova', mensagem);
      return mensagem;
    }),
  );

  socket.on(
    'mensagem:editar',
    comAck(registrarErro, (dados: unknown) => {
      const id = lerId(dados);
      const texto = lerTexto(dados);
      const editada = banco.transaction(() => {
        const atual = buscarMensagem(banco, id);
        if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Mensagem não encontrada.');
        if (atual.autorId !== usuarioId) throw new ErroHttp(403, 'sem_permissao', 'Só quem escreveu pode editar a mensagem.');
        if (atual.texto === texto) return atual;
        const nova = editarMensagem(banco, id, texto);
        // RN-20d: registra que editou, nunca o texto.
        if (nova.canalId !== null) {
          const canal = buscarCanal(banco, nova.canalId);
          registrarAuditoria(banco, { tipo: 'mensagem_editada', atorId: usuarioId, canal: canal ?? null, detalhes: { mensagem: id } });
        }
        return nova;
      })();
      io.emit('mensagem:editada', editada);
      return editada;
    }),
  );

  socket.on(
    'mensagem:apagar',
    comAck(registrarErro, (dados: unknown) => {
      const id = lerId(dados);
      const canalId = banco.transaction(() => {
        const atual = buscarMensagem(banco, id);
        if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Mensagem não encontrada.');
        const ehAutor = atual.autorId === usuarioId;
        // RN-9: administrador apaga mensagem alheia só em canal (nas DMs, nunca — RN-18, T12).
        const ehAdminEmCanal = atual.canalId !== null && buscarPorId(banco, usuarioId)?.cargo === 'admin';
        if (!ehAutor && !ehAdminEmCanal) throw new ErroHttp(403, 'sem_permissao', 'Você só pode apagar as suas mensagens.');
        apagarMensagem(banco, id);
        if (atual.canalId !== null) {
          const canal = buscarCanal(banco, atual.canalId) ?? null;
          registrarAuditoria(
            banco,
            ehAutor
              ? { tipo: 'mensagem_apagada', atorId: usuarioId, canal, detalhes: { mensagem: id } }
              : { tipo: 'mensagem_apagada_admin', atorId: usuarioId, alvoUsuarioId: atual.autorId, canal, detalhes: { mensagem: id } },
          );
        }
        return atual.canalId;
      })();
      io.emit('mensagem:apagada', { id, canalId });
      return undefined;
    }),
  );

  // Sem resposta: sinal descartável. Inválido é só ignorado; mais de um por segundo do mesmo socket também.
  let ultimoDigitando = 0;
  socket.on('digitando', (dados: unknown) => {
    const agora = Date.now();
    if (agora - ultimoDigitando < 1000) return;
    try {
      const canalId = lerCanalTexto(banco, dados);
      ultimoDigitando = agora;
      socket.broadcast.emit('digitando', { canalId, usuarioId });
    } catch {
      /* ignora */
    }
  });
}
