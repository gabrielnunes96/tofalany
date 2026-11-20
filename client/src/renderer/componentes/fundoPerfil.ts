import type { CSSProperties } from 'react';
import { urlArquivoValida, type FundoPerfil } from '@tofalando/shared';

const COR = /^#[0-9a-f]{6}$/i;

/**
 * Mini perfil: o fundo como estilo de CSS. Confere de novo o que veio do servidor (T-6, segurança): só cores #rrggbb e
 * arquivos do próprio servidor; qualquer outra coisa cai na cor de perfil. `parado` usa a miniatura (lista de membros).
 */
export function estiloFundo(fundo: FundoPerfil | null | undefined, corPerfil: string, servidorUrl: string, opcoes: { parado?: boolean } = {}): CSSProperties {
  const cores = (fundo?.cores ?? []).filter((c) => COR.test(c));
  const base = cores.length === 2 ? `linear-gradient(135deg, ${cores[0]}, ${cores[1]})` : (cores[0] ?? (COR.test(corPerfil) ? corPerfil : '#3a2f5c'));
  const arquivo = opcoes.parado ? fundo?.miniUrl : fundo?.url;
  if (arquivo && urlArquivoValida(arquivo)) {
    return { backgroundImage: `url("${servidorUrl}${arquivo}")${cores.length === 2 ? `, ${base}` : ''}`, backgroundColor: cores.length === 2 ? undefined : base, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return cores.length === 2 ? { backgroundImage: base } : { backgroundColor: base };
}

/** Mini perfil (CA-14): o fundo da linha na lista de membros, como valor de `background` (miniatura parada). */
export function fundoDaLinha(fundo: FundoPerfil | null | undefined, corPerfil: string, servidorUrl: string): string | undefined {
  if (!fundo) return undefined;
  const e = estiloFundo(fundo, corPerfil, servidorUrl, { parado: true });
  return (e.backgroundImage as string | undefined) ?? (e.backgroundColor as string | undefined);
}
