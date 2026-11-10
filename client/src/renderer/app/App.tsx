import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { caminhoComunidade, separarComunidade, type ConviteLink, type MotivoRevogacao, type ServidorConhecido, type SessaoResponse, type UsuarioDto } from '@tofalando/shared';
import { testarServidor } from '../servicos/servidor';
import { ponte } from '../servicos/ponte';
import { criarApi, ErroApiCliente } from '../servicos/api';
import { TelaServidor } from '../telas/TelaServidor';
import { TelaEntrar } from '../telas/TelaEntrar';
import { TelaPrincipal } from '../telas/TelaPrincipal';
import { avisoDeRevogacao } from './avisos';
import { ColunaServidores } from '../componentes/ColunaServidores';
import { INTERVALO_OUTROS_MS, naoLidasDosOutros } from '../servicos/naolidas-servidores';

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
  const lembrarServidor = useCallback((url: string, nome?: string, icone?: string | null) => {
    setServidores((atual) => {
      const existente = atual.find((s) => s.url === url);
      // icone: undefined = não sei (mantém); null = sem imagem.
      const iconeFinal = icone === undefined ? existente?.icone : (icone ?? undefined);
      if (existente && (nome === undefined || existente.nome === nome) && existente.icone === iconeFinal) return atual;
      const item = { url, ...((nome ?? existente?.nome) ? { nome: nome ?? existente?.nome } : {}), ...(iconeFinal ? { icone: iconeFinal } : {}) };
      const novo = existente ? atual.map((s) => (s.url === url ? item : s)) : [...atual, item];
      void ponte()
        .config.gravar({ servidores: novo })
        .catch(() => undefined);
      return novo;
    });
  }, []);

  const servidoresRef = useRef(servidores);
  useEffect(() => {
    servidoresRef.current = servidores;
  }, [servidores]);

  /**
   * Vários servidores na mesma instalação (https://x e https://x/c/<id>): a conta é a mesma, então a sessão de
   * qualquer um deles serve para os outros.
   */
  const tokenDaInstalacao = useCallback(async (url: string): Promise<string | null> => {
    const { base } = separarComunidade(url);
    const candidatos = [base, ...servidoresRef.current.map((s) => s.url)].filter((u, i, l) => u !== url && l.indexOf(u) === i && separarComunidade(u).base === base);
    for (const u of candidatos) {
      const s = await ponte()
        .sessao.ler(u)
        .catch(() => null);
      if (s?.token) return s.token;
    }
    return null;
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
      // Outro servidor da mesma instalação: a mesma conta entra sem pedir senha.
      const token = await tokenDaInstalacao(url);
      if (!token) {
        setEstado({ fase: 'entrar', url });
        return;
      }
      sessao = { servidorUrl: url, token };
    }
    try {
      const usuario = await criarApi(url, sessao.token).eu();
      await ponte()
        .sessao.gravar({ servidorUrl: url, token: sessao.token })
        .catch(() => undefined);
      setEstado({ fase: 'principal', url, token: sessao.token, usuario });
    } catch (e) {
      if (e instanceof ErroApiCliente && e.codigo === 'nao_membro') {
        setEstado({ fase: 'sem-conexao', url, mensagem: 'Você não participa deste servidor. Peça um convite para quem administra.' });
      } else if (e instanceof ErroApiCliente && e.status === 401) {
        await ponte()
          .sessao.apagar(url)
          .catch(() => undefined);
        setEstado({ fase: 'entrar', url });
      } else {
        setEstado({ fase: 'sem-conexao', url, mensagem: e instanceof Error ? e.message : 'Sem conexão com o servidor.' });
      }
    }
  }, [tokenDaInstalacao]);

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
        return;
      }
      // Convite de outro servidor de uma instalação em que já tenho conta: entra com ela, sem novo cadastro.
      const token = await tokenDaInstalacao(servidor);
      if (token) {
        try {
          const c = await criarApi(servidor, token).entrarComunidade(codigo);
          const url = `${separarComunidade(servidor).base}${caminhoComunidade(c.id)}`;
          await ponte().sessao.gravar({ servidorUrl: url, token });
          await ponte().config.gravar({ servidorUrl: url });
          lembrarServidor(url, c.nome);
          await retomar(url);
          return;
        } catch (e) {
          setEstado({ fase: 'sem-conexao', url: servidor, mensagem: e instanceof Error ? e.message : 'Não foi possível entrar no servidor.', convite });
          return;
        }
      }
      setEstado((atual) => ({ fase: 'entrar', url: servidor, convite: codigo, voltar: atual }));
    },
    [retomar, tokenDaInstalacao, lembrarServidor],
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

  /** Tira um servidor da coluna (saí, fui tirado ou ele foi excluído) e vai para outro da lista. */
  const esquecerServidor = useCallback(
    async (url: string) => {
      await ponte()
        .sessao.apagar(url)
        .catch(() => undefined);
      const resto = servidoresRef.current.filter((s) => s.url !== url);
      setServidores(resto);
      const proximo = resto.find((s) => s.url === separarComunidade(url).base) ?? resto[0];
      await ponte()
        .config.gravar({ servidores: resto, servidorUrl: proximo?.url ?? null })
        .catch(() => undefined);
      if (proximo) await retomar(proximo.url);
      else setEstado({ fase: 'escolher-servidor', voltar: null });
    },
    [retomar],
  );

  const sessaoRevogada = useCallback((motivo: MotivoRevogacao) => {
    const atual = estadoRef.current;
    if (motivo === 'fora_do_servidor' && atual.fase === 'principal') {
      void esquecerServidor(atual.url);
      return;
    }
    if (atual.fase === 'principal')
      void ponte()
        .sessao.apagar(atual.url)
        .catch(() => undefined);
    setEstado((atual) =>
      atual.fase === 'principal' ? { fase: 'entrar', url: atual.url, aviso: avisoDeRevogacao(motivo) } : atual,
    );
  }, [esquecerServidor]);

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

  // Servidores da mesma instalação: a coluna mostra todos os meus (o administrador vê todos) e tira os que saíram.
  const [podeCriar, setPodeCriar] = useState<string | null>(null);
  const principalUrl = estado.fase === 'principal' ? estado.url : null;
  const principalToken = estado.fase === 'principal' ? estado.token : null;
  useEffect(() => {
    if (!principalUrl || !principalToken) return;
    const { base } = separarComunidade(principalUrl);
    let vivo = true;
    void (async () => {
      const lista = await Promise.resolve()
        .then(() => criarApi(principalUrl, principalToken).comunidades())
        .catch(() => null);
      if (!lista || !vivo) return;
      const daqui = lista.map((c) => ({ url: `${base}${caminhoComunidade(c.id)}`, nome: c.nome, ...(c.iconeUrl ? { icone: `${base}${c.iconeUrl}` } : {}) }));
      for (const c of daqui) {
        await ponte()
          .sessao.gravar({ servidorUrl: c.url, token: principalToken })
          .catch(() => undefined);
      }
      if (!vivo) return;
      setServidores((atual) => {
        const urls = new Set(daqui.map((c) => c.url));
        const mantidos = atual.filter((s) => separarComunidade(s.url).base !== base || urls.has(s.url)).map((s) => daqui.find((c) => c.url === s.url) ?? s);
        const novos = daqui.filter((c) => !mantidos.some((s) => s.url === c.url));
        const proximo = [...mantidos, ...novos];
        if (JSON.stringify(proximo) === JSON.stringify(atual)) return atual;
        void ponte()
          .config.gravar({ servidores: proximo })
          .catch(() => undefined);
        return proximo;
      });
      // Só o administrador do principal cria servidores (o botão "Criar servidor" aparece para ele).
      const eu = await Promise.resolve()
        .then(() => criarApi(base, principalToken).eu())
        .catch(() => null);
      if (vivo) setPodeCriar(eu?.cargo === 'admin' ? base : null);
    })();
    return () => {
      vivo = false;
    };
  }, [principalUrl, principalToken]);

  async function criarServidor(nome: string): Promise<string | null> {
    const atual = estadoRef.current;
    if (atual.fase !== 'principal') return 'Entre num servidor primeiro.';
    try {
      const c = await criarApi(atual.url, atual.token).criarComunidade(nome);
      const url = `${separarComunidade(atual.url).base}${caminhoComunidade(c.id)}`;
      await ponte().sessao.gravar({ servidorUrl: url, token: atual.token });
      lembrarServidor(url, c.nome);
      await irParaServidor(url);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Não foi possível criar o servidor.';
    }
  }

  // Backlog v2: número de não lidas no ícone dos outros servidores (consulta a cada minuto e ao trocar de servidor).
  const [naoLidasOutros, setNaoLidasOutros] = useState<Record<string, number>>({});
  useEffect(() => {
    if (servidores.length < 2) return;
    let vivo = true;
    const conferir = () =>
      void naoLidasDosOutros(
        servidores,
        urlAtiva,
        async (url) => (await ponte().sessao.ler(url).catch(() => null))?.token ?? null,
        (url, token) => criarApi(url, token).naoLidas(),
      ).then((r) => {
        if (vivo) setNaoLidasOutros(r);
      });
    conferir();
    const relogio = setInterval(conferir, INTERVALO_OUTROS_MS);
    return () => {
      vivo = false;
      clearInterval(relogio);
    };
  }, [servidores, urlAtiva]);
  /** A coluna de servidores aparece quando já há algum servidor (na primeira execução, não). */
  const comColuna = (tela: ReactNode) =>
    servidores.length === 0 ? (
      tela
    ) : (
      <div className="app-com-servidores">
        <ColunaServidores
          servidores={servidores}
          ativo={urlAtiva}
          naoLidas={naoLidasOutros}
          aoEscolher={(url) => void irParaServidor(url)}
          aoAdicionar={trocarServidor}
          aoCriar={podeCriar && urlAtiva && separarComunidade(urlAtiva).base === podeCriar ? criarServidor : undefined}
        />
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
          aoNomeServidor={(nome, icone) => lembrarServidor(estado.url, nome, icone)}
          servidorUrl={estado.url}
          token={estado.token}
          usuarioInicial={estado.usuario}
          aoSair={() => void sair(estado.url, estado.token)}
          aoTrocarServidor={trocarServidor}
          aoSessaoRevogada={sessaoRevogada}
          aoSairDoServidor={() => void esquecerServidor(estado.url)}
        />,
      );
  }
}
