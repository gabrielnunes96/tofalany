import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { ConviteLink, MotivoRevogacao, ServidorConhecido, SessaoResponse, UsuarioDto } from '@tofalando/shared';
import { testarServidor } from '../servicos/servidor';
import { ponte } from '../servicos/ponte';
import { criarApi, ErroApiCliente } from '../servicos/api';
import { TelaServidor } from '../telas/TelaServidor';
import { TelaEntrar } from '../telas/TelaEntrar';
import { TelaPrincipal } from '../telas/TelaPrincipal';
import { avisoDeRevogacao } from './avisos';
import { ColunaServidores } from '../componentes/ColunaServidores';

type Estado =
  | { fase: 'carregando' }
  | { fase: 'escolher-servidor'; voltar: Estado | null }
  | { fase: 'sem-conexao'; url: string; mensagem: string; convite?: ConviteLink }
  | { fase: 'entrar'; url: string; aviso?: string; convite?: string; voltar?: Estado }
  | { fase: 'principal'; url: string; token: string; usuario: UsuarioDto };

export function App() {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });
  const estadoRef = useRef(estado);
  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);
  // Backlog v2, item 7: servidores em que a pessoa entrou (a coluna à esquerda).
  const [servidores, setServidores] = useState<ServidorConhecido[]>([]);
  const lembrarServidor = useCallback((url: string, nome?: string) => {
    setServidores((atual) => {
      const existente = atual.find((s) => s.url === url);
      if (existente && (nome === undefined || existente.nome === nome)) return atual;
      const novo = existente ? atual.map((s) => (s.url === url ? { url, nome } : s)) : [...atual, nome ? { url, nome } : { url }];
      void ponte()
        .config.gravar({ servidores: novo })
        .catch(() => undefined);
      return novo;
    });
  }, []);

  /** Com servidor guardado: usa a sessão se ela for deste servidor e ainda valer (RF-3). */
  const retomar = useCallback(async (salvo: string) => {
    let url = salvo;
    let sessao = await ponte()
      .sessao.ler(salvo)
      .catch(() => null);
    // Endereço http:// de um servidor que redireciona para HTTPS: o tempo real (WebSocket) não segue redirecionamento.
    if (url.startsWith('http:')) {
      const teste = await testarServidor(url);
      if (teste.ok && teste.valor.endereco !== url) {
        url = teste.valor.endereco;
        await ponte().config.gravar({ servidorUrl: url }).catch(() => undefined);
        if (sessao) {
          sessao = { ...sessao, servidorUrl: url };
          await ponte().sessao.gravar(sessao).catch(() => undefined);
          await ponte().sessao.apagar(salvo).catch(() => undefined);
        }
      }
    }
    if (!sessao || sessao.servidorUrl !== url) {
      setEstado({ fase: 'entrar', url });
      return;
    }
    try {
      const usuario = await criarApi(url, sessao.token).eu();
      setEstado({ fase: 'principal', url, token: sessao.token, usuario });
    } catch (e) {
      if (e instanceof ErroApiCliente && e.status === 401) {
        await ponte()
          .sessao.apagar(url)
          .catch(() => undefined);
        setEstado({ fase: 'entrar', url });
      } else {
        setEstado({ fase: 'sem-conexao', url, mensagem: e instanceof Error ? e.message : 'Sem conexão com o servidor.' });
      }
    }
  }, []);

  /**
   * RF-1a: link de convite. Se já há sessão neste servidor, só entra. Senão abre o cadastro com o
   * código, sem gravar nada: o servidor só vira o padrão do app depois de entrar (um link qualquer
   * de uma página não pode trocar o servidor de quem já usa outro). Fora do ar: "sem conexão",
   * guardando o convite para "Tentar de novo".
   */
  const abrirConvite = useCallback(
    async (convite: ConviteLink) => {
      const { codigo } = convite;
      const teste = await testarServidor(convite.servidor);
      if (!teste.ok) {
        setEstado({ fase: 'sem-conexao', url: convite.servidor, mensagem: teste.erro, convite });
        return;
      }
      const servidor = teste.valor.endereco;
      // O processo principal só deixa falar com o servidor salvo; este, já testado, vale enquanto o convite estiver aberto.
      await ponte().rede.servidorPendente(servidor).catch(() => undefined);
      const sessao = await ponte()
        .sessao.ler(servidor)
        .catch(() => null);
      if (sessao) {
        await ponte().config.gravar({ servidorUrl: servidor });
        await retomar(servidor);
      } else setEstado((atual) => ({ fase: 'entrar', url: servidor, convite: codigo, voltar: atual }));
    },
    [retomar],
  );

  useEffect(() => {
    const parar = ponte().convite.aoChegar((c) => void abrirConvite(c));
    void (async () => {
      const pendente = await ponte().convite.pendente().catch(() => null);
      if (pendente) return abrirConvite(pendente);
      const c = await ponte().config.ler();
      // Quem vem da versão sem a lista: o servidor salvo entra nela.
      setServidores(c.servidores?.length ? c.servidores : c.servidorUrl ? [{ url: c.servidorUrl }] : []);
      return c.servidorUrl ? retomar(c.servidorUrl) : setEstado({ fase: 'escolher-servidor', voltar: null });
    })().catch(() => setEstado({ fase: 'escolher-servidor', voltar: null }));
    return parar;
  }, [retomar, abrirConvite]);

  /** Só grava depois que a nova URL passou no teste; a sessão guardada só vale para o servidor em que foi criada. */
  async function guardarServidor(url: string) {
    const salvo = await ponte().config.gravar({ servidorUrl: url });
    if (!salvo.servidorUrl) throw new Error('Endereço recusado.');
    await retomar(salvo.servidorUrl);
  }

  async function entrou(url: string, sessao: SessaoResponse) {
    // Entrou neste servidor: agora sim ele vira o padrão do app (também vale para quem veio por convite).
    await ponte()
      .config.gravar({ servidorUrl: url })
      .catch((e: unknown) => console.error('Não foi possível guardar o servidor.', e));
    // A sessão já existe no servidor: se gravar localmente falhar, segue com ela só em memória
    // (vai pedir login ao reabrir) em vez de prender o usuário na tela de cadastro.
    await ponte()
      .sessao.gravar({ servidorUrl: url, token: sessao.token })
      .catch((e: unknown) => console.error('Não foi possível guardar a sessão neste computador.', e));
    lembrarServidor(url);
    setEstado({ fase: 'principal', url, token: sessao.token, usuario: sessao.usuario });
  }

  async function sair(url: string, token: string) {
    await criarApi(url, token).sair().catch(() => undefined);
    await ponte()
      .sessao.apagar(url)
      .catch((e: unknown) => console.error('Não foi possível apagar a sessão guardada.', e));
    setEstado({ fase: 'entrar', url });
  }

  const sessaoRevogada = useCallback((motivo: MotivoRevogacao) => {
    const atual = estadoRef.current;
    if (atual.fase === 'principal')
      void ponte()
        .sessao.apagar(atual.url)
        .catch(() => undefined);
    setEstado((atual) =>
      atual.fase === 'principal' ? { fase: 'entrar', url: atual.url, aviso: avisoDeRevogacao(motivo) } : atual,
    );
  }, []);

  const trocarServidor = () => setEstado((atual) => ({ fase: 'escolher-servidor', voltar: atual }));

  /** Backlog v2, item 7: clique na coluna: vira o servidor do app e entra com a sessão dele (se houver). */
  async function irParaServidor(url: string) {
    await ponte()
      .config.gravar({ servidorUrl: url })
      .catch(() => undefined);
    setEstado({ fase: 'carregando' });
    await retomar(url);
  }

  const urlAtiva = estado.fase === 'principal' || estado.fase === 'entrar' || estado.fase === 'sem-conexao' ? estado.url : null;
  /** A coluna de servidores aparece quando já há algum servidor (na primeira execução, não). */
  const comColuna = (tela: ReactNode) =>
    servidores.length === 0 ? (
      tela
    ) : (
      <div className="app-com-servidores">
        <ColunaServidores servidores={servidores} ativo={urlAtiva} aoEscolher={(url) => void irParaServidor(url)} aoAdicionar={trocarServidor} />
        <div className="app-tela">{tela}</div>
      </div>
    );

  switch (estado.fase) {
    case 'carregando':
      return null;
    case 'escolher-servidor': {
      const { voltar } = estado;
      return comColuna(<TelaServidor aoConectar={guardarServidor} aoConvite={(c) => void abrirConvite(c)} aoCancelar={voltar ? () => setEstado(voltar) : undefined} />);
    }
    case 'sem-conexao':
      return comColuna(
        <main className="tela-centro">
          <section className="cartao">
            <h1>Sem conexão</h1>
            <p className="erro" role="alert">
              {estado.mensagem}
            </p>
            <button type="button" onClick={() => void (estado.convite ? abrirConvite(estado.convite) : retomar(estado.url))}>
              Tentar de novo
            </button>
            <button type="button" className="link" onClick={trocarServidor}>
              Trocar servidor
            </button>
          </section>
        </main>,
      );
    case 'entrar':
      return comColuna(
        <TelaEntrar
          key={`${estado.url}|${estado.convite ?? ''}`}
          servidorUrl={estado.url}
          aviso={estado.aviso}
          conviteInicial={estado.convite}
          aoCancelarConvite={estado.voltar && estado.voltar.fase !== 'carregando' ? () => setEstado(estado.voltar!) : undefined}
          aoEntrar={(s) => entrou(estado.url, s)} aoTrocarServidor={trocarServidor} />,
      );
    case 'principal':
      return comColuna(
        <TelaPrincipal
          key={estado.url}
          aoNomeServidor={(nome) => lembrarServidor(estado.url, nome)}
          servidorUrl={estado.url}
          token={estado.token}
          usuarioInicial={estado.usuario}
          aoSair={() => void sair(estado.url, estado.token)}
          aoTrocarServidor={trocarServidor}
          aoSessaoRevogada={sessaoRevogada}
        />,
      );
  }
}
