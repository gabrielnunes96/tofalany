import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AvisoAtualizacao } from './componentes/AvisoAtualizacao';
import { ponte } from './servicos/ponte';
import '@fontsource-variable/inter/wght.css';
import './estilos/base.css';

// Backlog v2, item 9: o tema escolhido vale desde a primeira tela.
void ponte()
  .config.ler()
  .then((c) => {
    if (c.tema) document.documentElement.dataset.tema = c.tema;
  })
  .catch(() => undefined);

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado.');
createRoot(raiz).render(
  <StrictMode>
    <App />
    <AvisoAtualizacao atualizacao={ponte().atualizacao} />
  </StrictMode>,
);
