import { APP_ID, TEMPO_TESTE_SERVIDOR_MS, type Resultado, type ServidorInfo } from '@tofalando/shared';

type Buscar = (url: string, init?: RequestInit) => Promise<Response>;

const NAO_E_TOFALANDO = 'Esse endereço não é de um servidor ToFalany.';

function ehServidorInfo(v: unknown): v is ServidorInfo {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return o.app === APP_ID && typeof o.nome === 'string' && typeof o.versao === 'string' && typeof o.contas === 'number' && typeof o.limiteContas === 'number';
}

/** Confere se a URL responde como um servidor ToFalany (RF-1). */
export async function testarServidor(
  url: string,
  buscar: Buscar = fetch,
  tempoMs: number = TEMPO_TESTE_SERVIDOR_MS,
): Promise<Resultado<ServidorInfo>> {
  let resposta: Response;
  try {
    resposta = await buscar(`${url}/api/servidor`, { signal: AbortSignal.timeout(tempoMs) });
  } catch {
    return { ok: false, erro: 'Não foi possível conectar ao servidor. Confira o endereço e se ele está ligado.' };
  }
  if (!resposta.ok) return { ok: false, erro: `O servidor respondeu com erro (${resposta.status}).` };
  try {
    const info: unknown = await resposta.json();
    return ehServidorInfo(info) ? { ok: true, valor: info } : { ok: false, erro: NAO_E_TOFALANDO };
  } catch {
    return { ok: false, erro: NAO_E_TOFALANDO };
  }
}
