import { ErroApiCliente } from './api';

export interface ResultadoPedido {
  texto: string;
  ok: boolean;
}

/**
 * infra-e-atualizacao, RF-5 (T-7): pede à VM para conferir a versão nova na hora e devolve o texto para quem pediu.
 * O servidor só deixa o pedido; quem atualiza é a VM (o rodapé mostra a versão nova quando o servidor voltar).
 */
export async function pedirAtualizacaoServidor(api: { atualizarServidor(): Promise<unknown> }): Promise<ResultadoPedido> {
  try {
    await api.atualizarServidor();
    return { ok: true, texto: 'Pedido enviado: o servidor confere a versão nova em até 1 minuto (se houver, ele reinicia e volta sozinho).' };
  } catch (e) {
    if (!(e instanceof ErroApiCliente)) return { ok: false, texto: 'Não foi possível pedir a atualização agora.' };
    if (e.status === 429) return { ok: false, texto: 'A atualização já foi pedida há pouco. Espere alguns minutos.' };
    if (e.status === 403) return { ok: false, texto: 'Só o administrador da instalação pode pedir a atualização.' };
    // 503 do próprio servidor (sem pedido pelo app ou pasta indisponível) ou do proxy (reiniciando): a mensagem já diz qual.
    if (e.status >= 500 || e.status === 0) return { ok: false, texto: e.message };
    return { ok: false, texto: 'Não foi possível pedir a atualização agora.' };
  }
}
