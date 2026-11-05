import { useState, type FormEvent } from 'react';
import { validarSenha, validarUsuario, type SessaoResponse } from '@tofalando/shared';
import { criarApi, ErroApiCliente, type ClienteApi } from '../servicos/api';

interface Props {
  servidorUrl: string;
  /** Aviso vindo de fora (ex.: sessão encerrada pelo servidor). */
  aviso?: string;
  /** Código vindo do link de convite: abre já em "Tenho um convite" com o código preenchido (RF-1a). */
  conviteInicial?: string;
  aoEntrar: (sessao: SessaoResponse) => void | Promise<void>;
  aoTrocarServidor: () => void;
  /** Aberto por um convite com o app já em uso: volta para onde estava, sem mudar nada. */
  aoCancelarConvite?: () => void;
  api?: Pick<ClienteApi, 'cadastrar' | 'entrar'>;
}

type Modo = 'entrar' | 'cadastrar';
type Campo = 'convite' | 'usuario' | 'senha';

/** Login e cadastro com código de convite (RF-2, RF-3). */
export function TelaEntrar({ servidorUrl, aviso, conviteInicial, aoEntrar, aoTrocarServidor, aoCancelarConvite, api }: Props) {
  const [modo, setModo] = useState<Modo>(conviteInicial ? 'cadastrar' : 'entrar');
  const [convite, setConvite] = useState(conviteInicial ?? '');
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [errosCampo, setErrosCampo] = useState<Partial<Record<Campo, string>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function trocarModo(novo: Modo) {
    setModo(novo);
    setErro(null);
    setErrosCampo({});
  }

  function validar(): boolean {
    const novos: Partial<Record<Campo, string>> = {};
    if (modo === 'cadastrar') {
      if (!convite.trim()) novos.convite = 'Informe o código de convite.';
      const u = validarUsuario(usuario);
      if (!u.ok) novos.usuario = u.erro;
      const s = validarSenha(senha);
      if (!s.ok) novos.senha = s.erro;
    } else {
      if (!usuario.trim()) novos.usuario = 'Informe o nome de usuário.';
      if (!senha) novos.senha = 'Informe a senha.';
    }
    setErrosCampo(novos);
    return Object.keys(novos).length === 0;
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (!validar()) return;
    setEnviando(true);
    try {
      const cliente = api ?? criarApi(servidorUrl);
      const sessao =
        modo === 'cadastrar'
          ? await cliente.cadastrar({ convite: convite.trim(), usuario: usuario.trim(), senha })
          : await cliente.entrar({ usuario: usuario.trim(), senha });
      await aoEntrar(sessao);
    } catch (e) {
      setErro(e instanceof ErroApiCliente ? e.message : 'Não foi possível concluir. Tente de novo.');
      setEnviando(false);
    }
  }

  const campo = (id: Campo, rotulo: string, valor: string, mudar: (v: string) => void, extra: Record<string, string> = {}) => (
    <>
      <label htmlFor={`entrar-${id}`}>{rotulo}</label>
      <input
        id={`entrar-${id}`}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
        aria-invalid={errosCampo[id] ? true : undefined}
        aria-describedby={errosCampo[id] ? `entrar-${id}-erro` : undefined}
        {...extra}
      />
      {errosCampo[id] && (
        <p id={`entrar-${id}-erro`} className="erro">
          {errosCampo[id]}
        </p>
      )}
    </>
  );

  return (
    <main className="tela-centro">
      <form className="cartao" onSubmit={enviar} noValidate>
        <h1>{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="suave">Servidor: {servidorUrl}</p>
        {aviso && (
          <p className="aviso" role="status">
            {aviso}
          </p>
        )}
        <div className="abas" role="group" aria-label="Entrar ou criar conta">
          <button type="button" aria-pressed={modo === 'entrar'} onClick={() => trocarModo('entrar')}>
            Já tenho conta
          </button>
          <button type="button" aria-pressed={modo === 'cadastrar'} onClick={() => trocarModo('cadastrar')}>
            Tenho um convite
          </button>
        </div>
        {modo === 'cadastrar' && campo('convite', 'Código de convite', convite, setConvite, { autoComplete: 'off' })}
        {campo('usuario', 'Nome de usuário', usuario, setUsuario, { autoComplete: 'username' })}
        {campo('senha', 'Senha', senha, setSenha, { type: 'password', autoComplete: modo === 'entrar' ? 'current-password' : 'new-password' })}
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : 'Criar conta'}
        </button>
        {aoCancelarConvite && (
          <button type="button" className="secundario" onClick={aoCancelarConvite} disabled={enviando}>
            Cancelar convite
          </button>
        )}
        <button type="button" className="link" onClick={aoTrocarServidor} disabled={enviando}>
          Trocar servidor
        </button>
      </form>
    </main>
  );
}
