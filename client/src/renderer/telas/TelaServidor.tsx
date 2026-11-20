import { useState, type FormEvent } from 'react';
import { lerQualquerConvite, normalizarUrlServidor, type ConviteLink, type Resultado } from '@tofalando/shared';
import { testarServidor, type ServidorTestado } from '../servicos/servidor';

interface Props {
  aoConectar: (url: string) => void | Promise<void>;
  /** Backlog v2, item 4: colou o link de convite: o app segue com o servidor e o código dele. */
  aoConvite?: (convite: ConviteLink) => void;
  /** Presente quando já há um servidor guardado: volta para ele sem alterar nada. */
  aoCancelar?: () => void;
  testar?: (url: string) => Promise<Resultado<ServidorTestado>>;
}

/** Primeira execução: pede o endereço do servidor e confere antes de guardar (RF-1, CA-1). */
export function TelaServidor({ aoConectar, aoConvite, aoCancelar, testar = testarServidor }: Props) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    const convite = aoConvite ? lerQualquerConvite(texto) : undefined;
    if (convite) {
      aoConvite!(convite);
      return;
    }
    const url = normalizarUrlServidor(texto);
    if (!url.ok) {
      setErro(url.erro);
      return;
    }
    setTestando(true);
    try {
      // Sem "http(s)://" digitado: tenta HTTPS primeiro (servidor na VPS); se não responder, HTTP (Tailscale, rede local).
      const semEsquema = !/^[a-z][a-z0-9+.-]*:\/\//i.test(texto.trim());
      const candidatos = semEsquema ? [url.valor.replace(/^http:/, 'https:'), url.valor] : [url.valor];
      let resultado: Resultado<ServidorTestado> = { ok: false, erro: 'Endereço inválido.' };
      for (const candidato of candidatos) {
        resultado = await testar(candidato);
        if (resultado.ok) break;
      }
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      await aoConectar(resultado.valor.endereco);
    } catch {
      setErro('Não foi possível guardar o endereço. Tente de novo.');
    } finally {
      setTestando(false);
    }
  }

  return (
    <main className="tela-centro">
      <form className="cartao" onSubmit={enviar} noValidate>
        <h1>ToFalany</h1>
        <p className="suave">Cole o link de convite que você recebeu, ou o endereço do servidor do seu grupo.</p>
        <label htmlFor="servidor-url">Endereço do servidor</label>
        <input
          id="servidor-url"
          name="servidor-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="ex.: https://fala.exemplo.com/convite/abc123 ou 100.64.0.1:3000"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? 'servidor-erro' : undefined}
          autoFocus
        />
        {erro && (
          <p id="servidor-erro" className="erro" role="alert">
            {erro}
          </p>
        )}
        <button type="submit" disabled={testando}>
          {testando ? 'Testando conexão…' : 'Conectar'}
        </button>
        {aoCancelar && (
          <button type="button" className="secundario" onClick={aoCancelar} disabled={testando}>
            Cancelar
          </button>
        )}
      </form>
    </main>
  );
}
