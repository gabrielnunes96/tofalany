import { useEffect, useRef } from 'react';
import type { UsuarioDto } from '@tofalando/shared';
import type { FaixaVideo, VideoSala } from '../servicos/voz';

/** Um vídeo: prende a faixa no <video> enquanto estiver na tela. */
function Quadro({ faixa, nome, meu }: { faixa: FaixaVideo; nome: string; meu: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    faixa.attach(el);
    return () => {
      faixa.detach(el);
    };
  }, [faixa]);
  return (
    <figure className={`quadro-video${meu ? ' meu' : ''}`}>
      <video ref={ref} autoPlay playsInline muted aria-label={`Vídeo de ${nome}`} />
      <figcaption>{meu ? `${nome} (você)` : nome}</figcaption>
    </figure>
  );
}

/** RF-25: grade de câmeras do canal de voz (a minha como prévia, espelhada). */
export function GradeVideos({ videos, usuarios, euId }: { videos: VideoSala[]; usuarios: UsuarioDto[]; euId: number }) {
  if (videos.length === 0) return null;
  const nome = (id: number) => usuarios.find((u) => u.id === id)?.nomeExibicao ?? 'Alguém';
  return (
    <section className="grade-videos" aria-label="Câmeras">
      {videos.map((v) => (
        <Quadro key={v.meu ? 'meu' : v.usuarioId} faixa={v.faixa} meu={v.meu} nome={nome(v.meu ? euId : v.usuarioId)} />
      ))}
    </section>
  );
}
