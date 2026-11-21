import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { ApiTofalando } from '../../preload/api';
import { TelaAtualizando } from './AvisoAtualizacao';
import { TEXTOS_ATUALIZACAO } from './ProcurarAtualizacao';

type Fase =
  | { tipo: 'parado' }
  | { tipo: 'procurando' }
  | { tipo: 'baixando'; versao?: string; percentual: number }
  | { tipo: 'perguntar'; versao: string }
  | { tipo: 'instalando'; versao: string }
  | { tipo: 'aviso'; texto: string; erro?: boolean };

/**
 * qualidade-de-vida, RF-5 (T-7): "Atualizar o app" do menu do usuário. Montado uma vez, no App (a tela de um servidor
 * pode estar montada duas vezes, com a voz viva noutro). Procura; havendo versão, mostra o progresso do download e,
 * pronta, instala na hora. Numa chamada de voz, pergunta antes; recusando, volta o aviso do canto de sempre.
 */
export function AtualizarAgora({
  atualizacao,
  controleRef,
  emChamada,
}: {
  atualizacao: ApiTofalando['atualizacao'];
  /** O App chama `controleRef.current()` no clique em "Atualizar o app". */
  controleRef: RefObject<(() => void) | null>;
  emChamada: boolean;
}) {
  const [fase, setFase] = useState<Fase>({ tipo: 'parado' });
  const faseRef = useRef(fase);
  useEffect(() => {
    faseRef.current = fase;
  }, [fase]);
  const chamada = useRef(emChamada);
  useEffect(() => {
    chamada.current = emChamada;
  }, [emChamada]);

  const instalar = useCallback(
    async (versao: string) => {
      setFase({ tipo: 'instalando', versao });
      // Dá tempo de a tela de espera aparecer antes de o app fechar.
      await new Promise((r) => setTimeout(r, 600));
      await atualizacao.instalar();
    },
    [atualizacao],
  );

  // Progresso, versão pronta (com `pedido`) e falha do download.
  useEffect(() => {
    const pararProgresso = atualizacao.aoProgresso((percentual) => setFase((f) => (f.tipo === 'baixando' ? { ...f, percentual } : f)));
    const pararEstado = atualizacao.aoMudar((e) => {
      if (!e.pedido || e.modo !== 'reiniciar') return;
      if (chamada.current) setFase({ tipo: 'perguntar', versao: e.versao });
      else void instalar(e.versao);
    });
    // Janela recarregada com uma versão pronta do pedido: pergunta (nada fica escondido do aviso do canto).
    let vivo = true;
    void atualizacao
      .estado()
      .then((e) => vivo && e?.pedido && e.modo === 'reiniciar' && setFase((f) => (f.tipo === 'parado' ? { tipo: 'perguntar', versao: e.versao } : f)))
      .catch(() => undefined);
    const pararFalha = atualizacao.aoFalhar(() =>
      setFase({ tipo: 'aviso', texto: 'Não deu para baixar a atualização. Tente de novo mais tarde.', erro: true }),
    );
    return () => {
      vivo = false;
      pararProgresso();
      pararEstado();
      pararFalha();
    };
  }, [atualizacao, instalar]);

  // Cada clique em "Atualizar o app" começa uma procura.
  const procurar = useCallback(() => {
    // Já procurando, baixando ou instalando: o clique de novo não recomeça (nem zera o progresso).
    if (['procurando', 'baixando', 'instalando', 'perguntar'].includes(faseRef.current.tipo)) return;
    setFase({ tipo: 'procurando' });
    void atualizacao
      .agora()
      .catch(() => ({ situacao: 'erro' as const, versao: undefined }))
      .then((r) => {
        if (r.situacao === 'baixando') setFase({ tipo: 'baixando', versao: r.versao, percentual: 0 });
        // Pronta: a versão chega pelo aoMudar, com `pedido`.
        else if (r.situacao === 'pronta') setFase((f) => (f.tipo === 'procurando' ? { tipo: 'parado' } : f));
        else if (r.situacao === 'atualizado') setFase({ tipo: 'aviso', texto: TEXTOS_ATUALIZACAO.atualizado });
        else if (r.situacao === 'indisponivel') setFase({ tipo: 'aviso', texto: TEXTOS_ATUALIZACAO.indisponivel });
        else if (r.situacao === 'nova') {
          void atualizacao.abrirPagina();
          setFase({ tipo: 'aviso', texto: `A versão ${r.versao ?? 'nova'} está disponível: a página para baixar foi aberta.` });
        } else setFase({ tipo: 'aviso', texto: TEXTOS_ATUALIZACAO.erro, erro: true });
      });
  }, [atualizacao]);
  useEffect(() => {
    controleRef.current = procurar;
    return () => {
      controleRef.current = null;
    };
  }, [controleRef, procurar]);

  if (fase.tipo === 'parado') return null;
  if (fase.tipo === 'instalando') return <TelaAtualizando versao={fase.versao} />;
  if (fase.tipo === 'perguntar') {
    const depois = () => {
      setFase({ tipo: 'parado' });
      void atualizacao.recusar();
    };
    return (
      // Esc é "Depois"; o foco começa em "Depois" (um Enter por engano não tira ninguém da chamada).
      <div
        className="dialogo-fundo"
        role="presentation"
        onKeyDown={(e) => {
          if (e.key === 'Escape') depois();
        }}
      >
        <div className="dialogo cartao" role="alertdialog" aria-label="Atualizar o app" aria-describedby="texto-atualizar-agora">
          <h2>ToFalany {fase.versao} pronto</h2>
          <p id="texto-atualizar-agora">Reiniciar agora? Você vai sair da chamada.</p>
          <div className="dialogo-acoes">
            <button type="button" className="secundario" autoFocus onClick={depois}>
              Depois
            </button>
            <button type="button" onClick={() => void instalar(fase.versao)}>
              Reiniciar agora
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <aside className="aviso-atualizacao atualizar-agora" role="status" aria-label="Atualizar o app">
      {fase.tipo === 'procurando' && <p>Procurando atualização…</p>}
      {fase.tipo === 'baixando' && (
        <>
          <p>
            Baixando {fase.versao ? `a versão ${fase.versao}` : 'a versão nova'}… {fase.percentual}%
          </p>
          <progress max={100} value={fase.percentual} aria-label="Download da atualização" />
        </>
      )}
      {fase.tipo === 'aviso' && (
        <>
          <p className={fase.erro ? 'erro' : undefined}>{fase.texto}</p>
          <div>
            <button type="button" className="secundario" onClick={() => setFase({ tipo: 'parado' })}>
              Fechar
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
