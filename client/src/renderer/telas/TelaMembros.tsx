import { useState } from 'react';
import { COMUNIDADE_PRINCIPAL, separarComunidade } from '@tofalando/shared';
import type { Cargo, FuncaoDto, RedefinicaoDto, UsuarioDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';
import { Avatar } from '../componentes/Avatar';
import { GerenciarCargos } from '../componentes/GerenciarCargos';
import { ListaBanidos } from '../componentes/ListaBanidos';

interface Props {
  eu: UsuarioDto;
  usuarios: UsuarioDto[];
  servidorUrl: string;
  api: Pick<ClienteApi, 'mudarCargo' | 'removerConta' | 'gerarRedefinicao'> &
    Partial<Pick<ClienteApi, 'definirFuncao' | 'criarFuncao' | 'editarFuncao' | 'removerFuncao' | 'banidos' | 'desbanir'>>;
  /** Backlog v2, item 10c: cargos personalizados (sem eles, a tela fica como antes). */
  funcoes?: FuncaoDto[];
  /** Copia o código para a área de transferência (padrão: a do navegador). */
  copiar?: (texto: string) => Promise<void>;
  /** Aplica na hora o resultado (o evento do servidor também chega, mas pode atrasar com a conexão caída). */
  aoAtualizar: (usuario: UsuarioDto) => void;
  aoRemover: (id: number) => void;
  aoVoltar: () => void;
}

/** RF-6 (administrador): promover, rebaixar e remover contas. O servidor confere tudo (RN-5, RN-16). */
export function TelaMembros({ eu, usuarios, servidorUrl, api, funcoes, aoAtualizar, aoRemover, aoVoltar, copiar = (t) => navigator.clipboard.writeText(t) }: Props) {
  // Servidor criado na mesma instalação (/c/<id>): remover tira só daqui; código de senha é coisa da conta (principal).
  const principal = separarComunidade(servidorUrl).comunidade === COMUNIDADE_PRINCIPAL;
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [confirmando, setConfirmando] = useState<number | null>(null);
  // Backlog v2, item 3: o código aparece só aqui, uma vez, para o administrador mandar à pessoa.
  const [codigo, setCodigo] = useState<(RedefinicaoDto & { nome: string }) | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function agir(id: number, acao: () => Promise<unknown>) {
    setErro(null);
    setOcupado(id);
    try {
      await acao();
      setConfirmando(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setOcupado(null);
    }
  }

  const mudarCargo = (u: UsuarioDto, cargo: Cargo) => agir(u.id, async () => aoAtualizar(await api.mudarCargo(u.id, cargo)));
  const gerarCodigo = (u: UsuarioDto) =>
    agir(u.id, async () => {
      setCopiado(false);
      setCodigo({ ...(await api.gerarRedefinicao(u.id)), nome: u.nomeExibicao });
    });
  const remover = (u: UsuarioDto) =>
    agir(u.id, async () => {
      await api.removerConta(u.id);
      aoRemover(u.id);
    });

  return (
    <section className="painel" aria-labelledby="titulo-membros">
      <div className="painel-topo">
        <h1 id="titulo-membros">Membros</h1>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </div>
      {erro && (
        <p className="erro" role="alert">
          {erro}
        </p>
      )}
      {codigo && (
        <div className="codigo-redefinicao" role="status" aria-label="Código de redefinição de senha">
          <p>
            Código para <strong>{codigo.nome}</strong> trocar a senha: <code>{codigo.codigo}</code>
          </p>
          <p className="suave">
            Vale uma vez, até {new Date(codigo.expiraEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}. Mande para a pessoa: ela usa “Esqueci a
            senha” na tela de entrar. Gerar outro invalida este.
          </p>
          <div>
            <button type="button" onClick={() => void copiar(codigo.codigo).then(() => setCopiado(true))}>
              {copiado ? 'Copiado' : 'Copiar código'}
            </button>
            <button type="button" className="secundario" onClick={() => setCodigo(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}
      <ul className="lista-admin" aria-label="Contas do servidor">
        {usuarios.map((u) => (
          <li key={u.id} aria-label={u.nomeExibicao}>
            <Avatar usuario={u} servidorUrl={servidorUrl} tamanho={32} />
            <span className="nome">
              {u.nomeExibicao} <span className="suave">@{u.usuario}</span>
              {u.id === eu.id && <span className="suave"> (você)</span>}
            </span>
            <span className="selo">{u.cargo === 'admin' ? 'Administrador' : 'Membro'}</span>
            {funcoes && api.definirFuncao && u.cargo !== 'admin' && (
              <>
                <label className="so-leitor" htmlFor={`funcao-${u.id}`}>
                  Cargo de {u.nomeExibicao}
                </label>
                <select
                  id={`funcao-${u.id}`}
                  value={u.funcaoId ?? ''}
                  disabled={ocupado !== null}
                  onChange={(e) => void agir(u.id, async () => aoAtualizar(await api.definirFuncao!(u.id, e.target.value ? Number(e.target.value) : null)))}
                >
                  <option value="">Sem cargo</option>
                  {funcoes.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </>
            )}
            {u.cargo === 'membro' ? (
              <button type="button" disabled={ocupado !== null} onClick={() => void mudarCargo(u, 'admin')}>
                Tornar administrador
              </button>
            ) : (
              <button type="button" className="secundario" disabled={ocupado !== null} onClick={() => void mudarCargo(u, 'membro')}>
                Tornar membro
              </button>
            )}
            {principal && (
              <button type="button" className="secundario" disabled={ocupado !== null} onClick={() => void gerarCodigo(u)}>
                Gerar código de senha
              </button>
            )}
            {confirmando === u.id ? (
              <span className="confirmar" role="group" aria-label={`Confirmar remoção de ${u.nomeExibicao}`}>
                <button type="button" className="perigo" disabled={ocupado !== null} onClick={() => void remover(u)}>
                  Confirmar remoção
                </button>
                <button type="button" className="secundario" onClick={() => setConfirmando(null)}>
                  Cancelar
                </button>
              </span>
            ) : (
              <button type="button" className="secundario" disabled={ocupado !== null} onClick={() => setConfirmando(u.id)}>
                {principal ? 'Remover conta' : 'Tirar do servidor'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {funcoes && api.criarFuncao && api.editarFuncao && api.removerFuncao && (
        <GerenciarCargos funcoes={funcoes} api={{ criarFuncao: api.criarFuncao, editarFuncao: api.editarFuncao, removerFuncao: api.removerFuncao }} />
      )}
      {api.banidos && api.desbanir && <ListaBanidos api={{ banidos: api.banidos, desbanir: api.desbanir }} servidorUrl={servidorUrl} />}
      <p className="suave">
        {principal
          ? 'Remover uma conta desconecta a pessoa na hora e libera a vaga. As mensagens dela continuam, com o autor "conta removida".'
          : 'Tirar alguém do servidor desconecta a pessoa daqui; a conta dela continua nos outros servidores. Para voltar, ela precisa de um convite.'}
      </p>
    </section>
  );
}
