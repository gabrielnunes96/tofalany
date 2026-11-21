import { useEffect, useRef, useState } from 'react';

/**
 * video-teatro-cameras-e-sons (R-1): "janela própria". Abre `about:blank` com um nome conhecido (o processo principal
 * só deixa esse caso), copia para ela os estilos e o tema do app e devolve um elemento dela para um `createPortal`:
 * o React desta janela desenha lá, com as mesmas faixas de vídeo (sem nova conexão). Fechar a janela pelo sistema chama
 * `aoFechar`; desmontar (ou `nome` nulo) fecha a janela.
 */
export function useJanelaPropria(nome: string | null, titulo: string, aoFechar: () => void): HTMLElement | null {
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    if (!nome) return;
    const filha = window.open('about:blank', nome, 'popup');
    // Recusada pelo processo principal (limite de janelas ou já aberta: ela só ganhou o foco).
    if (!filha) {
      aoFecharRef.current();
      return;
    }
    const doc = filha.document;
    doc.title = titulo;
    // Estilos e tema do app (os <link> e <style> do Vite e o data-tema da raiz).
    const copiarRaiz = () => {
      for (const { name, value } of [...document.documentElement.attributes]) doc.documentElement.setAttribute(name, value);
    };
    copiarRaiz();
    const ehEstilo = (no: Node): no is Element => no instanceof Element && (no.tagName === 'STYLE' || (no.tagName === 'LINK' && no.getAttribute('rel') === 'stylesheet'));
    for (const no of document.head.querySelectorAll('style, link[rel="stylesheet"]')) doc.head.appendChild(no.cloneNode(true));
    // Estilos que chegam depois (CSS carregado sob demanda; em desenvolvimento, a atualização do Vite) vão junto.
    const estilosNovos = new MutationObserver((mudancas) => {
      for (const m of mudancas) for (const no of m.addedNodes) if (ehEstilo(no)) doc.head.appendChild(no.cloneNode(true));
    });
    estilosNovos.observe(document.head, { childList: true });
    doc.body.className = 'janela-propria';
    const raiz = doc.createElement('div');
    raiz.className = 'janela-propria-raiz';
    doc.body.appendChild(raiz);
    const tema = new MutationObserver(copiarRaiz);
    tema.observe(document.documentElement, { attributes: true });
    let fechandoDaqui = false;
    const fechouLa = () => {
      if (!fechandoDaqui) aoFecharRef.current();
    };
    filha.addEventListener('pagehide', fechouLa);
    // Fora do corpo do efeito (o React desenha no portal na renderização seguinte).
    let vivo = true;
    queueMicrotask(() => vivo && setAlvo(raiz));
    return () => {
      vivo = false;
      tema.disconnect();
      estilosNovos.disconnect();
      filha.removeEventListener('pagehide', fechouLa);
      fechandoDaqui = true;
      setAlvo(null);
      // Solta os vídeos antes de fechar (A6): nada fica tocando na janela que sai.
      for (const v of doc.querySelectorAll('video')) v.srcObject = null;
      if (!filha.closed) filha.close();
    };
  }, [nome, titulo]);
  return alvo;
}
