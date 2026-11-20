import { useEffect, useState } from 'react';
import type { SomDto } from '@tofalando/shared';

interface Props {
  sons: SomDto[];
  /** RN-12: só quem está num canal de voz toca. */
  naVoz: boolean;
  /** RN-13: instante (ms) em que posso tocar de novo; fica na tela principal para valer mesmo fechando o painel. */
  liberadoEm: number;
  /** RF-24: volume local (0 a 1). */
  volume: number;
  aoVolume: (v: number) => void;
  /** Pede ao servidor; devolve a mensagem de erro ou null. */
  aoTocar: (somId: number) => Promise<string | null>;
  aoFechar: () => void;
}

/** RF-23: sons cadastrados para tocar no canal de voz, com o volume local do soundboard. */
export function PainelSoundboard({ sons, naVoz, liberadoEm, volume, aoVolume, aoTocar, aoFechar }: Props) {
  const [agora, setAgora] = useState(() => Date.now());
  const [erro, setErro] = useState<string | null>(null);
  const falta = Math.max(0, liberadoEm - agora);

  // Conta o descanso (RN-13) até liberar.
  useEffect(() => {
    if (liberadoEm <= Date.now()) return;
    const primeiro = setTimeout(() => setAgora(Date.now()), 0);
    const t = setInterval(() => {
      const n = Date.now();
      setAgora(n);
      if (n >= liberadoEm) clearInterval(t);
    }, 250);
    return () => {
      clearTimeout(primeiro);
      clearInterval(t);
    };
  }, [liberadoEm]);

  async function tocar(som: SomDto) {
    setErro(null);
    const falha = await aoTocar(som.id);
    if (falha) setErro(falha);
  }

  const motivo = !naVoz ? 'Entre num canal de voz para tocar sons.' : falta > 0 ? `Aguarde ${Math.ceil(falta / 1000)} s para tocar outro som.` : null;
  const porcento = Math.round(volume * 100);
  return (
    <section className="painel-soundboard" aria-label="Soundboard">
      <div className="painel-topo">
        <h2>Soundboard</h2>
        <button type="button" className="icone" aria-label="Fechar soundboard" onClick={aoFechar}>
          ×
        </button>
      </div>
      <p className="suave" id="soundboard-motivo">
        {motivo ?? ''}
      </p>
      {sons.length === 0 ? (
        <p className="suave">Nenhum som cadastrado.</p>
      ) : (
        <div className="sons-grade">
          {sons.map((s) => (
            <button key={s.id} type="button" className="secundario" disabled={!!motivo} aria-describedby={motivo ? 'soundboard-motivo' : undefined} onClick={() => void tocar(s)}>
              {s.nome}
            </button>
          ))}
        </div>
      )}
      <label htmlFor="volume-soundboard">
        Volume do soundboard{' '}
        <span className="suave" aria-hidden="true">
          {porcento}%
        </span>
      </label>
      <input
        id="volume-soundboard"
        type="range"
        min={0}
        max={100}
        step={5}
        value={porcento}
        aria-valuetext={`${porcento}%`}
        onChange={(e) => aoVolume(Number(e.target.value) / 100)}
      />
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
