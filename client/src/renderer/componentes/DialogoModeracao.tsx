import { useEffect, useRef, useState } from 'react';
import { DURACOES_CASTIGO, MOTIVO_MODERACAO_MAX } from '@tofalando/shared';

export type TipoModeracao = 'castigo' | 'expulsar' | 'banir';

const TEXTOS: Record<TipoModeracao, { titulo: string; explica: string; botao: string }> = {
  castigo: {
    titulo: 'Pôr de castigo',
    explica: 'Durante o castigo a pessoa continua no servidor, mas não escreve, não entra na voz, não transmite nem toca sons. Se estiver na voz, sai.',
    botao: 'Pôr de castigo',
  },
  expulsar: { titulo: 'Expulsar', explica: 'A pessoa sai do servidor agora. Ela pode voltar com um convite.', botao: 'Expulsar' },
  banir: { titulo: 'Banir', explica: 'A pessoa sai do servidor e não volta, nem com convite, até alguém desbanir em Membros.', botao: 'Banir' },
};

/** Castigo, expulsão ou banimento: duração (castigo) e motivo, que a pessoa vê. */
export function DialogoModeracao({
  tipo,
  nome,
  aoConfirmar,
  aoFechar,
}: {
  tipo: TipoModeracao;
  nome: string;
  aoConfirmar: (dados: { minutos: number; motivo: string | null }) => Promise<void>;
  aoFechar: () => void;
}) {
  const [minutos, setMinutos] = useState<number>(10);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    campo.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [aoFechar]);
  const t = TEXTOS[tipo];
  return (
    <div className="dialogo-fundo" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <form
        className="dialogo cartao"
        role="dialog"
        aria-label={`${t.titulo}: ${nome}`}
        onSubmit={(e) => {
          e.preventDefault();
          setOcupado(true);
          setErro(null);
          aoConfirmar({ minutos, motivo: motivo.trim() || null })
            .then(aoFechar)
            .catch((x: unknown) => {
              setErro(x instanceof Error ? x.message : 'Não foi possível concluir.');
              setOcupado(false);
            });
        }}
      >
        <h2>
          {t.titulo}: {nome}
        </h2>
        <p className="suave">{t.explica}</p>
        {tipo === 'castigo' && (
          <fieldset className="duracoes-castigo">
            <legend>Por quanto tempo</legend>
            {DURACOES_CASTIGO.map((d) => (
              <label key={d.minutos}>
                <input type="radio" name="duracao-castigo" checked={minutos === d.minutos} onChange={() => setMinutos(d.minutos)} /> {d.texto}
              </label>
            ))}
          </fieldset>
        )}
        <label htmlFor="motivo-moderacao">Motivo (a pessoa vê; opcional)</label>
        <textarea id="motivo-moderacao" ref={campo} rows={3} maxLength={MOTIVO_MODERACAO_MAX} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <small className="suave">
          {motivo.length}/{MOTIVO_MODERACAO_MAX}
        </small>
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        <div className="dialogo-acoes">
          <button type="button" className="secundario" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className={tipo === 'castigo' ? undefined : 'perigo'} disabled={ocupado}>
            {ocupado ? 'Aguarde…' : t.botao}
          </button>
        </div>
      </form>
    </div>
  );
}
