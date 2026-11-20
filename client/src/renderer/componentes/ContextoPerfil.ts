import { createContext } from 'react';

/** Mini perfil: abre o cartão de uma pessoa junto do elemento clicado (provido pela tela principal). */
export const ContextoPerfil = createContext<((usuarioId: number, ancora: HTMLElement) => void) | null>(null);
