import { useState, type KeyboardEvent } from 'react';
import { validarTextoMensagem, type MensagemDto, type UsuarioDto } from '@tofalando/shared';
import { Avatar } from './Avatar';
import { ListaAnexos } from './Anexos';

interface Props {
  mensagem: MensagemDto;
  autor: UsuarioDto | undefined;
  servidorUrl: string;
  podeEditar: boolean;
  podeApagar: boolean;
  aoEditar: (id: number, texto: string) => Promise<string | null>;
  aoApagar: (id: number) => Promise<string | null>;
}

const horario = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Uma mensagem com editar (autor) e apagar (autor ou administrador em canal) — RF-11, RN-9. */
export function ItemMensagem({ mensagem: m, autor, servidorUrl, podeEditar, podeApagar, aoEditar, aoApagar }: Props) {
  const [modo, setModo] = useState<'ver' | 'editar' | 'apagar'>('ver');
  const [texto, setTexto] = useState(m.texto);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    const v = validarTextoMensagem(texto);
    if (!v.ok) return setErro(v.erro);
    setOcupado(true);
    const falha = await aoEditar(m.id, v.valor);
    setOcupado(false);
    setErro(falha);
    if (!falha) setModo('ver');
  }

  function cancelarEdicao() {
    setTexto(m.texto);
    setErro(null);
    setModo('ver');
  }

  function teclas(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') cancelarEdicao();
    else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void salvar();
    }
  }

  async function apagar() {
    setOcupado(true);
    const falha = await aoApagar(m.id);
    setOcupado(false);
    // Deu certo: a mensagem sai da lista e este item desmonta.
    if (falha) {
      setErro(falha);
      setModo('ver');
    }
  }

  return (
    <li className="mensagem" aria-label={`Mensagem de ${autor?.nomeExibicao ?? 'conta removida'}`}>
      <Avatar usuario={autor ?? { nomeExibicao: '?', cor: '#3a2f5c', avatarUrl: null }} servidorUrl={servidorUrl} tamanho={36} />
      <div className="mensagem-corpo">
        <div className="mensagem-topo">
          <span className={autor ? 'autor' : 'autor removido'}>{autor ? autor.nomeExibicao : 'conta removida'}</span>
          <time dateTime={new Date(m.criadaEm).toISOString()}>{horario.format(m.criadaEm)}</time>
          {m.editadaEm !== null && <span className="editada">(editada)</span>}
          {modo === 'ver' && (podeEditar || podeApagar) && (
            <span className="mensagem-acoes">
              {podeEditar && (
                <button
                  type="button"
                  className="icone"
                  onClick={() => {
                    setTexto(m.texto);
                    setModo('editar');
                  }}
                >
                  Editar
                </button>
              )}
              {podeApagar && (
                <button type="button" className="icone" onClick={() => setModo('apagar')}>
                  Apagar
                </button>
              )}
            </span>
          )}
        </div>
        {modo === 'editar' ? (
          <div className="mensagem-edicao">
            <textarea aria-label="Editar mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={teclas} maxLength={4000} autoFocus />
            <p className="suave dica">Enter salva · Esc cancela</p>
            <div className="form-nome-botoes">
              <button type="button" onClick={() => void salvar()} disabled={ocupado}>
                Salvar
              </button>
              <button type="button" className="secundario" onClick={cancelarEdicao}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          m.texto && <p className="mensagem-texto">{m.texto}</p>
        )}
        <ListaAnexos anexos={m.anexos} servidorUrl={servidorUrl} />
        {modo === 'apagar' && (
          <div className="confirmar" role="group" aria-label="Confirmar exclusão da mensagem">
            <span>Apagar esta mensagem?</span>
            <button type="button" className="perigo" onClick={() => void apagar()} disabled={ocupado}>
              Confirmar
            </button>
            <button type="button" className="secundario" onClick={() => setModo('ver')}>
              Cancelar
            </button>
          </div>
        )}
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
      </div>
    </li>
  );
}
