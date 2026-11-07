import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PreviaLink } from '@tofalando/shared';
import { ponte } from '../servicos/ponte';

/** Backlog v2, item 10b: quem busca a prévia (o servidor). Sem provedor (testes, telas soltas), não há prévia. */
export const ContextoPrevia = createContext<((url: string) => Promise<PreviaLink | undefined>) | null>(null);

/** Busca com cache (um pedido por link enquanto a tela estiver aberta). */
export function criarBuscaPrevia(buscar: (url: string) => Promise<PreviaLink | undefined>): (url: string) => Promise<PreviaLink | undefined> {
  const cache = new Map<string, Promise<PreviaLink | undefined>>();
  return (url) => {
    const existente = cache.get(url);
    if (existente) return existente;
    const nova = buscar(url).catch(() => undefined);
    cache.set(url, nova);
    return nova;
  };
}

const LINK = /\bhttps?:\/\/[^\s<>"'`]+/gi;
/** Pontuação no fim normalmente é da frase, não do link: "veja https://x.io/a." → "https://x.io/a". */
const limparFim = (url: string) => url.replace(/[.,;:!?)\]}'"]+$/, '');

export function linksDoTexto(texto: string): string[] {
  return [...texto.matchAll(LINK)].map((m) => limparFim(m[0]));
}

/** Texto da mensagem com os links clicáveis (abrem no navegador do sistema). */
export function TextoComLinks({ texto }: { texto: string }) {
  const partes: ReactNode[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(LINK)) {
    const url = limparFim(m[0]);
    const inicio = m.index;
    if (inicio > ultimo) partes.push(texto.slice(ultimo, inicio));
    partes.push(
      <a key={inicio} href={url} target="_blank" rel="noreferrer noopener">
        {url}
      </a>,
    );
    ultimo = inicio + url.length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return <>{partes}</>;
}

/** Cartão com título, descrição e miniatura; no YouTube, "Assistir" abre o player ali mesmo. */
export function CartaoPrevia({ url }: { url: string }) {
  const buscar = useContext(ContextoPrevia);
  const [previa, setPrevia] = useState<PreviaLink | null>(null);
  const [assistindo, setAssistindo] = useState(false);

  useEffect(() => {
    if (!buscar) return;
    let vivo = true;
    void buscar(url)
      .then((p) => vivo && p && setPrevia(p))
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [buscar, url]);

  // O player do YouTube só pode carregar (filtro de rede do app) enquanto estiver aberto.
  useEffect(() => {
    if (!assistindo) return;
    void ponte()
      .rede.video(true)
      .catch(() => undefined);
    return () => {
      void ponte()
        .rede.video(false)
        .catch(() => undefined);
    };
  }, [assistindo]);

  if (!previa) return null;
  const youtube = previa.tipo === 'youtube' && previa.videoId;
  return (
    <article className="previa-link" aria-label={`Prévia: ${previa.titulo ?? previa.site ?? url}`}>
      {previa.site && <p className="previa-site">{previa.site}</p>}
      {previa.titulo && (
        <a className="previa-titulo" href={url} target="_blank" rel="noreferrer noopener">
          {previa.titulo}
        </a>
      )}
      {previa.descricao && <p className="previa-descricao">{previa.descricao}</p>}
      {youtube && assistindo ? (
        <div className="previa-player">
          <iframe
            title={`Vídeo: ${previa.titulo ?? 'YouTube'}`}
            src={`https://www.youtube-nocookie.com/embed/${previa.videoId}?autoplay=1&rel=0`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
          <button type="button" className="secundario" onClick={() => setAssistindo(false)}>
            Fechar vídeo
          </button>
        </div>
      ) : (
        previa.imagem && (
          <div className="previa-imagem">
            <img src={previa.imagem} alt="" />
            {youtube && (
              <button type="button" className="previa-assistir" aria-label={`Assistir ${previa.titulo ?? 'vídeo'} aqui`} onClick={() => setAssistindo(true)}>
                ▶
              </button>
            )}
          </div>
        )
      )}
    </article>
  );
}
