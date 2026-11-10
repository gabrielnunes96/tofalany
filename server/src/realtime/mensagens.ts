import { temPermissao } from '../dominio/funcoes.js';
import { ANEXOS_POR_MENSAGEM, extrairMencoes, validarTextoMensagem, type Destino, type EventosServidor } from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal, comunidadeDoCanal } from '../dominio/canais.js';
import { membroDe } from '../dominio/comunidades.js';
import { saoAmigos } from '../dominio/amizades.js';
import { salaComunidade } from './salas.js';
import { apagarMensagem, buscarMensagem, editarMensagem, inserirMensagem, type Mencoes } from '../dominio/mensagens.js';
import { buscarPorId } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { arquivosDaMensagem, vincularAnexos } from '../dominio/anexos.js';
import { abrirDm, dmPara, exigirParticipante } from '../dominio/dms.js';
import { chaveDoDestino, marcarLido } from '../dominio/leituras.js';
import type { Armazem } from '../arquivos/armazem.js';
import { comAck } from './acoes.js';
import { salaUsuario, type ServidorTempoReal, type SocketTofalando } from './tempo-real.js';

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const ehId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;

function lerTexto(dados: unknown): string {
  const texto = validarTextoMensagem(ehObjeto(dados) && typeof dados.texto === 'string' ? dados.texto : '');
  if (!texto.ok) throw new ErroHttp(400, 'dados_invalidos', texto.erro);
  return texto.valor;
}

function lerId(dados: unknown): number {
  const id = ehObjeto(dados) ? dados.id : undefined;
  if (!ehId(id)) throw new ErroHttp(400, 'dados_invalidos', 'Mensagem inválida.');
  return id;
}

/** Ids de anexo (opcional, até 10, sem repetir). */
function lerAnexos(dados: unknown): string[] {
  const lista = ehObjeto(dados) ? dados.anexos : undefined;
  if (lista === undefined) return [];
  if (!Array.isArray(lista) || lista.length > ANEXOS_POR_MENSAGEM || !lista.every((x) => typeof x === 'string' && /^[0-9a-f]{24}$/.test(x))) {
    throw new ErroHttp(400, 'dados_invalidos', `Anexos inválidos (até ${ANEXOS_POR_MENSAGEM}).`);
  }
  return [...new Set(lista as string[])];
}

/** Destino conferido: canal de texto existente, ou DM em que a pessoa participa (RN-18). */
interface DestinoConferido {
  destino: Destino;
  /** Participantes, se for DM (os únicos que recebem os eventos). */
  participantes: [number, number] | null;
}

function lerDestino(banco: Banco, dados: unknown, usuarioId: number, comunidadeId: number): DestinoConferido {
  const d = ehObjeto(dados) && ehObjeto(dados.destino) ? dados.destino : undefined;
  if (d && ehId(d.canalId)) {
    // Só canais do servidor desta conexão.
    const canal = comunidadeDoCanal(banco, d.canalId) === comunidadeId ? buscarCanal(banco, d.canalId) : undefined;
    if (!canal || canal.tipo !== 'texto') throw new ErroHttp(404, 'nao_encontrado', 'Canal não encontrado.');
    return { destino: { canalId: d.canalId }, participantes: null };
  }
  if (d && ehId(d.dmId)) {
    const participantes = exigirParticipante(banco, d.dmId, usuarioId);
    const outro = participantes[0] === usuarioId ? participantes[1] : participantes[0];
    // Conversa com conta removida fica só para leitura.
    if (!buscarPorId(banco, outro)) throw new ErroHttp(403, 'sem_permissao', 'Essa conta foi removida; a conversa ficou só para leitura.');
    return { destino: { dmId: d.dmId }, participantes };
  }
  throw new ErroHttp(400, 'dados_invalidos', 'Destino inválido.');
}

/** RF-8 a RF-12a: enviar (com anexos), editar, apagar e "digitando" em canais e DMs; abrir DM. */
export function registrarEventosMensagens(
  io: ServidorTempoReal,
  socket: SocketTofalando,
  banco: Banco,
  armazem: Armazem,
  registrarErro: (e: unknown) => void,
) {
  const usuarioId = socket.data.usuarioId;
  const comunidadeId = socket.data.comunidadeId;
  /** Último sinal de "digitando" aceito deste socket (ver o tratador no fim). */
  let ultimoDigitando = 0;

  /**
   * Conexões de um participante da DM em que ela aparece: as dos servidores de que o outro também participa
   * (a conversa fica na aba Diretas de cada servidor em comum).
   */
  function conexoesDaConversa(participantes: [number, number]) {
    return [...io.of('/').sockets.values()].filter((s) => {
      const i = participantes.indexOf(s.data.usuarioId);
      if (i < 0) return false;
      const outro = participantes[1 - i]!;
      return outro === s.data.usuarioId || !!membroDe(banco, s.data.comunidadeId, outro) || saoAmigos(banco, s.data.usuarioId, outro);
    });
  }

  /** Canal: quem está no servidor dele. DM: só os participantes (RN-18). */
  function emitir<E extends keyof EventosServidor>(participantes: [number, number] | null, evento: E, ...args: Parameters<EventosServidor[E]>) {
    const alvos = participantes ? conexoesDaConversa(participantes) : [io.to(salaComunidade(comunidadeId))];
    for (const alvo of alvos) (alvo.emit as (e: E, ...a: Parameters<EventosServidor[E]>) => void)(evento, ...args);
  }

  /** Cada participante recebe a DM vista do seu lado (o "outro" de cada um). */
  function avisarDm(participantes: [number, number], dmId: number) {
    for (const s of conexoesDaConversa(participantes)) s.emit('dm:atualizada', dmPara(banco, dmId, s.data.usuarioId));
  }

  /** Mensagem de canal de outro servidor é como se não existisse para esta conexão. */
  const doServidor = (m: { canalId: number | null }) => {
    if (m.canalId !== null && comunidadeDoCanal(banco, m.canalId) !== comunidadeId) throw new ErroHttp(404, 'nao_encontrado', 'Mensagem não encontrada.');
  };

  /**
   * Menções da mensagem: @usuario vale para quem está no servidor do canal (na DM, só o outro participante);
   * @todos só num canal e de quem tem "Mencionar @todos" (sem a permissão, fica só o texto).
   */
  function resolverMencoes(texto: string, destino: Destino, participantes: [number, number] | null): Mencoes {
    const { usuarios, todos } = extrairMencoes(texto);
    const ids = new Set<number>();
    for (const nome of usuarios.slice(0, 20)) {
      const linha = banco.prepare('SELECT id FROM usuarios WHERE usuario_norm = ? AND removido_em IS NULL').get(nome) as { id: number } | undefined;
      if (!linha || linha.id === usuarioId) continue;
      const alcanca = participantes ? participantes.includes(linha.id) : !!membroDe(banco, comunidadeId, linha.id);
      if (alcanca) ids.add(linha.id);
    }
    return { usuarios: [...ids], todos: todos && 'canalId' in destino && temPermissao(banco, usuarioId, 'mencionar_todos', comunidadeId) };
  }

  const participantesDa = (m: { dmId: number | null }) => (m.dmId === null ? null : exigirParticipante(banco, m.dmId, usuarioId));

  socket.on(
    'mensagem:enviar',
    comAck(registrarErro, (dados: unknown) => {
      const { destino, participantes } = lerDestino(banco, dados, usuarioId, comunidadeId);
      const anexos = lerAnexos(dados);
      // Canais seguem o cargo (as conversas diretas, não).
      if ('canalId' in destino) {
        if (!temPermissao(banco, usuarioId, 'enviar_mensagens', comunidadeId)) throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite enviar mensagens nos canais.');
        if (anexos.length > 0 && !temPermissao(banco, usuarioId, 'enviar_anexos', comunidadeId)) throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite enviar arquivos nos canais.');
      }
      // Só com anexos, o texto pode ficar vazio.
      const bruto = ehObjeto(dados) && typeof dados.texto === 'string' ? dados.texto : '';
      const texto = anexos.length > 0 && !bruto.trim() ? '' : lerTexto(dados);
      const mensagem = banco.transaction(() => {
        const id = inserirMensagem(banco, destino, usuarioId, texto, Date.now(), resolverMencoes(texto, destino, participantes));
        vincularAnexos(banco, anexos, usuarioId, id);
        return buscarMensagem(banco, id)!;
      })();
      // Enviou: o próximo "digitando" (a pessoa já começa a próxima mensagem) não pode ser descartado.
      ultimoDigitando = 0;
      emitir(participantes, 'mensagem:nova', mensagem);
      if (participantes && mensagem.dmId !== null) avisarDm(participantes, mensagem.dmId);
      return mensagem;
    }),
  );

  socket.on(
    'mensagem:editar',
    comAck(registrarErro, (dados: unknown) => {
      const id = lerId(dados);
      const texto = lerTexto(dados);
      let participantes: [number, number] | null = null;
      const editada = banco.transaction(() => {
        const atual = buscarMensagem(banco, id);
        if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Mensagem não encontrada.');
        doServidor(atual);
        participantes = participantesDa(atual);
        if (atual.autorId !== usuarioId) throw new ErroHttp(403, 'sem_permissao', 'Só quem escreveu pode editar a mensagem.');
        if (atual.texto === texto) return atual;
        const destinoAtual: Destino = atual.canalId !== null ? { canalId: atual.canalId } : { dmId: atual.dmId! };
        const nova = editarMensagem(banco, id, texto, Date.now(), resolverMencoes(texto, destinoAtual, participantes));
        // RN-20d: registra que editou (só em canal, RN-21), nunca o texto.
        if (nova.canalId !== null) {
          const canal = buscarCanal(banco, nova.canalId);
          registrarAuditoria(banco, { tipo: 'mensagem_editada', atorId: usuarioId, canal: canal ?? null, detalhes: { mensagem: id } });
        }
        return nova;
      })();
      emitir(participantes, 'mensagem:editada', editada);
      return editada;
    }),
  );

  socket.on(
    'mensagem:apagar',
    comAck(registrarErro, (dados: unknown) => {
      const id = lerId(dados);
      let arquivos: string[] = [];
      let participantes: [number, number] | null = null;
      const apagada = banco.transaction(() => {
        const atual = buscarMensagem(banco, id);
        if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Mensagem não encontrada.');
        doServidor(atual);
        // Em DM, quem não participa nem fica sabendo que a mensagem existe.
        participantes = participantesDa(atual);
        const ehAutor = atual.autorId === usuarioId;
        // RN-9 / RN-18: administrador apaga mensagem alheia só em canal; nas DMs, nunca.
        // Backlog v2, item 10c: administrador ou quem tem "Apagar mensagens".
        const ehAdminEmCanal = atual.canalId !== null && temPermissao(banco, usuarioId, 'apagar_mensagens', comunidadeId);
        if (!ehAutor && !ehAdminEmCanal) throw new ErroHttp(403, 'sem_permissao', 'Você só pode apagar as suas mensagens.');
        arquivos = arquivosDaMensagem(banco, id);
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
        return atual;
      })();
      for (const a of arquivos) armazem.apagar(a);
      emitir(participantes, 'mensagem:apagada', { id, canalId: apagada.canalId, dmId: apagada.dmId });
      return undefined;
    }),
  );

  // Sem resposta: leitura é descartável (a próxima marca de novo). Vale para os outros computadores da pessoa.
  socket.on('lido:marcar', (dados: unknown) => {
    try {
      const ultima = ehObjeto(dados) ? dados.ultimaMensagemId : undefined;
      if (!ehId(ultima)) return;
      const d = ehObjeto(dados) && ehObjeto(dados.destino) ? dados.destino : undefined;
      // Ler uma DM com conta removida continua valendo (lerDestino recusaria por ser só leitura).
      let destino: Destino;
      if (d && ehId(d.dmId)) {
        exigirParticipante(banco, d.dmId, usuarioId);
        destino = { dmId: d.dmId };
      } else destino = lerDestino(banco, dados, usuarioId, comunidadeId).destino;
      const ultimaMensagemId = marcarLido(banco, usuarioId, destino, ultima);
      if (ultimaMensagemId !== undefined) io.to(salaUsuario(usuarioId)).emit('lido:atualizado', { chave: chaveDoDestino(destino), ultimaMensagemId });
    } catch {
      /* ignora */
    }
  });

  socket.on(
    'dm:abrir',
    comAck(registrarErro, (dados: unknown) => {
      const outro = ehObjeto(dados) ? dados.usuarioId : undefined;
      if (!ehId(outro)) throw new ErroHttp(400, 'dados_invalidos', 'Pessoa inválida.');
      // Conversa direta com quem também está neste servidor.
      if (outro !== usuarioId && !membroDe(banco, comunidadeId, outro) && !saoAmigos(banco, usuarioId, outro)) throw new ErroHttp(404, 'nao_encontrado', 'Pessoa não encontrada.');
      const id = abrirDm(banco, usuarioId, outro);
      // Só quem abriu: a outra pessoa fica sabendo na primeira mensagem (mensagem:enviar avisa os dois).
      io.to(salaUsuario(usuarioId)).emit('dm:atualizada', dmPara(banco, id, usuarioId));
      return dmPara(banco, id, usuarioId);
    }),
  );

  // Sem resposta: sinal descartável. Inválido é só ignorado; mais de um por segundo do mesmo socket também
  // (barra enxurrada; enviar mensagem zera o limite, para o sinal da próxima não se perder).
  socket.on('digitando', (dados: unknown) => {
    const agora = Date.now();
    if (agora - ultimoDigitando < 1000) return;
    try {
      const { destino, participantes } = lerDestino(banco, dados, usuarioId, comunidadeId);
      ultimoDigitando = agora;
      const payload = 'canalId' in destino ? { canalId: destino.canalId, dmId: null, usuarioId } : { canalId: null, dmId: destino.dmId, usuarioId };
      if (participantes) {
        for (const s of conexoesDaConversa(participantes)) if (s.data.usuarioId !== usuarioId) s.emit('digitando', payload);
      } else socket.to(salaComunidade(comunidadeId)).emit('digitando', payload);
    } catch {
      /* ignora */
    }
  });
}
