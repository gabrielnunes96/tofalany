import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { AVATAR_MAX_BYTES, SOBRE_MIM_LINHAS, SOBRE_MIM_MAX, validarCor, validarCoresFundo, validarNomeExibicao, validarSobreMim, type UsuarioDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';
import { Avatar } from '../componentes/Avatar';
import { estiloFundo } from '../componentes/fundoPerfil';

interface Props {
  usuario: UsuarioDto;
  servidorUrl: string;
  api: Pick<ClienteApi, 'atualizarPerfil' | 'enviarAvatar' | 'enviarFundo' | 'removerFundo'>;
  /** Atualiza a loja na hora (o evento do servidor também chega, para os outros). */
  aoAtualizar: (usuario: UsuarioDto) => void;
  /** Sem ele, a tela vem embutida (seção "Minha conta" das Configurações), sem o botão de voltar. */
  aoVoltar?: () => void;
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
  const arquivoFundo = useRef<HTMLInputElement>(null);
  // Mini perfil: só com servidor novo (o antigo não manda o campo "fundo").
  const temMiniPerfil = usuario.fundo !== undefined;
  const [sobreMim, setSobreMim] = useState(usuario.sobreMim ?? '');
  const coresIniciais = usuario.fundo?.cores;
  const [degrade, setDegrade] = useState((coresIniciais?.length ?? 0) === 2);
  const [cor1, setCor1] = useState(coresIniciais?.[0] ?? usuario.cor);
  const [cor2, setCor2] = useState(coresIniciais?.[1] ?? '#1a1a2e');
  const [usarCores, setUsarCores] = useState(!!coresIniciais);
  // Conta como o validador do servidor (quebras normalizadas, NFC, sem espaços nas pontas).
  const normalizado = sobreMim.replace(/\r\n?/g, '\n').normalize('NFC').trim();
  const caracteres = [...normalizado].length;
  const linhas = normalizado ? normalizado.split('\n').length : 0;
  const reduzirMovimento = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setAviso(null);
    const n = validarNomeExibicao(nome);
    if (!n.ok) return setErro(n.erro);
    const c = validarCor(cor);
    if (!c.ok) return setErro(c.erro);
    const extras: { sobreMim?: string; fundoCores?: string[] | null } = {};
    if (temMiniPerfil) {
      // Só o que mudou vai ao servidor (cada mudança de fundo ou "sobre mim" fica na auditoria).
      const sm = validarSobreMim(sobreMim);
      if (!sm.ok) return setErro(sm.erro);
      if (sm.valor !== (usuario.sobreMim ?? '')) extras.sobreMim = sm.valor;
      if (usarCores) {
        const cs = validarCoresFundo(degrade ? [cor1, cor2] : [cor1]);
        if (!cs.ok) return setErro(cs.erro);
        if (JSON.stringify(cs.valor) !== JSON.stringify(usuario.fundo?.cores ?? null)) extras.fundoCores = cs.valor;
      } else if (usuario.fundo?.cores) extras.fundoCores = null;
    }
    setOcupado(true);
    try {
      aoAtualizar(await api.atualizarPerfil({ nomeExibicao: n.valor, cor: c.valor, ...extras }));
      setNome(n.valor);
      if (extras.sobreMim !== undefined) setSobreMim(extras.sobreMim);
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

  async function escolherFundo(evento: ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0];
    evento.target.value = '';
    if (!escolhido) return;
    setErro(null);
    setAviso(null);
    if (!FORMATOS.includes(escolhido.type)) return setErro('Use uma imagem PNG, JPEG, GIF ou WebP.');
    if (escolhido.size > AVATAR_MAX_BYTES) return setErro('A imagem deve ter no máximo 8 MB.');
    setOcupado(true);
    try {
      aoAtualizar(await api.enviarFundo(escolhido, escolhido.name));
      setAviso('Fundo atualizado.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar o fundo.');
    } finally {
      setOcupado(false);
    }
  }

  async function tirarFundo() {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      aoAtualizar(await api.removerFundo());
      setUsarCores(false);
      setAviso('Fundo removido.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível tirar o fundo.');
    } finally {
      setOcupado(false);
    }
  }

  // Prévia do próprio cartão com o que está na tela (as cores ainda não salvas incluídas).
  const fundoPrevia = { ...(usuario.fundo ?? {}), ...(usarCores ? { cores: (degrade ? [cor1, cor2] : [cor1]) as [string] | [string, string] } : { cores: undefined }) };

  return (
    <section className="painel" aria-labelledby="titulo-perfil">
      {aoVoltar ? (
        <div className="painel-topo">
          <h1 id="titulo-perfil">Meu perfil</h1>
          <button type="button" className="secundario" onClick={aoVoltar}>
            Voltar
          </button>
        </div>
      ) : (
        <h2 id="titulo-perfil">Perfil</h2>
      )}
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
        {temMiniPerfil && (
          <fieldset className="perfil-mini">
            <legend>Cartão do perfil</legend>
            <div className="perfil-mini-previa" aria-label="Prévia do cartão" role="img">
              <div className="perfil-mini-previa-fundo" style={estiloFundo(fundoPrevia, cor, servidorUrl, { parado: reduzirMovimento })} />
              <div className="perfil-mini-previa-pessoa">
                <Avatar usuario={{ ...usuario, nomeExibicao: nome, cor }} servidorUrl={servidorUrl} tamanho={48} />
                <strong>{nome}</strong>
              </div>
            </div>
            <div className="perfil-mini-acoes">
              <button type="button" className="secundario" onClick={() => arquivoFundo.current?.click()} disabled={ocupado}>
                Enviar imagem ou GIF
              </button>
              <input ref={arquivoFundo} type="file" accept={FORMATOS.join(',')} hidden aria-label="Arquivo do fundo" onChange={escolherFundo} />
              {(usuario.fundo?.url || usuario.fundo?.cores) && (
                <button type="button" className="secundario" onClick={() => void tirarFundo()} disabled={ocupado}>
                  Tirar fundo
                </button>
              )}
            </div>
            <label className="perfil-mini-check">
              <input type="checkbox" checked={usarCores} onChange={(e) => setUsarCores(e.target.checked)} /> Fundo de cor
            </label>
            {usarCores && (
              <div className="perfil-mini-cores">
                <label>
                  Cor do fundo
                  <input type="color" value={cor1} onChange={(e) => setCor1(e.target.value)} />
                </label>
                <label className="perfil-mini-check">
                  <input type="checkbox" checked={degrade} onChange={(e) => setDegrade(e.target.checked)} /> Degradê
                </label>
                {degrade && (
                  <label>
                    Segunda cor do fundo
                    <input type="color" value={cor2} onChange={(e) => setCor2(e.target.value)} />
                  </label>
                )}
              </div>
            )}
            <label htmlFor="perfil-sobre">Sobre mim</label>
            <textarea id="perfil-sobre" value={sobreMim} onChange={(e) => setSobreMim(e.target.value)} rows={3} maxLength={1024} aria-describedby="perfil-sobre-conta" />
            <p id="perfil-sobre-conta" className={caracteres > SOBRE_MIM_MAX || linhas > SOBRE_MIM_LINHAS ? 'erro' : 'suave'}>
              {caracteres}/{SOBRE_MIM_MAX} caracteres · {linhas}/{SOBRE_MIM_LINHAS} linhas
            </p>
          </fieldset>
        )}
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
