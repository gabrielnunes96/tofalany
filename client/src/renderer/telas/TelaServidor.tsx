import { useState, type FormEvent } from 'react';
import { normalizarUrlServidor, type Resultado, type ServidorInfo } from '@tofalando/shared';
import { testarServidor } from '../servicos/servidor';

interface Props {
  aoConectar: (url: string) => void | Promise<void>;
  /** Presente quando já há um servidor guardado: volta para ele sem alterar nada. */
  aoCancelar?: () => void;
  testar?: (url: string) => Promise<Resultado<ServidorInfo>>;
}

/** Primeira execução: pede o endereço do servidor e confere antes de guardar (RF-1, CA-1). */
export function TelaServidor({ aoConectar, aoCancelar, testar = testarServidor }: Props) {
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    const url = normalizarUrlServidor(texto);
    if (!url.ok) {
      setErro(url.erro);
      return;
    }
    setTestando(true);
    try {
      const resultado = await testar(url.valor);
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      await aoConectar(url.valor);
    } catch {
      setErro('Não foi possível guardar o endereço. Tente de novo.');
    } finally {
      setTestando(false);
    }
  }

  return (
    <main className="tela-centro">
      <form className="cartao" onSubmit={enviar} noValidate>
        <h1>Tô Falando</h1>
        <p className="suave">Informe o endereço do servidor do seu grupo.</p>
        <label htmlFor="servidor-url">Endereço do servidor</label>
        <input
          id="servidor-url"
          name="servidor-url"
          type="text"
          inputMode="url"
          autoComplete="url"
          placeholder="ex.: https://fala.exemplo.com ou 100.64.0.1:3000"
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
