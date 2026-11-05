import { useEffect, useState } from 'react';
import type { ServidorInfo } from '@tofalando/shared';
import { testarServidor } from '../servicos/servidor';

interface Props {
  url: string;
  aoTrocarServidor: () => void;
}

/** Tela provisória até o login (T2): mostra o servidor guardado e permite trocá-lo (RF-1). */
export function TelaConectado({ url, aoTrocarServidor }: Props) {
  const [info, setInfo] = useState<ServidorInfo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    void testarServidor(url).then((r) => {
      if (!ativo) return;
      if (r.ok) setInfo(r.valor);
      else setErro(r.erro);
    });
    return () => {
      ativo = false;
    };
  }, [url]);

  return (
    <main className="tela-centro">
      <section className="cartao" aria-live="polite">
        <h1>{info ? info.nome : 'Tô Falando'}</h1>
        <p className="suave">Servidor: {url}</p>
        {info && <p data-testid="servidor-conectado">Conectado (versão {info.versao}).</p>}
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <button type="button" className="secundario" onClick={aoTrocarServidor}>
          Trocar servidor
        </button>
      </section>
    </main>
  );
}
