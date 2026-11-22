import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AvisoAtualizacao } from './componentes/AvisoAtualizacao';
import { ponte } from './servicos/ponte';
import '@fontsource-variable/inter/wght.css';
// Títulos dos temas da loja (OFL); o navegador só baixa a fonte quando um tema a usa.
import '@fontsource/cinzel/latin-700.css';
import '@fontsource/marcellus-sc/latin-400.css';
import '@fontsource/bangers/latin-400.css';
import './estilos/base.css';

// Backlog v2, item 9: o tema escolhido vale desde a primeira tela.
void ponte()
  .config.ler()
  .then((c) => {
    if (c.tema) document.documentElement.dataset.tema = c.tema;
  })
  .catch(() => undefined);

// E2E (volume-da-voz, T-6): mede o nivelamento da voz num OfflineAudioContext, no Chromium de verdade.
if (ponte().modoTeste) {
  void import('./servicos/nivel-voz-medicao').then(({ medirNivel }) => {
    (window as unknown as { __medirNivel?: typeof medirNivel }).__medirNivel = medirNivel;
  });
  // E2E (mover-e-afk): adianta o relógio da vigia de inatividade.
  void import('./estado/afk').then(({ relogioAfk }) => {
    (window as unknown as { __adiantarRelogioAfk?: (ms: number) => void }).__adiantarRelogioAfk = (ms) => {
      relogioAfk.adiantarMs = ms;
    };
  });
}

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado.');
createRoot(raiz).render(
  <StrictMode>
    <App />
    <AvisoAtualizacao atualizacao={ponte().atualizacao} />
  </StrictMode>,
);
