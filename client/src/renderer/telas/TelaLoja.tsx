import { useEffect, useRef, useState } from 'react';
import {
  ITENS_TEMA,
  QUALIDADES_VALE,
  VALE_DIAS,
  chaveItem,
  type CatalogoLojaDto,
  type ItemLoja,
  type LojaEstadoDto,
  type MovimentoDto,
  type QualidadeVale,
  type Tema,
  type TemaLoja,
} from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';

interface Props {
  /** Saldo e itens da conta (chega no ola e a cada crédito ou compra). */
  estado: LojaEstadoDto;
  api: Pick<ClienteApi, 'loja' | 'comprarNaLoja' | 'extratoLoja'>;
  /** Tema em uso (a prévia volta para ele). */
  temaAtual: Tema;
  aoUsarTema: (tema: Tema) => void;
  /** Resposta da compra: aplica na hora (o evento loja:estado também chega). */
  aoComprar: (estado: LojaEstadoDto) => void;
  aoVoltar: () => void;
}

const NOME_VALE: Record<QualidadeVale, string> = {
  '720p60': 'Transmitir em 720p60',
  '1080p30': 'Transmitir em 1080p30',
  '1080p60': 'Transmitir em 1080p60',
};
const DETALHE_VALE: Record<QualidadeVale, string> = {
  '720p60': 'tela mais fluida, ótima para jogos',
  '1080p30': 'mais nitidez, ótima para texto e código',
  '1080p60': 'nítida e fluida; também libera 720p60 e 1080p30',
};
const nomeTema = (id: TemaLoja) => ITENS_TEMA.find((t) => t.id === id)?.nome ?? id;
const nomeItem = (item: ItemLoja) => (item.tipo === 'tema' ? `o tema ${nomeTema(item.tema)}` : `o vale ${NOME_VALE[item.qualidade]}`);
/** Junta páginas do extrato sem repetir (por id), do mais novo para o mais antigo. */
const juntar = (a: MovimentoDto[], b: MovimentoDto[]) => [...new Map([...a, ...b].map((m) => [m.id, m])).values()].sort((x, y) => y.id - x.id);
const formatoData = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});
const pontos = (n: number) => `${n.toLocaleString('pt-BR')} ${Math.abs(n) === 1 ? 'ponto' : 'pontos'}`;

/** Texto de uma linha do extrato. */
function descreverMovimento(m: MovimentoDto): string {
  if (m.tipo === 'ganho') return 'Tempo em voz';
  const [tipo, id] = (m.item ?? '').split(':');
  if (tipo === 'tema') return `Tema ${nomeTema(id as TemaLoja)}`;
  if (tipo === 'vale') return `Vale de ${VALE_DIAS} dias: ${NOME_VALE[id as QualidadeVale] ?? id}`;
  return 'Compra';
}

/**
 * Pontos e loja: temas (para sempre) e vales de transmissão (7 dias, somam), com prévia do tema, confirmação e
 * extrato. Os preços vêm do servidor; o saldo também (o app nunca calcula pontos).
 */
export function TelaLoja({ estado, api, temaAtual, aoUsarTema, aoComprar, aoVoltar }: Props) {
  const [catalogo, setCatalogo] = useState<CatalogoLojaDto | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [erroCatalogo, setErroCatalogo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<ItemLoja | null>(null);
  const [comprando, setComprando] = useState(false);
  const [previa, setPrevia] = useState<TemaLoja | null>(null);
  const [extrato, setExtrato] = useState<MovimentoDto[] | null>(null);
  const [temMais, setTemMais] = useState(false);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [erroExtrato, setErroExtrato] = useState(false);
  const [tentativaExtrato, setTentativaExtrato] = useState(0);
  const titulo = useRef<HTMLHeadingElement>(null);
  /** Botão que abriu a confirmação: o foco volta para ele ao fechar. */
  const origem = useRef<HTMLButtonElement | null>(null);

  useEffect(() => titulo.current?.focus(), []);

  useEffect(() => {
    let vivo = true;
    api
      .loja()
      .then((c) => vivo && setCatalogo(c))
      .catch((e: unknown) => vivo && setErroCatalogo(e instanceof Error ? e.message : 'Não foi possível abrir a loja.'));
    return () => {
      vivo = false;
    };
  }, [api, tentativa]);

  // Extrato: a primeira página chega ao abrir e de novo quando o saldo muda (ganho de voz ou compra); junta por id,
  // sem perder as páginas antigas já abertas com "Ver mais".
  useEffect(() => {
    let vivo = true;
    api
      .extratoLoja()
      .then((r) => {
        if (!vivo) return;
        setErroExtrato(false);
        setExtrato((atual) => {
          if (atual === null) setTemMais(r.movimentos.length >= 50);
          return juntar(atual ?? [], r.movimentos);
        });
      })
      .catch(() => vivo && setErroExtrato(true));
    return () => {
      vivo = false;
    };
  }, [api, estado.saldo, tentativaExtrato]);

  // Prévia: troca o tema do app sem gravar; sair (ou fechar a loja) volta ao tema em uso.
  useEffect(() => {
    if (!previa) return;
    document.documentElement.dataset.tema = previa;
    return () => {
      document.documentElement.dataset.tema = temaAtual;
    };
  }, [previa, temaAtual]);

  const precoDe = (item: ItemLoja): number | undefined => (catalogo ? (item.tipo === 'tema' ? catalogo.precos.tema : catalogo.precos.vales[item.qualidade]) : undefined);

  async function confirmar() {
    if (!confirmando) return;
    const item = confirmando;
    setComprando(true);
    setErro(null);
    try {
      const novo = await api.comprarNaLoja(item);
      aoComprar(novo);
      setAviso(item.tipo === 'tema' ? `${nomeTema(item.tema)} é seu.` : `${NOME_VALE[item.qualidade]} liberado.`);
      fecharConfirmacao();
      setPrevia(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível comprar.');
      fecharConfirmacao();
    } finally {
      setComprando(false);
    }
  }

  function fecharConfirmacao() {
    setConfirmando(null);
    origem.current?.focus();
  }

  function botaoComprar(item: ItemLoja) {
    const preco = precoDe(item);
    if (preco === undefined) return null;
    const falta = preco - estado.saldo;
    return (
      <button
        type="button"
        disabled={falta > 0}
        title={falta > 0 ? `Faltam ${pontos(falta)}` : undefined}
        onClick={(e) => {
          origem.current = e.currentTarget;
          setConfirmando(item);
        }}
      >
        {falta > 0 ? `Faltam ${pontos(falta)}` : `Comprar por ${pontos(preco)}`}
      </button>
    );
  }

  async function carregarMais() {
    const ultimo = extrato?.at(-1);
    if (!ultimo || carregandoMais) return;
    setCarregandoMais(true);
    try {
      const r = await api.extratoLoja(ultimo.id);
      setExtrato((atual) => juntar(atual ?? [], r.movimentos));
      setTemMais(r.movimentos.length >= 50);
    } catch {
      setErroExtrato(true);
    } finally {
      setCarregandoMais(false);
    }
  }

  return (
    <div className="painel tela-loja">
      <div className="painel-topo">
        <h1 ref={titulo} tabIndex={-1}>
          Loja
        </h1>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
      <div className="loja-saldo" aria-live="polite">
        <span className="loja-estrela" aria-hidden="true" />
        <div>
          <strong data-testid="saldo-loja">{pontos(estado.saldo)}</strong>
          <span className="suave">{estado.tudoLiberado ? 'Você é o administrador: tudo liberado.' : 'Seu saldo vale em todos os servidores e não expira.'}</span>
        </div>
      </div>
      <section className="loja-como" aria-labelledby="titulo-como-ganhar">
        <h2 id="titulo-como-ganhar">Como ganhar pontos</h2>
        <ul>
          <li>
            <strong>{pontos(catalogo?.pontosPorMinuto ?? 1)} por minuto</strong> numa sala de voz com pelo menos mais uma pessoa. Conta só o minuto completo.
          </li>
          <li>Microfone mudo também conta. Com o fone desligado (sem ouvir), não conta.</li>
          <li>Sozinho na sala, ou só com o ToOuvini, não conta.</li>
          <li>Se a sua conexão cair, a contagem para até você voltar.</li>
          <li>Os pontos aparecem no seu painel, ao lado da estrela, assim que entram.</li>
        </ul>
      </section>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {aviso && (
        <p className="aviso-ok" role="status">
          {aviso}
        </p>
      )}
      {erroCatalogo && (
        <div className="linha-botoes">
          <p className="erro" role="alert">
            {erroCatalogo}
          </p>
          <button
            type="button"
            className="secundario"
            onClick={() => {
              setErroCatalogo(null);
              setTentativa((n) => n + 1);
            }}
          >
            Tentar de novo
          </button>
        </div>
      )}
      {!catalogo && !erroCatalogo && <p className="suave">Carregando a loja…</p>}

      {catalogo && (
        <>
          <h2>Temas</h2>
          <p className="suave">São seus para sempre. Troque quando quiser em Configurações, Aparência.</p>
          <ul className="loja-grade">
            {ITENS_TEMA.map((t) => {
              const meu = estado.tudoLiberado || estado.temas.includes(t.id);
              return (
                <li key={t.id} className="loja-item">
                  <div className="loja-amostra" data-tema={t.id} aria-hidden="true">
                    <span className="loja-amostra-titulo">{t.nome}</span>
                    <span className="loja-amostra-barra" />
                    <span className="loja-amostra-botao">Aa</span>
                  </div>
                  <div className="loja-item-texto">
                    <h3>{t.nome}</h3>
                    <p className="suave">{t.descricao}</p>
                  </div>
                  <div className="linha-botoes">
                    {meu ? (
                      <>
                        <span className="selo">{estado.tudoLiberado ? 'Liberado (administrador)' : 'Seu'}</span>
                        {temaAtual === t.id ? (
                          <span className="suave">Em uso</span>
                        ) : (
                          <button
                            type="button"
                            className="secundario"
                            onClick={() => {
                              setPrevia(null);
                              aoUsarTema(t.id);
                            }}
                          >
                            Usar agora
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <button type="button" className="secundario" onClick={() => setPrevia(t.id)}>
                          Ver prévia
                        </button>
                        {botaoComprar({ tipo: 'tema', tema: t.id })}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <h2>Vales de transmissão</h2>
          <p className="suave">
            Cada vale dura {VALE_DIAS} dias; comprar de novo soma mais {VALE_DIAS} dias. Os cargos que já liberam a qualidade continuam valendo.
          </p>
          <ul className="loja-grade">
            {QUALIDADES_VALE.map((q) => {
              const vale = estado.vales.find((v) => v.qualidade === q);
              return (
                <li key={q} className="loja-item">
                  <div className="loja-item-texto">
                    <h3>{NOME_VALE[q]}</h3>
                    <p className="suave">{DETALHE_VALE[q]}</p>
                    {vale && <p className="loja-validade">Vale até {formatoData.format(vale.expiraEm)}</p>}
                  </div>
                  <div className="linha-botoes">{estado.tudoLiberado ? <span className="selo">Liberado (administrador)</span> : botaoComprar({ tipo: 'vale', qualidade: q })}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <h2>Extrato</h2>
      {erroExtrato && (
        <div className="linha-botoes">
          <p className="erro" role="alert">
            Não foi possível carregar o extrato.
          </p>
          <button type="button" className="secundario" onClick={() => setTentativaExtrato((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      )}
      {extrato === null ? (
        !erroExtrato && <p className="suave">Carregando…</p>
      ) : extrato.length === 0 ? (
        <p className="suave">Nada por aqui ainda. Entre numa sala de voz com alguém para começar a ganhar.</p>
      ) : (
        <ul className="loja-extrato" aria-label="Extrato">
          {extrato.map((m) => (
            <li key={m.id} className={m.tipo}>
              <time>{formatoData.format(m.em)}</time>
              <span>{descreverMovimento(m)}</span>
              <strong>{m.valor > 0 ? `+${m.valor}` : `−${Math.abs(m.valor)}`}</strong>
            </li>
          ))}
        </ul>
      )}
      {temMais && (
        <button type="button" className="secundario" disabled={carregandoMais} onClick={() => void carregarMais()}>
          {carregandoMais ? 'Carregando…' : 'Ver mais'}
        </button>
      )}

      {previa && (
        <div className="loja-previa" role="region" aria-label="Prévia do tema">
          <span>
            Prévia: <strong>{nomeTema(previa)}</strong>
          </span>
          {botaoComprar({ tipo: 'tema', tema: previa })}
          <button type="button" className="secundario" onClick={() => setPrevia(null)}>
            Sair da prévia
          </button>
        </div>
      )}

      {confirmando && (
        <div
          className="dialogo-fundo"
          role="presentation"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !comprando) {
              e.stopPropagation();
              fecharConfirmacao();
            }
          }}
        >
          <div className="dialogo cartao" role="dialog" aria-modal="true" aria-label="Confirmar compra">
            <h2>Confirmar compra</h2>
            <p>
              Comprar <strong>{nomeItem(confirmando)}</strong> por {pontos(precoDe(confirmando) ?? 0)}?
            </p>
            <p className="suave">
              Compra não tem devolução.
              {confirmando.tipo === 'vale' ? ` O vale dura ${VALE_DIAS} dias (soma ao que você já tem).` : ''}
            </p>
            <div className="dialogo-acoes">
              <button type="button" className="secundario" autoFocus onClick={fecharConfirmacao} disabled={comprando}>
                Cancelar
              </button>
              <button type="button" onClick={() => void confirmar()} disabled={comprando} data-item={chaveItem(confirmando)}>
                {comprando ? 'Comprando…' : 'Comprar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
