import type { ServidorConhecido } from "@tofalando/shared";

/** Iniciais para o ícone: "Turma da Faculdade" → "TF"; sem nome, o começo do endereço. */
export function iniciais(s: ServidorConhecido): string {
  const nome = s.nome?.trim();
  if (nome) {
    // "da", "de", "do", "e"… não entram: "Turma da Faculdade" → "TF" (primeira e última palavra).
    const palavras = nome
      .split(/\s+/)
      .filter((p) => p && !/^(d[aeo]s?|e|of|the)$/i.test(p));
    return (
      palavras.length > 1
        ? palavras[0]![0]! + palavras.at(-1)![0]!
        : nome.slice(0, 2)
    ).toUpperCase();
  }
  try {
    return new URL(s.url).hostname
      .replace(/^www\./, "")
      .slice(0, 2)
      .toUpperCase();
  } catch {
    return "?";
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
}: {
  servidores: ServidorConhecido[];
  ativo: string | null;
  /** Não lidas dos servidores que não estão abertos (o aberto mostra as suas na lista de canais). */
  naoLidas?: Record<string, number>;
  aoEscolher: (url: string) => void;
  aoAdicionar: () => void;
}) {
  return (
    <nav className="coluna-servidores" aria-label="Servidores">
      {servidores.map((s) => {
        const n = s.url === ativo ? 0 : (naoLidas[s.url] ?? 0);
        const nome = s.nome ? `${s.nome} (${s.url})` : s.url;
        return (
          <button
            key={s.url}
            type="button"
            className={`servidor-icone${s.url === ativo ? " ativo" : ""}`}
            aria-current={s.url === ativo ? "page" : undefined}
            aria-label={
              n > 0 ? `${nome}, ${n} não lida${n > 1 ? "s" : ""}` : nome
            }
            title={s.nome ? `${s.nome}\n${s.url}` : s.url}
            onClick={() => s.url !== ativo && aoEscolher(s.url)}
          >
            {iniciais(s)}
            {n > 0 && (
              <span className="servidor-naolidas" aria-hidden="true">
                {n > 99 ? "99+" : n}
              </span>
            )}
          </button>
        );
      })}
      <span className="servidores-separador" aria-hidden="true" />
      <button
        type="button"
        className="servidor-icone adicionar"
        aria-label="Adicionar servidor"
        title="Entrar em outro servidor (cole o link de convite)"
        onClick={aoAdicionar}
      >
        +
      </button>
    </nav>
  );
}
