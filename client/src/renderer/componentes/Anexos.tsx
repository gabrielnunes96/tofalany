import { useEffect, useState } from 'react';
import type { AnexoDto } from '@tofalando/shared';
import { ponte } from '../servicos/ponte';

/** "2,4 MB", "830 KB". */
export function tamanhoLegivel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Imagem ampliada em tela cheia (Esc ou clique fora fecha). */
function Ampliada({ src, nome, aoFechar }: { src: string; nome: string; aoFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [aoFechar]);
  return (
    <div className="ampliada" role="dialog" aria-modal="true" aria-label={`Imagem ${nome}`} onClick={aoFechar}>
      <img src={src} alt={nome} onClick={(e) => e.stopPropagation()} />
      <button type="button" className="secundario fechar" onClick={aoFechar} autoFocus>
        Fechar
      </button>
    </div>
  );
}

/** PDF/ZIP: salva onde a pessoa escolher e oferece abrir pelo programa do sistema. */
function Documento({ anexo, servidorUrl }: { anexo: AnexoDto; servidorUrl: string }) {
  const [salvo, setSalvo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function baixar() {
    setErro(null);
    setOcupado(true);
    try {
      const caminho = await ponte().arquivos.baixar(`${servidorUrl}${anexo.url}`, anexo.nome);
      if (caminho) setSalvo(caminho);
    } catch {
      setErro('Não foi possível baixar o arquivo.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="anexo-documento" aria-label={`Arquivo ${anexo.nome}`} role="group">
      <span className="anexo-icone" aria-hidden="true">
        {anexo.url.toLowerCase().endsWith('.zip') ? 'ZIP' : 'PDF'}
      </span>
      <span className="anexo-info">
        <span className="anexo-nome">{anexo.nome}</span>
        <span className="suave">{tamanhoLegivel(anexo.bytes)}</span>
      </span>
      <button type="button" className="secundario" onClick={() => void baixar()} disabled={ocupado}>
        {ocupado ? 'Baixando…' : 'Baixar'}
      </button>
      {salvo && (
        <button
          type="button"
          className="secundario"
          onClick={() => void ponte().arquivos.abrir(salvo).catch(() => setErro('Não foi possível abrir o arquivo.'))}
        >
          Abrir
        </button>
      )}
      {salvo && (
        <span className="aviso-ok" role="status">
          Salvo em {salvo}
        </span>
      )}
      {erro && (
        <span className="erro" role="alert">
          {erro}
        </span>
      )}
    </div>
  );
}

/** Anexos de uma mensagem: imagens no chat (ampliáveis) e cartões de documento (RF-9). */
export function ListaAnexos({ anexos, servidorUrl }: { anexos: AnexoDto[]; servidorUrl: string }) {
  const [ampliada, setAmpliada] = useState<AnexoDto | null>(null);
  if (anexos.length === 0) return null;
  return (
    <div className="anexos">
      {anexos.map((a) =>
        a.tipo === 'imagem' ? (
          <button key={a.id} type="button" className="anexo-imagem" onClick={() => setAmpliada(a)} aria-label={`Ampliar imagem ${a.nome}`}>
            <img src={`${servidorUrl}${a.url}`} alt={a.nome} width={a.largura ?? undefined} height={a.altura ?? undefined} loading="lazy" />
          </button>
        ) : (
          <Documento key={a.id} anexo={a} servidorUrl={servidorUrl} />
        ),
      )}
      {ampliada && <Ampliada src={`${servidorUrl}${ampliada.url}`} nome={ampliada.nome} aoFechar={() => setAmpliada(null)} />}
    </div>
  );
}
