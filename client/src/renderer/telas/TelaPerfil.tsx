import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AVATAR_MAX_BYTES, validarCor, validarNomeExibicao, type UsuarioDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';
import { Avatar } from '../componentes/Avatar';

interface Props {
  usuario: UsuarioDto;
  servidorUrl: string;
  api: Pick<ClienteApi, 'atualizarPerfil' | 'enviarAvatar'>;
  /** Atualiza a loja na hora (o evento do servidor também chega, para os outros). */
  aoAtualizar: (usuario: UsuarioDto) => void;
  aoVoltar: () => void;
}

const FORMATOS = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** RF-5: avatar, cor e nome de exibição. */
export function TelaPerfil({ usuario, servidorUrl, api, aoAtualizar, aoVoltar }: Props) {
  const [nome, setNome] = useState(usuario.nomeExibicao);
  const [cor, setCor] = useState(usuario.cor);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const arquivo = useRef<HTMLInputElement>(null);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    const n = validarNomeExibicao(nome);
    if (!n.ok) return setErro(n.erro);
    const c = validarCor(cor);
    if (!c.ok) return setErro(c.erro);
    setOcupado(true);
    try {
      aoAtualizar(await api.atualizarPerfil({ nomeExibicao: n.valor, cor: c.valor }));
      setNome(n.valor);
      setAviso('Perfil salvo.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setOcupado(false);
    }
  }

  async function escolherAvatar(evento: ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0];
    evento.target.value = '';
    if (!escolhido) return;
    setErro(null);
    setAviso(null);
    if (!FORMATOS.includes(escolhido.type)) return setErro('Use uma imagem PNG, JPEG, GIF ou WebP.');
    if (escolhido.size > AVATAR_MAX_BYTES) return setErro('A imagem deve ter no máximo 8 MB.');
    setOcupado(true);
    try {
      const { avatarUrl } = await api.enviarAvatar(escolhido, escolhido.name);
      aoAtualizar({ ...usuario, avatarUrl });
      setAviso('Foto atualizada.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="painel" aria-labelledby="titulo-perfil">
      <div className="painel-topo">
        <h1 id="titulo-perfil">Meu perfil</h1>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
      <div className="perfil-foto">
        <Avatar usuario={{ ...usuario, nomeExibicao: nome, cor }} servidorUrl={servidorUrl} tamanho={96} />
        <button type="button" onClick={() => arquivo.current?.click()} disabled={ocupado}>
          Trocar foto
        </button>
        <input ref={arquivo} type="file" accept={FORMATOS.join(',')} hidden aria-label="Arquivo da foto" onChange={escolherAvatar} />
      </div>
      <form className="perfil-form" onSubmit={salvar} noValidate>
        <label htmlFor="perfil-nome">Nome de exibição</label>
        <input id="perfil-nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={64} />
        <label htmlFor="perfil-cor">Cor do perfil</label>
        <input id="perfil-cor" type="color" value={cor} onChange={(e) => setCor(e.target.value)} />
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="aviso-ok" role="status">
            {aviso}
          </p>
        )}
        <button type="submit" disabled={ocupado}>
          {ocupado ? 'Salvando…' : 'Salvar'}
        </button>
      </form>
    </section>
  );
}
