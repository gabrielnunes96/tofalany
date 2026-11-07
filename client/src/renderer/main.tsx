import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { AvisoAtualizacao } from './componentes/AvisoAtualizacao';
import { ponte } from './servicos/ponte';
import './estilos/base.css';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Elemento #raiz não encontrado.');
createRoot(raiz).render(
  <StrictMode>
    <App />
    <AvisoAtualizacao atualizacao={ponte().atualizacao} />
  </StrictMode>,
);
