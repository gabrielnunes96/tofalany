import { useState } from 'react';
import { pedirAtualizacaoServidor, type ResultadoPedido } from '../servicos/atualizar-servidor';

/**
 * infra-e-atualizacao, RF-5: item "Atualizar o servidor agora" do menu do servidor. Só para o administrador da
 * instalação (CA-6); fica desabilitado enquanto o pedido vai, para um clique duplo não virar "já foi pedida".
 */
export function BotaoAtualizarServidor({
  podePedir,
  api,
  aoResponder,
}: {
  podePedir: boolean;
  api: { atualizarServidor(): Promise<unknown> };
  aoResponder: (r: ResultadoPedido) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  if (!podePedir) return null;
  return (
    <button
      type="button"
      disabled={enviando}
      onClick={() => {
        setEnviando(true);
        void pedirAtualizacaoServidor(api)
          .then(aoResponder)
          .finally(() => setEnviando(false));
      }}
    >
      Atualizar o servidor agora
    </button>
  );
}
