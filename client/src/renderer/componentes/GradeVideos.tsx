import { useEffect, useRef, useState, type PointerEvent as EventoPonteiro } from 'react';
import type { UsuarioDto } from '@tofalando/shared';
import type { FaixaVideo, VideoSala } from '../servicos/voz';

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
  const telaCheia = () => void figura.current?.requestFullscreen?.().catch(() => undefined);
  const rotulo = meu ? `${nome} (você)` : nome;
  return (
    <figure ref={figura} className={`quadro-video${meu ? ' meu' : ''}`} onDoubleClick={telaCheia}>
      <video ref={ref} autoPlay playsInline muted aria-label={`Vídeo de ${nome}`} />
      <figcaption>{rotulo}</figcaption>
      <button type="button" className="icone quadro-tela-cheia" aria-label={`Tela cheia: ${rotulo}`} title="Tela cheia (ou duplo clique)" onClick={telaCheia}>
        ⛶
      </button>
    </figure>
  );
}

const CHAVE_POSICAO = 'tofalany.cameras';
type Modo = { flutuante: boolean; x: number; y: number };

function lerModo(): Modo {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_POSICAO) ?? '') as Partial<Modo>;
    return { flutuante: bruto.flutuante === true, x: Number(bruto.x) || 24, y: Number(bruto.y) || 80 };
  } catch {
    return { flutuante: false, x: 24, y: 80 };
  }
}

/**
 * RF-25: câmeras do canal de voz (a minha como prévia, espelhada). Backlog v2, itens 11 e 11b: cada câmera vai
 * para a tela cheia, e a grade pode virar uma janelinha flutuante, arrastável para qualquer canto (a posição fica
 * guardada neste computador).
 */
export function GradeVideos({ videos, usuarios, euId }: { videos: VideoSala[]; usuarios: UsuarioDto[]; euId: number }) {
  const [modo, setModo] = useState<Modo>(lerModo);
  const arrasto = useRef<{ dx: number; dy: number } | null>(null);
  const caixa = useRef<HTMLElement>(null);

  const guardar = (novo: Modo) => {
    setModo(novo);
    try {
      localStorage.setItem(CHAVE_POSICAO, JSON.stringify(novo));
    } catch {
      // Sem armazenamento: vale só nesta sessão.
    }
  };

  // Mantém a janelinha dentro da janela do app (ex.: depois de diminuir a janela).
  const limitar = (x: number, y: number) => {
    const el = caixa.current;
    const largura = el?.offsetWidth ?? 320;
    const altura = el?.offsetHeight ?? 200;
    return { x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - largura - 8)), y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - altura - 8)) };
  };

  const comecar = (e: EventoPonteiro<HTMLElement>) => {
    if (!modo.flutuante || (e.target as HTMLElement).closest('button')) return;
    arrasto.current = { dx: e.clientX - modo.x, dy: e.clientY - modo.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const mover = (e: EventoPonteiro<HTMLElement>) => {
    if (!arrasto.current) return;
    const p = limitar(e.clientX - arrasto.current.dx, e.clientY - arrasto.current.dy);
    setModo((m) => ({ ...m, ...p }));
  };
  const soltar = () => {
    if (!arrasto.current) return;
    arrasto.current = null;
    guardar(modo);
  };

  if (videos.length === 0) return null;
  const nome = (id: number) => usuarios.find((u) => u.id === id)?.nomeExibicao ?? 'Alguém';
  return (
    <section
      ref={caixa}
      className={`grade-videos${modo.flutuante ? ' flutuante' : ''}`}
      aria-label="Câmeras"
      style={modo.flutuante ? { left: modo.x, top: modo.y } : undefined}
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
          onClick={() => guardar({ ...modo, flutuante: !modo.flutuante })}
        >
          {modo.flutuante ? '📌' : '🗗'}
        </button>
      </div>
      {videos.map((v) => (
        <Quadro key={v.meu ? 'meu' : v.usuarioId} faixa={v.faixa} meu={v.meu} nome={nome(v.meu ? euId : v.usuarioId)} />
      ))}
    </section>
  );
}
