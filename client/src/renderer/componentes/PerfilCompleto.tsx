import { useEffect, useRef, useState } from 'react';
import type { AmizadeDto, PerfilDto, StatusPessoa, UsuarioDto } from '@tofalando/shared';
import { Avatar } from './Avatar';
import { StatusPonto, TEXTO_STATUS } from './StatusPonto';
import { TextoComLinks } from './Previa';
import { estiloFundo } from './fundoPerfil';
import { dataCurta } from './CartaoPessoa';

export interface PropsPerfilCompleto {
  usuario: UsuarioDto;
  servidorUrl: string;
  eu: boolean;
  status: StatusPessoa;
  atividade?: string[];
  funcao?: { nome: string; cor: string };
  /** Pessoas que o app já conhece (membros e conhecidos), para mostrar os amigos em comum. */
  pessoas: UsuarioDto[];
  carregarPerfil: () => Promise<PerfilDto | undefined>;
  amizade: AmizadeDto['situacao'] | undefined;
  aoConversar: () => void;
  aoPedirAmizade: () => void;
  aoAceitarAmizade: () => void;
  aoRemoverAmizade: () => void;
  aoFechar: () => void;
}

/** Mini perfil (RF-3): a janela maior, com os amigos e os servidores em comum e o botão de amizade. */
export function PerfilCompleto({
  usuario,
  servidorUrl,
  eu,
  status,
  atividade = [],
  funcao,
  pessoas,
  carregarPerfil,
  amizade,
  aoConversar,
  aoPedirAmizade,
  aoAceitarAmizade,
  aoRemoverAmizade,
  aoFechar,
}: PropsPerfilCompleto) {
  const janela = useRef<HTMLDivElement>(null);
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  });
  const [perfil, setPerfil] = useState<PerfilDto | undefined>(undefined);

  useEffect(() => {
    // O foco volta para quem estava focado antes de abrir.
    const antes = document.activeElement as HTMLElement | null;
    janela.current?.querySelector<HTMLElement>('button')?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar.current();
    };
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('keydown', tecla);
      if (antes?.isConnected) antes.focus();
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    void carregarPerfil()
      .catch(() => undefined)
      .then((p) => vivo && setPerfil(p));
    return () => {
      vivo = false;
    };
  }, [carregarPerfil]);

  const amigos = (perfil?.emComum.amigos ?? []).map((id) => pessoas.find((p) => p.id === id)).filter((p): p is UsuarioDto => !!p);
  const servidores = perfil?.emComum.servidores ?? [];

  return (
    <div className="dialogo-fundo perfil-completo-fundo-tela" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div ref={janela} className="perfil-completo" role="dialog" aria-modal="true" aria-label={`Perfil de ${usuario.nomeExibicao}`}>
        <button type="button" className="icone perfil-completo-fechar" aria-label="Fechar" onClick={aoFechar}>
          ×
        </button>
        <div className="perfil-completo-fundo" style={estiloFundo(usuario.fundo, usuario.cor, servidorUrl)} aria-hidden="true" />
        <div className="perfil-completo-conteudo">
          <div className="perfil-completo-lado">
            <div className="cartao-pessoa-foto perfil-completo-foto">
              <Avatar usuario={usuario} servidorUrl={servidorUrl} tamanho={104} />
              <StatusPonto status={status} />
            </div>
            <h2>{usuario.nomeExibicao}</h2>
            <p className="cartao-pessoa-usuario">
              @{usuario.usuario} · <span className="suave">{TEXTO_STATUS[status]}</span>
            </p>
            {!eu && (
              <div className="cartao-pessoa-botoes">
                <button type="button" onClick={aoConversar}>
                  Mensagem
                </button>
                {amizade === undefined && (
                  <button type="button" className="secundario" onClick={aoPedirAmizade}>
                    Adicionar amigo
                  </button>
                )}
                {amizade === 'enviado' && (
                  <button type="button" className="secundario" onClick={aoRemoverAmizade}>
                    Cancelar pedido
                  </button>
                )}
                {amizade === 'recebido' && (
                  <button type="button" className="secundario" onClick={aoAceitarAmizade}>
                    Aceitar pedido
                  </button>
                )}
                {amizade === 'amigo' && (
                  <button type="button" className="secundario" onClick={aoRemoverAmizade}>
                    Desfazer amizade
                  </button>
                )}
              </div>
            )}
            {(usuario.cargo === 'admin' || funcao) && (
              <ul className="cartao-pessoa-etiquetas" aria-label="Cargos">
                {usuario.cargo === 'admin' && (
                  <li className="etiqueta-cargo">
                    <span className="etiqueta-cor" style={{ background: 'var(--cor-acento)' }} aria-hidden="true" />
                    Administrador
                  </li>
                )}
                {funcao && (
                  <li className="etiqueta-cargo">
                    <span className="etiqueta-cor" style={{ background: funcao.cor }} aria-hidden="true" />
                    {funcao.nome}
                  </li>
                )}
              </ul>
            )}
            {atividade.map((t) => (
              <p key={t} className="cartao-pessoa-atividade">
                {t}
              </p>
            ))}
            {usuario.sobreMim && (
              <p className="cartao-pessoa-sobre perfil-completo-sobre" dir="auto">
                <TextoComLinks texto={usuario.sobreMim} />
              </p>
            )}
            {(usuario.membroDesde || perfil?.contaDesde) && (
              <dl className="perfil-completo-datas">
                {usuario.membroDesde && (
                  <>
                    <dt>Membro desde</dt>
                    <dd>{dataCurta(usuario.membroDesde)}</dd>
                  </>
                )}
                {perfil?.contaDesde && (
                  <>
                    <dt>Conta desde</dt>
                    <dd>{dataCurta(perfil.contaDesde)}</dd>
                  </>
                )}
              </dl>
            )}
          </div>
          {!eu && (
            <div className="perfil-completo-listas">
              <section aria-labelledby="perfil-amigos-comum">
                <h3 id="perfil-amigos-comum">
                  {perfil ? `${amigos.length} ${amigos.length === 1 ? 'amigo em comum' : 'amigos em comum'}` : 'Amigos em comum'}
                </h3>
                {perfil && amigos.length === 0 && <p className="suave">Nenhum amigo em comum.</p>}
                <ul className="perfil-completo-lista">
                  {amigos.map((a) => (
                    <li key={a.id}>
                      <Avatar usuario={a} servidorUrl={servidorUrl} tamanho={28} />
                      <span>{a.nomeExibicao}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-labelledby="perfil-servidores-comum">
                <h3 id="perfil-servidores-comum">
                  {perfil ? `${servidores.length} ${servidores.length === 1 ? 'servidor em comum' : 'servidores em comum'}` : 'Servidores em comum'}
                </h3>
                {perfil && servidores.length === 0 && <p className="suave">Nenhum servidor em comum.</p>}
                <ul className="perfil-completo-lista">
                  {servidores.map((s) => (
                    <li key={s.id}>
                      <span className="perfil-completo-servidor" aria-hidden="true">
                        {s.nome.slice(0, 2).toUpperCase()}
                      </span>
                      <span>{s.nome}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
