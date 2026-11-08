import { Icone } from './Icone';
import { useState } from 'react';
import type { AmizadeDto, CanalDto, DmDto, TipoCanal, TransmissaoDto, UsuarioDto, VozEstadoDto, StatusVisivel } from '@tofalando/shared';
import { Avatar } from './Avatar';
import { StatusPonto } from './StatusPonto';
import { FormNome } from './FormNome';

interface Props {
  /** Esconde a barra (o botão fica no topo dela; para mostrar de novo, o botão vai para o topo da conversa). */
  aoEsconder?: () => void;
  /** O que a barra mostra: canais (texto e voz) ou as conversas diretas. Sem `aoMudarAba`, a barra controla sozinha. */
  aba?: AbaBarra;
  aoMudarAba?: (aba: AbaBarra) => void;
  /** Começar conversa direta com alguém (amigo ou "Nova conversa" na aba Amigos). */
  aoConversarCom?: (usuarioId: number) => void;
  /** Amigos e pedidos (valem em todos os servidores) e as ações de amizade. */
  amizades?: AmizadeDto[];
  aoPedirAmizade?: (usuarioId: number) => void;
  aoAceitarAmizade?: (usuarioId: number) => void;
  aoRemoverAmizade?: (usuarioId: number) => void;
  /** Clique direito numa pessoa (na sala de voz): abre o menu dela (volume, mensagem, amizade). */
  aoMenuPessoa?: (usuarioId: number, x: number, y: number) => void;
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
  presencas?: Partial<Record<number, StatusVisivel>>;
  /** RF-40: conversas com notificações silenciadas ("c:<id>"/"d:<id>"). */
  silenciadas?: string[];
  /** RN-10: quem transmite a tela em cada canal de voz. */
  transmissoes?: TransmissaoDto[];
}

/** Bolinha com o número de não lidas (99+ acima disso). */
export type AbaBarra = 'canais' | 'diretas';

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
  'ehAdmin' | 'aoRenomear' | 'aoRemover' | 'aoEntrarVoz' | 'servidorUrl' | 'euId' | 'pessoasVoz' | 'aoVolumePessoa' | 'aoSilenciarPessoa' | 'aoMenuPessoa'
> {
  canal: CanalDto;
  presentes: {
    usuario: UsuarioDto;
    estado: VozEstadoDto;
    falando: boolean;
    transmite: boolean;
  }[];
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
  aoMenuPessoa,
}: Pick<PropsItemVoz, 'canal' | 'presentes' | 'servidorUrl' | 'aqui' | 'euId' | 'pessoasVoz' | 'aoVolumePessoa' | 'aoSilenciarPessoa' | 'aoMenuPessoa'>) {
  const [abertos, setAbertos] = useState<number | null>(null);
  if (presentes.length === 0) return null;
  return (
    <ul className="presentes-voz" aria-label={`Na voz em ${canal.nome}`}>
      {presentes.map(({ usuario, estado, falando, transmite }) => {
        const silenciado = !!pessoasVoz?.silenciados.includes(usuario.id);
        // Só ajusta quem eu ouço: gente do meu canal, menos eu.
        const ajustavel = aqui && usuario.id !== euId && !!aoVolumePessoa && !!aoSilenciarPessoa;
        return (
          <li
            key={usuario.id}
            className={falando ? 'falando' : undefined}
            aria-label={`${usuario.nomeExibicao}${falando ? ', falando' : ''}`}
            onContextMenu={
              aoMenuPessoa
                ? (e) => {
                    e.preventDefault();
                    aoMenuPessoa(usuario.id, e.clientX, e.clientY);
                  }
                : undefined
            }
          >
            <Avatar usuario={usuario} servidorUrl={servidorUrl ?? ''} tamanho={20} />
            <span className="nome">{usuario.nomeExibicao}</span>
            {silenciado && aqui && (
              <span role="img" title="Silenciado por você" aria-label="silenciado por você" className="silenciado">
                🔕
              </span>
            )}
            {transmite && (
              <span role="img" title="Transmitindo a tela" aria-label="transmitindo a tela">
                🖥️
              </span>
            )}
            {estado.camera && (
              <span role="img" title="Câmera ligada" aria-label="câmera ligada">
                📹
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
  transmissoes = [],
  aoEsconder,
  aba: abaControlada,
  aoMudarAba,
  aoConversarCom,
  amizades = [],
  aoPedirAmizade,
  aoAceitarAmizade,
  aoRemoverAmizade,
  aoMenuPessoa,
}: Props) {
  const [abaLocal, setAbaLocal] = useState<AbaBarra>('canais');
  const aba = abaControlada ?? abaLocal;
  const mudarAba = (a: AbaBarra) => (aoMudarAba ? aoMudarAba(a) : setAbaLocal(a));
  const soma = (prefixo: string) => Object.entries(naoLidas).reduce((t, [k, n]) => (k.startsWith(prefixo) ? t + (n ?? 0) : t), 0);
  const naoLidasCanais = soma('c:');
  const naoLidasDiretas = soma('d:');
  const [criando, setCriando] = useState<TipoCanal | null>(null);
  const presentesEm = (canalId: number) =>
    voz.flatMap((estado) => {
      if (estado.canalVozId !== canalId) return [];
      const usuario = usuarios.find((u) => u.id === estado.usuarioId);
      return usuario
        ? [
            {
              usuario,
              estado,
              falando: falando.includes(usuario.id),
              transmite: transmissoes.some((t) => t.canalVozId === canalId && t.usuarioId === usuario.id),
            },
          ]
        : [];
    });

  return (
    <nav className="barra-lateral" aria-label="Canais">
      <div className="topo-barra">
        <h1 className="nome-servidor">{nomeServidor}</h1>
        {aoEsconder && (
          <button type="button" className="icone esconder-canais" aria-label="Esconder canais" title="Esconder a barra de canais (Ctrl+B)" onClick={aoEsconder}>
            <Icone nome="painelEsquerdo" />
          </button>
        )}
      </div>
      <div className="abas-barra" role="tablist" aria-label="Ver na barra">
        <button type="button" role="tab" aria-selected={aba === 'canais'} className={aba === 'canais' ? 'ativa' : undefined} onClick={() => mudarAba('canais')}>
          <Icone nome="hashtag" tamanho={15} /> Canais
          <Contador n={aba === 'canais' ? undefined : naoLidasCanais} />
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'diretas'}
          className={aba === 'diretas' ? 'ativa' : undefined}
          onClick={() => mudarAba('diretas')}
        >
          <Icone nome="pessoas" tamanho={15} /> Amigos
          <Contador n={naoLidasDiretas + amizades.filter((a) => a.situacao === 'recebido').length} />
        </button>
      </div>
      {aba === 'canais' &&
        (['texto', 'voz'] as const).map((tipo) => (
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
                        aoMenuPessoa={aoMenuPessoa}
                        aqui={minhaVoz === c.id}
                        servidorUrl={servidorUrl}
                      />
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      {aba === 'diretas' && (
        <AbaAmigos
          dms={dms}
          usuarios={usuarios}
          dmAtiva={dmAtiva}
          naoLidas={naoLidas}
          presencas={presencas}
          silenciadas={silenciadas}
          servidorUrl={servidorUrl ?? ''}
          euId={euId}
          amizades={amizades}
          aoAbrirDm={aoAbrirDm}
          aoConversarCom={aoConversarCom}
          aoPedirAmizade={aoPedirAmizade}
          aoAceitarAmizade={aoAceitarAmizade}
          aoRemoverAmizade={aoRemoverAmizade}
          aoMenuPessoa={aoMenuPessoa}
        />
      )}
    </nav>
  );
}

/**
 * Aba Amigos (no lugar de Diretas): pedidos recebidos e enviados, amigos com status (clicar abre a conversa) e as
 * conversas com quem não é amigo em "Outras conversas". Amizade vale em todos os servidores da instalação.
 */
function AbaAmigos({
  dms,
  usuarios,
  dmAtiva,
  naoLidas,
  presencas,
  silenciadas,
  servidorUrl,
  euId,
  amizades,
  aoAbrirDm,
  aoConversarCom,
  aoPedirAmizade,
  aoAceitarAmizade,
  aoRemoverAmizade,
  aoMenuPessoa,
}: {
  dms: DmDto[];
  usuarios: UsuarioDto[];
  dmAtiva: number | null;
  naoLidas: Partial<Record<string, number>>;
  presencas: Partial<Record<number, StatusVisivel>>;
  silenciadas: string[];
  servidorUrl: string;
  euId?: number;
  amizades: AmizadeDto[];
  aoAbrirDm: (id: number) => void;
  aoConversarCom?: (usuarioId: number) => void;
  aoPedirAmizade?: (usuarioId: number) => void;
  aoAceitarAmizade?: (usuarioId: number) => void;
  aoRemoverAmizade?: (usuarioId: number) => void;
  aoMenuPessoa?: (usuarioId: number, x: number, y: number) => void;
}) {
  const [adicionando, setAdicionando] = useState(false);
  const pessoa = (id: number) => usuarios.find((u) => u.id === id);
  const situacao = new Map(amizades.map((a) => [a.usuarioId, a.situacao]));
  const amigos = amizades.filter((a) => a.situacao === 'amigo').map((a) => pessoa(a.usuarioId)).filter((u): u is UsuarioDto => !!u);
  const recebidos = amizades.filter((a) => a.situacao === 'recebido');
  const enviados = amizades.filter((a) => a.situacao === 'enviado');
  const dmDe = (id: number) => dms.find((d) => d.outroId === id);
  const outras = dms.filter((d) => situacao.get(d.outroId) !== 'amigo');
  const ordem: Record<string, number> = { online: 0, naoIncomodar: 1, ausente: 2 };
  amigos.sort((a, b) => (ordem[presencas[a.id] ?? 'offline'] ?? 3) - (ordem[presencas[b.id] ?? 'offline'] ?? 3) || a.nomeExibicao.localeCompare(b.nomeExibicao));
  const menu = (id: number) => (e: React.MouseEvent) => {
    if (!aoMenuPessoa) return;
    e.preventDefault();
    aoMenuPessoa(id, e.clientX, e.clientY);
  };
  const linhaPessoa = (u: UsuarioDto | undefined, id: number) => (
    <>
      {u ? (
        <span className="avatar-com-status">
          <Avatar usuario={u} servidorUrl={servidorUrl} tamanho={24} />
          <StatusPonto status={presencas[id] ?? 'offline'} oculto />
        </span>
      ) : (
        <StatusPonto status={presencas[id] ?? 'offline'} oculto />
      )}{' '}
      <span className="nome-dm">{u?.nomeExibicao ?? 'conta removida'}</span>
    </>
  );

  return (
    <section className="grupo-canais grupo-dms" aria-labelledby="grupo-amigos">
      {recebidos.length > 0 && (
        <>
          <div className="grupo-topo">
            <h2>Pedidos de amizade</h2>
          </div>
          <ul className="pedidos-amizade" aria-label="Pedidos de amizade">
            {recebidos.map((a) => (
              <li key={a.usuarioId}>
                {linhaPessoa(pessoa(a.usuarioId), a.usuarioId)}
                <button type="button" className="icone aceitar" aria-label={`Aceitar ${pessoa(a.usuarioId)?.nomeExibicao ?? ''}`} title="Aceitar" onClick={() => aoAceitarAmizade?.(a.usuarioId)}>
                  ✓
                </button>
                <button type="button" className="icone recusar" aria-label={`Recusar ${pessoa(a.usuarioId)?.nomeExibicao ?? ''}`} title="Recusar" onClick={() => aoRemoverAmizade?.(a.usuarioId)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="grupo-topo">
        <h2 id="grupo-amigos">Amigos{amigos.length ? ` — ${amigos.length}` : ''}</h2>
        {aoPedirAmizade && (
          <button type="button" className="icone" aria-expanded={adicionando} aria-label="Adicionar amigo" title="Adicionar amigo" onClick={() => setAdicionando(!adicionando)}>
            <Icone nome="mais" tamanho={16} />
          </button>
        )}
      </div>
      {adicionando && aoPedirAmizade && (
        <ul className="escolher-pessoa" aria-label="Adicionar amigo">
          {usuarios.filter((u) => u.id !== euId && !situacao.has(u.id)).length === 0 && <li className="suave">Todo mundo daqui já é seu amigo (ou tem pedido).</li>}
          {usuarios
            .filter((u) => u.id !== euId && !situacao.has(u.id))
            .map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  className="canal"
                  onClick={() => {
                    setAdicionando(false);
                    aoPedirAmizade(u.id);
                  }}
                >
                  <Avatar usuario={u} servidorUrl={servidorUrl} tamanho={22} /> {u.nomeExibicao}
                </button>
              </li>
            ))}
        </ul>
      )}
      {amigos.length === 0 && !adicionando && <p className="suave dica-dm">Sem amigos ainda. Use o + ou clique com o botão direito em alguém.</p>}
      <ul aria-label="Amigos">
        {amigos.map((u) => {
          const dm = dmDe(u.id);
          return (
            <li key={u.id} onContextMenu={menu(u.id)}>
              <button
                type="button"
                className={`canal${dm && dm.id === dmAtiva ? ' ativo' : ''}`}
                aria-current={dm && dm.id === dmAtiva ? 'page' : undefined}
                onClick={() => (dm ? aoAbrirDm(dm.id) : aoConversarCom?.(u.id))}
              >
                {linhaPessoa(u, u.id)}
                {dm && silenciadas.includes(`d:${dm.id}`) && <Silenciada />}
                <Contador n={dm ? naoLidas[`d:${dm.id}`] : undefined} />
              </button>
            </li>
          );
        })}
      </ul>
      {enviados.length > 0 && (
        <p className="suave pedidos-enviados">
          Aguardando: {enviados.map((a) => pessoa(a.usuarioId)?.nomeExibicao ?? 'alguém').join(', ')}
        </p>
      )}
      <div className="grupo-topo">
        <h2>Outras conversas</h2>
      </div>
      {outras.length === 0 && <p className="suave dica-dm">Conversas com quem não é seu amigo aparecem aqui.</p>}
      <ul aria-label="Mensagens diretas">
        {outras.map((d) => (
          <li key={d.id} onContextMenu={menu(d.outroId)}>
            <button type="button" className={`canal${d.id === dmAtiva ? ' ativo' : ''}`} aria-current={d.id === dmAtiva ? 'page' : undefined} onClick={() => aoAbrirDm(d.id)}>
              {linhaPessoa(pessoa(d.outroId), d.outroId)}
              <span className="so-leitor">{presencas[d.outroId] ?? 'offline'}</span>
              {silenciadas.includes(`d:${d.id}`) && <Silenciada />}
              <Contador n={naoLidas[`d:${d.id}`]} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
