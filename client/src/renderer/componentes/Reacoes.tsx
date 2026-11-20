import { useId } from 'react';
import type { ReacaoDto, UsuarioDto } from '@tofalando/shared';

/** Emojis de um clique, nas ações da mensagem. */
export const ATALHOS_REACAO = ['👍', '😂', '❤️'] as const;

/** Quem reagiu: até 10 nomes e "e mais N" (RF-4). */
export function quemReagiu(ids: number[], usuarios: Map<number, UsuarioDto> | undefined, euId?: number): string {
  const nomes = ids.slice(0, 10).map((id) => (id === euId ? 'você' : (usuarios?.get(id)?.nomeExibicao ?? 'conta removida')));
  const resto = ids.length - nomes.length;
  if (resto > 0) return `${nomes.join(', ')} e mais ${resto}`;
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : (nomes[0] ?? '');
}

/** Texto para o leitor de tela: "👍, 2 reações, inclusive você". */
export function rotuloReacao(r: ReacaoDto, minha: boolean): string {
  const n = r.usuarios.length;
  return `${r.emoji}, ${n} ${n === 1 ? 'reação' : 'reações'}${minha ? ', inclusive você' : ''}`;
}

interface Props {
  reacoes: ReacaoDto[];
  usuarios?: Map<number, UsuarioDto>;
  euId?: number;
  /** Sem permissão de escrever ali: as reações aparecem, mas não dá para mexer. */
  podeReagir: boolean;
  aoAlternar: (emoji: string) => void;
  /** Recebe o botão "+", que ganha o foco de volta quando o painel fecha (clicar de novo fecha). */
  aoAbrirSeletor: (botao: HTMLElement) => void;
  seletorAberto?: boolean;
}

/**
 * Um emoji com a contagem. Sem permissão continua focável (aria-disabled), para quem usa o teclado também ver quem
 * reagiu; a dica fica ligada ao botão (aria-describedby) para o leitor de tela.
 */
function BotaoReacao({ reacao: r, usuarios, euId, podeReagir, aoAlternar }: Omit<Props, 'reacoes' | 'aoAbrirSeletor' | 'seletorAberto'> & { reacao: ReacaoDto }) {
  const dica = useId();
  const minha = euId !== undefined && r.usuarios.includes(euId);
  return (
    <button
      type="button"
      className={`reacao${minha ? ' minha' : ''}`}
      aria-pressed={minha}
      aria-label={rotuloReacao(r, minha)}
      aria-describedby={dica}
      aria-disabled={!podeReagir || undefined}
      onClick={() => podeReagir && aoAlternar(r.emoji)}
    >
      <span className="reacao-emoji" aria-hidden="true">
        {r.emoji}
      </span>
      <span className="reacao-n" aria-hidden="true">
        {r.usuarios.length}
      </span>
      <span className="reacao-dica" id={dica} role="tooltip">
        {quemReagiu(r.usuarios, usuarios, euId)}
      </span>
    </button>
  );
}

/** Faixa debaixo da mensagem: um botão por emoji com a contagem, e o "+" para escolher outro (RF-3, RF-4). */
export function Reacoes({ reacoes, usuarios, euId, podeReagir, aoAlternar, aoAbrirSeletor, seletorAberto = false }: Props) {
  if (reacoes.length === 0) return null;
  return (
    <div className="reacoes" role="group" aria-label="Reações">
      {reacoes.map((r) => (
        <BotaoReacao key={r.emoji} reacao={r} usuarios={usuarios} euId={euId} podeReagir={podeReagir} aoAlternar={aoAlternar} />
      ))}
      {podeReagir && (
        <button type="button" className="reacao reacao-mais" aria-label="Adicionar reação" aria-expanded={seletorAberto} onClick={(e) => aoAbrirSeletor(e.currentTarget)}>
          +
        </button>
      )}
    </div>
  );
}
