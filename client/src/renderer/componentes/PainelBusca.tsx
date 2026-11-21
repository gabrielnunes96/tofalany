import { useEffect, useRef, useState, type FormEvent } from 'react';
import { textoSemGif, type CanalDto, type MensagemDto, type PedidoBusca, type ResultadoBusca, type UsuarioDto } from '@tofalando/shared';
import { ErroApiCliente } from '../servicos/api';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Texto com as partes achadas em <mark>, montado como texto (sem HTML vindo do servidor, A16). */
export function TrechoDestacado({ texto, destaques }: { texto: string; destaques: [number, number][] }) {
  const partes: React.ReactNode[] = [];
  let pos = 0;
  for (const [i, f] of [...destaques].sort((a, b) => a[0] - b[0])) {
    if (i < pos || f > texto.length || f <= i) continue;
    if (i > pos) partes.push(texto.slice(pos, i));
    partes.push(<mark key={i}>{texto.slice(i, f)}</mark>);
    pos = f;
  }
  if (pos < texto.length) partes.push(texto.slice(pos));
  return <>{partes}</>;
}

interface Props {
  /** A conversa aberta: canal ou DM. */
  conversa: { canalId: number } | { dmId: number };
  /** Texto digitado no campo do topo; `pedido` muda a cada Enter (mesmo texto busca de novo). */
  termo: string;
  pedido: number;
  buscar: (p: PedidoBusca) => Promise<{ resultados: ResultadoBusca[]; mais: boolean }>;
  usuarios: UsuarioDto[];
  canais: CanalDto[];
  aoAbrir: (m: MensagemDto) => void;
  aoFechar: () => void;
}

/** chat-fixar-e-buscar (RF-5 a RF-7): resultados da busca com filtros, 25 por vez. */
export function PainelBusca({ conversa, termo, pedido, buscar, usuarios, canais, aoAbrir, aoFechar }: Props) {
  const ehDm = 'dmId' in conversa;
  const [onde, setOnde] = useState<'conversa' | 'todos'>('conversa');
  const [autorId, setAutorId] = useState<number | ''>('');
  const [comAnexo, setComAnexo] = useState(false);
  const [comGif, setComGif] = useState(false);
  const [resultados, setResultados] = useState<ResultadoBusca[] | null>(null);
  const [mais, setMais] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /** Resposta de uma busca antiga que chega depois da nova não vale. */
  const vez = useRef(0);

  const montar = (antes?: number): PedidoBusca => ({
    ...(termo.trim() ? { q: termo.trim() } : {}),
    onde: onde === 'conversa' ? 'conversa' : ehDm ? 'dms' : 'servidor',
    ...(onde === 'conversa' ? conversa : {}),
    ...(autorId !== '' ? { autorId } : {}),
    ...(comAnexo ? { comAnexo } : {}),
    ...(comGif ? { comGif } : {}),
    ...(antes ? { antes } : {}),
  });

  async function executar(antes?: number) {
    const semFiltro = autorId === '' && !comAnexo && !comGif;
    // RN-9: pelo menos 2 letras (ou só filtros); o servidor confere de novo.
    if (semFiltro && termo.trim().replace(/[^\p{L}\p{N}]/gu, '').length < 2) {
      setResultados(null);
      setErro('Digite pelo menos 2 letras.');
      return;
    }
    const minha = ++vez.current;
    setCarregando(true);
    setErro(null);
    try {
      const r = await buscar(montar(antes));
      if (minha !== vez.current) return;
      setResultados((atual) => (antes && atual ? [...atual, ...r.resultados] : r.resultados));
      setMais(r.mais);
    } catch (e) {
      if (minha !== vez.current) return;
      setErro(e instanceof ErroApiCliente ? e.message : 'Não foi possível buscar agora.');
    } finally {
      if (minha === vez.current) setCarregando(false);
    }
  }

  // Novo Enter no campo do topo, ou um filtro mudou: busca de novo do começo.
  useEffect(() => {
    // No próximo tique: junta mudanças seguidas (ex.: dois filtros) numa busca só.
    const t = setTimeout(() => void executar(), 0);
    return () => clearTimeout(t);
    // executar lê o estado atual; só estes valores disparam a busca.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido, onde, autorId, comAnexo, comGif]);

  const nome = (id: number) => usuarios.find((u) => u.id === id)?.nomeExibicao ?? 'conta removida';
  const nomeCanal = (id: number | null) => (id === null ? null : (canais.find((c) => c.id === id)?.nome ?? null));
  const enviar = (e: FormEvent) => e.preventDefault();

  return (
    <section className="painel-lateral painel-busca" aria-labelledby="titulo-busca">
      <header className="painel-lateral-topo">
        <h2 id="titulo-busca" className="subtitulo">
          Busca{termo.trim() ? `: “${termo.trim()}”` : ''}
        </h2>
        <button type="button" className="icone" aria-label="Fechar a busca" onClick={aoFechar}>
          ✕
        </button>
      </header>
      <form className="busca-filtros" onSubmit={enviar} aria-label="Filtros da busca">
        <label>
          Onde
          <select value={onde} onChange={(e) => setOnde(e.target.value as 'conversa' | 'todos')}>
            <option value="conversa">Nesta conversa</option>
            <option value="todos">{ehDm ? 'Em todas as minhas DMs' : 'Em todos os canais do servidor'}</option>
          </select>
        </label>
        <label>
          De quem
          <select value={autorId} onChange={(e) => setAutorId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Qualquer pessoa</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nomeExibicao}
              </option>
            ))}
          </select>
        </label>
        <label className="caixa">
          <input type="checkbox" checked={comAnexo} onChange={(e) => setComAnexo(e.target.checked)} /> Com anexo
        </label>
        <label className="caixa">
          <input type="checkbox" checked={comGif} onChange={(e) => setComGif(e.target.checked)} /> Com GIF
        </label>
      </form>
      <p className="visualmente-oculto" role="status">
        {carregando ? 'Buscando…' : resultados ? `${resultados.length}${mais ? ' ou mais' : ''} resultados` : ''}
      </p>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {resultados?.length === 0 && !carregando && <p className="suave">Nada encontrado.</p>}
      <ul className="lista-fixadas lista-resultados" aria-label="Resultados da busca">
        {resultados?.map(({ mensagem: m, destaques }) => {
          const proprio = textoSemGif(m.texto, m.gif);
          const canal = onde === 'todos' && !ehDm ? nomeCanal(m.canalId) : null;
          return (
            <li key={m.id}>
              <button type="button" className="fixada-ir" onClick={() => aoAbrir(m)}>
                <span className="fixada-topo">
                  <strong>{nome(m.autorId)}</strong>
                  {canal && <span className="suave">#{canal}</span>}
                  <time dateTime={new Date(m.criadaEm).toISOString()}>{quando.format(m.criadaEm)}</time>
                </span>
                <span className="fixada-trecho">
                  {proprio ? <TrechoDestacado texto={proprio} destaques={destaques} /> : m.gif ? 'GIF' : m.anexos.length ? `Anexo: ${m.anexos[0]!.nome}` : ''}
                </span>
                {m.anexos.length > 0 && proprio && <span className="suave fixada-por">Anexo: {m.anexos.map((a) => a.nome).join(', ')}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {mais && (
        <button type="button" className="secundario" disabled={carregando} onClick={() => void executar(resultados?.at(-1)?.mensagem.id)}>
          {carregando ? 'Buscando…' : 'Mais resultados'}
        </button>
      )}
    </section>
  );
}
