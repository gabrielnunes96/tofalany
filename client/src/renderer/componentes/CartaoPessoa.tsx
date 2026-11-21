import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { validarTextoMensagem, type ComunidadeDto, type PerfilDto, type StatusPessoa, type UsuarioDto } from '@tofalando/shared';
import { Avatar } from './Avatar';
import { StatusPonto, TEXTO_STATUS } from './StatusPonto';
import { TextoComLinks } from './Previa';
import { estiloFundo } from './fundoPerfil';
import { ConvidarParaServidor } from './ConvidarParaServidor';

export interface PropsCartao {
  /** undefined = conta removida (RN-9). */
  usuario: UsuarioDto | undefined;
  servidorUrl: string;
  /** Posição do clique (o cartão fica dentro da janela). */
  x: number;
  y: number;
  eu: boolean;
  status: StatusPessoa;
  atividade?: string[];
  /** Cargo personalizado (nome e cor), se houver. */
  funcao?: { nome: string; cor: string };
  /** Amigos e servidores em comum (chega depois; undefined enquanto carrega ou se não dá para ver). */
  carregarPerfil?: () => Promise<PerfilDto | undefined>;
  aoMensagem: (texto: string) => Promise<string | null>;
  aoConversar: () => void;
  aoVerPerfil: () => void;
  aoEditarPerfil: () => void;
  /** qualidade-de-vida, RF-2: convidar a pessoa para um servidor (ausente para mim mesmo). */
  convite?: { carregar: () => Promise<ComunidadeDto[]>; aoConvidar: (comunidadeId: number) => Promise<string | null> };
  /** `devolverFoco`: Esc devolve o foco a quem abriu; o clique fora deixa onde a pessoa clicou. */
  aoFechar: (devolverFoco: boolean) => void;
}

const LARGURA = 320;
const MARGEM = 8;

/** "AAAA-MM-DD" → "12/10/2026". */
export function dataCurta(d: string): string {
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}`;
}

function textoEmComum(p: PerfilDto): string {
  const partes: string[] = [];
  const a = p.emComum.amigos.length;
  const s = p.emComum.servidores.length;
  if (a) partes.push(`${a} ${a === 1 ? 'amigo em comum' : 'amigos em comum'}`);
  if (s) partes.push(`${s} ${s === 1 ? 'servidor em comum' : 'servidores em comum'}`);
  return partes.join(' · ');
}

/** Mini perfil (RF-2, RF-5): cartão com o fundo, a foto, o nome, os cargos, o status, o "sobre mim" e o campo de mensagem. */
export function CartaoPessoa({ usuario, servidorUrl, x, y, eu, status, atividade = [], funcao, carregarPerfil, aoMensagem, aoConversar, aoVerPerfil, aoEditarPerfil, convite, aoFechar }: PropsCartao) {
  const caixa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  });
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [perfil, setPerfil] = useState<PerfilDto | undefined>(undefined);
  // Abaixo do clique; se não couber, acima. Medido depois de desenhar (a altura muda com o conteúdo).
  const [topo, setTopo] = useState(y);
  const esquerda = Math.max(MARGEM, Math.min(x, window.innerWidth - LARGURA - MARGEM));
  useLayoutEffect(() => {
    const altura = caixa.current?.offsetHeight ?? 0;
    const cabeAbaixo = y + altura <= window.innerHeight - MARGEM;
    setTopo(cabeAbaixo ? y : Math.max(MARGEM, Math.min(y - altura - 40, window.innerHeight - altura - MARGEM)));
  }, [y, perfil, usuario]);

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) fechar.current(false);
    };
    // Esc fecha mesmo com o foco fora do cartão (conta removida, depois do último botão).
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar.current(true);
      }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    (campo.current ?? caixa.current?.querySelector<HTMLElement>('button') ?? caixa.current)?.focus();
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, []);

  useEffect(() => {
    let vivo = true;
    void carregarPerfil?.()
      .catch(() => undefined)
      .then((p) => vivo && setPerfil(p));
    return () => {
      vivo = false;
    };
  }, [carregarPerfil]);

  async function enviar() {
    const v = validarTextoMensagem(texto);
    if (!v.ok) return setErro(v.erro);
    setEnviando(true);
    const falha = await aoMensagem(v.valor);
    setEnviando(false);
    if (falha) setErro(falha);
    campo.current?.focus();
  }

  const reduzirMovimento = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nome = usuario?.nomeExibicao ?? 'conta removida';
  const emComum = perfil ? textoEmComum(perfil) : '';

  return (
    <div ref={caixa} className="cartao-pessoa" role="dialog" tabIndex={-1} aria-label={`Perfil de ${nome}`} style={{ left: esquerda, top: topo, width: LARGURA }}>
      <div className="cartao-pessoa-fundo" style={usuario ? estiloFundo(usuario.fundo, usuario.cor, servidorUrl, { parado: reduzirMovimento }) : undefined} aria-hidden="true" />
      <div className="cartao-pessoa-foto">
        <Avatar usuario={usuario ?? { nomeExibicao: '?', cor: '#3a2f5c', avatarUrl: null }} servidorUrl={servidorUrl} tamanho={72} />
        {usuario && <StatusPonto status={status} />}
      </div>
      <div className="cartao-pessoa-corpo">
        <h3 className={usuario ? undefined : 'removido'}>{nome}</h3>
        {usuario && (
          <>
            <p className="cartao-pessoa-usuario">
              @{usuario.usuario} · <span className="suave">{TEXTO_STATUS[status]}</span>
            </p>
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
              <p className="cartao-pessoa-sobre" dir="auto">
                <TextoComLinks texto={usuario.sobreMim} />
              </p>
            )}
            {usuario.membroDesde ? (
              <p className="cartao-pessoa-desde">
                <span className="suave">Membro desde</span> {dataCurta(usuario.membroDesde)}
              </p>
            ) : (
              perfil?.contaDesde && (
                <p className="cartao-pessoa-desde">
                  <span className="suave">Conta desde</span> {dataCurta(perfil.contaDesde)}
                </p>
              )
            )}
            <p className="cartao-pessoa-comum suave" aria-live="polite">
              {emComum}
            </p>
            {eu ? (
              <button type="button" className="secundario" onClick={aoEditarPerfil}>
                Editar perfil
              </button>
            ) : (
              <>
                <input
                  ref={campo}
                  className="cartao-pessoa-campo"
                  aria-label={`Mensagem para @${usuario.usuario}`}
                  placeholder={`Mensagem para @${usuario.usuario}`}
                  value={texto}
                  maxLength={4000}
                  readOnly={enviando}
                  onChange={(e) => {
                    setTexto(e.target.value);
                    setErro(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.nativeEvent.isComposing && !enviando && texto.trim()) {
                      e.preventDefault();
                      void enviar();
                    }
                  }}
                />
                {erro && (
                  <p className="erro" role="alert">
                    {erro}
                  </p>
                )}
                <div className="cartao-pessoa-botoes">
                  <button type="button" onClick={aoConversar} disabled={enviando}>
                    Mensagem
                  </button>
                  <button type="button" className="secundario" onClick={aoVerPerfil}>
                    Ver perfil
                  </button>
                </div>
                {convite && <ConvidarParaServidor carregar={convite.carregar} aoConvidar={convite.aoConvidar} />}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
