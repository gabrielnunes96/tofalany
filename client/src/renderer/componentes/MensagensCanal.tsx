import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { DIGITANDO_INTERVALO_MS, validarTextoMensagem, type CanalDto, type UsuarioDto } from '@tofalando/shared';
import { useLoja } from '../estado/loja';
import type { ClienteApi } from '../servicos/api';
import { ErroApiCliente } from '../servicos/api';
import { ItemMensagem } from './ItemMensagem';

interface Props {
  canal: CanalDto;
  usuarios: UsuarioDto[];
  servidorUrl: string;
  api: Pick<ClienteApi, 'mensagensCanal'>;
  /** Envia pelo tempo real; devolve a mensagem de erro ou null. */
  aoEnviar: (texto: string) => Promise<string | null>;
  euId: number;
  ehAdmin: boolean;
  aoEditar: (id: number, texto: string) => Promise<string | null>;
  aoApagar: (id: number) => Promise<string | null>;
  aoDigitar: () => void;
}

/** "Ana está digitando…", "Ana e Bia estão digitando…", "Várias pessoas estão digitando…". */
export function textoDigitando(nomes: string[]): string | null {
  if (nomes.length === 0) return null;
  if (nomes.length === 1) return `${nomes[0]} está digitando…`;
  if (nomes.length <= 3) return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)} estão digitando…`;
  return 'Várias pessoas estão digitando…';
}

/** Perto do fim (px): mensagem nova rola a lista; mais acima, a pessoa está lendo o histórico. */
const PERTO_DO_FIM = 120;

/** RF-8: histórico com carga ao rolar para cima (CA-14) e envio de mensagens. */
export function MensagensCanal({ canal, usuarios, servidorUrl, api, aoEnviar, euId, ehAdmin, aoEditar, aoApagar, aoDigitar }: Props) {
  const historico = useLoja((s) => s.historicos[canal.id]);
  const digitandoAte = useLoja((s) => s.digitando[canal.id]);
  const [agora, setAgora] = useState(() => Date.now());
  const ultimoSinal = useRef(0);
  const lista = useRef<HTMLDivElement>(null);
  const topo = useRef<HTMLDivElement>(null);
  /** Altura antes de pôr mensagens antigas no topo, para manter a posição de leitura. */
  const alturaAntes = useRef<number | null>(null);
  const estavaNoFim = useRef(true);
  const [texto, setTexto] = useState('');
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(
    (antes?: number) => {
      const { iniciarCarga, receberPagina, falharCarga } = useLoja.getState();
      const geracao = iniciarCarga(canal.id);
      api
        .mensagensCanal(canal.id, antes)
        .then((pagina) => receberPagina(canal.id, pagina, geracao))
        .catch((e: unknown) => {
          alturaAntes.current = null;
          falharCarga(canal.id, e instanceof ErroApiCliente ? e.message : 'Não foi possível carregar as mensagens.', geracao);
        });
    },
    [api, canal.id],
  );

  // Primeira abertura do canal (ou depois de reconectar, quando o histórico foi descartado).
  useEffect(() => {
    if (!useLoja.getState().historicos[canal.id]) carregar();
  }, [canal.id, carregar, historico]);

  const carregarAnteriores = useCallback(
    (automatico: boolean) => {
      const h = useLoja.getState().historicos[canal.id];
      if (!h || h.fim || h.carregando || (automatico && h.erro)) return;
      alturaAntes.current = lista.current?.scrollHeight ?? null;
      carregar(h.mensagens[0]?.id);
    },
    [canal.id, carregar],
  );

  // Chegar ao topo da lista carrega as anteriores (o botão continua para teclado e leitor de tela).
  useEffect(() => {
    const alvo = topo.current;
    if (!alvo || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && carregarAnteriores(true), { root: lista.current });
    obs.observe(alvo);
    return () => obs.disconnect();
  }, [carregarAnteriores]);

  const mensagens = historico?.mensagens;
  const primeiroId = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = lista.current;
    if (!el) return;
    const primeiro = mensagens?.[0]?.id;
    const entrouNoTopo = primeiroId.current !== undefined && primeiro !== primeiroId.current;
    primeiroId.current = primeiro;
    // Só compensa quando chegaram mensagens antigas no topo (mensagem nova no fim não conta).
    if (alturaAntes.current !== null && entrouNoTopo) {
      el.scrollTop += el.scrollHeight - alturaAntes.current;
      alturaAntes.current = null;
    } else if (estavaNoFim.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [mensagens]);

  // Relógio para o aviso de "digitando" expirar sozinho (CA-17).
  const alguemDigitando = !!digitandoAte && Object.entries(digitandoAte).some(([id, ate]) => ate > agora && Number(id) !== euId);
  // Só roda enquanto alguém está de fato digitando; para sozinho quando o aviso expira.
  useEffect(() => {
    if (!alguemDigitando) return;
    const t = setInterval(() => setAgora(Date.now()), 500);
    return () => clearInterval(t);
  }, [alguemDigitando]);

  function mudarTexto(valor: string) {
    setTexto(valor);
    const t = Date.now();
    if (valor.trim() && t - ultimoSinal.current > DIGITANDO_INTERVALO_MS) {
      ultimoSinal.current = t;
      aoDigitar();
    }
  }

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    const v = validarTextoMensagem(texto);
    if (!v.ok) return;
    setEnviando(true);
    setErroEnvio(null);
    const falha = await aoEnviar(v.valor);
    setEnviando(false);
    if (falha) setErroEnvio(falha);
    else {
      setTexto('');
      ultimoSinal.current = 0;
      estavaNoFim.current = true;
    }
  }

  function teclas(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void enviar();
    }
  }

  const porId = new Map(usuarios.map((u) => [u.id, u]));

  return (
    <div className="chat">
      <div
        className="mensagens"
        ref={lista}
        onScroll={(e) => {
          const el = e.currentTarget;
          estavaNoFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < PERTO_DO_FIM;
        }}
      >
        <div ref={topo} className="sentinela" aria-hidden="true" />
        {historico && !historico.fim && historico.mensagens.length > 0 && (
          <button type="button" className="secundario carregar-antigas" onClick={() => carregarAnteriores(false)} disabled={historico.carregando}>
            {historico.carregando ? 'Carregando…' : 'Carregar mensagens anteriores'}
          </button>
        )}
        {historico?.fim && <p className="suave inicio-canal">Este é o começo de #{canal.nome}.</p>}
        {historico?.erro && (
          <div className="erro-carga">
            <p className="erro" role="alert">
              {historico.erro}
            </p>
            {historico.mensagens.length === 0 && (
              <button type="button" className="secundario" onClick={() => carregar()} disabled={historico.carregando}>
                Tentar de novo
              </button>
            )}
          </div>
        )}
        <ol className="lista-mensagens" aria-label={`Mensagens de #${canal.nome}`} aria-busy={historico?.carregando ?? true}>
          {mensagens?.map((m) => (
            <ItemMensagem
              key={m.id}
              mensagem={m}
              autor={porId.get(m.autorId)}
              servidorUrl={servidorUrl}
              podeEditar={m.autorId === euId}
              podeApagar={m.autorId === euId || ehAdmin}
              aoEditar={aoEditar}
              aoApagar={aoApagar}
            />
          ))}
        </ol>
      </div>
      <form className="compositor" onSubmit={enviar}>
        <textarea
          aria-label={`Mensagem para #${canal.nome}`}
          placeholder={`Mensagem para #${canal.nome}`}
          value={texto}
          onChange={(e) => mudarTexto(e.target.value)}
          onKeyDown={teclas}
          rows={1}
          maxLength={4000}
        />
        <button type="submit" disabled={enviando || !texto.trim()}>
          Enviar
        </button>
      </form>
      <p className="digitando" aria-live="polite">
        {alguemDigitando
          ? textoDigitando(
              Object.entries(digitandoAte!)
                .filter(([id, ate]) => ate > agora && Number(id) !== euId)
                .map(([id]) => porId.get(Number(id))?.nomeExibicao ?? 'Alguém'),
            )
          : ''}
      </p>
      {erroEnvio && (
        <p className="erro" role="alert">
          {erroEnvio}
        </p>
      )}
    </div>
  );
}
