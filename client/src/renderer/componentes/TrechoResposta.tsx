import type { RespostaDto, UsuarioDto } from '@tofalando/shared';

interface Props {
  resposta: RespostaDto;
  usuarios?: Map<number, UsuarioDto>;
  euId?: number;
  aoIrPara?: (id: number) => void;
}

/** Acima da resposta: quem escreveu a original e o começo dela; clicar leva até ela (RF-7, RN-9, RN-10). */
export function TrechoResposta({ resposta: r, usuarios, euId, aoIrPara }: Props) {
  if (r.apagada) {
    return (
      <p className="trecho-resposta apagada">
        <span className="trecho-seta" aria-hidden="true">
          ↱
        </span>
        Mensagem original apagada
      </p>
    );
  }
  const autor = r.autorId === euId ? 'você' : (usuarios?.get(r.autorId)?.nomeExibicao ?? 'conta removida');
  const conteudo = (
    <>
      <span className="trecho-seta" aria-hidden="true">
        ↱
      </span>
      <span className="trecho-autor">{autor}</span>
      <span className="trecho-texto">{r.soAnexo ? 'Anexo' : r.trecho}</span>
    </>
  );
  return aoIrPara ? (
    <button
      type="button"
      className="trecho-resposta"
      aria-label={`Resposta a ${autor}: ${r.soAnexo ? 'anexo' : r.trecho}. Ir até a mensagem`}
      onClick={() => aoIrPara(r.id)}
    >
      {conteudo}
    </button>
  ) : (
    <p className="trecho-resposta">{conteudo}</p>
  );
}
