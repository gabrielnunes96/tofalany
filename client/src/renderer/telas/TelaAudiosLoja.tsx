import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AUDIOS_LOJA_MAX, NOME_SOM_MAX, NOMES_RARIDADE, RARIDADES_AUDIO, SOM_MAX_BYTES, validarNomeSom, type AudioLojaAdminDto, type RaridadeAudio } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';

interface Props {
  /** Sempre a API do servidor principal (as rotas exigem o administrador da instalação). */
  api: Required<Pick<ClienteApi, 'audiosLojaAdmin' | 'cadastrarAudioLoja' | 'alterarAudioLoja' | 'retirarAudioLoja'>>;
  servidorUrl: string;
  aoVoltar: () => void;
}

const ACEITOS = '.mp3,.ogg,.wav,audio/mpeg,audio/ogg,audio/wav';
const segundos = (ms: number) => `${(ms / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

/**
 * audios-na-loja (RF-1): o administrador da instalação cadastra, renomeia, troca a raridade e tira áudios da loja.
 * Tirar não apaga de quem comprou (RN-8). O arquivo não é trocado depois do cadastro.
 */
export function TelaAudiosLoja({ api, servidorUrl, aoVoltar }: Props) {
  const [audios, setAudios] = useState<AudioLojaAdminDto[] | null>(null);
  const [nome, setNome] = useState('');
  const [raridade, setRaridade] = useState<RaridadeAudio>('comum');
  const [arquivo, setArquivo] = useState<File | undefined>();
  const [formulario, setFormulario] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [renomeando, setRenomeando] = useState<{ id: number; nome: string } | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);

  const recarregar = useCallback(() => api.audiosLojaAdmin().then(setAudios), [api]);
  useEffect(() => {
    recarregar().catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Não foi possível carregar os áudios.'));
  }, [recarregar]);

  async function agir(acao: () => Promise<string>) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      const texto = await acao();
      await recarregar();
      setAviso(texto);
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
    if (!arquivo) return setErro('Escolha um arquivo de áudio.');
    if (arquivo.size > SOM_MAX_BYTES) return setErro('O arquivo passa de 2 MB.');
    void agir(async () => {
      const novo = await api.cadastrarAudioLoja(n.valor, raridade, arquivo, arquivo.name);
      setNome('');
      setArquivo(undefined);
      setFormulario((f) => f + 1);
      return `"${novo.nome}" está na loja.`;
    });
  }

  function renomear(evento: FormEvent, a: AudioLojaAdminDto) {
    evento.preventDefault();
    const n = validarNomeSom(renomeando?.nome ?? '');
    if (!n.ok) return setErro(n.erro);
    void agir(async () => {
      await api.alterarAudioLoja(a.id, { nome: n.valor });
      setRenomeando(null);
      return 'Nome trocado.';
    });
  }

  const cheio = (audios?.length ?? 0) >= AUDIOS_LOJA_MAX;
  return (
    <section className="painel" aria-labelledby="titulo-audios-loja">
      <div className="painel-topo">
        <h1 id="titulo-audios-loja" tabIndex={-1}>
          Áudios da loja
        </h1>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
      <p className="suave">
        Áudios de até 10 segundos (MP3, OGG ou WAV, até 2 MB) que todos podem comprar com pontos e tocar no soundboard de qualquer servidor. O preço vem da raridade. Até{' '}
        {AUDIOS_LOJA_MAX} áudios.
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

      {audios === null ? (
        !erro && <p className="suave">Carregando…</p>
      ) : audios.length === 0 ? (
        <p className="suave">Nenhum áudio na loja ainda.</p>
      ) : (
        <ul className="lista-admin" aria-label="Áudios da loja">
          {audios.map((a) => (
            <li key={a.id} aria-label={a.nome} className={`raridade-${a.raridade}`}>
              {renomeando?.id === a.id ? (
                <form className="som-renomear" onSubmit={(e) => renomear(e, a)} noValidate>
                  <label className="so-leitor" htmlFor={`audio-nome-${a.id}`}>
                    Novo nome de {a.nome}
                  </label>
                  <input id={`audio-nome-${a.id}`} value={renomeando.nome} maxLength={NOME_SOM_MAX} onChange={(e) => setRenomeando({ id: a.id, nome: e.target.value })} autoFocus />
                  <button type="submit" disabled={ocupado}>
                    Salvar
                  </button>
                  <button type="button" className="secundario" onClick={() => setRenomeando(null)}>
                    Cancelar
                  </button>
                </form>
              ) : (
                <span className="nome">
                  {a.nome}{' '}
                  <span className="suave">
                    {segundos(a.duracaoMs)} · {a.compradores === 1 ? '1 pessoa comprou' : `${a.compradores} pessoas compraram`}
                    {a.retirado ? ' · fora da loja' : ''}
                  </span>
                </span>
              )}
              <audio
                controls
                preload="none"
                src={`${servidorUrl}${a.url}`}
                aria-label={`Ouvir ${a.nome}`}
                // Item 64 (RN-9): ouvir um áudio para o que estava tocando.
                onPlay={(e) => {
                  for (const outro of document.querySelectorAll('audio')) if (outro !== e.currentTarget) outro.pause();
                }}
              />
              <label className="so-leitor" htmlFor={`audio-raridade-${a.id}`}>
                Raridade de {a.nome}
              </label>
              <select
                id={`audio-raridade-${a.id}`}
                value={a.raridade}
                disabled={ocupado}
                onChange={(e) => {
                  const nova = e.target.value as RaridadeAudio;
                  void agir(async () => {
                    await api.alterarAudioLoja(a.id, { raridade: nova });
                    return `"${a.nome}" agora é ${NOMES_RARIDADE[nova]}.`;
                  });
                }}
              >
                {RARIDADES_AUDIO.map((r) => (
                  <option key={r} value={r}>
                    {NOMES_RARIDADE[r]}
                  </option>
                ))}
              </select>
              {renomeando?.id !== a.id && (
                <button type="button" className="secundario" disabled={ocupado} onClick={() => setRenomeando({ id: a.id, nome: a.nome })}>
                  Renomear
                </button>
              )}
              {!a.retirado &&
                (confirmando === a.id ? (
                  <span className="confirmar" role="group" aria-label={`Confirmar retirada de ${a.nome}`}>
                    <button
                      type="button"
                      className="perigo"
                      disabled={ocupado}
                      onClick={() =>
                        void agir(async () => {
                          await api.retirarAudioLoja(a.id);
                          setConfirmando(null);
                          return a.compradores > 0 ? `"${a.nome}" saiu da loja; quem comprou continua com ele.` : `"${a.nome}" saiu da loja.`;
                        })
                      }
                    >
                      Tirar da loja
                    </button>
                    <button type="button" className="secundario" onClick={() => setConfirmando(null)}>
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button type="button" className="secundario" disabled={ocupado} onClick={() => setConfirmando(a.id)}>
                    Tirar da loja
                  </button>
                ))}
            </li>
          ))}
        </ul>
      )}

      <h2>Cadastrar áudio</h2>
      {cheio ? (
        <p className="suave">A loja já tem {AUDIOS_LOJA_MAX} áudios.</p>
      ) : (
        <form key={formulario} className="perfil-form" onSubmit={cadastrar} noValidate>
          <p className="suave">Envie só áudios que o grupo pode usar: de domínio público, CC0 ou com licença que permita usar e compartilhar.</p>
          <label htmlFor="audio-nome">Nome do áudio</label>
          <input id="audio-nome" value={nome} maxLength={NOME_SOM_MAX} onChange={(e) => setNome(e.target.value)} />
          <label htmlFor="audio-raridade">Raridade</label>
          <select id="audio-raridade" value={raridade} onChange={(e) => setRaridade(e.target.value as RaridadeAudio)}>
            {RARIDADES_AUDIO.map((r) => (
              <option key={r} value={r}>
                {NOMES_RARIDADE[r]}
              </option>
            ))}
          </select>
          <label htmlFor="audio-arquivo">Arquivo de áudio</label>
          <input id="audio-arquivo" type="file" accept={ACEITOS} onChange={(e) => setArquivo(e.target.files?.[0])} />
          <button type="submit" disabled={ocupado}>
            {ocupado ? 'Enviando…' : 'Cadastrar na loja'}
          </button>
        </form>
      )}
    </section>
  );
}
