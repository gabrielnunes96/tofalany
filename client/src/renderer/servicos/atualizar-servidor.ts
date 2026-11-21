import { ErroApiCliente } from './api';

/**
 * infra-e-atualizacao, RF-5 (T-7): pede à VM para conferir a versão nova na hora e devolve o texto para quem pediu.
 * O servidor só deixa o pedido; quem atualiza é a VM (o rodapé mostra a versão nova quando o servidor voltar).
 */
export async function pedirAtualizacaoServidor(api: { atualizarServidor(): Promise<unknown> }): Promise<string> {
  try {
    await api.atualizarServidor();
    return 'Pedido enviado: o servidor confere a versão nova em até 1 minuto (se houver, ele reinicia e volta sozinho).';
  } catch (e) {
    if (e instanceof ErroApiCliente && e.status === 429) return 'A atualização já foi pedida há pouco. Espere alguns minutos.';
    if (e instanceof ErroApiCliente && e.status === 503) return 'Este servidor não atualiza pelo app (só na VPS com a atualização automática ligada).';
    if (e instanceof ErroApiCliente && e.status === 403) return 'Só o administrador da instalação pode pedir a atualização.';
    return 'Não foi possível pedir a atualização agora.';
  }
}
