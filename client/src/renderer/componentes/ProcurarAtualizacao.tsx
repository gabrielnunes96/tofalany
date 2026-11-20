import { useState } from 'react';
import type { ApiTofalando } from '../../preload/api';

type Resultado = Awaited<ReturnType<ApiTofalando['atualizacao']['procurar']>>;

const TEXTOS: Record<Resultado['situacao'], (v?: string) => string> = {
  atualizado: () => 'Você já está na versão mais nova.',
  nova: (v) => `A versão ${v} está disponível: o aviso no canto da tela leva até ela.`,
  baixando: (v) => `Baixando a versão ${v}. Quando terminar, aparece o aviso para reiniciar.`,
  pronta: (v) => `A versão ${v} já está baixada: use o aviso no canto da tela para reiniciar.`,
  erro: () => 'Não deu para procurar agora. Confira a internet e tente de novo.',
  indisponivel: () => 'A procura só funciona no app instalado.',
};

/** Backlog 27: procura uma versão nova na hora, sem esperar a conferência automática. */
export function ProcurarAtualizacao({ atualizacao, versaoAtual }: { atualizacao: Pick<ApiTofalando['atualizacao'], 'procurar'>; versaoAtual: string }) {
  const [procurando, setProcurando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  async function procurar() {
    setProcurando(true);
    setResultado(null);
    setResultado(await atualizacao.procurar().catch((): Resultado => ({ situacao: 'erro' })));
    setProcurando(false);
  }

  return (
    <div className="procurar-atualizacao">
      <span className="suave">Versão instalada: {versaoAtual}</span>
      <button type="button" className="secundario" onClick={() => void procurar()} disabled={procurando}>
        {procurando ? 'Procurando…' : 'Procurar atualização'}
      </button>
      <p role="status" className={resultado?.situacao === 'erro' ? 'erro' : 'suave'}>
        {resultado ? TEXTOS[resultado.situacao](resultado.versao) : ''}
      </p>
    </div>
  );
}
