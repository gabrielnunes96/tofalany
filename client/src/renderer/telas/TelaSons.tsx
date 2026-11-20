import { useEffect, useRef, useState, type FormEvent } from 'react';
import { NOME_SOM_MAX, SOM_MAX_BYTES, SONS_MAX, validarNomeSom, type SomDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';

interface Props {
  sons: SomDto[];
  servidorUrl: string;
  api: Pick<ClienteApi, 'cadastrarSom' | 'trocarSom' | 'removerSom'>;
  /** Aplica na hora, mesclando por id (o evento sons:atualizados também chega para todos). */
  aoSalvar: (som: SomDto) => void;
  aoRemover: (id: number) => void;
  aoVoltar: () => void;
}

const ACEITOS = '.mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav';
const segundos = (ms: number) => `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

function conferirArquivo(arquivo: File | undefined): string | null {
  if (!arquivo) return 'Escolha um arquivo de áudio.';
  if (arquivo.size > SOM_MAX_BYTES) return 'O arquivo passa de 2 MB.';
  return null;
}

/** RF-22 (administrador): cadastrar, renomear, trocar o áudio e remover os sons do soundboard (RN-11). */
export function TelaSons({ sons, servidorUrl, api, aoSalvar, aoRemover, aoVoltar }: Props) {
  const [nome, setNome] = useState('');
  const [arquivo, setArquivo] = useState<File | undefined>();
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [renomeando, setRenomeando] = useState<{ id: number; nome: string } | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  const entradaArquivo = useRef<HTMLInputElement>(null);
  const trocandoArquivo = useRef(new Map<number, HTMLInputElement>());
  const cheio = sons.length >= SONS_MAX;
  // Foco depois que o elemento focado some (formulário de renomear fechado, item removido).
  const titulo = useRef<HTMLHeadingElement>(null);
  const botoesRenomear = useRef(new Map<number, HTMLButtonElement>());
  const focarDepois = useRef<number | 'titulo' | null>(null);
  useEffect(() => {
    const alvo = focarDepois.current;
    if (alvo === null) return;
    focarDepois.current = null;
    if (alvo === 'titulo') titulo.current?.focus();
    else botoesRenomear.current.get(alvo)?.focus();
  });
  const fecharRenomear = (id: number) => {
    focarDepois.current = id;
    setRenomeando(null);
  };

  async function agir(acao: () => Promise<string>) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      setAviso(await acao());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  }

  function cadastrar(evento: FormEvent) {
    evento.preventDefault();
    const n = validarNomeSom(nome);
    if (!n.ok) return setErro(n.erro);
    const problema = conferirArquivo(arquivo);
    if (problema) return setErro(problema);
    void agir(async () => {
      const novo = await api.cadastrarSom(n.valor, arquivo!, arquivo!.name);
      aoSalvar(novo);
      setNome('');
      setArquivo(undefined);
      if (entradaArquivo.current) entradaArquivo.current.value = '';
      return `Som "${novo.nome}" cadastrado.`;
    });
  }

  function renomear(evento: FormEvent, som: SomDto) {
    evento.preventDefault();
    const n = validarNomeSom(renomeando?.nome ?? '');
    if (!n.ok) return setErro(n.erro);
    void agir(async () => {
      aoSalvar(await api.trocarSom(som.id, { nome: n.valor }));
      fecharRenomear(som.id);
      return 'Nome trocado.';
    });
  }

  function trocarAudio(som: SomDto, novo: File | undefined) {
    const problema = conferirArquivo(novo);
    if (problema) return setErro(problema);
    void agir(async () => {
      aoSalvar(await api.trocarSom(som.id, { arquivo: { dados: novo!, nome: novo!.name } }));
      return `Áudio de "${som.nome}" trocado.`;
    });
  }

  const remover = (som: SomDto) =>
    void agir(async () => {
      await api.removerSom(som.id);
      aoRemover(som.id);
      setConfirmando(null);
      focarDepois.current = 'titulo';
      return `Som "${som.nome}" removido.`;
    });

  return (
    <section className="painel" aria-labelledby="titulo-sons">
      <div className="painel-topo">
        <h1 id="titulo-sons" ref={titulo} tabIndex={-1}>
          Soundboard
        </h1>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
      <p className="suave">
        Até {SONS_MAX} sons para o servidor todo, cada um com até 10 segundos (MP3, OGG ou WAV, até 2 MB). Quem estiver num canal de voz pode tocá-los.
      </p>
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

      {sons.length === 0 ? (
        <p className="suave">Nenhum som cadastrado ainda.</p>
      ) : (
        <ul className="lista-admin" aria-label="Sons do soundboard">
          {sons.map((som) => (
            <li key={som.id} aria-label={som.nome}>
              {renomeando?.id === som.id ? (
                <form className="som-renomear" onSubmit={(e) => renomear(e, som)} noValidate>
                  <label className="so-leitor" htmlFor={`som-nome-${som.id}`}>
                    Novo nome de {som.nome}
                  </label>
                  <input id={`som-nome-${som.id}`} value={renomeando.nome} maxLength={NOME_SOM_MAX} onChange={(e) => setRenomeando({ id: som.id, nome: e.target.value })} autoFocus />
                  <button type="submit" disabled={ocupado}>
                    Salvar
                  </button>
                  <button type="button" className="secundario" onClick={() => fecharRenomear(som.id)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <span className="nome">
                  {som.nome} <span className="suave">{segundos(som.duracaoMs)}</span>
                </span>
              )}
              <audio controls preload="none" src={`${servidorUrl}${som.url}`} aria-label={`Ouvir ${som.nome}`} />
              {renomeando?.id !== som.id && (
                <button
                  type="button"
                  className="secundario"
                  ref={(el) => {
                    if (el) botoesRenomear.current.set(som.id, el);
                    else botoesRenomear.current.delete(som.id);
                  }}
                  disabled={ocupado}
                  onClick={() => setRenomeando({ id: som.id, nome: som.nome })}
                >
                  Renomear
                </button>
              )}
              <button type="button" className="secundario" disabled={ocupado} onClick={() => trocandoArquivo.current.get(som.id)?.click()}>
                Trocar áudio
              </button>
              <input
                ref={(el) => {
                  if (el) trocandoArquivo.current.set(som.id, el);
                  else trocandoArquivo.current.delete(som.id);
                }}
                type="file"
                hidden
                accept={ACEITOS}
                aria-label={`Novo áudio de ${som.nome}`}
                onChange={(e) => {
                  trocarAudio(som, e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {confirmando === som.id ? (
                <span className="confirmar" role="group" aria-label={`Confirmar remoção de ${som.nome}`}>
                  <button type="button" className="perigo" disabled={ocupado} onClick={() => remover(som)}>
                    Confirmar remoção
                  </button>
                  <button type="button" className="secundario" onClick={() => setConfirmando(null)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button type="button" className="secundario" disabled={ocupado} onClick={() => setConfirmando(som.id)}>
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <h2>Cadastrar som</h2>
      {cheio ? (
        <p className="suave">O soundboard já tem {SONS_MAX} sons. Remova um para cadastrar outro.</p>
      ) : (
        <form className="perfil-form" onSubmit={cadastrar} noValidate>
          <label htmlFor="som-nome">Nome do som</label>
          <input id="som-nome" value={nome} maxLength={NOME_SOM_MAX} onChange={(e) => setNome(e.target.value)} />
          <label htmlFor="som-arquivo">Arquivo de áudio</label>
          <input id="som-arquivo" ref={entradaArquivo} type="file" accept={ACEITOS} onChange={(e) => setArquivo(e.target.files?.[0])} />
          <button type="submit" disabled={ocupado}>
            {ocupado ? 'Enviando…' : 'Cadastrar som'}
          </button>
        </form>
      )}
    </section>
  );
}
