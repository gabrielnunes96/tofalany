import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icone } from './Icone';
import { BotaoBarra } from './PainelTransmissao';
import { alternarTelaCheia, useEmTelaCheia } from './telaCheia';

/**
 * Backlog v2, item 12: o que a minha tela está mandando (mudo, sem rede). "Ampliar" abre grande dentro do app (não em
 * tela cheia). Transmitindo a tela em que o app está, a imagem não é desenhada: ela apareceria dentro da própria
 * transmissão, num espelho infinito para quem assiste.
 */
export function PreviaLocal({ faixa, telaInteira, mesmaTela, aoOcultar }: { faixa: MediaStreamTrack; telaInteira: boolean; mesmaTela: boolean; aoOcultar?: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [ampliada, setAmpliada] = useState(false);
  const previaCheia = useEmTelaCheia(ref);
  useEffect(() => {
    const v = ref.current;
    if (!v || mesmaTela) return;
    v.srcObject = new MediaStream([faixa]);
    void v.play().catch(() => undefined);
    return () => {
      v.srcObject = null;
    };
  }, [faixa, mesmaTela, ampliada]);
  useEffect(() => {
    if (!ampliada) return;
    // Em tela cheia, o Esc é da tela cheia (sai só dela); fora, fecha a prévia ampliada.
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setAmpliada(false);
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [ampliada]);
  if (mesmaTela) {
    return (
      <p className="previa-minha-tela previa-espelho" role="note">
        Você está transmitindo a tela em que o ToFalany está aberto: a prévia não aparece aqui para não virar espelho para quem assiste.
        {telaInteira && ' Para ver a prévia, transmita uma janela ou deixe o ToFalany em outro monitor.'}
      </p>
    );
  }
  const video = <video ref={ref} aria-label="Prévia da sua transmissão" muted playsInline />;
  if (ampliada) {
    // video-teatro-cameras-e-sons (RN-4): no <body> (fora do painel do meio, que cortava a prévia), inteira na janela,
    // com a barra de controles de quem transmite.
    return createPortal(
      <div className="previa-ampliada-fundo" role="presentation" onClick={() => setAmpliada(false)}>
        <figure className="previa-ampliada" role="dialog" aria-label="Prévia ampliada" onClick={(e) => e.stopPropagation()}>
          {video}
          <div className="transmissao-acoes previa-acoes">
            <span className="com-icone transmissao-nome">
              <Icone nome="tela" tamanho={16} /> Sua transmissão
            </span>
            <BotaoBarra rotulo={previaCheia ? 'Sair da tela cheia' : 'Tela cheia'} icone={previaCheia ? 'reduzir' : 'ampliar'} onClick={() => alternarTelaCheia(ref.current)} />
            {aoOcultar && <BotaoBarra rotulo="Ocultar prévia" icone="olho" onClick={aoOcultar} />}
            <BotaoBarra rotulo="Fechar (Esc)" icone="fechar" onClick={() => setAmpliada(false)} />
          </div>
        </figure>
      </div>,
      document.body,
    );
  }
  return (
    <figure className="previa-minha-tela" onDoubleClick={() => setAmpliada(true)}>
      {video}
      <button type="button" className="icone quadro-tela-cheia" aria-label="Ampliar prévia" title="Ampliar (ou duplo clique)" onClick={() => setAmpliada(true)}>
        <Icone nome="ampliar" tamanho={16} />
      </button>
    </figure>
  );
}
