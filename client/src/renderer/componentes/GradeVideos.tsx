import { useEffect, useRef, useState, type PointerEvent as EventoPonteiro } from 'react';
import { createPortal } from 'react-dom';
import { gravarModoCameras, useModoCameras } from '../servicos/modo-cameras';
import type { UsuarioDto } from '@tofalando/shared';
import type { FaixaVideo, VideoSala } from '../servicos/voz';
import { alternarTelaCheia, useEmTelaCheia } from './telaCheia';
import { Icone } from './Icone';

/** Um vídeo: prende a faixa no <video> enquanto estiver na tela. Duplo clique (ou o botão) = tela cheia. */
function Quadro({ faixa, nome, meu }: { faixa: FaixaVideo; nome: string; meu: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const figura = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    faixa.attach(el);
    return () => {
      faixa.detach(el);
    };
  }, [faixa]);
  const cheia = useEmTelaCheia(figura);
  const telaCheia = () => alternarTelaCheia(figura.current);
  const rotulo = meu ? `${nome} (você)` : nome;
  return (
    <figure ref={figura} className={`quadro-video${meu ? ' meu' : ''}`} onDoubleClick={telaCheia}>
      <video ref={ref} autoPlay playsInline muted aria-label={`Vídeo de ${nome}`} />
      <figcaption>{rotulo}</figcaption>
      <button
        type="button"
        className="icone quadro-tela-cheia"
        aria-label={cheia ? `Sair da tela cheia: ${rotulo}` : `Tela cheia: ${rotulo}`}
        title={cheia ? 'Sair da tela cheia (ou Esc)' : 'Tela cheia (ou duplo clique)'}
        onClick={telaCheia}
      >
        <Icone nome={cheia ? 'reduzir' : 'ampliar'} tamanho={16} />
      </button>
    </figure>
  );
}

/**
 * RF-25: câmeras do canal de voz (a minha como prévia, espelhada). Backlog v2, itens 11 e 11b: cada câmera vai
 * para a tela cheia, e a grade pode virar uma janelinha flutuante, arrastável para qualquer canto (a posição fica
 * guardada neste computador). video-teatro-cameras-e-sons (RN-1): a janelinha é desenhada direto no <body>, por cima
 * de tudo; dentro do painel do meio (que tem vidro, backdrop-filter) ela ficava presa a ele e sumia ao passar da borda.
 */
export function GradeVideos({ videos, usuarios, euId }: { videos: VideoSala[]; usuarios: UsuarioDto[]; euId: number }) {
  const modo = useModoCameras();
  /** Posição durante o arrasto (só grava ao soltar). */
  const [arrastando, setArrastando] = useState<{ x: number; y: number } | null>(null);
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);
  const caixa = useRef<HTMLElement>(null);

  // Mantém a janelinha inteira dentro da janela do app (RN-1).
  const limitar = (x: number, y: number) => {
    const el = caixa.current;
    const largura = el?.offsetWidth ?? 320;
    const altura = el?.offsetHeight ?? 200;
    return limitarNaJanela(x, y, largura, altura, window.innerWidth, window.innerHeight);
  };

  const comecar = (e: EventoPonteiro<HTMLElement>) => {
    if (!modo.flutuante || (e.target as HTMLElement).closest('button')) return;
    arrasto.current = { dx: e.clientX - modo.x, dy: e.clientY - modo.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const mover = (e: EventoPonteiro<HTMLElement>) => {
    if (!arrasto.current) return;
    setArrastando(limitar(e.clientX - arrasto.current.dx, e.clientY - arrasto.current.dy));
  };
  const soltar = () => {
    if (!arrasto.current) return;
    arrasto.current = null;
    if (arrastando) gravarModoCameras({ ...modo, ...arrastando });
    setArrastando(null);
  };

  // A posição guardada pode ter ficado fora da janela (outro monitor, janela menor): na tela, a janelinha fica sempre
  // dentro da janela do app (senão as câmeras parecem ter sumido); redimensionar recalcula.
  const [, setTamanhoJanela] = useState(0);
  useEffect(() => {
    if (!modo.flutuante) return;
    const aoRedimensionar = () => setTamanhoJanela(window.innerWidth * 10_000 + window.innerHeight);
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, [modo.flutuante]);

  if (videos.length === 0) return null;
  // Na tela: sem ler o tamanho real (largura do CSS da janelinha e uma altura mínima), só para nunca ficar fora.
  const larguraFlutuante = Math.min(360, window.innerWidth * 0.4);
  const posicao = arrastando ?? limitarNaJanela(modo.x, modo.y, larguraFlutuante, 160, window.innerWidth, window.innerHeight);
  const nome = (id: number) => usuarios.find((u) => u.id === id)?.nomeExibicao ?? 'Alguém';
  const grade = (
    <section
      ref={caixa}
      className={`grade-videos${modo.flutuante ? ' flutuante' : ''}`}
      aria-label="Câmeras"
      style={modo.flutuante ? { left: posicao.x, top: posicao.y } : undefined}
      onPointerDown={comecar}
      onPointerMove={mover}
      onPointerUp={soltar}
    >
      <div className="grade-videos-barra">
        {modo.flutuante && <span className="suave">Arraste para mover</span>}
        <button
          type="button"
          className="icone"
          aria-pressed={modo.flutuante}
          aria-label={modo.flutuante ? 'Prender as câmeras no topo' : 'Câmeras flutuantes'}
          title={modo.flutuante ? 'Voltar as câmeras para o topo da conversa' : 'Soltar as câmeras numa janelinha que dá para arrastar'}
          onClick={() => gravarModoCameras({ ...modo, flutuante: !modo.flutuante })}
        >
          <Icone nome={modo.flutuante ? 'alfinete' : 'janela'} tamanho={16} />
        </button>
      </div>
      {videos.map((v) => (
        <Quadro key={v.meu ? 'meu' : v.usuarioId} faixa={v.faixa} meu={v.meu} nome={nome(v.meu ? euId : v.usuarioId)} />
      ))}
    </section>
  );
  return modo.flutuante ? createPortal(grade, document.body) : grade;
}

/** Posição (x, y) de uma caixa largura × altura inteira dentro de uma janela, com 8 px de margem (RN-1). */
export function limitarNaJanela(x: number, y: number, largura: number, altura: number, janelaLargura: number, janelaAltura: number) {
  return {
    x: Math.min(Math.max(8, x), Math.max(8, janelaLargura - largura - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, janelaAltura - altura - 8)),
  };
}
