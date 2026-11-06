import { useCallback } from 'react';
import type { DmDto, UsuarioDto } from '@tofalando/shared';
import type { ClienteApi } from '../servicos/api';
import { chaveDm } from '../estado/loja';
import { Avatar } from './Avatar';
import { BotaoSilenciarConversa } from './BotaoSilenciarConversa';
import { Conversa } from './MensagensCanal';

interface Props {
  dm: DmDto;
  /** A outra pessoa (undefined se a conta foi removida). */
  outro: UsuarioDto | undefined;
  usuarios: UsuarioDto[];
  servidorUrl: string;
  euId: number;
  api: Pick<ClienteApi, 'mensagensDm' | 'enviarAnexo'>;
  aoEnviar: (dmId: number, texto: string, anexos: string[]) => Promise<string | null>;
  aoEditarMensagem: (id: number, texto: string) => Promise<string | null>;
  aoApagarMensagem: (id: number) => Promise<string | null>;
  aoDigitar: (dmId: number) => void;
  /** RF-40: notificações desta conversa silenciadas. */
  silenciada?: boolean;
  aoSilenciar?: (sim: boolean) => void;
}

/** RF-12a: conversa direta. Só as duas pessoas veem; nem administrador apaga mensagem alheia aqui (RN-18). */
export function DmAberta({ dm, outro, usuarios, servidorUrl, euId, api, aoEnviar, aoEditarMensagem, aoApagarMensagem, aoDigitar, silenciada = false, aoSilenciar }: Props) {
  const nome = outro?.nomeExibicao ?? 'conta removida';
  const carregarPagina = useCallback((antes?: number) => api.mensagensDm(dm.id, antes), [api, dm.id]);
  return (
    <section className="canal-aberto" aria-labelledby="titulo-dm">
      <header className="canal-topo">
        <h2 id="titulo-dm" className="titulo-dm">
          {outro && <Avatar usuario={outro} servidorUrl={servidorUrl} tamanho={28} />}
          {nome}
        </h2>
        <span className="suave">Conversa direta · só vocês dois veem</span>
        {aoSilenciar && <BotaoSilenciarConversa silenciada={silenciada} nome={nome} aoSilenciar={aoSilenciar} />}
      </header>
      <Conversa
        conversa={{
          chave: chaveDm(dm.id),
          titulo: nome,
          inicio: `Este é o começo da conversa com ${nome}.`,
          rotuloLista: `Mensagens com ${nome}`,
        }}
        carregarPagina={carregarPagina}
        usuarios={usuarios}
        servidorUrl={servidorUrl}
        api={api}
        euId={euId}
        ehAdmin={false}
        aoEnviar={(texto, anexos) => aoEnviar(dm.id, texto, anexos)}
        aoEditar={aoEditarMensagem}
        aoApagar={aoApagarMensagem}
        aoDigitar={() => aoDigitar(dm.id)}
        somenteLeitura={outro ? undefined : 'Essa conta foi removida. A conversa ficou só para leitura.'}
      />
    </section>
  );
}
