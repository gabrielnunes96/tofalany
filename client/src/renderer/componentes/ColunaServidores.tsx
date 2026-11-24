import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type MouseEvent as EventoMouse } from 'react';
import {
  chaveItemColuna,
  CORES_PASTA,
  criarPasta,
  itensColuna,
  moverItem,
  moverPasso,
  NOME_PASTA_MAX,
  normalizarPastas,
  somarAPasta,
  tirarDaPasta,
  type Organizacao,
  type PastaServidores,
  type ServidorConhecido,
} from '@tofalando/shared';

/** organizar-a-tela: tipo do arrastar de servidores e pastas (chave do item). */
const TIPO_ARRASTO_SERVIDOR = 'application/x-tofalany-servidor';
/** Identificador de uma pasta nova (só neste computador). */
const novoId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Iniciais para o ícone: "Turma da Faculdade" → "TF"; sem nome, o começo do endereço. */
export function iniciais(s: ServidorConhecido): string {
  const nome = s.nome?.trim();
  if (nome) {
    // "da", "de", "do", "e"… não entram: "Turma da Faculdade" → "TF" (primeira e última palavra).
    const palavras = nome.split(/\s+/).filter((p) => p && !/^(d[aeo]s?|e|of|the)$/i.test(p));
    return (palavras.length > 1 ? palavras[0]![0]! + palavras.at(-1)![0]! : nome.slice(0, 2)).toUpperCase();
  }
  try {
    return new URL(s.url).hostname
      .replace(/^www\./, '')
      .slice(0, 2)
      .toUpperCase();
  } catch {
    return '?';
  }
}

function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

/**
 * Backlog v2, item 7: coluna de servidores à esquerda. Um clique troca de servidor (cada um com o seu login);
 * "+" entra em outro (endereço ou link de convite). Clique direito num ícone: "Remover da lista" (item 41).
 */
export function ColunaServidores({
  servidores,
  ativo,
  naoLidas = {},
  aoEscolher,
  aoAdicionar,
  aoRemover,
  aoCriar,
  pastas = [],
  aoOrganizar,
}: {
  servidores: ServidorConhecido[];
  /** organizar-a-tela: pastas da coluna (a ordem é a de `servidores`). */
  pastas?: PastaServidores[];
  /** organizar-a-tela: nova ordem e pastas (arrastar, menu). Sem ele, a coluna não se reorganiza. */
  aoOrganizar?: (o: Organizacao) => void;
  ativo: string | null;
  /** Não lidas dos servidores que não estão abertos (o aberto mostra as suas na lista de canais). */
  naoLidas?: Record<string, number>;
  aoEscolher: (url: string) => void;
  aoAdicionar: () => void;
  /** Tira o servidor só da lista deste computador, sem falar com ele (serve para servidor fora do ar ou que mudou). */
  aoRemover?: (url: string) => void;
  /** Só o administrador do principal: cria um servidor novo na mesma instalação (devolve o erro, se houver). */
  aoCriar?: (nome: string) => Promise<string | null>;
}) {
  const [menu, setMenu] = useState<'fechado' | 'opcoes' | 'criar'>('fechado');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (menu === 'fechado') return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setMenu('fechado');
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu('fechado');
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [menu]);
  async function criar(e: FormEvent) {
    e.preventDefault();
    if (!aoCriar || !nome.trim() || criando) return;
    setCriando(true);
    const falha = await aoCriar(nome.trim());
    setCriando(false);
    setErro(falha);
    if (!falha) {
      setNome('');
      setMenu('fechado');
    }
  }
  /** Imagem que não carregou (servidor fora do ar, outra instalação): volta para as iniciais. */
  const [falhas, setFalhas] = useState<Record<string, true>>({});
  /**
   * Menu do clique direito (item 41 e organizar-a-tela, RN-7): organizar (pasta, ordem) para todos os servidores e
   * pastas; "Remover da lista" só para servidores de outro endereço (os da instalação aberta voltam sozinhos).
   */
  const [menuServidor, setMenuServidor] = useState<{ chave: string; x: number; y: number; sub?: 'mover' | 'nova' | 'editar' } | null>(null);
  const caixaMenu = useRef<HTMLDivElement>(null);
  const origemMenu = useRef<HTMLButtonElement | null>(null);
  const fecharMenu = (devolverFoco: boolean) => {
    setMenuServidor(null);
    if (devolverFoco && origemMenu.current?.isConnected) origemMenu.current.focus();
  };
  const hostAtivo = ativo ? hostDe(ativo) : '';
  useEffect(() => {
    if (!menuServidor) return;
    const fora = (e: MouseEvent) => {
      if (!caixaMenu.current?.contains(e.target as Node)) setMenuServidor(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharMenu(true);
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [menuServidor]);
  function remover(s: ServidorConhecido) {
    const nome = s.nome ?? s.url;
    const sim = window.confirm(
      `Tirar ${nome} da lista? Ele só some da lista neste computador; você continua no servidor. Para voltar, entre de novo pelo endereço dele.`,
    );
    fecharMenu(!sim);
    if (sim) aoRemover?.(s.url);
  }

  // organizar-a-tela: a lista como aparece (pastas normalizadas: servidor que saiu da lista sai da pasta, RN-8).
  const org = normalizarPastas(
    servidores.map((s) => s.url),
    pastas,
  );
  const porUrl = new Map(servidores.map((s) => [s.url, s]));
  const itens = itensColuna(org.urls, org.pastas);
  const chaves = itens.map(chaveItemColuna);
  const organizar = (op: (o: Organizacao) => Organizacao) => aoOrganizar?.(op(org));
  const naoLidasDe = (url: string) => (url === ativo ? 0 : (naoLidas[url] ?? 0));

  // RN-4, RN-5: arrastar servidores e pastas; a linha ou o destaque mostram onde vai cair.
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [alvo, setAlvo] = useState<{ chave: string; onde: 'antes' | 'depois' | 'dentro' } | null>(null);
  const ondeSoltar = (e: DragEvent<HTMLElement>, podeDentro: boolean): 'antes' | 'depois' | 'dentro' => {
    const r = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - r.top) / (r.height || 1);
    if (podeDentro && y > 0.25 && y < 0.75) return 'dentro';
    return y < 0.5 ? 'antes' : 'depois';
  };
  /** Solta `arrastado` em relação ao item `chave` (de fora da pasta) ou ao servidor `chave` de dentro da pasta `pastaId`. */
  function soltar(arrastado: string, chave: string, onde: 'antes' | 'depois' | 'dentro', pastaId?: string) {
    if (arrastado === chave) return;
    const ehPasta = arrastado.startsWith('pasta:');
    if (pastaId) {
      // Sobre um servidor de dentro de uma pasta: entra nela (pastas não entram em pastas).
      if (!ehPasta) organizar((o) => (o.pastas.find((p) => p.id === pastaId)?.urls.includes(arrastado) ? o : somarAPasta(o, arrastado, pastaId)));
      return;
    }
    if (onde === 'dentro' && !ehPasta) {
      if (chave.startsWith('pasta:')) organizar((o) => somarAPasta(o, arrastado, chave.slice(6)));
      else organizar((o) => criarPasta(o, arrastado, chave, novoId()));
      return;
    }
    const i = chaves.indexOf(chave);
    organizar((o) => moverItem(o, arrastado, onde === 'antes' ? chave : (chaves[i + 1] ?? null)));
  }
  const alvoArraste = (chave: string, podeDentro: boolean, pastaId?: string) => ({
    onDragOver: (e: DragEvent<HTMLElement>) => {
      if (!aoOrganizar || !arrastando || !e.dataTransfer.types.includes(TIPO_ARRASTO_SERVIDOR)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      const onde = pastaId ? 'dentro' : ondeSoltar(e, podeDentro && !arrastando.startsWith('pasta:'));
      if (alvo?.chave !== chave || alvo.onde !== onde) setAlvo({ chave, onde });
    },
    onDragLeave: () => setAlvo((a) => (a?.chave === chave ? null : a)),
    onDrop: (e: DragEvent<HTMLElement>) => {
      const arrastado = e.dataTransfer.getData(TIPO_ARRASTO_SERVIDOR);
      if (!aoOrganizar || !arrastado) return;
      e.preventDefault();
      e.stopPropagation();
      soltar(arrastado, chave, pastaId ? 'dentro' : ondeSoltar(e, podeDentro && !arrastado.startsWith('pasta:')), pastaId);
      setAlvo(null);
      setArrastando(null);
    },
  });
  const arrastavel = (chave: string) =>
    aoOrganizar
      ? {
          draggable: true,
          onDragStart: (e: DragEvent<HTMLElement>) => {
            e.stopPropagation();
            e.dataTransfer.setData(TIPO_ARRASTO_SERVIDOR, chave);
            e.dataTransfer.effectAllowed = 'move';
            setArrastando(chave);
          },
          onDragEnd: () => {
            setArrastando(null);
            setAlvo(null);
          },
        }
      : {};
  const classeAlvo = (chave: string) => (alvo?.chave === chave ? ` solta-${alvo.onde}` : '');

  const abrirMenu = (e: EventoMouse<HTMLButtonElement>, chave: string) => {
    e.preventDefault();
    // Ao lado do ícone, pelo mouse ou pelo teclado (tecla de menu, Shift+F10).
    origemMenu.current = e.currentTarget;
    const r = e.currentTarget.getBoundingClientRect();
    setMenuServidor({ chave, x: r.right + 8, y: r.top });
  };
  const temMenu = (s: ServidorConhecido) => !!aoOrganizar || (!!aoRemover && hostDe(s.url) !== hostAtivo);

  function botaoServidor(s: ServidorConhecido, pastaId?: string) {
    const n = naoLidasDe(s.url);
    const nome = s.nome ? `${s.nome} (${s.url})` : s.url;
    return (
      <button
        key={s.url}
        type="button"
        className={`servidor-icone${s.url === ativo ? ' ativo' : ''}${classeAlvo(s.url)}`}
        aria-current={s.url === ativo ? 'page' : undefined}
        aria-label={n > 0 ? `${nome}, ${n} não lida${n > 1 ? 's' : ''}` : nome}
        title={s.nome ? `${s.nome}\n${s.url}` : s.url}
        onClick={() => s.url !== ativo && aoEscolher(s.url)}
        onContextMenu={temMenu(s) ? (e) => abrirMenu(e, s.url) : undefined}
        {...arrastavel(s.url)}
        {...alvoArraste(s.url, true, pastaId)}
      >
        {s.icone && falhas[s.icone] !== true ? (
          <img className="servidor-imagem" src={s.icone} alt="" draggable={false} onError={() => setFalhas((f) => ({ ...f, [s.icone!]: true }))} />
        ) : (
          iniciais(s)
        )}
        {n > 0 && (
          <span className="servidor-naolidas" aria-hidden="true">
            {n > 99 ? '99+' : n}
          </span>
        )}
      </button>
    );
  }

  function pasta(p: PastaServidores) {
    const chave = `pasta:${p.id}`;
    const dentro = p.urls.map((u) => porUrl.get(u)).filter((s): s is ServidorConhecido => !!s);
    // RN-6: soma as não lidas dos de dentro (o aberto não conta).
    const n = p.urls.reduce((t, u) => t + naoLidasDe(u), 0);
    const nome = p.nome || 'Pasta';
    const temAtivo = p.urls.includes(ativo ?? '');
    return (
      <div key={chave} className={`pasta-servidores${p.aberta ? ' aberta' : ''}`} style={{ '--cor-pasta': p.cor } as CSSProperties}>
        <button
          type="button"
          className={`servidor-icone pasta${temAtivo && !p.aberta ? ' ativo-dentro' : ''}${classeAlvo(chave)}`}
          aria-expanded={p.aberta}
          aria-label={`Pasta ${nome}, ${dentro.length} servidores${n > 0 ? `, ${n} não lida${n > 1 ? 's' : ''}` : ''}`}
          title={`${nome}\n${dentro.map((s) => s.nome ?? s.url).join('\n')}`}
          onClick={() => organizar((o) => ({ ...o, pastas: o.pastas.map((x) => (x.id === p.id ? { ...x, aberta: !x.aberta } : x)) }))}
          onContextMenu={aoOrganizar ? (e) => abrirMenu(e, chave) : undefined}
          {...arrastavel(chave)}
          {...alvoArraste(chave, true)}
        >
          {p.aberta ? (
            <span className="pasta-aberta-marca" aria-hidden="true">
              ▾
            </span>
          ) : (
            <span className="pasta-miniaturas" aria-hidden="true">
              {dentro.slice(0, 4).map((s) =>
                s.icone && falhas[s.icone] !== true ? <img key={s.url} src={s.icone} alt="" draggable={false} /> : <span key={s.url}>{iniciais(s).slice(0, 1)}</span>,
              )}
            </span>
          )}
          {n > 0 && !p.aberta && (
            <span className="servidor-naolidas" aria-hidden="true">
              {n > 99 ? '99+' : n}
            </span>
          )}
        </button>
        {p.aberta && dentro.map((s) => botaoServidor(s, p.id))}
      </div>
    );
  }

  // Menu: o que se pode fazer com o item do clique direito.
  const itemMenu = menuServidor ? itens.find((i) => chaveItemColuna(i) === menuServidor.chave) : undefined;
  const servidorMenu = menuServidor && !menuServidor.chave.startsWith('pasta:') ? porUrl.get(menuServidor.chave) : undefined;
  const pastaMenu = menuServidor?.chave.startsWith('pasta:') ? org.pastas.find((p) => `pasta:${p.id}` === menuServidor.chave) : undefined;
  const pastaDoServidor = servidorMenu ? org.pastas.find((p) => p.urls.includes(servidorMenu.url)) : undefined;
  const fazer = (op: (o: Organizacao) => Organizacao) => {
    organizar(op);
    fecharMenu(true);
  };
  const [edicao, setEdicao] = useState<{ nome: string; cor: string }>({ nome: '', cor: CORES_PASTA[0] });
  const nomeMenu = servidorMenu ? (servidorMenu.nome ?? servidorMenu.url) : pastaMenu ? `a pasta ${pastaMenu.nome || 'Pasta'}` : '';

  return (
    <nav
      className={`coluna-servidores${arrastando ? ' arrastando' : ''}`}
      aria-label="Servidores"
      // Soltar no espaço vazio da coluna: vai para o fim (e sai da pasta).
      onDragOver={(e) => {
        if (aoOrganizar && arrastando) e.preventDefault();
      }}
      onDrop={(e) => {
        const arrastado = e.dataTransfer.getData(TIPO_ARRASTO_SERVIDOR);
        if (!aoOrganizar || !arrastado) return;
        e.preventDefault();
        organizar((o) => moverItem(o, arrastado, null));
        setArrastando(null);
        setAlvo(null);
      }}
    >
      {itens.map((i) => (i.tipo === 'pasta' ? pasta(i.pasta) : porUrl.get(i.url) ? botaoServidor(porUrl.get(i.url)!) : null))}
      {menuServidor && (servidorMenu || pastaMenu) && (
        <div
          ref={caixaMenu}
          className="menu-adicionar menu-servidor"
          role="menu"
          aria-label={`Opções de ${servidorMenu ? nomeMenu : `Pasta ${pastaMenu!.nome || 'Pasta'}`}`}
          style={{ left: menuServidor.x, top: menuServidor.y }}
          // Tab para fora do menu fecha (o foco já foi para outro lugar).
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMenuServidor(null);
          }}
        >
          {menuServidor.sub === 'mover' && servidorMenu ? (
            <>
              {org.pastas
                .filter((p) => p.id !== pastaDoServidor?.id)
                .map((p, i) => (
                  <button key={p.id} type="button" role="menuitem" autoFocus={i === 0} onClick={() => fazer((o) => somarAPasta(o, servidorMenu.url, p.id))}>
                    {p.nome || 'Pasta'}
                  </button>
                ))}
              <button type="button" role="menuitem" autoFocus={org.pastas.filter((p) => p.id !== pastaDoServidor?.id).length === 0} onClick={() => setMenuServidor({ ...menuServidor, sub: 'nova' })}>
                Nova pasta…
                <small>Escolha com qual servidor</small>
              </button>
            </>
          ) : menuServidor.sub === 'nova' && servidorMenu ? (
            org.urls
              .filter((u) => u !== servidorMenu.url && !org.pastas.some((p) => p.urls.includes(u)))
              .map((u, i) => (
                <button key={u} type="button" role="menuitem" autoFocus={i === 0} onClick={() => fazer((o) => criarPasta(o, servidorMenu.url, u, novoId()))}>
                  Nova pasta com {porUrl.get(u)?.nome ?? u}
                </button>
              ))
          ) : menuServidor.sub === 'editar' && pastaMenu ? (
            <form
              className="editar-pasta"
              onSubmit={(e) => {
                e.preventDefault();
                fazer((o) => ({ ...o, pastas: o.pastas.map((p) => (p.id === pastaMenu.id ? { ...p, nome: edicao.nome.trim().slice(0, NOME_PASTA_MAX), cor: edicao.cor } : p)) }));
              }}
            >
              <label htmlFor="nome-pasta">Nome da pasta</label>
              <input id="nome-pasta" autoFocus maxLength={NOME_PASTA_MAX} value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
              <fieldset className="cores-pasta">
                <legend>Cor</legend>
                {CORES_PASTA.map((c) => (
                  <label key={c} title={c}>
                    <input type="radio" name="cor-pasta" value={c} checked={edicao.cor === c} onChange={() => setEdicao({ ...edicao, cor: c })} aria-label={`Cor ${c}`} />
                    <span style={{ background: c }} aria-hidden="true" />
                  </label>
                ))}
              </fieldset>
              <button type="submit">Salvar</button>
            </form>
          ) : (
            <>
              {servidorMenu && aoOrganizar && (
                <button type="button" role="menuitem" autoFocus onClick={() => setMenuServidor({ ...menuServidor, sub: 'mover' })}>
                  Mover para pasta…
                </button>
              )}
              {servidorMenu && aoOrganizar && pastaDoServidor && (
                <button type="button" role="menuitem" onClick={() => fazer((o) => tirarDaPasta(o, servidorMenu.url))}>
                  Tirar da pasta
                </button>
              )}
              {pastaMenu && (
                <button
                  type="button"
                  role="menuitem"
                  autoFocus
                  onClick={() => {
                    setEdicao({ nome: pastaMenu.nome, cor: pastaMenu.cor });
                    setMenuServidor({ ...menuServidor, sub: 'editar' });
                  }}
                >
                  Editar pasta
                </button>
              )}
              {pastaMenu && (
                <button type="button" role="menuitem" onClick={() => fazer((o) => ({ ...o, pastas: o.pastas.filter((p) => p.id !== pastaMenu.id) }))}>
                  Desfazer pasta
                </button>
              )}
              {aoOrganizar && (itemMenu || pastaDoServidor) && (
                <>
                  <button type="button" role="menuitem" onClick={() => fazer((o) => moverPasso(o, menuServidor.chave, -1))}>
                    Mover para cima
                  </button>
                  <button type="button" role="menuitem" onClick={() => fazer((o) => moverPasso(o, menuServidor.chave, 1))}>
                    Mover para baixo
                  </button>
                </>
              )}
              {servidorMenu && aoRemover && hostDe(servidorMenu.url) !== hostAtivo && (
                <button type="button" role="menuitem" autoFocus={!aoOrganizar} onClick={() => remover(servidorMenu)}>
                  Remover da lista
                  <small>Só neste computador; não sai do servidor</small>
                </button>
              )}
            </>
          )}
        </div>
      )}
      <span className="servidores-separador" aria-hidden="true" />
      <div className="adicionar-servidor" ref={caixa}>
        <button
          type="button"
          className="servidor-icone adicionar"
          aria-label="Adicionar servidor"
          aria-expanded={aoCriar ? menu !== 'fechado' : undefined}
          title={aoCriar ? 'Criar um servidor ou entrar em outro' : 'Entrar em outro servidor (cole o link de convite)'}
          onClick={() => (aoCriar ? setMenu(menu === 'fechado' ? 'opcoes' : 'fechado') : aoAdicionar())}
        >
          +
        </button>
        {menu === 'opcoes' && (
          <div className="menu-adicionar" role="menu" aria-label="Adicionar servidor">
            <button type="button" role="menuitem" onClick={() => setMenu('criar')}>
              Criar servidor
              <small>Um servidor novo nesta instalação, com canais e convite próprios</small>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu('fechado');
                aoAdicionar();
              }}
            >
              Entrar com convite
              <small>Cole o link de convite de outro servidor</small>
            </button>
          </div>
        )}
        {menu === 'criar' && (
          <form className="menu-adicionar" onSubmit={(e) => void criar(e)}>
            <label htmlFor="nome-novo-servidor">Nome do servidor</label>
            <input id="nome-novo-servidor" value={nome} maxLength={40} autoFocus onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Família" />
            {erro && (
              <p className="erro" role="alert">
                {erro}
              </p>
            )}
            <div className="menu-adicionar-acoes">
              <button type="button" className="secundario" onClick={() => setMenu('opcoes')}>
                Voltar
              </button>
              <button type="submit" disabled={!nome.trim() || criando}>
                {criando ? 'Criando…' : 'Criar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </nav>
  );
}
