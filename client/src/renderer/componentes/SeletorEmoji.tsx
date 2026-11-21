import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { buscarEmojis, carregarEmojis, lerRecentes, type Emoji, type GrupoEmojis } from '../servicos/emojis';
import { ATALHOS_REACAO } from './Reacoes';

interface Props {
  aoEscolher: (emoji: string) => void;
  /** `devolverFoco`: Esc devolve o foco a quem abriu; o clique fora deixa o foco onde a pessoa clicou. */
  aoFechar: (devolverFoco: boolean) => void;
  /** Botão que abriu o painel: clicar nele alterna pelo próprio botão, não pelo "clique fora". */
  ancora?: HTMLElement | null;
}

/** Colunas da grade (as setas para cima e para baixo pulam uma linha). */
const COLUNAS = 8;

/**
 * Setas dentro das grades, mantendo a coluna ao passar de uma seção para a vizinha. Devolve o botão de destino,
 * `'campo'` para voltar à busca, ou null para ficar onde está.
 */
function destinoDaSeta(grades: HTMLButtonElement[][], g: number, i: number, tecla: string): HTMLButtonElement | 'campo' | null {
  const grade = grades[g]!;
  const coluna = i % COLUNAS;
  if (tecla === 'ArrowRight') return grade[i + 1] ?? grades[g + 1]?.[0] ?? null;
  if (tecla === 'ArrowLeft') return i > 0 ? grade[i - 1]! : (grades[g - 1]?.at(-1) ?? 'campo');
  if (tecla === 'ArrowDown') {
    if (i + COLUNAS < grade.length) return grade[i + COLUNAS]!;
    // Última linha (ou a de baixo está incompleta): mesma coluna na linha de baixo, ou na primeira linha da próxima grade.
    if (Math.floor(i / COLUNAS) < Math.floor((grade.length - 1) / COLUNAS)) return grade.at(-1)!;
    const proxima = grades[g + 1];
    return proxima ? proxima[Math.min(coluna, proxima.length - 1)]! : null;
  }
  if (tecla === 'ArrowUp') {
    if (i - COLUNAS >= 0) return grade[i - COLUNAS]!;
    const anterior = grades[g - 1];
    if (!anterior) return 'campo';
    const inicioUltimaLinha = Math.floor((anterior.length - 1) / COLUNAS) * COLUNAS;
    return anterior[Math.min(inicioUltimaLinha + coluna, anterior.length - 1)]!;
  }
  return null;
}

/**
 * Painel para escolher a reação (RF-2): busca por nome em português, usados recentemente e categorias.
 * Tab entra na grade por um emoji só (e sai dela no seguinte); setas andam entre os emojis, Enter escolhe,
 * Esc ou clique fora fecha.
 */
export function SeletorEmoji({ aoEscolher, aoFechar, ancora }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  // As funções do pai mudam a cada render: os ouvintes leem a versão atual daqui, sem remontar a grade.
  const escolher = useRef(aoEscolher);
  const fechar = useRef(aoFechar);
  useEffect(() => {
    escolher.current = aoEscolher;
    fechar.current = aoFechar;
  });
  const [grupos, setGrupos] = useState<GrupoEmojis[] | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [termo, setTermo] = useState('');
  const recentes = useMemo(() => lerRecentes(), []);

  useEffect(() => {
    let vivo = true;
    carregarEmojis().then(
      (g) => vivo && setGrupos(g),
      () => vivo && setFalhou(true),
    );
    campo.current?.focus();
    ref.current?.scrollIntoView?.({ block: 'nearest' });
    return () => {
      vivo = false;
    };
  }, []);

  // Clique fora fecha, sem roubar o foco de onde a pessoa clicou.
  useEffect(() => {
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (ref.current && !ref.current.contains(alvo) && !ancora?.contains(alvo)) fechar.current(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [ancora]);

  const nomes = useMemo(() => new Map(grupos?.flatMap((g) => g.emojis.map((e) => [e.emoji, e.nome] as const)) ?? []), [grupos]);
  const achados = useMemo(() => (grupos && termo.trim() ? buscarEmojis(grupos, termo) : null), [grupos, termo]);

  /** Só o primeiro emoji do painel entra no Tab; o resto, pelas setas. */
  const botao = (x: Emoji | string, primeiro: boolean) => {
    const emoji = typeof x === 'string' ? x : x.emoji;
    const nome = typeof x === 'string' ? (nomes.get(x) ?? x) : x.nome;
    return (
      <button key={emoji} type="button" className="emoji" aria-label={nome} title={nome} tabIndex={primeiro ? 0 : -1} onClick={() => escolher.current(emoji)}>
        {emoji}
      </button>
    );
  };

  const sugeridos = recentes.length ? recentes : [...ATALHOS_REACAO];
  // A grade das categorias é grande (cerca de 1900 botões): só muda quando os dados chegam.
  const categorias = useMemo(
    () =>
      grupos?.map((g) => (
        <section key={g.id} aria-labelledby={`emojis-grupo-${g.id}`}>
          <h4 id={`emojis-grupo-${g.id}`}>{g.nome}</h4>
          <div className="grade-emojis">{g.emojis.map((e) => botao(e, false))}</div>
        </section>
      )),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- botao só depende de nomes (derivado de grupos)
    [grupos],
  );

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      fechar.current(true);
      return;
    }
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const grades = [...(ref.current?.querySelectorAll('.grade-emojis') ?? [])]
      .map((d) => [...d.querySelectorAll<HTMLButtonElement>('.emoji')])
      .filter((l) => l.length);
    if (grades.length === 0) return;
    const ativo = document.activeElement as HTMLButtonElement;
    const g = grades.findIndex((l) => l.includes(ativo));
    if (g < 0) {
      // Do campo de busca, a seta para baixo entra na grade.
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        grades[0]![0]!.focus();
      }
      return;
    }
    e.preventDefault();
    const destino = destinoDaSeta(grades, g, grades[g]!.indexOf(ativo), e.key);
    if (destino === 'campo') campo.current?.focus();
    else destino?.focus();
  }

  return (
    <div ref={ref} className="seletor-emoji" role="dialog" aria-label="Escolher reação" onKeyDown={teclas}>
      <input
        ref={campo}
        type="search"
        className="seletor-emoji-busca"
        placeholder="Buscar emoji"
        aria-label="Buscar emoji (setas para escolher)"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && achados?.[0]) {
            e.preventDefault();
            escolher.current(achados[0].emoji);
          }
        }}
      />
      <p className="visualmente-oculto" role="status">
        {achados ? (achados.length ? `${achados.length} ${achados.length === 1 ? 'emoji' : 'emojis'}` : '') : ''}
      </p>
      <div className="seletor-emoji-lista">
        {achados ? (
          achados.length ? (
            <section aria-label="Resultados">
              <div className="grade-emojis">{achados.map((e, i) => botao(e, i === 0))}</div>
            </section>
          ) : (
            <p className="suave seletor-emoji-vazio">Nenhum emoji com &quot;{termo.trim()}&quot;.</p>
          )
        ) : (
          <>
            <section aria-labelledby="emojis-sugeridos">
              <h4 id="emojis-sugeridos">{recentes.length ? 'Usados recentemente' : 'Sugestões'}</h4>
              <div className="grade-emojis">{sugeridos.map((e, i) => botao(e, i === 0))}</div>
            </section>
            {falhou && (
              <p className="erro" role="alert">
                Não foi possível carregar os emojis.
              </p>
            )}
            {!grupos && !falhou && <p className="suave seletor-emoji-vazio">Carregando emojis…</p>}
            {categorias}
          </>
        )}
      </div>
    </div>
  );
}
