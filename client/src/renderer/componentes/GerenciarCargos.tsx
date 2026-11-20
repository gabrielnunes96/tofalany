import { useState, type FormEvent } from 'react';
import { PERMISSOES, PERMISSOES_BASICAS, type FuncaoDto, type Permissao } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';

type Rascunho = { id: number | null; nome: string; cor: string; permissoes: Permissao[] };
/** Cargo novo: as básicas vêm marcadas (dá para desmarcar); as extras, desmarcadas. */
const NOVO: Rascunho = { id: null, nome: '', cor: '#7c8cff', permissoes: [...PERMISSOES_BASICAS] };

/** Backlog v2, item 10c: o administrador cria, edita e remove cargos (nome, cor e permissões). */
export function GerenciarCargos({ funcoes, api }: { funcoes: FuncaoDto[]; api: Pick<ClienteApi, 'criarFuncao' | 'editarFuncao' | 'removerFuncao'> }) {
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function agir(acao: () => Promise<unknown>) {
    setErro(null);
    setOcupado(true);
    try {
      await acao();
      setRascunho(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(false);
    }
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    if (!rascunho) return;
    const dados = { nome: rascunho.nome, cor: rascunho.cor, permissoes: rascunho.permissoes };
    void agir(() => (rascunho.id === null ? api.criarFuncao(dados) : api.editarFuncao(rascunho.id, dados)));
  }

  const alternar = (p: Permissao) =>
    setRascunho((r) => (r ? { ...r, permissoes: r.permissoes.includes(p) ? r.permissoes.filter((x) => x !== p) : [...r.permissoes, p] } : r));

  return (
    <section className="cargos" aria-labelledby="titulo-cargos">
      <h2 id="titulo-cargos">Cargos</h2>
      <p className="suave">Administradores podem tudo. Os cargos dão a outras pessoas só o que estiver marcado.</p>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      <ul className="lista-admin" aria-label="Cargos do servidor">
        {funcoes.map((f) => (
          <li key={f.id} aria-label={f.nome}>
            <span className="nome" style={{ color: f.cor }}>
              {f.nome}
            </span>
            <span className="suave">
              {f.permissoes.length ? f.permissoes.map((p) => PERMISSOES.find((x) => x.id === p)?.nome).join(', ') : 'sem permissões'}
            </span>
            <button
              type="button"
              className="secundario"
              disabled={ocupado}
              onClick={() => setRascunho({ id: f.id, nome: f.nome, cor: f.cor, permissoes: f.permissoes })}
            >
              Editar
            </button>
            <button type="button" className="secundario" disabled={ocupado} onClick={() => void agir(() => api.removerFuncao(f.id))}>
              Remover
            </button>
          </li>
        ))}
      </ul>
      {rascunho ? (
        <form className="form-cargo" onSubmit={salvar} aria-label={rascunho.id === null ? 'Novo cargo' : `Editar ${rascunho.nome}`}>
          <label htmlFor="cargo-nome">Nome do cargo</label>
          <input id="cargo-nome" value={rascunho.nome} maxLength={32} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
          <label htmlFor="cargo-cor">Cor</label>
          <input id="cargo-cor" type="color" value={rascunho.cor} onChange={(e) => setRascunho({ ...rascunho, cor: e.target.value })} />
          <fieldset className="opcoes">
            <legend>Permissões</legend>
            {(['Básicas (todo membro tem; dá para tirar)', 'Extras'] as const).map((titulo, i) => (
              <fieldset key={titulo} className="grupo-permissoes">
                <legend>{titulo}</legend>
                {PERMISSOES.filter((p) => !!p.basica === (i === 0)).map((p) => (
                  <label key={p.id}>
                    <input type="checkbox" checked={rascunho.permissoes.includes(p.id)} onChange={() => alternar(p.id)} /> {p.nome}{' '}
                    <span className="suave">({p.descricao})</span>
                  </label>
                ))}
              </fieldset>
            ))}
          </fieldset>
          <div className="linha-botoes">
            <button type="submit" disabled={ocupado}>
              Salvar cargo
            </button>
            <button type="button" className="secundario" onClick={() => setRascunho(null)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button type="button" disabled={ocupado || funcoes.length >= 20} onClick={() => setRascunho(NOVO)}>
          Novo cargo
        </button>
      )}
    </section>
  );
}
