import { temPermissao } from '../dominio/funcoes.js';
import {
  ANEXOS_POR_MENSAGEM,
  FIXAR_RAJADA,
  REACOES_RAJADA,
  extrairMencoes,
  textoSemGif,
  validarEmojiReacao,
  validarGif,
  validarTextoMensagem,
  type Destino,
  type GifDto,
  type EventosServidor,
  type MensagemDto,
} from '@tofalando/shared';
import type { Banco } from '../db/banco.js';
import { ErroHttp } from '../erros.js';
import { buscarCanal, comunidadeDoCanal } from '../dominio/canais.js';
import { membroDe } from '../dominio/comunidades.js';
import { saoAmigos } from '../dominio/amizades.js';
import { salaComunidade } from './salas.js';
import { apagarMensagem, buscarMensagem, editarMensagem, inserirMensagem, localDaMensagem, type Mencoes } from '../dominio/mensagens.js';
import { buscarPorId } from '../dominio/usuarios.js';
import { registrarAuditoria } from '../dominio/auditoria.js';
import { arquivosDaMensagem, vincularAnexos } from '../dominio/anexos.js';
import { abrirDm, dmPara, exigirParticipante } from '../dominio/dms.js';
import { alternarReacao } from '../dominio/reacoes.js';
import { desafixar, fixar } from '../dominio/fixadas.js';
import { criarLimitador, type Limitador } from '../auth/limitador.js';
import { chaveDoDestino, marcarLido } from '../dominio/leituras.js';
import type { Armazem } from '../arquivos/armazem.js';
import { comAck } from './acoes.js';
import { salaUsuario, type ServidorTempoReal, type SocketTofalando } from './tempo-real.js';
import type { Config } from '../config.js';

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

/**
 * Conexões de um participante da DM em que ela aparece: as dos servidores de que o outro também participa
 * (a conversa fica na aba Diretas de cada servidor em comum).
 */
export function conexoesDaConversaDm(io: ServidorTempoReal, banco: Banco, participantes: [number, number]): SocketTofalando[] {
  return [...io.of('/').sockets.values()].filter((s) => {
    const i = participantes.indexOf(s.data.usuarioId);
    if (i < 0) return false;
    const outro = participantes[1 - i]!;
    return outro === s.data.usuarioId || !!membroDe(banco, s.data.comunidadeId, outro) || saoAmigos(banco, s.data.usuarioId, outro);
  });
}

/** Cada participante recebe a DM vista do seu lado (o "outro" de cada um). */
export function avisarDmParticipantes(io: ServidorTempoReal, banco: Banco, participantes: [number, number], dmId: number): void {
  for (const s of conexoesDaConversaDm(io, banco, participantes)) s.emit('dm:atualizada', dmPara(banco, dmId, s.data.usuarioId));
}

/** Mensagem de DM criada fora de um socket (ex.: convite pela rota): chega como `mensagem:nova` e a DM se atualiza. */
export function entregarMensagemDm(io: ServidorTempoReal, banco: Banco, participantes: [number, number], mensagem: MensagemDto): void {
  for (const s of conexoesDaConversaDm(io, banco, participantes)) s.emit('mensagem:nova', mensagem);
  if (mensagem.dmId !== null) avisarDmParticipantes(io, banco, participantes, mensagem.dmId);
}

/** Um limitador de fixar por servidor de tempo real (vale para todas as conexões de cada pessoa). */
const limitadoresFixar = new WeakMap<ServidorTempoReal, Limitador>();
function limitadorFixar(io: ServidorTempoReal): Limitador {
  let l = limitadoresFixar.get(io);
  if (!l) {
    l = criarLimitador(FIXAR_RAJADA.eventos, FIXAR_RAJADA.janelaMs);
    limitadoresFixar.set(io, l);
  }
  return l;
}

/** RF-8 a RF-12a: enviar (com anexos), editar, apagar e "digitando" em canais e DMs; abrir DM. */
export function registrarEventosMensagens(
  io: ServidorTempoReal,
  socket: SocketTofalando,
  banco: Banco,
  armazem: Armazem,
  registrarErro: (e: unknown) => void,
  gifConfig?: Config['gif'],
) {
  const usuarioId = socket.data.usuarioId;
  const comunidadeId = socket.data.comunidadeId;
  /** Último sinal de "digitando" aceito deste socket (ver o tratador no fim). */
  let ultimoDigitando = 0;
  /** Momentos dos últimos pedidos de reação deste socket (limite de rajada). */
  let reacoesRecentes: number[] = [];
  /** A11: fixar/desafixar por pessoa (todas as conexões dela no processo), sem encher o chat de linhas "fixou". */
  const limiteFixar = limitadorFixar(io);

  const conexoesDaConversa = (participantes: [number, number]) => conexoesDaConversaDm(io, banco, participantes);

  /** Canal: quem está no servidor dele. DM: só os participantes (RN-18). */
  function emitir<E extends keyof EventosServidor>(participantes: [number, number] | null, evento: E, ...args: Parameters<EventosServidor[E]>) {
    const alvos = participantes ? conexoesDaConversa(participantes) : [io.to(salaComunidade(comunidadeId))];
    for (const alvo of alvos) (alvo.emit as (e: E, ...a: Parameters<EventosServidor[E]>) => void)(evento, ...args);
  }

  const avisarDm = (participantes: [number, number], dmId: number) => avisarDmParticipantes(io, banco, participantes, dmId);

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

  /** Quem a menção de resposta alcança: no canal, quem está no servidor; na DM, o outro participante. */
  const alcanca = (alvo: number, participantes: [number, number] | null) =>
    !!buscarPorId(banco, alvo) && (participantes ? participantes.includes(alvo) : !!membroDe(banco, comunidadeId, alvo));

  /**
   * RN-8/RN-11: a original tem de ser do mesmo canal ou DM. Com aviso (padrão), o autor dela entra nas menções,
   * a não ser que seja a própria pessoa ou que já não alcance a conversa.
   */
  function lerResposta(dados: unknown, destino: Destino, participantes: [number, number] | null): { a: number; avisa: number } | null {
    const respostaA = ehObjeto(dados) ? dados.respostaA : undefined;
    if (respostaA === undefined || respostaA === null) return null;
    if (!ehId(respostaA)) throw new ErroHttp(400, 'dados_invalidos', 'Mensagem respondida inválida.');
    const original = localDaMensagem(banco, respostaA);
    const mesmoLugar = original && ('canalId' in destino ? original.canalId === destino.canalId : original.dmId === destino.dmId);
    if (!original || !mesmoLugar) throw new ErroHttp(404, 'nao_encontrado', 'Mensagem respondida não encontrada.');
    if (original.sistema) throw new ErroHttp(400, 'dados_invalidos', 'Essa linha não pode ser respondida.');
    const bruto = ehObjeto(dados) ? dados.avisar : undefined;
    if (bruto !== undefined && typeof bruto !== 'boolean') throw new ErroHttp(400, 'dados_invalidos', 'Aviso inválido.');
    const avisar = bruto !== false;
    const avisa = avisar && original.autorId !== usuarioId && alcanca(original.autorId, participantes) ? original.autorId : 0;
    return { a: respostaA, avisa };
  }

  /** Busca de GIF (RN-3): só com a busca ligada e endereço de mídia da Klipy. */
  function lerGifEnviado(dados: unknown): GifDto | null {
    const bruto = ehObjeto(dados) ? dados.gif : undefined;
    if (bruto === undefined || bruto === null) return null;
    if (!gifConfig) throw new ErroHttp(400, 'gif_indisponivel', 'A busca de GIF está desligada neste servidor.');
    const gif = validarGif(bruto, gifConfig.hostsMidia, gifConfig.aceitarHttp);
    if (!gif) throw new ErroHttp(400, 'dados_invalidos', 'GIF inválido.');
    return gif;
  }

  const comAviso = (m: Mencoes, avisa: number): Mencoes => (avisa && !m.usuarios.includes(avisa) ? { ...m, usuarios: [...m.usuarios, avisa] } : m);

  socket.on(
    'mensagem:enviar',
    comAck(registrarErro, (dados: unknown) => {
      const { destino, participantes } = lerDestino(banco, dados, usuarioId, comunidadeId);
      const anexos = lerAnexos(dados);
      const gif = lerGifEnviado(dados);
      // Canais seguem o cargo (as conversas diretas, não). GIF segue a regra dos anexos (RN-4).
      if ('canalId' in destino) {
        if (!temPermissao(banco, usuarioId, 'enviar_mensagens', comunidadeId))
          throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite enviar mensagens nos canais.');
        if ((anexos.length > 0 || gif) && !temPermissao(banco, usuarioId, 'enviar_anexos', comunidadeId))
          throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite enviar arquivos nos canais.');
      }
      // Só com anexos ou GIF, o texto pode ficar vazio.
      const bruto = ehObjeto(dados) && typeof dados.texto === 'string' ? dados.texto : '';
      const texto = (anexos.length > 0 || gif) && !bruto.trim() ? '' : lerTexto(dados);
      const mensagem = banco.transaction(() => {
        const resposta = lerResposta(dados, destino, participantes);
        const mencoes = comAviso(resolverMencoes(texto, destino, participantes), resposta?.avisa ?? 0);
        const id = inserirMensagem(banco, destino, usuarioId, texto, Date.now(), mencoes, resposta, gif);
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
      const bruto = ehObjeto(dados) && typeof dados.texto === 'string' ? dados.texto : '';
      let participantes: [number, number] | null = null;
      const editada = banco.transaction(() => {
        const atual = buscarMensagem(banco, id);
        if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Mensagem não encontrada.');
        doServidor(atual);
        participantes = participantesDa(atual);
        if (atual.fixou) throw new ErroHttp(400, 'dados_invalidos', 'Essa linha não pode ser editada.');
        if (atual.autorId !== usuarioId) throw new ErroHttp(403, 'sem_permissao', 'Só quem escreveu pode editar a mensagem.');
        // Com GIF: o app antigo edita o texto com o endereço no fim (tirado aqui); o texto pode ficar vazio.
        const semGif = atual.gif ? textoSemGif(bruto.trim(), atual.gif) : bruto;
        const texto = atual.gif && !semGif.trim() ? '' : lerTexto({ texto: semGif });
        if (textoSemGif(atual.texto, atual.gif) === texto) return atual;
        const destinoAtual: Destino = atual.canalId !== null ? { canalId: atual.canalId } : { dmId: atual.dmId! };
        // A resposta continua avisando quem avisava (as menções são refeitas pelo texto novo).
        const gravado = localDaMensagem(banco, id)?.respostaAvisa ?? 0;
        const avisa = gravado && alcanca(gravado, participantes) ? gravado : 0;
        const nova = editarMensagem(banco, id, texto, Date.now(), comAviso(resolverMencoes(texto, destinoAtual, participantes), avisa));
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

  socket.on(
    'reacao:alternar',
    comAck(registrarErro, (dados: unknown) => {
      const agora = Date.now();
      reacoesRecentes = reacoesRecentes.filter((t) => agora - t < REACOES_RAJADA.janelaMs);
      if (reacoesRecentes.length >= REACOES_RAJADA.eventos) throw new ErroHttp(429, 'muitas_tentativas', 'Calma, muitas reações seguidas.');
      reacoesRecentes.push(agora);
      const mensagemId = ehObjeto(dados) ? dados.mensagemId : undefined;
      if (!ehId(mensagemId)) throw new ErroHttp(400, 'dados_invalidos', 'Mensagem inválida.');
      const emoji = ehObjeto(dados) ? dados.emoji : undefined;
      if (!validarEmojiReacao(emoji)) throw new ErroHttp(400, 'dados_invalidos', 'Emoji inválido.');
      let participantes: [number, number] | null = null;
      let alvo: { canalId: number | null; dmId: number | null } = { canalId: null, dmId: null };
      const reacoes = banco.transaction(() => {
        const atual = buscarMensagem(banco, mensagemId);
        if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Mensagem não encontrada.');
        doServidor(atual);
        if (atual.fixou) throw new ErroHttp(400, 'dados_invalidos', 'Essa linha não recebe reações.');
        // RN-1: reage quem pode escrever ali (canal: o cargo, sem castigo; DM: os dois, se o outro não foi removido).
        const destino: Destino = atual.canalId !== null ? { canalId: atual.canalId } : { dmId: atual.dmId! };
        participantes = lerDestino(banco, { destino }, usuarioId, comunidadeId).participantes;
        if ('canalId' in destino && !temPermissao(banco, usuarioId, 'enviar_mensagens', comunidadeId))
          throw new ErroHttp(403, 'sem_permissao', 'Você não pode reagir aqui.');
        alvo = { canalId: atual.canalId, dmId: atual.dmId };
        return alternarReacao(banco, mensagemId, usuarioId, emoji, agora);
      })();
      // RN-7: reação não é mensagem nova (não notifica nem conta como não lida).
      emitir(participantes, 'mensagem:reacoes', { id: mensagemId, ...alvo, reacoes });
      return reacoes;
    }),
  );

  /**
   * chat-fixar-e-buscar: fixar e desafixar. A conversa vem da própria mensagem (nunca do pedido): canal do servidor
   * desta conexão com "Fixar mensagens" (sem castigo); DM, os dois participantes, se o outro não foi removido.
   */
  function alternarFixada(dados: unknown, fixada: boolean) {
    const agora = Date.now();
    if (!limiteFixar.permitir(String(usuarioId))) throw new ErroHttp(429, 'muitas_tentativas', 'Calma, muitas mensagens fixadas seguidas.');
    const id = lerId(dados);
    let participantes: [number, number] | null = null;
    let alvo: { canalId: number | null; dmId: number | null } = { canalId: null, dmId: null };
    const resultado = banco
      .transaction(() => {
        const atual = buscarMensagem(banco, id);
        if (!atual) throw new ErroHttp(404, 'nao_encontrado', 'Mensagem não encontrada.');
        doServidor(atual);
        if (atual.fixou) throw new ErroHttp(400, 'dados_invalidos', 'Essa linha não pode ser fixada.');
        const destino: Destino = atual.canalId !== null ? { canalId: atual.canalId } : { dmId: atual.dmId! };
        participantes = lerDestino(banco, { destino }, usuarioId, comunidadeId).participantes;
        if ('canalId' in destino && !temPermissao(banco, usuarioId, 'fixar_mensagens', comunidadeId)) {
          throw new ErroHttp(403, 'sem_permissao', 'Seu cargo não permite fixar mensagens.');
        }
        alvo = { canalId: atual.canalId, dmId: atual.dmId };
        const r = fixada ? fixar(banco, id, destino, usuarioId, agora) : { mudou: desafixar(banco, id), linhaId: null };
        // Auditoria só de canal (RN-21), com o id e sem o texto.
        if (r.mudou && atual.canalId !== null) {
          registrarAuditoria(banco, {
            tipo: fixada ? 'mensagem_fixada' : 'mensagem_desafixada',
            atorId: usuarioId,
            alvoUsuarioId: atual.autorId,
            canal: buscarCanal(banco, atual.canalId) ?? null,
            detalhes: { mensagem: id },
          });
        }
        return { mudou: r.mudou, linha: r.linhaId ? buscarMensagem(banco, r.linhaId)! : null };
      })
      .immediate();
    if (!resultado.mudou) return undefined;
    emitir(participantes, 'fixadas:mudou', { ...alvo, mensagemId: id, fixada, por: usuarioId });
    if (resultado.linha) {
      emitir(participantes, 'mensagem:nova', resultado.linha);
      if (participantes && resultado.linha.dmId !== null) avisarDm(participantes, resultado.linha.dmId);
    }
    return undefined;
  }

  socket.on(
    'mensagem:fixar',
    comAck(registrarErro, (dados: unknown) => alternarFixada(dados, true)),
  );
  socket.on(
    'mensagem:desafixar',
    comAck(registrarErro, (dados: unknown) => alternarFixada(dados, false)),
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
      if (outro !== usuarioId && !membroDe(banco, comunidadeId, outro) && !saoAmigos(banco, usuarioId, outro))
        throw new ErroHttp(404, 'nao_encontrado', 'Pessoa não encontrada.');
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
