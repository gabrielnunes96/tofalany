import { useEffect, useRef, useState, type KeyboardEvent as TecladoReact } from 'react';

export interface FonteTela {
  id: string;
  nome: string;
  tipo: 'tela' | 'janela';
  miniatura: string;
}

interface Props {
  listar: () => Promise<FonteTela[]>;
  /** RF-29: áudio do sistema só no Windows; no Linux a opção aparece desabilitada com o motivo. */
  audioDisponivel: boolean;
  aoEscolher: (fonte: FonteTela, audio: boolean) => void;
  aoCancelar: () => void;
}

/** RF-26: seletor próprio com miniaturas das telas e janelas abertas. */
export function SeletorTela({ listar, audioDisponivel, aoEscolher, aoCancelar }: Props) {
  const [fontes, setFontes] = useState<FonteTela[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [audio, setAudio] = useState(false);

  useEffect(() => {
    let vivo = true;
    listar()
      .then((f) => vivo && setFontes(f))
      .catch(() => vivo && setErro('Não foi possível listar as telas e janelas.'));
    return () => {
      vivo = false;
    };
  }, [listar]);

  const dialogo = useRef<HTMLDivElement>(null);
  /** Esc fecha; Tab fica dentro do diálogo (modal). */
  function aoTeclar(e: TecladoReact) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      aoCancelar();
      return;
    }
    if (e.key !== 'Tab' || !dialogo.current) return;
    const focaveis = [...dialogo.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
    if (focaveis.length === 0) return;
    const primeiro = focaveis[0]!;
    const ultimo = focaveis[focaveis.length - 1]!;
    if (e.shiftKey && document.activeElement === primeiro) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
      e.preventDefault();
      primeiro.focus();
    }
  }

  const grupo = (tipo: FonteTela['tipo'], titulo: string) => {
    const lista = (fontes ?? []).filter((f) => f.tipo === tipo);
    if (lista.length === 0) return null;
    return (
      <section aria-label={titulo}>
        <h3>{titulo}</h3>
        <ul className="fontes-tela">
          {lista.map((f) => (
            <li key={f.id}>
              <button type="button" className="fonte-tela" onClick={() => aoEscolher(f, audio)}>
                <img src={f.miniatura} alt="" />
                <span>{f.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="seletor-fundo" role="presentation" onClick={aoCancelar}>
      <div
        ref={dialogo}
        className="seletor-tela"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-seletor"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={aoTeclar}
      >
        <div className="painel-topo">
          <h2 id="titulo-seletor">Transmitir tela</h2>
          <button type="button" className="secundario" onClick={aoCancelar} autoFocus>
            Cancelar
          </button>
        </div>
        <label className="opcao-audio">
          <input type="checkbox" checked={audio} disabled={!audioDisponivel} onChange={(e) => setAudio(e.target.checked)} /> Incluir o áudio do sistema
        </label>
        {!audioDisponivel && <p className="suave">Neste sistema (Linux) o áudio do computador não pode ir junto na transmissão; só no Windows.</p>}
        {erro && (
          <p className="erro" role="alert">
            {erro}
          </p>
        )}
        {fontes === null && !erro && <p className="suave">Carregando telas e janelas…</p>}
        {fontes?.length === 0 && <p className="suave">Nenhuma tela ou janela encontrada.</p>}
        {grupo('tela', 'Telas')}
        {grupo('janela', 'Janelas')}
      </div>
    </div>
  );
}
