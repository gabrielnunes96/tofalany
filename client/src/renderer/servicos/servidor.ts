import { caminhoComunidade, separarComunidade } from '@tofalando/shared';
import { APP_ID, TEMPO_TESTE_SERVIDOR_MS, type Resultado, type ServidorInfo } from '@tofalando/shared';

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

const NAO_E_TOFALANDO = 'Esse endereço não é de um servidor ToFalany.';

function ehServidorInfo(v: unknown): v is ServidorInfo {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.app === APP_ID && typeof o.nome === 'string' && typeof o.versao === 'string' && typeof o.contas === 'number' && typeof o.limiteContas === 'number';
}

/** Resposta do teste: dados do servidor e o endereço a guardar (o final, se ele redirecionou para HTTPS). */
export type ServidorTestado = ServidorInfo & { endereco: string };

/** Endereço final de um redirecionamento: só aceita a troca de http para https no mesmo host. */
function enderecoFinal(pedido: string, final: string): string {
  try {
    const de = new URL(pedido);
    const para = new URL(final);
    // O caminho /c/<id> (servidor criado na mesma instalação) faz parte do endereço.
    const { comunidade } = separarComunidade(pedido);
    const caminho = caminhoComunidade(comunidade);
    return (de.protocol === 'http:' && para.protocol === 'https:' && de.hostname === para.hostname ? para.origin : de.origin) + caminho;
  } catch {
    return pedido;
  }
}

/** Confere se a URL responde como um servidor ToFalany (RF-1). */
export async function testarServidor(
  url: string,
  buscar: Buscar = fetch,
  tempoMs: number = TEMPO_TESTE_SERVIDOR_MS,
): Promise<Resultado<ServidorTestado>> {
  let resposta: Response;
  try {
    resposta = await buscar(`${url}/api/servidor`, { signal: AbortSignal.timeout(tempoMs) });
  } catch {
    return { ok: false, erro: 'Não foi possível conectar ao servidor. Confira o endereço e se ele está ligado.' };
  }
  if (!resposta.ok) return { ok: false, erro: `O servidor respondeu com erro (${resposta.status}).` };
  try {
    const info: unknown = await resposta.json();
    return ehServidorInfo(info) ? { ok: true, valor: { ...info, endereco: enderecoFinal(url, resposta.url || url) } } : { ok: false, erro: NAO_E_TOFALANDO };
  } catch {
    return { ok: false, erro: NAO_E_TOFALANDO };
  }
}
