import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ANEXO_MAX_BYTES,
  ANEXOS_POR_MENSAGEM,
  DIGITANDO_INTERVALO_MS,
  EXTENSOES_ANEXO,
  validarTextoMensagem,
  type AnexoDto,
  type CanalDto,
  type PaginaMensagens,
  type UsuarioDto,
} from '@tofalando/shared';
import { tamanhoLegivel } from './Anexos';
import { chaveCanal, useLoja, type Chave } from '../estado/loja';
import type { ClienteApi } from '../servicos/api';
import { ErroApiCliente } from '../servicos/api';
import { ItemMensagem } from './ItemMensagem';

/** O que a conversa mostra: canal de texto ("#geral") ou DM ("Bia"). */
export interface DadosConversa {
  chave: Chave;
  /** "#geral" ou "Bia": usado em "Mensagens de …", "Mensagem para …". */
  titulo: string;
  /** Frase no começo do histórico. */
  inicio: string;
  /** Rótulo da lista de mensagens. */
  rotuloLista: string;
}

interface Props {
  conversa: DadosConversa;
  carregarPagina: (antes?: number) => Promise<PaginaMensagens>;
  usuarios: UsuarioDto[];
  servidorUrl: string;
  api: Pick<ClienteApi, 'enviarAnexo'>;
  /** Envia pelo tempo real; devolve a mensagem de erro ou null. */
  aoEnviar: (texto: string, anexos: string[]) => Promise<string | null>;
  euId: number;
  ehAdmin: boolean;
  aoEditar: (id: number, texto: string) => Promise<string | null>;
  aoApagar: (id: number) => Promise<string | null>;
  aoDigitar: () => void;
  /** Conversa só para leitura (ex.: DM com conta removida): sem campo de escrever. */
  somenteLeitura?: string;
}

/** Extensão de um arquivo colado: a do nome ou a do tipo (image/png → png). */
function extensaoDe(f: File): string {
  const doNome = /\.(\w+)$/.exec(f.name)?.[1];
  return (doNome ?? f.type.split('/')[1] ?? 'png').toLowerCase();
}

interface Pendente {
  chave: number;
  nome: string;
  bytes: number;
  estado: 'enviando' | 'pronto' | 'erro';
  anexo?: AnexoDto;
  erro?: string;
}

/** Confere no app o que o servidor também confere (RN-19): extensão e tamanho. */
export function problemaDoArquivo(nome: string, bytes: number): string | null {
  const ext = nome.toLowerCase().split('.').pop() ?? '';
  if (!(EXTENSOES_ANEXO as readonly string[]).includes(ext)) return 'Formato não aceito. Envie JPEG, PNG, GIF, WebP, PDF ou ZIP.';
  if (bytes > ANEXO_MAX_BYTES) return 'O arquivo deve ter no máximo 25 MB.';
  return null;
}

let proximaChave = 1;

/** "Ana está digitando…", "Ana e Bia estão digitando…", "Várias pessoas estão digitando…". */
export function textoDigitando(nomes: string[]): string | null {
  if (nomes.length === 0) return null;
  if (nomes.length === 1) return `${nomes[0]} está digitando…`;
  if (nomes.length <= 3) return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)} estão digitando…`;
  return 'Várias pessoas estão digitando…';
}

/** Perto do fim (px): mensagem nova rola a lista; mais acima, a pessoa está lendo o histórico. */
const PERTO_DO_FIM = 120;

/** RF-8, RF-12a: histórico com carga ao rolar para cima (CA-14) e envio de mensagens — canal ou DM. */
export function Conversa({
  conversa,
  carregarPagina,
  usuarios,
  servidorUrl,
  api,
  aoEnviar,
  euId,
  ehAdmin,
  aoEditar,
  aoApagar,
  aoDigitar,
  somenteLeitura,
}: Props) {
  const chave = conversa.chave;
  const historico = useLoja((s) => s.historicos[chave]);
  const digitandoAte = useLoja((s) => s.digitando[chave]);
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
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [arrastando, setArrastando] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);
  /** Anexos ocupando vaga (enviando ou prontos), contados na hora: duas escolhas seguidas não passam de 10. */
  const ativos = useRef(0);

  function anexar(arquivos: FileList | File[]) {
    const lista = [...arquivos];
    setErroEnvio(null);
    const vagas = ANEXOS_POR_MENSAGEM - ativos.current;
    if (lista.length > vagas) setErroEnvio(`Até ${ANEXOS_POR_MENSAGEM} anexos por mensagem.`);
    for (const arquivo of lista.slice(0, Math.max(0, vagas))) {
      const chave = proximaChave++;
      const problema = problemaDoArquivo(arquivo.name, arquivo.size);
      const base: Pendente = { chave, nome: arquivo.name, bytes: arquivo.size, estado: problema ? 'erro' : 'enviando', erro: problema ?? undefined };
      setPendentes((p) => [...p, base]);
      if (problema) continue;
      ativos.current++;
      api
        .enviarAnexo(arquivo, arquivo.name)
        .then((anexo) => setPendentes((p) => p.map((x) => (x.chave === chave ? { ...x, estado: 'pronto', anexo } : x))))
        .catch((e: unknown) => {
          ativos.current--;
          setPendentes((p) =>
            p.map((x) => (x.chave === chave ? { ...x, estado: 'erro', erro: e instanceof Error ? e.message : 'Não foi possível enviar.' } : x)),
          );
        });
    }
  }

  /** Colar (Ctrl+V): arquivos da área de transferência (ex.: um print) viram anexos; texto cola normalmente. */
  function colar(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const arquivos = [...e.clipboardData.files];
    if (!arquivos.length) return;
    e.preventDefault();
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    // Prints chegam como "image.png": dá um nome que não se repete entre colagens.
    anexar(arquivos.map((f, i) => (/^image\.\w+$/i.test(f.name) || !f.name ? new File([f], `print-${carimbo}${i ? `-${i + 1}` : ''}.${extensaoDe(f)}`, { type: f.type }) : f)));
  }

  const carregar = useCallback(
    (antes?: number) => {
      const { iniciarCarga, receberPagina, falharCarga } = useLoja.getState();
      const geracao = iniciarCarga(chave);
      carregarPagina(antes)
        .then((pagina) => receberPagina(chave, pagina, geracao))
        .catch((e: unknown) => {
          alturaAntes.current = null;
          falharCarga(chave, e instanceof ErroApiCliente ? e.message : 'Não foi possível carregar as mensagens.', geracao);
        });
    },
    [carregarPagina, chave],
  );

  // Primeira abertura da conversa (ou depois de reconectar, quando o histórico foi descartado).
  useEffect(() => {
    if (!useLoja.getState().historicos[chave]) carregar();
  }, [chave, carregar, historico]);

  const carregarAnteriores = useCallback(
    (automatico: boolean) => {
      const h = useLoja.getState().historicos[chave];
      if (!h || h.fim || h.carregando || (automatico && h.erro)) return;
      alturaAntes.current = lista.current?.scrollHeight ?? null;
      carregar(h.mensagens[0]?.id);
    },
    [chave, carregar],
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

  const prontos = pendentes.filter((p) => p.estado === 'pronto').map((p) => p.anexo!.id);
  const subindo = pendentes.some((p) => p.estado === 'enviando');
  const podeEnviar = !enviando && !subindo && (texto.trim() !== '' || prontos.length > 0);

  async function enviar(evento?: FormEvent) {
    evento?.preventDefault();
    if (!podeEnviar) return;
    const v = validarTextoMensagem(texto);
    if (!v.ok && prontos.length === 0) return;
    setEnviando(true);
    setErroEnvio(null);
    // Limpa só o que foi enviado: o que a pessoa digitou ou anexou durante o envio fica no compositor.
    const textoEnviado = texto;
    const enviados = new Set(pendentes.filter((p) => p.estado === 'pronto').map((p) => p.chave));
    const falha = await aoEnviar(v.ok ? v.valor : '', prontos);
    setEnviando(false);
    if (falha) setErroEnvio(falha);
    else {
      setTexto((atual) => (atual === textoEnviado ? '' : atual));
      setPendentes((lista) => lista.filter((p) => !enviados.has(p.chave)));
      ativos.current = Math.max(0, ativos.current - enviados.size);
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
    <div
      className={`chat${arrastando ? ' arrastando' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setArrastando(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        if (e.dataTransfer.files.length) anexar(e.dataTransfer.files);
      }}
    >
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
        {historico?.fim && <p className="suave inicio-canal">{conversa.inicio}</p>}
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
        <ol className="lista-mensagens" aria-label={conversa.rotuloLista} aria-busy={historico?.carregando ?? true}>
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
      {somenteLeitura ? (
        <p className="suave somente-leitura" role="note">
          {somenteLeitura}
        </p>
      ) : (
        <>
      {pendentes.length > 0 && (
        <ul className="pendentes" aria-label="Anexos a enviar">
          {pendentes.map((p) => (
            <li key={p.chave} className={`pendente ${p.estado}`}>
              <span className="anexo-nome">{p.nome}</span>
              <span className="suave">{p.estado === 'enviando' ? 'enviando…' : p.estado === 'erro' ? p.erro : tamanhoLegivel(p.bytes)}</span>
              <button
                type="button"
                className="icone"
                aria-label={`Tirar ${p.nome}`}
                onClick={() => {
                  if (p.estado !== 'erro') ativos.current--;
                  setPendentes((lista) => lista.filter((x) => x.chave !== p.chave));
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="compositor" onSubmit={enviar}>
        <button type="button" className="secundario anexar" aria-label="Anexar arquivo" title="Anexar arquivo" onClick={() => seletor.current?.click()}>
          +
        </button>
        <input
          ref={seletor}
          type="file"
          multiple
          hidden
          aria-label="Arquivos para anexar"
          accept={EXTENSOES_ANEXO.map((e) => `.${e}`).join(',')}
          onChange={(e) => {
            if (e.target.files?.length) anexar(e.target.files);
            e.target.value = '';
          }}
        />
        <textarea
          aria-label={`Mensagem para ${conversa.titulo}`}
          placeholder={`Mensagem para ${conversa.titulo}`}
          value={texto}
          onChange={(e) => mudarTexto(e.target.value)}
          onKeyDown={teclas}
          onPaste={colar}
          rows={1}
          maxLength={4000}
        />
        <button type="submit" disabled={!podeEnviar}>
          Enviar
        </button>
      </form>
        </>
      )}
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

type PropsCanal = Omit<Props, 'conversa' | 'carregarPagina' | 'api'> & {
  canal: CanalDto;
  api: Pick<ClienteApi, 'mensagensCanal' | 'enviarAnexo'>;
};

/** Conversa de um canal de texto. */
export function MensagensCanal({ canal, api, ...resto }: PropsCanal) {
  const carregarPagina = useCallback((antes?: number) => api.mensagensCanal(canal.id, antes), [api, canal.id]);
  return (
    <Conversa
      {...resto}
      api={api}
      carregarPagina={carregarPagina}
      conversa={{
        chave: chaveCanal(canal.id),
        titulo: `#${canal.nome}`,
        inicio: `Este é o começo de #${canal.nome}.`,
        rotuloLista: `Mensagens de #${canal.nome}`,
      }}
    />
  );
}
