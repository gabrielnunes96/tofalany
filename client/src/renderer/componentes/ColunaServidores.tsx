import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ServidorConhecido } from '@tofalando/shared';

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

/**
 * Backlog v2, item 7: coluna de servidores à esquerda. Um clique troca de servidor (cada um com o seu login);
 * "+" entra em outro (endereço ou link de convite).
 */
export function ColunaServidores({
  servidores,
  ativo,
  naoLidas = {},
  aoEscolher,
  aoAdicionar,
  aoCriar,
}: {
  servidores: ServidorConhecido[];
  ativo: string | null;
  /** Não lidas dos servidores que não estão abertos (o aberto mostra as suas na lista de canais). */
  naoLidas?: Record<string, number>;
  aoEscolher: (url: string) => void;
  aoAdicionar: () => void;
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
  return (
    <nav className="coluna-servidores" aria-label="Servidores">
      {servidores.map((s) => {
        const n = s.url === ativo ? 0 : (naoLidas[s.url] ?? 0);
        const nome = s.nome ? `${s.nome} (${s.url})` : s.url;
        return (
          <button
            key={s.url}
            type="button"
            className={`servidor-icone${s.url === ativo ? ' ativo' : ''}`}
            aria-current={s.url === ativo ? 'page' : undefined}
            aria-label={n > 0 ? `${nome}, ${n} não lida${n > 1 ? 's' : ''}` : nome}
            title={s.nome ? `${s.nome}\n${s.url}` : s.url}
            onClick={() => s.url !== ativo && aoEscolher(s.url)}
          >
            {iniciais(s)}
            {n > 0 && (
              <span className="servidor-naolidas" aria-hidden="true">
                {n > 99 ? '99+' : n}
              </span>
            )}
          </button>
        );
      })}
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
