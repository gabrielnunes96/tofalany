import { useState } from 'react';
import type { CanalDto } from '@tofalando/shared';
import { FormNome } from './FormNome';

interface Props {
  canal: CanalDto | undefined;
  ehAdmin: boolean;
  aoRenomear: (id: number, nome: string) => Promise<string | null>;
  aoRemover: (id: number) => Promise<string | null>;
}

/** Cabeçalho e conteúdo do canal de texto aberto (as mensagens entram na T9). */
export function CanalAberto({ canal, ehAdmin, aoRenomear, aoRemover }: Props) {
  const [modo, setModo] = useState<'ver' | 'renomear' | 'remover'>('ver');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (!canal) {
    return (
      <section className="canal-aberto vazio">
        <p className="suave">Nenhum canal de texto. Crie um na barra ao lado.</p>
      </section>
    );
  }

  return (
    <section className="canal-aberto" aria-labelledby="titulo-canal">
      <header className="canal-topo">
        {modo === 'renomear' ? (
          <FormNome
            key={canal.id}
            rotulo="Novo nome do canal"
            inicial={canal.nome}
            textoBotao="Salvar"
            aoCancelar={() => setModo('ver')}
            aoEnviar={async (nome) => {
              const falha = await aoRenomear(canal.id, nome);
              if (!falha) setModo('ver');
              return falha;
            }}
          />
        ) : (
          <h2 id="titulo-canal">
            <span aria-hidden="true">#</span> {canal.nome}
          </h2>
        )}
        {modo === 'ver' && (
          <div className="canal-acoes">
            <button type="button" className="secundario" onClick={() => setModo('renomear')}>
              Renomear
            </button>
            {ehAdmin && (
              <button type="button" className="secundario" onClick={() => setModo('remover')}>
                Remover canal
              </button>
            )}
          </div>
        )}
        {modo === 'remover' && (
          <div className="confirmar" role="group" aria-label="Confirmar remoção do canal">
            <span>Remover #{canal.nome} e todo o histórico?</span>
            <button
              type="button"
              className="perigo"
              disabled={enviando}
              onClick={async () => {
                setEnviando(true);
                const falha = await aoRemover(canal.id);
                setEnviando(false);
                setErro(falha);
                setModo('ver');
              }}
            >
              Confirmar remoção
            </button>
            <button type="button" className="secundario" onClick={() => setModo('ver')}>
              Cancelar
            </button>
          </div>
        )}
      </header>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <div className="mensagens" aria-label={`Mensagens de #${canal.nome}`}>
        <p className="suave">Nenhuma mensagem ainda em #{canal.nome}.</p>
      </div>
    </section>
  );
}
