import { useState, type FormEvent } from 'react';
import { REGRAS_SENHA, validarSenha, validarUsuario, type SessaoResponse } from '@tofalando/shared';
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
  api?: Pick<ClienteApi, 'cadastrar' | 'entrar' | 'redefinirSenha'>;
}

type Modo = 'entrar' | 'cadastrar' | 'redefinir';
type Campo = 'convite' | 'usuario' | 'senha' | 'confirmar' | 'codigo';

/** Login e cadastro com código de convite (RF-2, RF-3). */
export function TelaEntrar({ servidorUrl, aviso, conviteInicial, aoEntrar, aoTrocarServidor, aoCancelarConvite, api }: Props) {
  const [modo, setModo] = useState<Modo>(conviteInicial ? 'cadastrar' : 'entrar');
  const [convite, setConvite] = useState(conviteInicial ?? '');
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [codigo, setCodigo] = useState('');
  const [avisoLocal, setAvisoLocal] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Partial<Record<Campo, string>>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function trocarModo(novo: Modo) {
    setModo(novo);
    setErro(null);
    setAvisoLocal(null);
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
      else if (confirmar !== senha) novos.confirmar = 'As senhas não são iguais.';
    } else if (modo === 'redefinir') {
      if (!usuario.trim()) novos.usuario = 'Informe o nome de usuário.';
      if (!codigo.trim()) novos.codigo = 'Informe o código que o administrador mandou.';
      const s = validarSenha(senha);
      if (!s.ok) novos.senha = s.erro;
      else if (confirmar !== senha) novos.confirmar = 'As senhas não são iguais.';
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
      if (modo === 'redefinir') {
        await cliente.redefinirSenha({ usuario: usuario.trim(), codigo: codigo.trim(), senha });
        setCodigo('');
        setSenha('');
        setConfirmar('');
        trocarModo('entrar');
        setAvisoLocal('Senha trocada. Entre com a senha nova.');
        setEnviando(false);
        return;
      }
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
        <h1>{modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar conta' : 'Trocar a senha'}</h1>
        <p className="suave">Servidor: {servidorUrl}</p>
        {(avisoLocal ?? aviso) && (
          <p className="aviso" role="status">
            {avisoLocal ?? aviso}
          </p>
        )}
        {modo === 'redefinir' && <p className="suave">Peça ao administrador do servidor um código de redefinição (ele gera em Membros).</p>}
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
        {modo === 'redefinir' && campo('codigo', 'Código de redefinição', codigo, setCodigo, { autoComplete: 'off' })}
        {campo('senha', modo === 'redefinir' ? 'Senha nova' : 'Senha', senha, setSenha, { type: 'password', autoComplete: modo === 'entrar' ? 'current-password' : 'new-password' })}
        {modo !== 'entrar' && (
          <>
            {campo('confirmar', 'Confirmar senha', confirmar, setConfirmar, { type: 'password', autoComplete: 'new-password' })}
            <ul className="regras-senha" aria-label="A senha precisa ter">
              {[...REGRAS_SENHA.map((r) => ({ id: r.id, texto: r.texto, ok: r.cumpre(senha) })), { id: 'iguais', texto: 'As duas senhas iguais', ok: confirmar !== '' && confirmar === senha }].map((r) => (
                <li key={r.id} className={r.ok ? 'ok' : undefined}>
                  <span aria-hidden="true">{r.ok ? '✓' : '○'}</span> {r.texto}
                  <span className="so-leitor">{r.ok ? ' (ok)' : ' (falta)'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <button type="submit" disabled={enviando}>
          {enviando ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'cadastrar' ? 'Criar conta' : 'Trocar a senha'}
        </button>
        {modo === 'entrar' && (
          <button type="button" className="link" onClick={() => trocarModo('redefinir')} disabled={enviando}>
            Esqueci a senha
          </button>
        )}
        {modo === 'redefinir' && (
          <button type="button" className="secundario" onClick={() => trocarModo('entrar')} disabled={enviando}>
            Voltar
          </button>
        )}
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
