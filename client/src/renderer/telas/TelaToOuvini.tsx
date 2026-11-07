import { useEffect, useState } from 'react';
import type { ClienteApi } from '../servicos/api';

/**
 * Backlog v2, item 14: o administrador do servidor principal envia os cookies de uma conta do YouTube para o
 * ToOuvini (o YouTube recusa o IP de datacenter da VPS sem login).
 */
export function TelaToOuvini({
  api,
  aoVoltar,
}: {
  api: Pick<ClienteApi, 'situacaoMusica' | 'enviarCookiesMusica' | 'removerCookiesMusica'>;
  aoVoltar: () => void;
}) {
  const [situacao, setSituacao] = useState<{ cookies: boolean; atualizadoEm: number | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    void api
      .situacaoMusica()
      .then(setSituacao)
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : 'Não foi possível ler a situação do ToOuvini.'));
  }, [api]);

  async function enviar(arquivo: File) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      setSituacao(await api.enviarCookiesMusica(await arquivo.text()));
      setAviso('Cookies enviados. Peça uma música com /play para conferir.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar os cookies.');
    } finally {
      setOcupado(false);
    }
  }

  async function remover() {
    setOcupado(true);
    try {
      await api.removerCookiesMusica();
      setSituacao({ cookies: false, atualizadoEm: null });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <section className="tela-admin" aria-labelledby="titulo-toouvini">
      <header className="canal-topo">
        <h2 id="titulo-toouvini">🎵 ToOuvini</h2>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </header>
      <p>
        O YouTube pede login para servidores em nuvem (&quot;confirme que você não é um robô&quot;). Para o ToOuvini tocar, envie os cookies de uma conta do
        YouTube. <strong>Use uma conta secundária</strong>: os cookies dão acesso a ela, e o YouTube pode limitar contas usadas por bots.
      </p>
      <p role="status">
        {situacao === null
          ? 'Conferindo…'
          : situacao.cookies
            ? `Cookies configurados${situacao.atualizadoEm ? ` em ${new Date(situacao.atualizadoEm).toLocaleString('pt-BR')}` : ''}.`
            : 'Sem cookies: o YouTube deve recusar as músicas neste servidor.'}
      </p>
      <ol className="passos">
        <li>No Chrome ou no Firefox, instale a extensão &quot;Get cookies.txt LOCALLY&quot;.</li>
        <li>Abra o youtube.com com a conta secundária logada.</li>
        <li>Na extensão, exporte os cookies do youtube.com (formato Netscape) e salve o cookies.txt.</li>
        <li>Envie o arquivo aqui. Ele fica só no servidor, legível apenas pelo ToFalany.</li>
      </ol>
      <label className="botao-arquivo">
        <input
          type="file"
          accept=".txt,text/plain"
          disabled={ocupado}
          aria-label="Arquivo cookies.txt"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void enviar(f);
          }}
        />
        {ocupado ? 'Enviando…' : 'Enviar cookies.txt'}
      </label>
      {situacao?.cookies && (
        <button type="button" className="secundario" disabled={ocupado} onClick={() => void remover()}>
          Remover cookies
        </button>
      )}
      {aviso && (
        <p className="aviso-ok" role="status">
          {aviso}
        </p>
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </section>
  );
}
