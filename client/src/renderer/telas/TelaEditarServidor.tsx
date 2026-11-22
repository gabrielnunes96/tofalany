import { useState } from 'react';
import { MINUTOS_AFK, type AfkDto, type CanalDto, type ComunidadeDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';

/** Administrador do servidor: troca o nome e a imagem (o app de todos atualiza na hora). */
export function TelaEditarServidor({
  api,
  nome,
  iconeUrl,
  servidorUrl,
  aoVoltar,
  canaisVoz = [],
  afk,
}: {
  api: Pick<ClienteApi, 'renomearComunidade' | 'enviarIconeComunidade' | 'removerIconeComunidade'> & Partial<Pick<ClienteApi, 'definirAfk'>>;
  nome: string;
  /** mover-e-afk (RF-4): salas de voz do servidor e a AFK atual (sem `afk`, servidor antigo: a seção não aparece). */
  canaisVoz?: CanalDto[];
  afk?: AfkDto | null;
  iconeUrl: string | null;
  servidorUrl: string;
  aoVoltar: () => void;
}) {
  const [texto, setTexto] = useState(nome);
  const [salaAfk, setSalaAfk] = useState<number | ''>(afk?.canalId ?? '');
  const [minutosAfk, setMinutosAfk] = useState<number>(afk?.minutos ?? 15);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  async function fazer(acao: () => Promise<ComunidadeDto>, ok: string) {
    setErro(null);
    setAviso(null);
    setOcupado(true);
    try {
      await acao();
      setAviso(ok);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setOcupado(false);
    }
  }

  const limpo = texto.trim().replace(/\s+/g, ' ');
  return (
    <section className="tela-admin" aria-labelledby="titulo-editar-servidor">
      <header className="canal-topo">
        <h2 id="titulo-editar-servidor">Editar servidor</h2>
        <button type="button" className="secundario" onClick={aoVoltar}>
          Voltar
        </button>
      </header>
      <form
        className="editar-servidor-nome"
        onSubmit={(e) => {
          e.preventDefault();
          if (limpo && limpo !== nome) void fazer(() => api.renomearComunidade(limpo), 'Nome salvo.');
        }}
      >
        <label htmlFor="nome-servidor">Nome do servidor</label>
        <input id="nome-servidor" value={texto} maxLength={40} onChange={(e) => setTexto(e.target.value)} />
        <button type="submit" disabled={ocupado || !limpo || limpo === nome}>
          Salvar nome
        </button>
      </form>
      <h3>Imagem</h3>
      <div className="editar-servidor-imagem">
        {iconeUrl ? (
          <img className="servidor-imagem-previa" src={`${servidorUrl}${iconeUrl}`} alt="Imagem atual do servidor" width={96} height={96} />
        ) : (
          <p className="suave">Sem imagem: a coluna de servidores mostra as iniciais do nome.</p>
        )}
        <label className="botao-arquivo">
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            disabled={ocupado}
            aria-label="Imagem do servidor"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void fazer(() => api.enviarIconeComunidade(f, f.name), 'Imagem trocada.');
            }}
          />
          {ocupado ? 'Enviando…' : iconeUrl ? 'Trocar imagem' : 'Escolher imagem'}
        </label>
        {iconeUrl && (
          <button type="button" className="secundario" disabled={ocupado} onClick={() => void fazer(() => api.removerIconeComunidade(), 'Imagem removida.')}>
            Remover imagem
          </button>
        )}
        <p className="suave">PNG, JPEG, GIF ou WebP, até 8 MB. Ela é recortada em quadrado.</p>
      </div>
      {api.definirAfk && afk !== undefined && (
        <form
          className="editar-servidor-afk"
          onSubmit={(e) => {
            e.preventDefault();
            const definir = api.definirAfk!;
            void fazer(
              () => definir(salaAfk === '' ? null : salaAfk, minutosAfk).then(() => ({ id: 0, nome, url: servidorUrl, iconeUrl })),
              salaAfk === '' ? 'Sala de AFK desligada.' : 'Sala de AFK salva.',
            );
          }}
        >
          <h3>Sala de AFK</h3>
          <p className="suave">Quem fica esse tempo sem falar e sem mexer no computador vai sozinho para a sala de AFK, onde ninguém fala.</p>
          <label htmlFor="sala-afk">Sala</label>
          <select id="sala-afk" value={salaAfk} onChange={(e) => setSalaAfk(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Desligada</option>
            {canaisVoz.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          <label htmlFor="minutos-afk">Depois de</label>
          <select id="minutos-afk" value={minutosAfk} disabled={salaAfk === ''} onChange={(e) => setMinutosAfk(Number(e.target.value))}>
            {MINUTOS_AFK.map((m) => (
              <option key={m} value={m}>
                {m} minutos
              </option>
            ))}
          </select>
          <button type="submit" disabled={ocupado}>
            Salvar sala de AFK
          </button>
        </form>
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
