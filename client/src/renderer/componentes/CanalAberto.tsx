import { useState } from 'react';
import type { CanalDto, UsuarioDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';
import { FormNome } from './FormNome';
import { MensagensCanal } from './MensagensCanal';

interface Props {
  canal: CanalDto | undefined;
  ehAdmin: boolean;
  aoRenomear: (id: number, nome: string) => Promise<string | null>;
  aoRemover: (id: number) => Promise<string | null>;
  usuarios: UsuarioDto[];
  servidorUrl: string;
  api: Pick<ClienteApi, 'mensagensCanal'>;
  aoEnviar: (canalId: number, texto: string) => Promise<string | null>;
  euId: number;
  aoEditarMensagem: (id: number, texto: string) => Promise<string | null>;
  aoApagarMensagem: (id: number) => Promise<string | null>;
  aoDigitar: (canalId: number) => void;
}

/** Cabeçalho do canal de texto aberto (renomear, remover) e o chat dele. */
export function CanalAberto({
  canal,
  ehAdmin,
  aoRenomear,
  aoRemover,
  usuarios,
  servidorUrl,
  api,
  aoEnviar,
  euId,
  aoEditarMensagem,
  aoApagarMensagem,
  aoDigitar,
}: Props) {
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
      <MensagensCanal
        canal={canal}
        usuarios={usuarios}
        servidorUrl={servidorUrl}
        api={api}
        aoEnviar={(texto) => aoEnviar(canal.id, texto)}
        euId={euId}
        ehAdmin={ehAdmin}
        aoEditar={aoEditarMensagem}
        aoApagar={aoApagarMensagem}
        aoDigitar={() => aoDigitar(canal.id)}
      />
    </section>
  );
}
