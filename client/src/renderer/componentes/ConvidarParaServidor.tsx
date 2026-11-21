import { useEffect, useId, useRef, useState } from 'react';
import type { ComunidadeDto } from '@tofalando/shared';

/**
 * qualidade-de-vida, RF-2 e RF-3: "Convidar para servidor" no cartão e no menu da pessoa. A lista vem do servidor
 * (só onde eu posso convidar e a pessoa ainda não está); vazia, o item nem aparece. Escolher manda o convite como
 * mensagem direta e mostra a confirmação ali mesmo. Quem monta o componente o remonta para outra pessoa (`key`).
 */
export function ConvidarParaServidor({
  carregar,
  aoConvidar,
  noMenu = false,
}: {
  carregar: () => Promise<ComunidadeDto[]>;
  /** null = enviado; texto = o motivo da falha (um erro lançado também vira o texto). */
  aoConvidar: (comunidadeId: number) => Promise<string | null>;
  /** Dentro do menu da pessoa (itens com role="menuitem"). */
  noMenu?: boolean;
}) {
  const [lista, setLista] = useState<ComunidadeDto[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const idLista = useId();

  useEffect(() => {
    let vivo = true;
    carregar()
      .catch(() => [] as ComunidadeDto[])
      .then((l) => vivo && setLista(l));
    return () => {
      vivo = false;
    };
    // Carrega uma vez por montagem (uma por pessoa: quem usa troca a `key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function convidar(c: ComunidadeDto) {
    setEnviando(true);
    setResultado(null);
    const falha = await aoConvidar(c.id).catch((e: unknown) => (e instanceof Error ? e.message : 'Não foi possível enviar o convite.'));
    setEnviando(false);
    if (falha) {
      setResultado({ ok: false, texto: falha });
    } else {
      setResultado({ ok: true, texto: `Convite enviado para ${c.nome}.` });
      setLista((l) => l?.filter((x) => x.id !== c.id) ?? null);
      setAberto(false);
    }
    // O botão clicado some ou fica desabilitado: o foco volta para "Convidar para servidor" (se ainda existir).
    requestAnimationFrame(() => botao.current?.focus());
  }

  const papel = noMenu ? { role: 'menuitem' as const } : {};
  const temLista = !!lista?.length;
  if (!temLista && !resultado) return null;
  return (
    <div className="convidar-servidor" role={noMenu ? 'none' : undefined}>
      {temLista && (
        <button
          ref={botao}
          type="button"
          className={noMenu ? undefined : 'secundario'}
          {...papel}
          aria-expanded={aberto}
          aria-controls={idLista}
          onClick={() => setAberto(!aberto)}
          disabled={enviando}
        >
          Convidar para servidor
        </button>
      )}
      {temLista && aberto && (
        <ul id={idLista} className="convidar-servidor-lista" aria-label="Servidores para convidar" role={noMenu ? 'group' : undefined}>
          {lista!.map((c) => (
            <li key={c.id} role={noMenu ? 'none' : undefined}>
              <button type="button" {...papel} onClick={() => void convidar(c)} disabled={enviando}>
                {c.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
      {/* Sempre montado: o leitor de tela anuncia quando o texto muda. */}
      <p role="status" className={resultado?.ok === false ? 'erro convite-resultado' : 'suave convite-resultado'}>
        {resultado?.texto ?? ''}
      </p>
    </div>
  );
}
