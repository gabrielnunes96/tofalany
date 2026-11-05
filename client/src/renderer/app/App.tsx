import { useEffect, useState } from 'react';
import { ponte } from '../servicos/ponte';
import { TelaServidor } from '../telas/TelaServidor';
import { TelaConectado } from '../telas/TelaConectado';

type Estado =
  | { fase: 'carregando' }
  | { fase: 'escolher-servidor'; urlAtual: string | null }
  | { fase: 'conectado'; url: string };

export function App() {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });

  useEffect(() => {
    ponte()
      .config.ler()
      .then((c) => setEstado(c.servidorUrl ? { fase: 'conectado', url: c.servidorUrl } : { fase: 'escolher-servidor', urlAtual: null }))
      .catch(() => setEstado({ fase: 'escolher-servidor', urlAtual: null }));
  }, []);

  /** Só grava depois que a nova URL passou no teste; a anterior continua guardada até lá. */
  async function guardarServidor(url: string) {
    const salvo = await ponte().config.gravar({ servidorUrl: url });
    if (!salvo.servidorUrl) throw new Error('Endereço recusado.');
    setEstado({ fase: 'conectado', url: salvo.servidorUrl });
  }

  if (estado.fase === 'carregando') return null;
  if (estado.fase === 'escolher-servidor') {
    const { urlAtual } = estado;
    return (
      <TelaServidor
        aoConectar={guardarServidor}
        aoCancelar={urlAtual ? () => setEstado({ fase: 'conectado', url: urlAtual }) : undefined}
      />
    );
  }
  return <TelaConectado url={estado.url} aoTrocarServidor={() => setEstado({ fase: 'escolher-servidor', urlAtual: estado.url })} />;
}
