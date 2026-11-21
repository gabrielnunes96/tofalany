import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { FaixaVideo } from '../servicos/voz';
import { alternarTelaCheia, useEmTelaCheia } from './telaCheia';
import { Espectadores } from './Espectadores';
import { Icone } from './Icone';
import { ligarFaixa } from '../servicos/faixa-em-janela';
import { useJanelaPropria } from '../servicos/janela-propria';

/**
 * RF-30: a transmissão de alguém do meu canal — aviso com "Assistir", e grande com tela cheia ao assistir.
 * Abrir e fechar avisa o servidor (`aoAssistir`), para todos verem quem está assistindo.
 */
export function PainelTransmissao({
  id,
  nome,
  faixa,
  espectadores = [],
  aoAssistir,
  conectado = true,
  aoSom,
}: {
  /** Quem transmite (o nome da janela própria: uma por transmissão). */
  id?: number;
  nome: string;
  faixa: FaixaVideo | undefined;
  espectadores?: string[];
  aoAssistir?: (assistindo: boolean) => void;
  conectado?: boolean;
  /** Som da transmissão aqui: toca só assistindo, no volume escolhido (0 = mudo). */
  aoSom?: (o: { assistindo: boolean; volume: number }) => void;
}) {
  const [assistindo, setAssistindoEstado] = useState(false);
  /**
   * video-teatro-cameras-e-sons (RF-4, RF-5): onde a transmissão aparece enquanto assisto — no painel, no modo teatro
   * (por cima do app, desenhado no <body>) ou numa janela própria (T5). Fechar volta ao painel e sai de tudo (RN-7).
   */
  const [exibicao, setExibicao] = useState<'painel' | 'teatro' | 'janela'>('painel');
  // RF-3/CA-5: janela própria; fechar a janela pelo sistema volta ao painel; parar de assistir ou o painel sumir
  // (a transmissão acabou, saí da voz) fecha a janela (A6).
  const alvoJanela = useJanelaPropria(
    assistindo && exibicao === 'janela' && id ? `tofalany-transmissao-${id}` : null,
    'ToFalany – Transmissão',
    useCallback(() => setExibicao('painel'), []),
  );
  const setAssistindo = (sim: boolean) => {
    setAssistindoEstado(sim);
    if (!sim) setExibicao('painel');
  };
  const [volume, setVolume] = useState(1);
  const [mudo, setMudo] = useState(false);
  const som = useRef(aoSom);
  useEffect(() => {
    som.current = aoSom;
  }, [aoSom]);
  useEffect(() => {
    som.current?.({ assistindo, volume: mudo ? 0 : volume });
  }, [assistindo, volume, mudo]);
  // Painel some (a pessoa parou): o som dela para de tocar aqui.
  useEffect(() => () => som.current?.({ assistindo: false, volume: 1 }), []);
  const avisar = useRef(aoAssistir);
  useEffect(() => {
    avisar.current = aoAssistir;
  }, [aoAssistir]);
  // Avisa ao abrir, ao fechar (ou o painel sumir) e de novo depois de uma reconexão.
  useEffect(() => {
    if (!assistindo || !conectado) return;
    avisar.current?.(true);
    return () => avisar.current?.(false);
  }, [assistindo, conectado]);
  const ref = useRef<HTMLVideoElement>(null);
  const caixa = useRef<HTMLElement>(null);
  // Em tela cheia e no modo teatro, os controles ficam por cima do vídeo: aparecem ao mexer o mouse e somem depois de
  // 3 s parado (RN-6).
  const [controlesVisiveis, setControlesVisiveis] = useState(true);
  const esconder = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mostrarControles = () => {
    setControlesVisiveis(true);
    clearTimeout(esconder.current);
    esconder.current = setTimeout(() => setControlesVisiveis(false), ESCONDER_CONTROLES_MS);
  };
  useEffect(() => () => clearTimeout(esconder.current), []);
  const cheia = useEmTelaCheia(caixa, alvoJanela?.ownerDocument ?? document);
  // RN-6: ao entrar no modo teatro, na tela cheia ou na janela própria (também pelo teclado), o relógio de esconder os
  // controles começa sem precisar mexer o mouse.
  const sobreOVideoAgora = assistindo && (exibicao !== 'painel' || cheia);
  useEffect(() => {
    if (!sobreOVideoAgora) return;
    esconder.current = setTimeout(() => setControlesVisiveis(false), ESCONDER_CONTROLES_MS);
    return () => {
      clearTimeout(esconder.current);
      setTimeout(() => setControlesVisiveis(true), 0);
    };
  }, [sobreOVideoAgora]);
  // Item 39: ao parar de assistir (Fechar, ou o painel sumir) com o vídeo em tela cheia, sai da tela cheia.
  // Sem isso a janela ficava em tela cheia, toda preta, só com o aviso "fulano está transmitindo" no meio.
  useEffect(() => {
    if (!assistindo) return;
    const el = caixa.current;
    return () => {
      const doc = el?.ownerDocument ?? document;
      if (el && doc.fullscreenElement === el) void doc.exitFullscreen().catch(() => undefined);
    };
  }, [assistindo]);
  // O <video> muda de lugar ao entrar e sair do modo teatro: prende a faixa de novo no elemento novo.
  useEffect(() => {
    const el = ref.current;
    if (!assistindo || !el || !faixa) return;
    // Numa janela própria, a mesma faixa com a visibilidade informada por ela (faixa-em-janela).
    return ligarFaixa(faixa, el);
  }, [assistindo, faixa, exibicao, alvoJanela]);
  // Modo teatro: Esc sai (a tela cheia trata o Esc dela).
  useEffect(() => {
    if (exibicao !== 'teatro') return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setExibicao('painel');
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [exibicao]);

  if (!assistindo) {
    return (
      <section key="aviso" className="aviso-transmissao" aria-label={`Transmissão de ${nome}`}>
        <span>
          <Icone nome="tela" tamanho={16} /> <strong>{nome}</strong> está transmitindo a tela.
        </span>
        <Espectadores nomes={espectadores} />
        <button type="button" onClick={() => setAssistindo(true)} disabled={!faixa}>
          {faixa ? 'Assistir' : 'Conectando…'}
        </button>
      </section>
    );
  }
  const teatro = exibicao === 'teatro';
  const emJanela = exibicao === 'janela';
  const sobreOVideo = cheia || teatro || emJanela;
  const grande = (
    <section
      key="assistindo"
      ref={caixa}
      className={`transmissao-grande${teatro ? ' teatro' : ''}${emJanela ? ' em-janela' : ''}${sobreOVideo && !controlesVisiveis ? ' controles-ocultos' : ''}`}
      aria-label={`Transmissão de ${nome}`}
      onMouseMove={sobreOVideo ? mostrarControles : undefined}
      onMouseLeave={sobreOVideo ? () => setControlesVisiveis(false) : undefined}
      onClick={teatro ? (e) => e.stopPropagation() : undefined}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        aria-label={`Tela de ${nome}`}
        // RF-4: no painel, duplo clique abre o modo teatro; no teatro e na janela própria, alterna a tela cheia.
        onDoubleClick={() => (exibicao === 'painel' && !cheia ? setExibicao('teatro') : alternarTelaCheia(caixa.current))}
      />
      <div className="transmissao-acoes">
        <span className="com-icone transmissao-nome">
          <Icone nome="tela" tamanho={16} /> {nome}
        </span>
        <Espectadores nomes={espectadores} />
        <div className="transmissao-volume">
          <button
            type="button"
            className="secundario"
            aria-pressed={mudo || volume === 0}
            aria-label={mudo || volume === 0 ? 'Ligar o som da transmissão' : 'Mutar o som da transmissão'}
            title={mudo || volume === 0 ? 'Ligar o som' : 'Mutar'}
            onClick={() => (volume === 0 ? (setVolume(1), setMudo(false)) : setMudo(!mudo))}
          >
            <Icone nome={mudo || volume === 0 ? 'volumeMudo' : volume < 0.5 ? 'volumeBaixo' : 'altoFalante'} tamanho={16} />
          </button>
          <input
            type="range"
            min={0}
            max={200}
            step={5}
            value={mudo ? 0 : Math.round(volume * 100)}
            aria-label="Volume da transmissão"
            aria-valuetext={`${mudo ? 0 : Math.round(volume * 100)}%`}
            title={`${mudo ? 0 : Math.round(volume * 100)}%`}
            onChange={(e) => {
              setVolume(Number(e.target.value) / 100);
              setMudo(false);
            }}
          />
        </div>
        {!emJanela && (
          <BotaoBarra
            rotulo={teatro ? 'Sair do modo teatro' : 'Modo teatro'}
            icone={teatro ? 'reduzir' : 'janela'}
            pressionado={teatro}
            onClick={() => setExibicao(teatro ? 'painel' : 'teatro')}
          />
        )}
        {id !== undefined && (
          <BotaoBarra
            rotulo={emJanela ? 'Trazer de volta para o app' : 'Abrir em janela própria'}
            icone={emJanela ? 'alfinete' : 'ampliar'}
            onClick={() => setExibicao(emJanela ? 'painel' : 'janela')}
          />
        )}
        <BotaoBarra rotulo={cheia ? 'Sair da tela cheia' : 'Tela cheia'} icone={cheia ? 'reduzir' : 'ampliar'} onClick={() => alternarTelaCheia(caixa.current)} />
        <BotaoBarra rotulo="Fechar" icone="fechar" onClick={() => setAssistindo(false)} />
      </div>
    </section>
  );
  if (emJanela) {
    // A transmissão sai do app (RN-3); aqui fica o aviso para trazer de volta.
    return (
      <>
        <section className="aviso-transmissao" aria-label={`Transmissão de ${nome}`}>
          <span>
            <Icone nome="tela" tamanho={16} /> Assistindo <strong>{nome}</strong> numa janela própria.
          </span>
          <Espectadores nomes={espectadores} />
          <button type="button" className="secundario" onClick={() => setExibicao('painel')}>
            Trazer de volta
          </button>
          <button type="button" className="secundario" onClick={() => setAssistindo(false)}>
            Fechar
          </button>
        </section>
        {alvoJanela && createPortal(grande, alvoJanela)}
      </>
    );
  }
  if (!teatro) return grande;
  // RN-4: por cima do app, no <body> (fora do painel do meio, que tem vidro e cortaria a camada), inteiro na janela.
  return createPortal(
    <div className="teatro-fundo" role="presentation" onClick={() => setExibicao('painel')}>
      {grande}
    </div>,
    document.body,
  );
}

/** Controles some depois deste tempo parado (tela cheia e modo teatro). */
export const ESCONDER_CONTROLES_MS = 3000;

/**
 * Botão da barra de controles (RN-5): ícone e texto; em largura estreita o texto some (CSS), o nome acessível fica.
 */
export function BotaoBarra({ rotulo, icone, onClick, pressionado }: { rotulo: string; icone: Parameters<typeof Icone>[0]['nome']; onClick: () => void; pressionado?: boolean }) {
  return (
    <button type="button" className="secundario botao-barra" aria-label={rotulo} title={rotulo} aria-pressed={pressionado} onClick={onClick}>
      <Icone nome={icone} tamanho={16} />
      <span className="botao-barra-texto" aria-hidden="true">
        {rotulo}
      </span>
    </button>
  );
}
