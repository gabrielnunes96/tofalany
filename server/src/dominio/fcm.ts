/**
 * celular: envio do aviso sem conteúdo pelo Firebase Cloud Messaging (API HTTP v1). A credencial é o arquivo JSON de
 * uma conta de serviço com só o papel de envio do FCM (A7), num caminho da VM (PUSH_FCM_CREDENCIAL). O token de acesso
 * OAuth é pedido com um JWT assinado (RS256) e guardado até perto de vencer. Nenhum texto vai para o Google: só
 * `{ v: '1', k }` (A6), sem bloco `notification` (o Android não mostra nada sozinho).
 */
import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ResultadoEnvio, Transporte } from './push.js';

interface ContaServico {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const ESCOPO = 'https://www.googleapis.com/auth/firebase.messaging';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const TEMPO_LIMITE_MS = 10_000;

const base64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Lê a conta de serviço; sem arquivo (ou inválido), o push fica desligado. */
export function lerContaServico(caminho: string | undefined): ContaServico | undefined {
  if (!caminho) return undefined;
  try {
    const c = JSON.parse(readFileSync(caminho, 'utf8')) as Partial<ContaServico>;
    if (typeof c.project_id === 'string' && typeof c.client_email === 'string' && typeof c.private_key === 'string') return c as ContaServico;
  } catch {
    // Sem credencial: push desligado.
  }
  return undefined;
}

/** Transporte real: OAuth (JWT de conta de serviço) + `messages:send`. `buscar` é injetável nos testes. */
export function criarTransporteFcm(conta: ContaServico, buscar: typeof fetch = fetch, agora: () => number = Date.now): Transporte {
  let acesso: { token: string; vence: number } | undefined;

  async function tokenDeAcesso(): Promise<string> {
    if (acesso && acesso.vence - 60_000 > agora()) return acesso.token;
    const iat = Math.floor(agora() / 1000);
    const cabecalho = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const corpo = base64url(JSON.stringify({ iss: conta.client_email, scope: ESCOPO, aud: conta.token_uri ?? URL_TOKEN, iat, exp: iat + 3600 }));
    const assinatura = createSign('RSA-SHA256').update(`${cabecalho}.${corpo}`).sign(conta.private_key, 'base64url');
    const r = await buscar(conta.token_uri ?? URL_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${cabecalho}.${corpo}.${assinatura}` }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!r.ok) throw new Error(`OAuth do FCM respondeu ${r.status}`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    acesso = { token: j.access_token, vence: agora() + j.expires_in * 1000 };
    return acesso.token;
  }

  return async ({ fcmToken, k, ttlSegundos, urgente }): Promise<ResultadoEnvio> => {
    const token = await tokenDeAcesso();
    const r = await buscar(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(conta.project_id)}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          data: { v: '1', k },
          android: { priority: urgente ? 'high' : 'normal', ttl: `${ttlSegundos}s`, collapse_key: k },
        },
      }),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (r.ok) return 'ok';
    // 404 UNREGISTERED e 400 INVALID_ARGUMENT (token inválido): o aparelho não existe mais no Google.
    if (r.status === 404 || r.status === 400) return 'nao_registrado';
    return 'erro';
  };
}
