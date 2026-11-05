import { useState } from 'react';
import type { CanalDto, TipoCanal } from '@tofalando/shared';
import { FormNome } from './FormNome';

interface Props {
  nomeServidor: string;
  canais: CanalDto[];
  canalAtivo: number | null;
  ehAdmin: boolean;
  aoAbrir: (id: number) => void;
  aoCriar: (tipo: TipoCanal, nome: string) => Promise<string | null>;
  aoRenomear: (id: number, nome: string) => Promise<string | null>;
  aoRemover: (id: number) => Promise<string | null>;
}

const TITULOS: Record<TipoCanal, string> = { texto: 'Canais de texto', voz: 'Canais de voz' };

/** Canal de voz na barra: renomear (qualquer membro) e remover (só administrador, com confirmação). */
function ItemVoz({ canal, ehAdmin, aoRenomear, aoRemover }: { canal: CanalDto } & Pick<Props, 'ehAdmin' | 'aoRenomear' | 'aoRemover'>) {
  const [modo, setModo] = useState<'ver' | 'renomear' | 'remover'>('ver');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (modo === 'renomear') {
    return (
      <FormNome
        rotulo={`Novo nome do canal de voz ${canal.nome}`}
        inicial={canal.nome}
        textoBotao="Salvar"
        aoCancelar={() => setModo('ver')}
        aoEnviar={async (nome) => {
          const falha = await aoRenomear(canal.id, nome);
          if (!falha) setModo('ver');
          return falha;
        }}
      />
    );
  }

  return (
    <div className="item-voz">
      <span className="canal voz">
        <span aria-hidden="true">🔊</span> {canal.nome}
      </span>
      {modo === 'ver' ? (
        <span className="item-acoes">
          <button type="button" className="icone" aria-label={`Renomear canal de voz ${canal.nome}`} title="Renomear" onClick={() => setModo('renomear')}>
            ✎
          </button>
          {ehAdmin && (
            <button type="button" className="icone" aria-label={`Remover canal de voz ${canal.nome}`} title="Remover" onClick={() => setModo('remover')}>
              ×
            </button>
          )}
        </span>
      ) : (
        <span className="confirmar" role="group" aria-label={`Confirmar remoção de ${canal.nome}`}>
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
        </span>
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}

/** RF-7: lista de canais de texto e de voz; qualquer membro cria e renomeia, só administrador remove (RN-7). */
export function BarraLateral({ nomeServidor, canais, canalAtivo, ehAdmin, aoAbrir, aoCriar, aoRenomear, aoRemover }: Props) {
  const [criando, setCriando] = useState<TipoCanal | null>(null);

  return (
    <nav className="barra-lateral" aria-label="Canais">
      <h1 className="nome-servidor">{nomeServidor}</h1>
      {(['texto', 'voz'] as const).map((tipo) => (
        <section key={tipo} className="grupo-canais" aria-labelledby={`grupo-${tipo}`}>
          <div className="grupo-topo">
            <h2 id={`grupo-${tipo}`}>{TITULOS[tipo]}</h2>
            <button type="button" className="icone" aria-label={`Criar canal de ${tipo}`} title={`Criar canal de ${tipo}`} onClick={() => setCriando(tipo)}>
              +
            </button>
          </div>
          {criando === tipo && (
            <FormNome
              rotulo={`Nome do novo canal de ${tipo}`}
              textoBotao="Criar"
              aoCancelar={() => setCriando(null)}
              aoEnviar={async (nome) => {
                const falha = await aoCriar(tipo, nome);
                if (!falha) setCriando(null);
                return falha;
              }}
            />
          )}
          <ul aria-label={TITULOS[tipo]}>
            {canais
              .filter((c) => c.tipo === tipo)
              .map((c) => (
                <li key={c.id}>
                  {tipo === 'texto' ? (
                    <button
                      type="button"
                      className={`canal${c.id === canalAtivo ? ' ativo' : ''}`}
                      aria-current={c.id === canalAtivo ? 'page' : undefined}
                      onClick={() => aoAbrir(c.id)}
                    >
                      <span aria-hidden="true">#</span> {c.nome}
                    </button>
                  ) : (
                    <ItemVoz canal={c} ehAdmin={ehAdmin} aoRenomear={aoRenomear} aoRemover={aoRemover} />
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
