import { useState } from 'react';
import type { UsuarioDto } from '@tofalando/shared';

interface Props {
  usuario: Pick<UsuarioDto, 'nomeExibicao' | 'cor' | 'avatarUrl'>;
  servidorUrl: string;
  tamanho?: number;
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
    <span className="avatar avatar-inicial" style={{ ...estilo, background: usuario.cor, fontSize: tamanho * 0.45 }} aria-hidden="true">
      {inicial}
    </span>
  );
}
