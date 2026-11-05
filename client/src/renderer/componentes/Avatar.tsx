import { useState } from 'react';
import type { UsuarioDto } from '@tofalando/shared';

interface Props {
  usuario: Pick<UsuarioDto, 'nomeExibicao' | 'cor' | 'avatarUrl'>;
  servidorUrl: string;
  tamanho?: number;
}

/** Texto legível sobre a cor do perfil: escuro nas cores claras (neon), branco nas escuras. */
export function corDoTexto(fundo: string): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fundo);
  if (!m) return '#ffffff';
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const luminancia = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Ponto em que o contraste com preto e com branco se igualam (~0,18).
  return luminancia > 0.18 ? '#07060d' : '#ffffff';
}

/** Foto do perfil ou, sem foto, a inicial sobre a cor do perfil. */
export function Avatar({ usuario, servidorUrl, tamanho = 32 }: Props) {
  const estilo = { width: tamanho, height: tamanho };
  const [falhou, setFalhou] = useState<string | null>(null);
  if (usuario.avatarUrl && falhou !== usuario.avatarUrl) {
    const url = usuario.avatarUrl;
    return (
      <img
        className="avatar"
        src={`${servidorUrl}${url}`}
        alt=""
        width={tamanho}
        height={tamanho}
        style={estilo}
        onError={() => setFalhou(url)}
      />
    );
  }
  const inicial = [...usuario.nomeExibicao.trim()][0]?.toUpperCase() ?? '?';
  return (
    <span className="avatar avatar-inicial" style={{ ...estilo, background: usuario.cor, color: corDoTexto(usuario.cor), fontSize: tamanho * 0.45 }} aria-hidden="true">
      {inicial}
    </span>
  );
}
