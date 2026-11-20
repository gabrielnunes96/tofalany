import { useCallback, useEffect, useRef, useState } from 'react';
import { ROTULOS_AUDITORIA, TIPOS_AUDITORIA, type CanalDto, type FiltroAuditoria, type RegistroAuditoriaDto, type TipoAuditoria } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';
import { descreverRegistro, formatarQuando, limiteDoDia } from './auditoria-texto';

/** Pessoa no filtro (inclui contas removidas que ainda têm registros no prazo). */
export interface PessoaFiltro {
  id: number;
  nome: string;
  removido?: boolean;
}

interface Props {
  api: Pick<ClienteApi, 'auditoria'>;
  pessoas: PessoaFiltro[];
  /** Canais atuais, para filtrar por canal (registros de canais removidos aparecem sem filtro). */
  canais: CanalDto[];
  aoVoltar: () => void;
}

interface Filtros {
  pessoa: string;
  canal: string;
  tipo: '' | TipoAuditoria;
  de: string;
  ate: string;
}

/** RF-35: auditoria do servidor, só para administrador (o servidor também recusa membro). */
export function TelaAuditoria({ api, pessoas, canais, aoVoltar }: Props) {
  const [filtros, setFiltros] = useState<Filtros>({ pessoa: '', canal: '', tipo: '', de: '', ate: '' });
  const [registros, setRegistros] = useState<RegistroAuditoriaDto[]>([]);
  const [fim, setFim] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const geracao = useRef(0);
  const sentinela = useRef<HTMLLIElement | null>(null);

  const filtroApi = useCallback(
    (antes?: number): FiltroAuditoria => ({
      pessoa: filtros.pessoa ? Number(filtros.pessoa) : undefined,
      canal: filtros.canal ? Number(filtros.canal) : undefined,
      tipo: filtros.tipo || undefined,
      de: limiteDoDia(filtros.de, false),
      ate: limiteDoDia(filtros.ate, true),
      antes,
    }),
    [filtros],
  );

  /** Busca uma página; respostas de filtros antigos (geração anterior) são descartadas. */
  const buscar = useCallback(
    (antes: number | undefined, minha: number) =>
      api
        .auditoria(filtroApi(antes))
        .then((pagina) => {
          if (minha !== geracao.current) return;
          setRegistros((atuais) => (antes === undefined ? pagina.registros : [...atuais, ...pagina.registros]));
          setFim(pagina.fim);
          setCarregando(false);
        })
        .catch((e: unknown) => {
          if (minha !== geracao.current) return;
          setErro(e instanceof Error ? e.message : 'Não foi possível carregar a auditoria.');
          setCarregando(false);
        }),
    [api, filtroApi],
  );

  // Filtro mudou: recomeça do mais recente.
  useEffect(() => {
    void buscar(undefined, ++geracao.current);
  }, [buscar]);

  /** automatico = veio da rolagem: depois de um erro, só o botão tenta de novo (evita laço com o servidor fora). */
  const carregarMais = useCallback(
    (automatico = false) => {
    const ultimo = registros.at(-1);
    if (carregando || fim || !ultimo || (automatico && erro)) return;
    setCarregando(true);
    setErro(null);
    void buscar(ultimo.id, geracao.current);
    },
    [buscar, carregando, fim, registros, erro],
  );

  // Rolar até o fim carrega os mais antigos (o botão continua para teclado e leitor de tela).
  useEffect(() => {
    const alvo = sentinela.current;
    if (!alvo || typeof IntersectionObserver === 'undefined') return;
    const observador = new IntersectionObserver((entradas) => entradas.some((e) => e.isIntersecting) && carregarMais(true));
    observador.observe(alvo);
    return () => observador.disconnect();
  }, [carregarMais]);

  const mudar = <K extends keyof Filtros>(chave: K, valor: Filtros[K]) => {
    setCarregando(true);
    setErro(null);
    setFiltros((f) => ({ ...f, [chave]: valor }));
  };

  return (
    <section className="painel" aria-labelledby="titulo-auditoria">
      <div className="painel-topo">
        <h1 id="titulo-auditoria">Auditoria</h1>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
      <p className="suave">Os registros ficam guardados pelo prazo definido no servidor. Nada das mensagens diretas aparece aqui.</p>
      <div className="filtros">
        <label>
          Pessoa
          <select value={filtros.pessoa} onChange={(e) => mudar('pessoa', e.target.value)}>
            <option value="">Todas</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.removido ? `${p.nome} (conta removida)` : p.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          Canal
          <select value={filtros.canal} onChange={(e) => mudar('canal', e.target.value)}>
            <option value="">Todos</option>
            {canais.map((c) => (
              <option key={c.id} value={c.id}>
                {c.tipo === 'texto' ? `# ${c.nome}` : `🔊 ${c.nome}`}
              </option>
            ))}
            {filtros.canal && !canais.some((c) => String(c.id) === filtros.canal) && <option value={filtros.canal}>(canal removido)</option>}
          </select>
        </label>
        <label>
          Evento
          <select value={filtros.tipo} onChange={(e) => mudar('tipo', e.target.value as Filtros['tipo'])}>
            <option value="">Todos</option>
            {TIPOS_AUDITORIA.map((t) => (
              <option key={t} value={t}>
                {ROTULOS_AUDITORIA[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          De
          <input type="date" value={filtros.de} onChange={(e) => mudar('de', e.target.value)} />
        </label>
        <label>
          Até
          <input type="date" value={filtros.ate} onChange={(e) => mudar('ate', e.target.value)} />
        </label>
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <ol className="lista-auditoria" aria-label="Registros da auditoria" aria-busy={carregando}>
        {registros.map((r) => (
          <li key={r.id}>
            <time dateTime={new Date(r.quando).toISOString()}>{formatarQuando(r.quando)}</time>
            <span>{descreverRegistro(r)}</span>
          </li>
        ))}
        {!carregando && registros.length === 0 && !erro && <li className="suave">Nenhum registro com esses filtros.</li>}
        <li ref={sentinela} aria-hidden="true" className="sentinela" />
      </ol>
      {!fim && registros.length > 0 && (
        <button type="button" className="secundario" onClick={() => carregarMais()} disabled={carregando}>
          {carregando ? 'Carregando…' : 'Carregar mais antigos'}
        </button>
      )}
    </section>
  );
}
