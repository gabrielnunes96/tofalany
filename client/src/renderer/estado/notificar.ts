import type { CanalDto, MensagemDto, UsuarioDto, StatusPessoa, StatusVisivel } from '@tofalando/shared';
import { chaveDe, type Chave } from './chaves';

export interface DecisaoMensagemNova {
  chave: Chave;
  /** 'lido': a conversa está na tela com a janela em foco; 'contar': vira não lida. */
  acao: 'lido' | 'contar';
  /** Ausente quando as notificações estão desligadas ou a conversa está silenciada (RF-39, RF-40). */
  notificacao?: { titulo: string; corpo: string; chave: Chave; conversaAberta: boolean };
}

/**
 * RF-12: o que fazer com uma mensagem nova de outra pessoa. Mensagens da própria pessoa: nada (undefined).
 * A notificação vai sempre para o processo principal, que mostra só se a conversa estiver fechada ou a janela sem foco.
 */
export function decidirMensagemNova(
  m: MensagemDto,
  contexto: {
    euId: number;
    chaveAberta: Chave | null;
    focado: boolean;
    usuarios: UsuarioDto[];
    canais: CanalDto[];
    /** RF-39: notificações de mensagem ligadas (padrão: sim). */
    notificar?: boolean;
    /** RF-40: conversas silenciadas. */
    silenciadas?: string[];
    /** Backlog v2, item 2: "não incomodar" escolhido: sem notificação (o contador continua). */
    naoIncomodar?: boolean;
  },
): DecisaoMensagemNova | undefined {
  const chave = chaveDe(m);
  if (!chave || m.autorId === contexto.euId) return undefined;
  const aberta = contexto.chaveAberta === chave;
  const autor = contexto.usuarios.find((u) => u.id === m.autorId)?.nomeExibicao ?? 'Alguém';
  const canal = m.canalId !== null ? contexto.canais.find((c) => c.id === m.canalId) : undefined;
  // Menção a mim (ou @todos num canal): avisa mesmo com a conversa silenciada ou as notificações de mensagem desligadas.
  const mencionado = m.mencoes?.includes(contexto.euId) || (!!m.mencionaTodos && m.canalId !== null);
  const titulo = mencionado ? `@ ${autor} mencionou você${canal ? ` em #${canal.nome}` : ''}` : canal ? `#${canal.nome} — ${autor}` : autor;
  const anexos = m.anexos.length === 0 ? '' : `📎 ${m.anexos.length === 1 ? m.anexos[0]!.nome : `${m.anexos.length} anexos`}`;
  const notificar = !contexto.naoIncomodar && (mencionado || (contexto.notificar !== false && !contexto.silenciadas?.includes(chave)));
  return {
    chave,
    acao: aberta && contexto.focado ? 'lido' : 'contar',
    // RN-27: desligar só tira a notificação; o contador continua.
    ...(notificar ? { notificacao: { titulo, corpo: m.texto || anexos, chave, conversaAberta: aberta } } : {}),
  };
}

/**
 * RF-41: alguém entrou ou saiu do servidor? Só a passagem de offline para online/ausente (entrou) e o
 * contrário (saiu) contam; ausente↔online não. Eu mesmo não; logo depois de (re)conectar também não
 * (o retrato inicial e as reconexões dos outros após um reinício do servidor não são novidade).
 */
export function decidirAvisoPresenca(
  antes: StatusVisivel | undefined,
  status: StatusPessoa,
  contexto: { id: number; euId: number | undefined; calado: boolean; som: boolean; aviso: boolean; surdo: boolean },
): { tipo: 'entrou' | 'saiu'; som: boolean; aviso: boolean } | undefined {
  if (contexto.id === contexto.euId || contexto.calado) return undefined;
  const tipo = !antes && status !== 'offline' ? 'entrou' : antes && status === 'offline' ? 'saiu' : undefined;
  if (!tipo || (!contexto.som && !contexto.aviso)) return undefined;
  return { tipo, som: contexto.som && !contexto.surdo, aviso: contexto.aviso };
}
