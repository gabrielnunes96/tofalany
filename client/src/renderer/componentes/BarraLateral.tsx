import { useState } from 'react';
import type { CanalDto, DmDto, TipoCanal, UsuarioDto, VozEstadoDto } from '@tofalando/shared';
import { Avatar } from './Avatar';
import { StatusPonto } from './StatusPonto';
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
  dms: DmDto[];
  usuarios: UsuarioDto[];
  dmAtiva: number | null;
  aoAbrirDm: (id: number) => void;
  /** RF-12: não lidas por conversa ("c:<id>" / "d:<id>"). */
  naoLidas?: Partial<Record<string, number>>;
  /** RF-13: quem está em cada canal de voz, quem fala e onde eu estou. */
  voz?: VozEstadoDto[];
  falando?: number[];
  minhaVoz?: number | null;
  servidorUrl?: string;
  aoEntrarVoz?: (canalId: number) => void;
  /** RF-19/RF-38: ajustes de quem está no meu canal de voz (só neste computador). */
  euId?: number;
  pessoasVoz?: { volumes: Record<string, number>; silenciados: number[] };
  aoVolumePessoa?: (usuarioId: number, volume: number) => void;
  aoSilenciarPessoa?: (usuarioId: number, silenciar: boolean) => void;
  /** RF-37: status de quem não está offline. */
  presencas?: Partial<Record<number, 'online' | 'ausente'>>;
  /** RF-40: conversas com notificações silenciadas ("c:<id>"/"d:<id>"). */
  silenciadas?: string[];
}

/** Bolinha com o número de não lidas (99+ acima disso). */
function Contador({ n }: { n: number | undefined }) {
  if (!n) return null;
  return (
    <span className="contador">
      <span aria-hidden="true">{n > 99 ? '99+' : n}</span>
      <span className="so-leitor">{`${n} não ${n === 1 ? 'lida' : 'lidas'}`}</span>
    </span>
  );
}

/** RF-40: ícone de conversa silenciada (o estado completo fica no botão do topo da conversa). */
function Silenciada() {
  return (
    <>
      <span className="silenciada" title="Notificações silenciadas" aria-hidden="true">
        🔕
      </span>
      <span className="so-leitor">, silenciada</span>
    </>
  );
}

const TITULOS: Record<TipoCanal, string> = {
  texto: 'Canais de texto',
  voz: 'Canais de voz',
};

/** Canal de voz na barra: renomear (qualquer membro) e remover (só administrador, com confirmação). */
interface PropsItemVoz extends Pick<
  Props,
  'ehAdmin' | 'aoRenomear' | 'aoRemover' | 'aoEntrarVoz' | 'servidorUrl' | 'euId' | 'pessoasVoz' | 'aoVolumePessoa' | 'aoSilenciarPessoa'
> {
  canal: CanalDto;
  presentes: { usuario: UsuarioDto; estado: VozEstadoDto; falando: boolean }[];
  aqui: boolean;
}

/** Quem está no canal de voz, com o indicador de fala (RF-13) e ícones de mute/deafen. */
/** Volume (0–200%) e silenciar uma pessoa, só neste computador (RF-19, RF-38). */
function AjustesPessoa({
  usuario,
  volume,
  silenciado,
  aoVolume,
  aoSilenciar,
}: {
  usuario: UsuarioDto;
  volume: number;
  silenciado: boolean;
  aoVolume: (v: number) => void;
  aoSilenciar: (s: boolean) => void;
}) {
  const nome = usuario.nomeExibicao;
  const porcento = Math.round(volume * 100);
  return (
    <div className="ajustes-pessoa" role="group" id={`ajustes-${usuario.id}`} aria-label={`Ajustes de voz de ${nome}`}>
      <label htmlFor={`volume-${usuario.id}`}>
        Volume de {nome}{' '}
        <span className="suave" aria-hidden="true">
          {porcento}%
        </span>
      </label>
      <input
        id={`volume-${usuario.id}`}
        type="range"
        min={0}
        max={200}
        step={5}
        value={porcento}
        aria-valuetext={`${porcento}%`}
        onChange={(e) => aoVolume(Number(e.target.value) / 100)}
      />
      <button type="button" className={silenciado ? 'perigo' : 'secundario'} aria-pressed={silenciado} onClick={() => aoSilenciar(!silenciado)}>
        Silenciar {nome}
      </button>
    </div>
  );
}

function PresentesVoz({
  canal,
  presentes,
  servidorUrl,
  aqui,
  euId,
  pessoasVoz,
  aoVolumePessoa,
  aoSilenciarPessoa,
}: Pick<PropsItemVoz, 'canal' | 'presentes' | 'servidorUrl' | 'aqui' | 'euId' | 'pessoasVoz' | 'aoVolumePessoa' | 'aoSilenciarPessoa'>) {
  const [abertos, setAbertos] = useState<number | null>(null);
  if (presentes.length === 0) return null;
  return (
    <ul className="presentes-voz" aria-label={`Na voz em ${canal.nome}`}>
      {presentes.map(({ usuario, estado, falando }) => {
        const silenciado = !!pessoasVoz?.silenciados.includes(usuario.id);
        // Só ajusta quem eu ouço: gente do meu canal, menos eu.
        const ajustavel = aqui && usuario.id !== euId && !!aoVolumePessoa && !!aoSilenciarPessoa;
        return (
          <li key={usuario.id} className={falando ? 'falando' : undefined} aria-label={`${usuario.nomeExibicao}${falando ? ', falando' : ''}`}>
            <Avatar usuario={usuario} servidorUrl={servidorUrl ?? ''} tamanho={20} />
            <span className="nome">{usuario.nomeExibicao}</span>
            {silenciado && aqui && (
              <span role="img" title="Silenciado por você" aria-label="silenciado por você" className="silenciado">
                🔕
              </span>
            )}
            {estado.surdo ? (
              <span role="img" title="Sem áudio" aria-label="sem áudio">
                🔇
              </span>
            ) : (
              estado.mudo && (
                <span role="img" title="Microfone desligado" aria-label="microfone desligado">
                  🎙️✕
                </span>
              )
            )}
            {ajustavel && (
              <button
                type="button"
                className="icone"
                aria-expanded={abertos === usuario.id}
                aria-controls={abertos === usuario.id ? `ajustes-${usuario.id}` : undefined}
                aria-label={`Ajustes de voz de ${usuario.nomeExibicao}`}
                title="Volume e silenciar"
                onClick={() => setAbertos(abertos === usuario.id ? null : usuario.id)}
              >
                ⋯
              </button>
            )}
            {ajustavel && abertos === usuario.id && (
              <AjustesPessoa
                usuario={usuario}
                volume={pessoasVoz?.volumes[String(usuario.id)] ?? 1}
                silenciado={silenciado}
                aoVolume={(v) => aoVolumePessoa!(usuario.id, v)}
                aoSilenciar={(sim) => aoSilenciarPessoa!(usuario.id, sim)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ItemVoz({ canal, ehAdmin, aoRenomear, aoRemover, aoEntrarVoz, presentes, aqui, servidorUrl, ...pessoas }: PropsItemVoz) {
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
      <button
        type="button"
        className={`canal voz${aqui ? ' ativo' : ''}`}
        aria-current={aqui ? 'true' : undefined}
        aria-label={aqui ? `${canal.nome}, você está aqui` : `Entrar no canal de voz ${canal.nome}`}
        title={aqui ? 'Você está neste canal' : 'Entrar'}
        onClick={() => {
          if (!aqui) aoEntrarVoz?.(canal.id);
        }}
      >
        <span aria-hidden="true">🔊</span> {canal.nome}
      </button>
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
      <PresentesVoz canal={canal} presentes={presentes} servidorUrl={servidorUrl} aqui={aqui} {...pessoas} />
    </div>
  );
}

/** RF-7: lista de canais de texto e de voz; qualquer membro cria e renomeia, só administrador remove (RN-7). */
export function BarraLateral({
  nomeServidor,
  canais,
  canalAtivo,
  ehAdmin,
  aoAbrir,
  aoCriar,
  aoRenomear,
  aoRemover,
  dms,
  usuarios,
  dmAtiva,
  aoAbrirDm,
  naoLidas = {},
  voz = [],
  falando = [],
  minhaVoz = null,
  euId,
  pessoasVoz,
  aoVolumePessoa,
  aoSilenciarPessoa,
  servidorUrl,
  aoEntrarVoz,
  presencas = {},
  silenciadas = [],
}: Props) {
  const [criando, setCriando] = useState<TipoCanal | null>(null);
  const presentesEm = (canalId: number) =>
    voz.flatMap((estado) => {
      if (estado.canalVozId !== canalId) return [];
      const usuario = usuarios.find((u) => u.id === estado.usuarioId);
      return usuario ? [{ usuario, estado, falando: falando.includes(usuario.id) }] : [];
    });

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
                      {silenciadas.includes(`c:${c.id}`) && <Silenciada />}
                      <Contador n={naoLidas[`c:${c.id}`]} />
                    </button>
                  ) : (
                    <ItemVoz
                      canal={c}
                      ehAdmin={ehAdmin}
                      aoRenomear={aoRenomear}
                      aoRemover={aoRemover}
                      aoEntrarVoz={aoEntrarVoz}
                      presentes={presentesEm(c.id)}
                      euId={euId}
                      pessoasVoz={pessoasVoz}
                      aoVolumePessoa={aoVolumePessoa}
                      aoSilenciarPessoa={aoSilenciarPessoa}
                      aqui={minhaVoz === c.id}
                      servidorUrl={servidorUrl}
                    />
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section className="grupo-canais" aria-labelledby="grupo-dms">
        <div className="grupo-topo">
          <h2 id="grupo-dms">Mensagens diretas</h2>
        </div>
        {dms.length === 0 && <p className="suave dica-dm">Use ✉ na lista de membros para conversar só com uma pessoa.</p>}
        <ul aria-label="Mensagens diretas">
          {dms.map((d) => {
            const nome = usuarios.find((u) => u.id === d.outroId)?.nomeExibicao ?? 'conta removida';
            return (
              <li key={d.id}>
                <button
                  type="button"
                  className={`canal${d.id === dmAtiva ? ' ativo' : ''}`}
                  aria-current={d.id === dmAtiva ? 'page' : undefined}
                  onClick={() => aoAbrirDm(d.id)}
                >
                  <StatusPonto status={presencas[d.outroId] ?? 'offline'} oculto /> {nome}
                  <span className="so-leitor" id={`dm-status-${d.id}`}>
                    {presencas[d.outroId] ?? 'offline'}
                  </span>
                  {silenciadas.includes(`d:${d.id}`) && <Silenciada />}
                  <Contador n={naoLidas[`d:${d.id}`]} />
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </nav>
  );
}
