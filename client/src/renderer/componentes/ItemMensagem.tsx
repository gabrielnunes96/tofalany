import { useContext, useState, type KeyboardEvent } from 'react';
import { textoSemGif, validarTextoMensagem, type MensagemDto, type UsuarioDto } from '@tofalando/shared';
import { Avatar } from './Avatar';
import { ListaAnexos } from './Anexos';
import { CartaoPrevia, linksDoTexto, TextoComLinks, type MencoesDoTexto } from './Previa';
import { ATALHOS_REACAO, Reacoes } from './Reacoes';
import { SeletorEmoji } from './SeletorEmoji';
import { TrechoResposta } from './TrechoResposta';
import { GifMensagem } from './GifMensagem';
import { ContextoPerfil } from './ContextoPerfil';
import { guardarRecente } from '../servicos/emojis';

interface Props {
  mensagem: MensagemDto;
  autor: UsuarioDto | undefined;
  servidorUrl: string;
  podeEditar: boolean;
  podeApagar: boolean;
  aoEditar: (id: number, texto: string) => Promise<string | null>;
  aoApagar: (id: number) => Promise<string | null>;
  /** Para mostrar as menções: as pessoas (por id) e quem sou eu. */
  usuarios?: Map<number, UsuarioDto>;
  euId?: number;
  /** Quem pode escrever ali também reage (RN-1). Devolve a mensagem de erro ou null. */
  aoReagir?: (id: number, emoji: string) => Promise<string | null>;
  /** Responder (RF-6): abre a faixa no compositor. Sem ele (só leitura), não aparece. */
  aoResponder?: (m: MensagemDto) => void;
  /** Ir até a original de uma resposta (RF-7). */
  aoIrPara?: (id: number) => void;
  /** Destaque de alguns segundos ao chegar nela por uma resposta. */
  destacada?: boolean;
  /** chat-fixar-e-buscar: está na lista de fixadas da conversa. */
  fixada?: boolean;
  /** Fixar/desafixar (só quem pode). Devolve a mensagem de erro ou null. */
  aoFixar?: (id: number, fixar: boolean) => Promise<string | null>;
}

const horario = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Uma mensagem com editar (autor) e apagar (autor ou administrador em canal) — RF-11, RN-9. */
export function ItemMensagem(props: Props) {
  // Linha de sistema "fulano fixou uma mensagem" (chat-fixar-e-buscar): sem ações, clicável até a fixada.
  if (props.mensagem.fixou) return <LinhaFixou {...props} />;
  return <MensagemComum {...props} />;
}

function LinhaFixou({ mensagem: m, autor, aoIrPara, destacada = false }: Props) {
  const nome = autor?.nomeExibicao ?? 'conta removida';
  const ref = m.fixou!;
  return (
    <li className={`mensagem linha-sistema${destacada ? ' destacada' : ''}`} aria-label={`${nome} fixou uma mensagem`} data-mensagem-id={m.id}>
      <span aria-hidden="true">📌</span>
      <span>
        <strong>{nome}</strong> fixou{' '}
        {ref.apagada || !aoIrPara ? (
          <span>{ref.apagada ? 'uma mensagem (apagada)' : 'uma mensagem'}</span>
        ) : (
          <button type="button" className="link" onClick={() => aoIrPara(ref.mensagemId)}>
            uma mensagem
          </button>
        )}
        .
      </span>
      <time dateTime={new Date(m.criadaEm).toISOString()}>{horario.format(m.criadaEm)}</time>
    </li>
  );
}

function MensagemComum({
  mensagem: m,
  autor,
  servidorUrl,
  podeEditar,
  podeApagar,
  aoEditar,
  aoApagar,
  usuarios,
  euId,
  aoReagir,
  aoResponder,
  aoIrPara,
  destacada = false,
  fixada = false,
  aoFixar,
}: Props) {
  const mencoes: MencoesDoTexto | undefined =
    m.mencoes?.length || m.mencionaTodos
      ? {
          nomes: new Map(
            (m.mencoes ?? []).flatMap((id) => {
              const u = usuarios?.get(id);
              return u ? [[u.usuario.toLowerCase(), { nome: u.nomeExibicao, eu: id === euId, id }] as const] : [];
            }),
          ),
          todos: !!m.mencionaTodos,
        }
      : undefined;
  const mencionouMe = euId !== undefined && m.autorId !== euId && (m.mencoes?.includes(euId) || !!m.mencionaTodos);
  const abrirPerfil = useContext(ContextoPerfil);
  const [modo, setModo] = useState<'ver' | 'editar' | 'apagar'>('ver');
  // Com GIF, o texto do servidor termina com o endereço dele (para os apps antigos): aqui fica só o que a pessoa escreveu.
  const proprio = textoSemGif(m.texto, m.gif);
  const [texto, setTexto] = useState(proprio);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [seletor, setSeletor] = useState(false);
  const [erroReacao, setErroReacao] = useState<string | null>(null);
  /** Quem abriu o painel (Reagir ou "+") recebe o foco de volta ao fechar. */
  const [quemAbriu, setQuemAbriu] = useState<HTMLElement | null>(null);
  const podeReagir = !!aoReagir;

  /** Reagir e o "+" alternam o painel. */
  function alternarSeletor(botao: HTMLElement) {
    if (seletor) return fecharSeletor(true);
    setQuemAbriu(botao);
    setSeletor(true);
  }

  /** Esc e escolher devolvem o foco a quem abriu; o clique fora deixa o foco onde a pessoa clicou. */
  function fecharSeletor(devolverFoco: boolean) {
    setSeletor(false);
    const alvo = quemAbriu;
    setQuemAbriu(null);
    if (alvo && devolverFoco) requestAnimationFrame(() => alvo.isConnected && alvo.focus());
  }

  async function reagir(emoji: string) {
    if (seletor) fecharSeletor(true);
    // Só pôr a reação (não tirar) e só se o servidor aceitou entra nos usados recentemente.
    const poe = euId === undefined || !m.reacoes?.some((r) => r.emoji === emoji && r.usuarios.includes(euId));
    const falha = (await aoReagir?.(m.id, emoji)) ?? null;
    setErroReacao(falha);
    if (!falha && poe) guardarRecente(emoji);
  }

  async function salvar() {
    const v = validarTextoMensagem(texto);
    // Com GIF, o texto pode ficar vazio (a mensagem continua com o GIF).
    const vazioComGif = !!m.gif && !texto.trim();
    if (!v.ok && !vazioComGif) return setErro(v.erro);
    setOcupado(true);
    const falha = await aoEditar(m.id, v.ok ? v.valor : '');
    setOcupado(false);
    setErro(falha);
    if (!falha) setModo('ver');
  }

  function cancelarEdicao() {
    setTexto(proprio);
    setErro(null);
    setModo('ver');
  }

  function teclas(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') cancelarEdicao();
    else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void salvar();
    }
  }

  async function apagar() {
    setOcupado(true);
    const falha = await aoApagar(m.id);
    setOcupado(false);
    // Deu certo: a mensagem sai da lista e este item desmonta.
    if (falha) {
      setErro(falha);
      setModo('ver');
    }
  }

  return (
    <li
      className={`mensagem${mencionouMe ? ' mencionou-me' : ''}${destacada ? ' destacada' : ''}`}
      aria-label={`Mensagem de ${autor?.nomeExibicao ?? 'conta removida'}`}
      data-mensagem-id={m.id}
    >
      {abrirPerfil ? (
        <button
          type="button"
          className="mensagem-foto"
          tabIndex={-1}
          aria-label={`Perfil de ${autor?.nomeExibicao ?? 'conta removida'}`}
          onClick={(e) => abrirPerfil(m.autorId, e.currentTarget)}
        >
          <Avatar usuario={autor ?? { nomeExibicao: '?', cor: '#3a2f5c', avatarUrl: null }} servidorUrl={servidorUrl} tamanho={36} />
        </button>
      ) : (
        <Avatar usuario={autor ?? { nomeExibicao: '?', cor: '#3a2f5c', avatarUrl: null }} servidorUrl={servidorUrl} tamanho={36} />
      )}
      <div className="mensagem-corpo">
        <div className="mensagem-topo">
          {abrirPerfil ? (
            <button
              type="button"
              className={autor ? 'autor autor-botao' : 'autor removido autor-botao'}
              onClick={(e) => abrirPerfil(m.autorId, e.currentTarget)}
            >
              {autor ? autor.nomeExibicao : 'conta removida'}
            </button>
          ) : (
            <span className={autor ? 'autor' : 'autor removido'}>{autor ? autor.nomeExibicao : 'conta removida'}</span>
          )}
          <time dateTime={new Date(m.criadaEm).toISOString()}>{horario.format(m.criadaEm)}</time>
          {m.editadaEm !== null && <span className="editada">(editada)</span>}
          {fixada && (
            <span className="selo-fixada" title="Mensagem fixada">
              📌 fixada
            </span>
          )}
          {modo === 'ver' && (podeEditar || podeApagar || podeReagir || !!aoResponder || !!aoFixar) && (
            <span className="mensagem-acoes">
              {podeReagir && (
                <>
                  {ATALHOS_REACAO.map((e) => (
                    <button key={e} type="button" className="icone atalho-reacao" aria-label={`Reagir com ${e}`} onClick={() => void reagir(e)}>
                      {e}
                    </button>
                  ))}
                  <button type="button" className="icone" aria-expanded={seletor} onClick={(e) => alternarSeletor(e.currentTarget)}>
                    Reagir
                  </button>
                </>
              )}
              {aoResponder && (
                <button type="button" className="icone" onClick={() => aoResponder(m)}>
                  Responder
                </button>
              )}
              {aoFixar && (
                <button type="button" className="icone" onClick={() => void aoFixar(m.id, !fixada).then((falha) => setErroReacao(falha))}>
                  {fixada ? 'Desafixar' : 'Fixar'}
                </button>
              )}
              {podeEditar && (
                <button
                  type="button"
                  className="icone"
                  onClick={() => {
                    setTexto(proprio);
                    setModo('editar');
                  }}
                >
                  Editar
                </button>
              )}
              {podeApagar && (
                <button type="button" className="icone" onClick={() => setModo('apagar')}>
                  Apagar
                </button>
              )}
            </span>
          )}
        </div>
        {m.resposta && <TrechoResposta resposta={m.resposta} usuarios={usuarios} euId={euId} aoIrPara={aoIrPara} />}
        {modo === 'editar' ? (
          <div className="mensagem-edicao">
            <textarea aria-label="Editar mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={teclas} maxLength={4000} autoFocus />
            <p className="suave dica">Enter salva · Esc cancela</p>
            <div className="form-nome-botoes">
              <button type="button" onClick={() => void salvar()} disabled={ocupado}>
                Salvar
              </button>
              <button type="button" className="secundario" onClick={cancelarEdicao}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          proprio && (
            <>
              <p className="mensagem-texto">
                <TextoComLinks texto={proprio} mencoes={mencoes} />
              </p>
              {linksDoTexto(proprio)[0] && <CartaoPrevia url={linksDoTexto(proprio)[0]!} />}
            </>
          )
        )}
        {m.gif && <GifMensagem gif={m.gif} />}
        <ListaAnexos anexos={m.anexos} servidorUrl={servidorUrl} />
        <Reacoes
          reacoes={m.reacoes ?? []}
          usuarios={usuarios}
          euId={euId}
          podeReagir={podeReagir}
          aoAlternar={(e) => void reagir(e)}
          aoAbrirSeletor={alternarSeletor}
          seletorAberto={seletor}
        />
        {seletor && <SeletorEmoji aoEscolher={(e) => void reagir(e)} aoFechar={fecharSeletor} ancora={quemAbriu} />}
        {erroReacao && (
          <p className="erro" role="alert">
            {erroReacao}
          </p>
        )}
        {modo === 'apagar' && (
          <div className="confirmar" role="group" aria-label="Confirmar exclusão da mensagem">
            <span>Apagar esta mensagem?</span>
            <button type="button" className="perigo" onClick={() => void apagar()} disabled={ocupado}>
              Confirmar
            </button>
            <button type="button" className="secundario" onClick={() => setModo('ver')}>
              Cancelar
            </button>
          </div>
        )}
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </li>
  );
}
