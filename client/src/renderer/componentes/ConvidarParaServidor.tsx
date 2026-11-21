import { useEffect, useState } from 'react';
import type { ComunidadeDto } from '@tofalando/shared';

/**
 * qualidade-de-vida, RF-2 e RF-3: "Convidar para servidor" no cartão e no menu da pessoa. A lista vem do servidor
 * (só onde eu posso convidar e a pessoa ainda não está); vazia, o item nem aparece. Escolher manda o convite como
 * mensagem direta e mostra a confirmação ali mesmo.
 */
export function ConvidarParaServidor({
  carregar,
  aoConvidar,
  noMenu = false,
}: {
  carregar: () => Promise<ComunidadeDto[]>;
  /** null = enviado; texto = o motivo da falha. */
  aoConvidar: (comunidadeId: number) => Promise<string | null>;
  /** Dentro do menu da pessoa (itens com role="menuitem"). */
  noMenu?: boolean;
}) {
  const [lista, setLista] = useState<ComunidadeDto[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    carregar()
      .catch(() => [] as ComunidadeDto[])
      .then((l) => vivo && setLista(l));
    return () => {
      vivo = false;
    };
    // Carrega uma vez ao abrir o cartão ou o menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function convidar(c: ComunidadeDto) {
    setEnviando(true);
    setResultado(null);
    const falha = await aoConvidar(c.id).catch((e: unknown) => (e instanceof Error ? e.message : 'Não foi possível enviar o convite.'));
    setEnviando(false);
    if (falha) {
      setResultado({ ok: false, texto: falha });
      return;
    }
    setResultado({ ok: true, texto: `Convite enviado para ${c.nome}.` });
    setLista((l) => l?.filter((x) => x.id !== c.id) ?? null);
    setAberto(false);
  }

  const papel = noMenu ? { role: 'menuitem' as const } : {};
  // Sem lista (carregando) ou sem para onde convidar: só a confirmação do último envio, se houver.
  if (!lista?.length) return resultado ? <p role="status" className={resultado.ok ? 'suave convite-resultado' : 'erro convite-resultado'}>{resultado.texto}</p> : null;
  return (
    <div className="convidar-servidor">
      <button type="button" className={noMenu ? undefined : 'secundario'} {...papel} aria-expanded={aberto} onClick={() => setAberto(!aberto)} disabled={enviando}>
        Convidar para servidor
      </button>
      {aberto && (
        <ul className="convidar-servidor-lista" aria-label="Servidores para convidar">
          {lista.map((c) => (
            <li key={c.id}>
              <button type="button" {...papel} onClick={() => void convidar(c)} disabled={enviando}>
                {c.nome}
              </button>
            </li>
          ))}
        </ul>
      )}
      {resultado && (
        <p role="status" className={resultado.ok ? 'suave convite-resultado' : 'erro convite-resultado'}>
          {resultado.texto}
        </p>
      )}
    </div>
  );
}
