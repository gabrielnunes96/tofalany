import { useEffect, useRef, useState, type KeyboardEvent as TecladoReact } from 'react';
import { DIMENSOES_TELA, QUALIDADES_TELA, type QualidadeTela } from '@tofalando/shared';

export interface FonteTela {
  id: string;
  nome: string;
  tipo: 'tela' | 'janela';
  miniatura: string;
  /** Resolução do monitor (pixels reais), para não oferecer qualidade acima do que ele tem. */
  largura?: number;
  altura?: number;
}

/** A qualidade cabe no monitor (sem resolução conhecida, cabe). */
const cabe = (q: QualidadeTela, f: { altura?: number } | undefined) => !f?.altura || DIMENSOES_TELA[q].altura <= f.altura;

interface Props {
  listar: () => Promise<FonteTela[]>;
  /** RF-29: áudio do sistema só no Windows; no Linux a opção aparece desabilitada com o motivo. */
  audioDisponivel: boolean;
  /** Última escolha de "Incluir o áudio do sistema" (sem valor: marcada). */
  audioPadrao?: boolean;
  /** RF-28: qualidades que o cargo permite (membro: só 720p30) e a já selecionada. */
  qualidades?: QualidadeTela[];
  qualidadePadrao?: QualidadeTela;
  aoEscolher: (fonte: FonteTela, audio: boolean, qualidade: QualidadeTela) => void;
  aoCancelar: () => void;
}

/** RF-26: seletor próprio com miniaturas das telas e janelas abertas. */
export function SeletorTela({ listar, audioDisponivel, audioPadrao = true, qualidades = ['720p30'], qualidadePadrao = '720p30', aoEscolher, aoCancelar }: Props) {
  const [fontes, setFontes] = useState<FonteTela[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [audio, setAudio] = useState(audioDisponivel && audioPadrao);
  const [qualidade, setQualidade] = useState<QualidadeTela>(qualidades.includes(qualidadePadrao) ? qualidadePadrao : '720p30');

  useEffect(() => {
    let vivo = true;
    listar()
      .then((f) => vivo && setFontes(f))
      .catch(() => vivo && setErro('Não foi possível listar as telas e janelas.'));
    return () => {
      vivo = false;
    };
  }, [listar]);

  const dialogo = useRef<HTMLDivElement>(null);
  /** Esc fecha; Tab fica dentro do diálogo (modal). */
  function aoTeclar(e: TecladoReact) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      aoCancelar();
      return;
    }
    if (e.key !== 'Tab' || !dialogo.current) return;
    const focaveis = [...dialogo.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0]!;
    const ultimo = focaveis[focaveis.length - 1]!;
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  // O maior monitor deste computador decide o que dá para escolher (1440p só com monitor de 1440p ou mais).
  const maiorMonitor = (fontes ?? []).reduce<FonteTela | undefined>((m, f) => (f.altura && (!m?.altura || f.altura > m.altura) ? f : m), undefined);
  const semMonitor = (q: QualidadeTela) => !cabe(q, maiorMonitor);
  // Fonte menor que a qualidade (ex.: tela 1080p com 1440p marcado): transmite na maior que cabe nela.
  const maiorQueCabe = (f: FonteTela | undefined): QualidadeTela => [...qualidades].reverse().find((q) => cabe(q, f)) ?? '720p30';
  // A escolhida, ajustada ao maior monitor (ex.: o padrão era 1440p e o monitor é 1080p).
  const qualidadeVista = semMonitor(qualidade) ? maiorQueCabe(maiorMonitor) : qualidade;
  const qualidadePara = (f: FonteTela): QualidadeTela => (cabe(qualidadeVista, f) ? qualidadeVista : maiorQueCabe(f));

  const grupo = (tipo: FonteTela['tipo'], titulo: string) => {
    const lista = (fontes ?? []).filter((f) => f.tipo === tipo);
    if (lista.length === 0) return null;
    return (
      <section aria-label={titulo}>
        <h3>{titulo}</h3>
        <ul className="fontes-tela">
          {lista.map((f) => (
            <li key={f.id}>
              <button type="button" className="fonte-tela" onClick={() => aoEscolher(f, audio, qualidadePara(f))}>
                <img src={f.miniatura} alt="" />
                <span>{f.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="seletor-fundo" role="presentation" onClick={aoCancelar}>
      <div
        ref={dialogo}
        className="seletor-tela"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-seletor"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={aoTeclar}
      >
        <div className="painel-topo">
          <h2 id="titulo-seletor">Transmitir tela</h2>
          <button type="button" className="secundario" onClick={aoCancelar} autoFocus>
            Cancelar
          </button>
        </div>
        <fieldset className="opcoes qualidade-tela" aria-describedby={qualidades.length === 1 ? 'qualidade-tela-motivo' : undefined}>
          <legend>Qualidade</legend>
          {QUALIDADES_TELA.map((q) => (
            <label
              key={q}
              title={
                !qualidades.includes(q)
                  ? 'Seu cargo não libera esta qualidade'
                  : semMonitor(q)
                    ? `Não encontramos um monitor com ${DIMENSOES_TELA[q].altura}p: a transmissão fica em até ${maiorMonitor?.altura ?? '?'}p`
                    : undefined
              }
            >
              <input type="radio" name="qualidade-tela" checked={qualidadeVista === q} disabled={!qualidades.includes(q) || semMonitor(q)} onChange={() => setQualidade(q)} /> {q}
              {qualidades.includes(q) && semMonitor(q) && <span className="suave"> (monitor não tem)</span>}
            </label>
          ))}
          {qualidades.length === 1 && (
            <p className="suave" id="qualidade-tela-motivo">
              Acima de 720p30, só com o cargo que libera.
            </p>
          )}
        </fieldset>
        <label className="opcao-audio">
          <input type="checkbox" checked={audio} disabled={!audioDisponivel} onChange={(e) => setAudio(e.target.checked)} /> Incluir o áudio do sistema
        </label>
        {!audioDisponivel && <p className="suave">Neste computador o som não pode ir junto: no Linux, precisa do PipeWire.</p>}
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        {fontes === null && !erro && <p className="suave">Carregando telas e janelas…</p>}
        {fontes?.length === 0 && <p className="suave">Nenhuma tela ou janela encontrada.</p>}
        {grupo('tela', 'Telas')}
        {grupo('janela', 'Janelas')}
      </div>
    </div>
  );
}
