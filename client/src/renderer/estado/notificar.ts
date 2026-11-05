import type { CanalDto, MensagemDto, UsuarioDto } from '@tofalando/shared';
import { chaveDe, type Chave } from './chaves';

export interface DecisaoMensagemNova {
  chave: Chave;
  /** 'lido': a conversa está na tela com a janela em foco; 'contar': vira não lida. */
  acao: 'lido' | 'contar';
  notificacao: { titulo: string; corpo: string; chave: Chave; conversaAberta: boolean };
}

/**
 * RF-12: o que fazer com uma mensagem nova de outra pessoa. Mensagens da própria pessoa: nada (undefined).
 * A notificação vai sempre para o processo principal, que mostra só se a conversa estiver fechada ou a janela sem foco.
 */
export function decidirMensagemNova(
  m: MensagemDto,
  contexto: { euId: number; chaveAberta: Chave | null; focado: boolean; usuarios: UsuarioDto[]; canais: CanalDto[] },
): DecisaoMensagemNova | undefined {
  const chave = chaveDe(m);
  if (!chave || m.autorId === contexto.euId) return undefined;
  const aberta = contexto.chaveAberta === chave;
  const autor = contexto.usuarios.find((u) => u.id === m.autorId)?.nomeExibicao ?? 'Alguém';
  const canal = m.canalId !== null ? contexto.canais.find((c) => c.id === m.canalId) : undefined;
  const titulo = canal ? `#${canal.nome} — ${autor}` : autor;
  const anexos = m.anexos.length === 0 ? '' : `📎 ${m.anexos.length === 1 ? m.anexos[0]!.nome : `${m.anexos.length} anexos`}`;
  return {
    chave,
    acao: aberta && contexto.focado ? 'lido' : 'contar',
    notificacao: { titulo, corpo: m.texto || anexos, chave, conversaAberta: aberta },
  };
}
