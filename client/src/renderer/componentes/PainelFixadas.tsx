import { textoSemGif, trechoDeResposta, type FixadaDto, type UsuarioDto } from '@tofalando/shared';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** O começo da mensagem para a lista (como o trecho das respostas). */
export function trechoDaFixada(f: FixadaDto): string {
  const m = f.mensagem;
  return trechoDeResposta(textoSemGif(m.texto, m.gif)) || (m.gif ? 'GIF' : m.anexos.length ? `Anexo: ${m.anexos[0]!.nome}` : '');
}

interface Props {
  /** undefined enquanto carrega. */
  fixadas: FixadaDto[] | undefined;
  usuarios: Map<number, UsuarioDto>;
  /** Quem pode fixar também desafixa pela lista. */
  aoDesafixar?: (id: number) => Promise<string | null>;
  aoIr: (id: number) => void;
  aoFechar: () => void;
  erro?: string | null;
}

/** chat-fixar-e-buscar (RF-2): as fixadas da conversa aberta, da mais nova para a mais antiga. */
export function PainelFixadas({ fixadas, usuarios, aoDesafixar, aoIr, aoFechar, erro }: Props) {
  const nome = (id: number | null) => (id === null ? 'conta removida' : (usuarios.get(id)?.nomeExibicao ?? 'conta removida'));
  return (
    <section className="painel-lateral painel-fixadas" aria-labelledby="titulo-fixadas">
      <header className="painel-lateral-topo">
        <h2 id="titulo-fixadas" className="subtitulo">
          Fixadas{fixadas ? ` — ${fixadas.length}` : ''}
        </h2>
        <button type="button" className="icone" aria-label="Fechar as fixadas" onClick={aoFechar}>
          ✕
        </button>
      </header>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {!fixadas && !erro && <p className="suave">Carregando…</p>}
      {fixadas?.length === 0 && <p className="suave">Nenhuma mensagem fixada nesta conversa.</p>}
      <ul className="lista-fixadas" aria-label="Mensagens fixadas">
        {fixadas?.map((f) => (
          <li key={f.mensagem.id}>
            <button type="button" className="fixada-ir" onClick={() => aoIr(f.mensagem.id)}>
              <span className="fixada-topo">
                <strong>{nome(f.mensagem.autorId)}</strong>
                <time dateTime={new Date(f.mensagem.criadaEm).toISOString()}>{quando.format(f.mensagem.criadaEm)}</time>
              </span>
              <span className="fixada-trecho">{trechoDaFixada(f)}</span>
              <span className="suave fixada-por">Fixada por {nome(f.fixadaPor)}</span>
            </button>
            {aoDesafixar && (
              <button type="button" className="secundario fixada-desafixar" onClick={() => void aoDesafixar(f.mensagem.id)}>
                Desafixar
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
