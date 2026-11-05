import { useEffect, useRef, useState } from 'react';
import type { PreferenciasAudio } from '@tofalando/shared';
import { abrirMicrofone, criarMedidor, type Medidor, type Microfone } from '../servicos/pipeline-audio';

export interface DependenciasConfiguracoes {
  listarDispositivos(): Promise<MediaDeviceInfo[]>;
  aoMudarDispositivos(fn: () => void): () => void;
  abrirMicrofone: typeof abrirMicrofone;
  criarMedidor: typeof criarMedidor;
}

const doNavegador: DependenciasConfiguracoes = {
  listarDispositivos: () => navigator.mediaDevices.enumerateDevices(),
  aoMudarDispositivos(fn) {
    navigator.mediaDevices.addEventListener('devicechange', fn);
    return () => navigator.mediaDevices.removeEventListener('devicechange', fn);
  },
  abrirMicrofone,
  criarMedidor,
};

interface Props {
  audio: PreferenciasAudio;
  /** Grava (RN-14) e aplica na chamada, se houver (RF-17); resolve quando a chamada já usa a escolha. */
  aoMudarAudio: (audio: PreferenciasAudio) => Promise<void> | void;
  /** Microfone da chamada em andamento: o teste mede ele em vez de abrir outro (R-7). */
  microfoneDaChamada?: () => Microfone | undefined;
  aoVoltar: () => void;
  deps?: DependenciasConfiguracoes;
}

const TEXTO_SUPRESSAO: Record<Microfone['supressao'], string> = {
  forte: 'Supressão de ruído: forte (RNNoise).',
  basica: 'Supressão de ruído: básica (a forte não carregou neste computador).',
  desligada: 'Supressão de ruído desligada.',
};

/** Posição (0–100%) de um valor em dBFS na barra do medidor. */
const porcento = (db: number) => Math.round(((Math.max(-100, Math.min(0, db)) + 100) / 100) * 100);

/** RF-17, RF-18, RF-20: dispositivos, tratamento de áudio e teste de microfone, salvos por máquina. */
export function TelaConfiguracoes({ audio, aoMudarAudio, microfoneDaChamada, aoVoltar, deps = doNavegador }: Props) {
  const [dispositivos, setDispositivos] = useState<MediaDeviceInfo[]>([]);
  const [testando, setTestando] = useState(false);
  const [nivel, setNivel] = useState(-100);
  const [supressao, setSupressao] = useState<Microfone['supressao'] | null>(null);
  const [daChamada, setDaChamada] = useState(false);
  const [dispositivoEmUso, setDispositivoEmUso] = useState<string | undefined>();
  const [erro, setErro] = useState<string | null>(null);
  const teste = useRef<{ mic: Microfone; medidor: Medidor; relogio: ReturnType<typeof setInterval>; proprio: boolean } | null>(null);
  /** Cada abertura ganha um número; a que voltar atrasada (ou depois de sair da tela) é descartada. */
  const geracao = useRef(0);

  useEffect(() => {
    let vivo = true;
    const atualizar = () =>
      void deps
        .listarDispositivos()
        .then((d) => vivo && setDispositivos(d))
        .catch(() => undefined);
    atualizar();
    const parar = deps.aoMudarDispositivos(atualizar);
    return () => {
      vivo = false;
      parar();
    };
  }, [deps]);

  function pararTeste() {
    geracao.current++;
    const t = teste.current;
    if (!t) return;
    clearInterval(t.relogio);
    t.medidor.parar();
    // O microfone da chamada continua; só o aberto para o teste é fechado.
    if (t.proprio) t.mic.parar();
    teste.current = null;
  }

  async function iniciarTeste(prefs: PreferenciasAudio) {
    pararTeste();
    const minha = geracao.current;
    setErro(null);
    let mic: Microfone | undefined;
    try {
      const daSala = microfoneDaChamada?.();
      mic = daSala ?? (await deps.abrirMicrofone(prefs));
      const proprio = !daSala;
      if (geracao.current !== minha) {
        if (proprio) mic.parar();
        return;
      }
      const medidor = deps.criarMedidor(mic.faixa);
      // ~12 leituras por segundo bastam para o medidor (e não repinta a tela a 60 Hz).
      const relogio = setInterval(() => setNivel(Math.round(medidor.nivelDb())), 80);
      teste.current = { mic, medidor, relogio, proprio };
      setNivel(Math.round(medidor.nivelDb()));
      setSupressao(mic.supressao);
      setDaChamada(!proprio);
      setDispositivoEmUso(mic.dispositivoId);
      setTestando(true);
      if (mic.usouPadrao) setErro('O microfone escolhido não foi encontrado; testando o padrão do sistema.');
      // Com permissão dada, os dispositivos passam a ter nome.
      void deps
        .listarDispositivos()
        .then(setDispositivos)
        .catch(() => undefined);
    } catch {
      if (mic && !microfoneDaChamada?.()) mic.parar();
      if (geracao.current !== minha) return;
      setTestando(false);
      setErro('Não foi possível abrir o microfone. Confira a permissão e o dispositivo escolhido.');
    }
  }

  useEffect(() => pararTeste, []);

  function mudar(parcial: Partial<PreferenciasAudio>) {
    const novo = { ...audio, ...parcial };
    const aplicado = aoMudarAudio(novo);
    // O teste reabre o microfone com o que mudou (a sensibilidade só move a marca); na chamada, depois da troca.
    if (teste.current && !('sensibilidadeDb' in parcial)) void Promise.resolve(aplicado).then(() => iniciarTeste(novo));
  }

  const entradas = dispositivos.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const saidas = dispositivos.filter((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications');
  const nome = (d: MediaDeviceInfo, i: number, tipo: string) => d.label || `${tipo} ${i + 1}`;

  return (
    <section className="painel" aria-labelledby="titulo-config">
      <div className="painel-topo">
        <h1 id="titulo-config">Configurações</h1>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
      <p className="suave">Valem só neste computador.</p>

      <h2>Áudio</h2>
      <div className="perfil-form">
        <label htmlFor="cfg-entrada">Microfone</label>
        <select id="cfg-entrada" value={audio.entradaId ?? ''} onChange={(e) => mudar({ entradaId: e.target.value || null })}>
          <option value="">Padrão do sistema</option>
          {entradas.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {nome(d, i, 'Microfone')}
            </option>
          ))}
          {audio.entradaId && !entradas.some((d) => d.deviceId === audio.entradaId) && <option value={audio.entradaId}>Dispositivo desconectado</option>}
        </select>

        <label htmlFor="cfg-saida">Saída de áudio</label>
        <select id="cfg-saida" value={audio.saidaId ?? ''} onChange={(e) => mudar({ saidaId: e.target.value || null })}>
          <option value="">Padrão do sistema</option>
          {saidas.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {nome(d, i, 'Saída')}
            </option>
          ))}
          {audio.saidaId && !saidas.some((d) => d.deviceId === audio.saidaId) && <option value={audio.saidaId}>Dispositivo desconectado</option>}
        </select>

        <fieldset className="opcoes">
          <legend>Tratamento do microfone</legend>
          <label>
            <input type="checkbox" checked={audio.supressaoRuido} onChange={(e) => mudar({ supressaoRuido: e.target.checked })} /> Supressão de ruído
          </label>
          <label>
            <input type="checkbox" checked={audio.cancelamentoEco} onChange={(e) => mudar({ cancelamentoEco: e.target.checked })} /> Cancelamento de eco
          </label>
          <label>
            <input type="checkbox" checked={audio.ganhoAutomatico} onChange={(e) => mudar({ ganhoAutomatico: e.target.checked })} /> Controle automático de ganho
          </label>
        </fieldset>
      </div>

      <h2>Teste de microfone</h2>
      <div className="teste-mic">
        <div
          className="medidor"
          role="meter"
          aria-label="Nível do microfone"
          aria-valuemin={-100}
          aria-valuemax={0}
          aria-valuenow={Math.round(nivel)}
          aria-valuetext={testando ? `${Math.round(nivel)} dB` : 'sem teste'}
          aria-describedby="cfg-sensibilidade-texto"
        >
          <div className={`medidor-nivel${nivel >= audio.sensibilidadeDb ? ' acima' : ''}`} style={{ width: `${testando ? porcento(nivel) : 0}%` }} />
          <div className="medidor-marca" style={{ left: `${porcento(audio.sensibilidadeDb)}%` }} title="Sensibilidade da detecção de voz" aria-hidden="true" />
        </div>
        <label htmlFor="cfg-sensibilidade">
          Sensibilidade da detecção de voz: <span className="suave">{audio.sensibilidadeDb} dB</span>
        </label>
        <input
          id="cfg-sensibilidade"
          type="range"
          min={-100}
          max={0}
          step={1}
          value={audio.sensibilidadeDb}
          onChange={(e) => mudar({ sensibilidadeDb: Number(e.target.value) })}
        />
        <p className="suave" id="cfg-sensibilidade-texto">
          Marca da sensibilidade em {audio.sensibilidadeDb} dB: acima dela, a detecção de voz transmite.
        </p>
        {testando ? (
          <button
            type="button"
            className="secundario"
            onClick={() => {
              pararTeste();
              setTestando(false);
              setNivel(-100);
            }}
          >
            Parar teste
          </button>
        ) : (
          <button type="button" onClick={() => void iniciarTeste(audio)}>
            Testar microfone
          </button>
        )}
        {/* Região viva sempre presente: o leitor de tela anuncia quando o texto muda. */}
        <p className="suave" role="status" data-dispositivo={testando ? dispositivoEmUso : undefined}>
          {testando && supressao ? `${daChamada ? 'Medindo o microfone da chamada. ' : ''}${TEXTO_SUPRESSAO[supressao]}` : ''}
        </p>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </section>
  );
}
