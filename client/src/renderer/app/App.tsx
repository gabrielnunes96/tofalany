import { useCallback, useEffect, useState } from 'react';
import type { MotivoRevogacao, SessaoResponse, UsuarioDto } from '@tofalando/shared';
import { ponte } from '../servicos/ponte';
import { criarApi, ErroApiCliente } from '../servicos/api';
import { TelaServidor } from '../telas/TelaServidor';
import { TelaEntrar } from '../telas/TelaEntrar';
import { TelaPrincipal } from '../telas/TelaPrincipal';
import { avisoDeRevogacao } from './avisos';

type Estado =
  | { fase: 'carregando' }
  | { fase: 'escolher-servidor'; voltar: Estado | null }
  | { fase: 'sem-conexao'; url: string; mensagem: string }
  | { fase: 'entrar'; url: string; aviso?: string }
  | { fase: 'principal'; url: string; token: string; usuario: UsuarioDto };

export function App() {
  const [estado, setEstado] = useState<Estado>({ fase: 'carregando' });

  /** Com servidor guardado: usa a sessão se ela for deste servidor e ainda valer (RF-3). */
  const retomar = useCallback(async (url: string) => {
    const sessao = await ponte().sessao.ler().catch(() => null);
    if (!sessao || sessao.servidorUrl !== url) {
      setEstado({ fase: 'entrar', url });
      return;
    }
    try {
      const usuario = await criarApi(url, sessao.token).eu();
      setEstado({ fase: 'principal', url, token: sessao.token, usuario });
    } catch (e) {
      if (e instanceof ErroApiCliente && e.status === 401) {
        await ponte().sessao.apagar().catch(() => undefined);
        setEstado({ fase: 'entrar', url });
      } else {
        setEstado({ fase: 'sem-conexao', url, mensagem: e instanceof Error ? e.message : 'Sem conexão com o servidor.' });
      }
    }
  }, []);

  useEffect(() => {
    ponte()
      .config.ler()
      .then((c) => (c.servidorUrl ? retomar(c.servidorUrl) : setEstado({ fase: 'escolher-servidor', voltar: null })))
      .catch(() => setEstado({ fase: 'escolher-servidor', voltar: null }));
  }, [retomar]);

  /** Só grava depois que a nova URL passou no teste; a sessão guardada só vale para o servidor em que foi criada. */
  async function guardarServidor(url: string) {
    const salvo = await ponte().config.gravar({ servidorUrl: url });
    if (!salvo.servidorUrl) throw new Error('Endereço recusado.');
    await retomar(salvo.servidorUrl);
  }

  async function entrou(url: string, sessao: SessaoResponse) {
    // A sessão já existe no servidor: se gravar localmente falhar, segue com ela só em memória
    // (vai pedir login ao reabrir) em vez de prender o usuário na tela de cadastro.
    await ponte()
      .sessao.gravar({ servidorUrl: url, token: sessao.token })
      .catch((e: unknown) => console.error('Não foi possível guardar a sessão neste computador.', e));
    setEstado({ fase: 'principal', url, token: sessao.token, usuario: sessao.usuario });
  }

  async function sair(url: string, token: string) {
    await criarApi(url, token).sair().catch(() => undefined);
    await ponte()
      .sessao.apagar()
      .catch((e: unknown) => console.error('Não foi possível apagar a sessão guardada.', e));
    setEstado({ fase: 'entrar', url });
  }

  const sessaoRevogada = useCallback((motivo: MotivoRevogacao) => {
    void ponte()
      .sessao.apagar()
      .catch(() => undefined);
    setEstado((atual) =>
      atual.fase === 'principal' ? { fase: 'entrar', url: atual.url, aviso: avisoDeRevogacao(motivo) } : atual,
    );
  }, []);

  const trocarServidor = () => setEstado((atual) => ({ fase: 'escolher-servidor', voltar: atual }));

  switch (estado.fase) {
    case 'carregando':
      return null;
    case 'escolher-servidor': {
      const { voltar } = estado;
      return <TelaServidor aoConectar={guardarServidor} aoCancelar={voltar ? () => setEstado(voltar) : undefined} />;
    }
    case 'sem-conexao':
      return (
        <main className="tela-centro">
          <section className="cartao">
            <h1>Sem conexão</h1>
            <p className="erro" role="alert">
              {estado.mensagem}
            </p>
            <button type="button" onClick={() => void retomar(estado.url)}>
              Tentar de novo
            </button>
            <button type="button" className="link" onClick={trocarServidor}>
              Trocar servidor
            </button>
          </section>
        </main>
      );
    case 'entrar':
      return (
        <TelaEntrar servidorUrl={estado.url} aviso={estado.aviso} aoEntrar={(s) => entrou(estado.url, s)} aoTrocarServidor={trocarServidor} />
      );
    case 'principal':
      return (
        <TelaPrincipal
          servidorUrl={estado.url}
          token={estado.token}
          usuarioInicial={estado.usuario}
          aoSair={() => void sair(estado.url, estado.token)}
          aoTrocarServidor={trocarServidor}
          aoSessaoRevogada={sessaoRevogada}
        />
      );
  }
}
