import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { GifDto } from '@tofalando/shared';
import type { GifResultado, Klipy, PaginaGifs } from '../servicos/gif';

interface Props {
  klipy: Pick<Klipy, 'emAlta' | 'buscar'>;
  /** `q`: o texto buscado (vazio quando veio dos em alta), para o registro de envio. */
  aoEscolher: (gif: GifDto, q: string) => void;
  /** `devolverFoco`: Esc devolve o foco ao botão GIF; o clique fora deixa o foco onde a pessoa clicou. */
  aoFechar: (devolverFoco: boolean) => void;
  ancora?: HTMLElement | null;
}

/** Colunas da grade (a mesma conta serve para o CSS e para as setas). */
const COLUNAS = 3;
const PAUSA_MS = 300;

/** O que já veio de uma consulta, e o estado do pedido dela. */
interface Lista {
  itens: GifResultado[];
  /** Última página recebida (0: nenhuma ainda). */
  pagina: number;
  temMais: boolean;
  carregando: boolean;
  falhou: boolean;
  /** Muda a cada falha: refaz o observador do fim da grade (nova tentativa ao rolar). */
  falhas: number;
}
const VAZIA: Lista = { itens: [], pagina: 0, temMais: false, carregando: false, falhou: false, falhas: 0 };

/**
 * Busca de GIF (RF-2, RF-6): sem texto, os em alta; com texto, a busca, depois de uma pausa. A grade segue a ordem
 * da Klipy e carrega mais ao rolar. Cada consulta é pedida uma vez enquanto o painel está aberto (RN-6), e o
 * estado (carregando, falha) é de cada consulta: uma resposta atrasada não mexe na que está na tela.
 */
export function PainelGif({ klipy, aoEscolher, aoFechar, ancora }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLDivElement>(null);
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  });
  const [termo, setTermo] = useState('');
  const [consulta, setConsulta] = useState('');
  const [listas, setListas] = useState<Map<string, Lista>>(() => new Map());
  /** GIF que recebe o Tab (roving tab): o último focado, na consulta em que foi focado. */
  const [ativo, setAtivo] = useState({ q: '', i: 0 });
  /** Páginas com pedido em andamento ou já recebidas, por consulta. */
  const pedidos = useRef(new Set<string>());

  useEffect(() => {
    campo.current?.focus();
    ref.current?.scrollIntoView?.({ block: 'nearest' });
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

  // Busca só depois de uma pausa na digitação.
  useEffect(() => {
    const t = setTimeout(() => setConsulta(termo.trim()), PAUSA_MS);
    return () => clearTimeout(t);
  }, [termo]);

  const atual = listas.get(consulta) ?? VAZIA;

  function mudar(q: string, fn: (l: Lista) => Lista) {
    setListas((m) => new Map(m).set(q, fn(m.get(q) ?? VAZIA)));
  }

  function carregar(q: string, pagina: number) {
    const chave = `${q}\u0000${pagina}`;
    if (pedidos.current.has(chave)) return;
    pedidos.current.add(chave);
    mudar(q, (l) => ({ ...l, carregando: true, falhou: false }));
    const pedido: Promise<PaginaGifs> = q ? klipy.buscar(q, pagina) : klipy.emAlta(pagina);
    pedido.then(
      (p) => mudar(q, (l) => ({ ...l, itens: [...(pagina > 1 ? l.itens : []), ...p.itens], pagina, temMais: p.temMais, carregando: false, falhou: false })),
      () => {
        // Falhou: pode tentar de novo (outra digitação ou rolagem).
        pedidos.current.delete(chave);
        mudar(q, (l) => ({ ...l, carregando: false, falhou: true, falhas: l.falhas + 1 }));
      },
    );
  }

  useEffect(() => {
    const l = listas.get(consulta);
    if (!l || (l.pagina === 0 && !l.carregando)) carregar(consulta, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega quando a consulta muda; o cache vive em `listas`
  }, [consulta]);

  // Chegou perto do fim da grade: próxima página (de novo depois de uma falha).
  useEffect(() => {
    const alvo = fim.current;
    if (!alvo || !atual.temMais || atual.pagina === 0 || typeof IntersectionObserver === 'undefined') return;
    const proxima = atual.pagina + 1;
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) carregar(consulta, proxima);
    });
    obs.observe(alvo);
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refaz quando muda a página, a consulta ou depois de uma falha
  }, [consulta, atual.pagina, atual.temMais, atual.falhas]);

  function teclas(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      fechar.current(true);
      return;
    }
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    const botoes = [...(ref.current?.querySelectorAll<HTMLButtonElement>('.painel-gif-item') ?? [])];
    if (botoes.length === 0) return;
    const i = botoes.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        botoes[Math.min(foco, botoes.length - 1)]!.focus();
      }
      return;
    }
    e.preventDefault();
    const passo = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLUNAS, ArrowUp: -COLUNAS }[e.key]!;
    const destino = i + passo;
    if (destino < 0) campo.current?.focus();
    else botoes[Math.min(destino, botoes.length - 1)]!.focus();
  }

  const itens = atual.itens;
  const foco = Math.min(ativo.q === consulta ? ativo.i : 0, Math.max(0, itens.length - 1));
  let aviso = '';
  if (atual.falhou) aviso = 'A busca de GIF está indisponível agora.';
  else if (atual.pagina > 0 && itens.length === 0) aviso = 'Nada encontrado.';
  let status = aviso;
  if (!status && atual.carregando) status = 'Carregando GIFs…';
  else if (!status && atual.pagina > 0) status = `${itens.length} GIFs`;

  return (
    <div ref={ref} className="painel-gif" role="dialog" aria-label="Escolher GIF" onKeyDown={teclas}>
      {/* O texto do campo é exigido pelos termos da Klipy (atribuição). */}
      <input
        ref={campo}
        type="search"
        className="painel-gif-busca"
        placeholder="Search KLIPY"
        aria-label="Buscar GIF"
        aria-describedby="painel-gif-dica"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        onKeyDown={(e) => {
          // O painel fica dentro do formulário do compositor: Enter aqui não pode enviar a mensagem.
          if (e.key === 'Enter') e.preventDefault();
        }}
      />
      <p id="painel-gif-dica" className="visualmente-oculto">
        Seta para baixo entra na grade; Enter envia o GIF; Esc fecha.
      </p>
      <p className="visualmente-oculto" role="status">
        {status}
      </p>
      <div className="painel-gif-lista">
        {itens.length > 0 && (
          <div
            className="painel-gif-grade"
            role="group"
            aria-label={consulta ? `Resultados de ${consulta}` : 'Em alta'}
            style={{ gridTemplateColumns: `repeat(${COLUNAS}, 1fr)` }}
          >
            {itens.map((g, i) => (
              <button
                key={`${g.slug}-${i}`}
                type="button"
                className="painel-gif-item"
                aria-label={g.descricao || 'GIF'}
                title={g.descricao || undefined}
                tabIndex={i === foco ? 0 : -1}
                style={g.borrada ? { backgroundImage: `url("${g.borrada}")` } : undefined}
                onFocus={() => setAtivo({ q: consulta, i })}
                onClick={() => aoEscolher(g.gif, consulta)}
              >
                <img src={g.miniatura.url} width={g.miniatura.largura} height={g.miniatura.altura} alt="" loading="lazy" decoding="async" draggable={false} />
              </button>
            ))}
          </div>
        )}
        {aviso && <p className={atual.falhou ? 'erro painel-gif-aviso' : 'suave painel-gif-aviso'}>{aviso}</p>}
        {atual.carregando && <p className="suave painel-gif-aviso">Carregando…</p>}
        <div ref={fim} className="painel-gif-fim" aria-hidden="true" />
      </div>
    </div>
  );
}
