import { useEffect, useState, type FormEvent } from 'react';
import { validarCodigoConvite, type ConviteDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';

interface Props {
  api: Pick<ClienteApi, 'lerConvite' | 'trocarConvite'>;
  aoVoltar: () => void;
}

/** RF-6a (administrador): ver e trocar o código de convite; o link antigo deixa de valer (RN-1). */
export function TelaConvite({ api, aoVoltar }: Props) {
  const [convite, setConvite] = useState<ConviteDto | null>(null);
  const [novo, setNovo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    api
      .lerConvite()
      .then(setConvite)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Não foi possível ler o convite.'));
  }, [api]);

  async function trocar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    const codigo = validarCodigoConvite(novo);
    if (!codigo.ok) return setErro(codigo.erro);
    setOcupado(true);
    try {
      setConvite(await api.trocarConvite(codigo.valor));
      setNovo('');
      setAviso('Código trocado. O link e o código antigos não valem mais.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível trocar o código.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="painel" aria-labelledby="titulo-convite">
      <div className="painel-topo">
        <h1 id="titulo-convite">Convite</h1>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
      {convite && (
        <dl className="convite-atual">
          <dt>Código atual</dt>
          <dd data-testid="codigo-convite">{convite.codigo}</dd>
          <dt>Link</dt>
          <dd data-testid="link-convite">{convite.link}</dd>
        </dl>
      )}
      <form className="perfil-form" onSubmit={trocar} noValidate>
        <label htmlFor="convite-novo">Novo código</label>
        <input id="convite-novo" value={novo} onChange={(e) => setNovo(e.target.value)} autoComplete="off" />
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="aviso-ok" role="status">
            {aviso}
          </p>
        )}
        <button type="submit" disabled={ocupado}>
          {ocupado ? 'Trocando…' : 'Trocar código'}
        </button>
      </form>
    </section>
  );
}
