import { useEffect, useEffectEvent, useState } from 'react';
import { conflitoAtalhoSom, SUGESTOES_ATALHO_SOM, TECLAS_ATALHO, textoAtalho, type AlvoAtalhoSom, type Atalho, type Atalhos, type AtalhosSons } from '@tofalando/shared';

interface Som {
  id: number;
  nome: string;
}

/**
 * atalhos-de-sons (RF-1): em Configurações → Atalhos, um atalho por som. Os sons deste servidor guardam o atalho por
 * servidor; os de "Meus sons" valem em todos. Nenhum vem pronto (RN-6): a pessoa grava ou escolhe uma sugestão.
 */
export function AtalhosSonsSecao({
  atalhos,
  atalhosSons,
  servidor,
  sonsDoServidor,
  meusSons,
  aoMudar,
  aoCapturar,
}: {
  atalhos: Atalhos;
  atalhosSons: AtalhosSons;
  /** Chave do servidor atual (URL normalizada). */
  servidor: string;
  sonsDoServidor: Som[];
  meusSons: Som[];
  aoMudar: (novo: AtalhosSons) => void;
  aoCapturar?: (sim: boolean) => void;
}) {
  const [capturando, setCapturando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const alvoDe = (chave: string): AlvoAtalhoSom => (chave.startsWith('som:') ? { somId: Number(chave.slice(4)) } : { audioId: Number(chave.slice(6)) });
  const atual = (alvo: AlvoAtalhoSom) => ('somId' in alvo ? atalhosSons.porServidor[servidor]?.[alvo.somId] : atalhosSons.globais[alvo.audioId]) ?? null;

  function gravar(alvo: AlvoAtalhoSom, novo: Atalho | null, nome: string): boolean {
    const quem = conflitoAtalhoSom(atalhos, atalhosSons, servidor, alvo, novo);
    if (quem) {
      setErro(`${textoAtalho(novo)} já é o atalho de ${quem}. Escolha outro para ${nome}.`);
      return false;
    }
    setErro(null);
    if ('somId' in alvo) {
      const doServidor = { ...(atalhosSons.porServidor[servidor] ?? {}) };
      if (novo) doServidor[alvo.somId] = novo;
      else delete doServidor[alvo.somId];
      const porServidor = { ...atalhosSons.porServidor, [servidor]: doServidor };
      if (Object.keys(doServidor).length === 0) delete porServidor[servidor];
      aoMudar({ ...atalhosSons, porServidor });
    } else {
      const globais = { ...atalhosSons.globais };
      if (novo) globais[alvo.audioId] = novo;
      else delete globais[alvo.audioId];
      aoMudar({ ...atalhosSons, globais });
    }
    return true;
  }

  const nomeDe = (chave: string) => [...sonsDoServidor.map((s) => [`som:${s.id}`, s.nome]), ...meusSons.map((s) => [`audio:${s.id}`, s.nome])].find(([k]) => k === chave)?.[1] ?? 'o som';

  // A tecla lida com o estado mais novo; a escuta só liga e desliga com a captura (uma pausa dos globais por captura).
  const aoTeclar = useEffectEvent((e: KeyboardEvent) => {
    if (!capturando) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.code === 'Escape') return setCapturando(null);
    if (/^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/.test(e.code)) return;
    if (!(e.code in TECLAS_ATALHO)) return setErro('Essa tecla não pode ser usada como atalho.');
    const novo = { codigo: e.code, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
    if (gravar(alvoDe(capturando), novo, nomeDe(capturando))) setCapturando(null);
  });
  const pausarGlobais = useEffectEvent((sim: boolean) => aoCapturar?.(sim));
  const capturandoAgora = capturando !== null;
  useEffect(() => {
    if (!capturandoAgora) return;
    pausarGlobais(true);
    const ouvir = (e: KeyboardEvent) => aoTeclar(e);
    window.addEventListener('keydown', ouvir, true);
    return () => {
      window.removeEventListener('keydown', ouvir, true);
      pausarGlobais(false);
    };
  }, [capturandoAgora]);

  const linha = (chave: string, nome: string) => {
    const alvo = alvoDe(chave);
    const a = atual(alvo);
    const vago = SUGESTOES_ATALHO_SOM.map((codigo) => ({ codigo, ctrl: false, alt: false, shift: false, meta: false })).find(
      (s) => !conflitoAtalhoSom(atalhos, atalhosSons, servidor, alvo, s),
    );
    return (
      <li key={chave} aria-label={nome}>
        <span className="nome">{nome}</span>
        <kbd aria-live="polite">{capturando === chave ? 'Pressione a combinação… (Esc cancela)' : textoAtalho(a)}</kbd>
        <button
          type="button"
          className="secundario"
          aria-label={capturando === chave ? `Cancelar a troca do atalho de ${nome}` : `Gravar atalho de ${nome}`}
          onClick={() => {
            setErro(null);
            setCapturando(capturando === chave ? null : chave);
          }}
        >
          {capturando === chave ? 'Cancelar' : 'Gravar'}
        </button>
        {!a && vago && capturando !== chave && (
          <button type="button" className="secundario" aria-label={`Usar ${vago.codigo} para ${nome}`} onClick={() => gravar(alvo, vago, nome)}>
            Usar {vago.codigo}
          </button>
        )}
        {a && (
          <button type="button" className="secundario" aria-label={`Remover atalho de ${nome}`} onClick={() => gravar(alvo, null, nome)}>
            Remover
          </button>
        )}
      </li>
    );
  };

  return (
    <fieldset className="opcoes">
      <legend>Sons</legend>
      <p className="suave">Toque um som do soundboard pelo teclado, mesmo jogando. Só funciona na voz, com o mesmo intervalo do botão.</p>
      {sonsDoServidor.length === 0 && meusSons.length === 0 ? (
        <p className="suave">Este servidor não tem sons e você ainda não tem áudios da loja.</p>
      ) : (
        <ul className="lista-admin" aria-label="Atalhos dos sons">
          {sonsDoServidor.map((s) => linha(`som:${s.id}`, s.nome))}
          {meusSons.map((s) => linha(`audio:${s.id}`, `${s.nome} (Meus sons)`))}
        </ul>
      )}
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
    </fieldset>
  );
}
