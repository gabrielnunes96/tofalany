import { useState, type FormEvent } from 'react';
import { validarNomeCanal } from '@tofalando/shared';

interface Props {
  rotulo: string;
  inicial?: string;
  textoBotao: string;
  /** Devolve a mensagem de erro do servidor, ou null se deu certo. */
  aoEnviar: (nome: string) => Promise<string | null>;
  aoCancelar: () => void;
}

/** Campo curto para criar ou renomear canal, com validação igual à do servidor. */
export function FormNome({ rotulo, inicial = '', textoBotao, aoEnviar, aoCancelar }: Props) {
  const [nome, setNome] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const v = validarNomeCanal(nome);
    if (!v.ok) return setErro(v.erro);
    setEnviando(true);
    const falha = await aoEnviar(v.valor);
    setEnviando(false);
    if (falha) setErro(falha);
  }

  return (
    <form className="form-nome" onSubmit={enviar} noValidate>
      <input
        aria-label={rotulo}
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && aoCancelar()}
        maxLength={64}
        autoFocus
      />
      <div className="form-nome-botoes">
        <button type="submit" disabled={enviando}>
          {textoBotao}
        </button>
        <button type="button" className="secundario" onClick={aoCancelar}>
          Cancelar
        </button>
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </form>
  );
}
