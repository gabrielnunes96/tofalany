import type { UsuarioDto } from '@tofalando/shared';

interface Props {
  usuario: UsuarioDto;
  servidorUrl: string;
  aoSair: () => void;
  aoTrocarServidor: () => void;
}

/** Tela provisória depois do login: canais e chat chegam nas próximas tarefas (T4, T8, T9). */
export function TelaPrincipal({ usuario, servidorUrl, aoSair, aoTrocarServidor }: Props) {
  return (
    <main className="tela-centro">
      <section className="cartao">
        <h1 data-testid="usuario-logado">Olá, {usuario.nomeExibicao}</h1>
        <p className="suave">
          {usuario.cargo === 'admin' ? 'Administrador' : 'Membro'} · {servidorUrl}
        </p>
        <button type="button" className="secundario" onClick={aoSair}>
          Sair
        </button>
        <button type="button" className="link" onClick={aoTrocarServidor}>
          Trocar servidor
        </button>
      </section>
    </main>
  );
}
