import { Icone } from './Icone';

/** RF-40: silenciar (ou reativar) as notificações de uma conversa. O contador de não lidas continua (RN-27). */
export function BotaoSilenciarConversa({ silenciada, nome, aoSilenciar }: { silenciada: boolean; nome: string; aoSilenciar: (sim: boolean) => void }) {
  return (
    <button
      type="button"
      className={`icone silenciar-conversa${silenciada ? ' ativo' : ''}`}
      aria-pressed={silenciada}
      aria-label={`Silenciar notificações de ${nome}`}
      title={silenciada ? 'Notificações silenciadas (clique para reativar)' : 'Silenciar notificações'}
      onClick={() => aoSilenciar(!silenciada)}
    >
      <Icone nome={silenciada ? 'sinoDesligado' : 'sino'} />
    </button>
  );
}
