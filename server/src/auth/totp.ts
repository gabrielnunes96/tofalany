/**
 * Códigos de uso único por tempo (TOTP, RFC 6238): HMAC-SHA1, passos de 30 s, 6 dígitos — o formato que os apps de
 * autenticação (Google Authenticator, Microsoft Authenticator e outros) leem pelo QR code.
 */
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const ALFABETO_BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PASSO_MS = 30_000;
const DIGITOS = 6;

export function paraBase32(dados: Buffer): string {
  let bits = 0;
  let valor = 0;
  let saida = '';
  for (const byte of dados) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      saida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) saida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return saida;
}

export function deBase32(texto: string): Buffer {
  const limpo = texto.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let valor = 0;
  const bytes: number[] = [];
  for (const c of limpo) {
    valor = (valor << 5) | ALFABETO_BASE32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segredo novo de 160 bits, em base32 (o que o app guarda). */
export const gerarSegredo = (): string => paraBase32(randomBytes(20));

export const passoDe = (agora: number): number => Math.floor(agora / PASSO_MS);

/** Código de 6 dígitos de um passo. */
export function codigoDoPasso(segredo: string, passo: number): string {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(passo));
  const hmac = createHmac('sha1', deBase32(segredo)).update(contador).digest();
  const deslocamento = hmac[hmac.length - 1]! & 0x0f;
  const numero = (hmac.readUInt32BE(deslocamento) & 0x7fffffff) % 10 ** DIGITOS;
  return String(numero).padStart(DIGITOS, '0');
}

/**
 * Confere o código com tolerância de um passo para cada lado (relógio do celular adiantado ou atrasado).
 * Devolve o passo que bateu, só se for depois de `ultimoPasso` (o mesmo código não serve duas vezes); senão null.
 */
export function conferirCodigo(segredo: string, codigo: string, agora: number, ultimoPasso = 0): number | null {
  const digitado = codigo.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digitado)) return null;
  const atual = passoDe(agora);
  for (const passo of [atual - 1, atual, atual + 1]) {
    if (passo <= ultimoPasso) continue;
    const certo = codigoDoPasso(segredo, passo);
    if (timingSafeEqual(Buffer.from(certo), Buffer.from(digitado))) return passo;
  }
  return null;
}

/** Endereço que vira o QR code: o app mostra "<emissor> (<conta>)". */
export function enderecoOtpauth(segredo: string, conta: string, emissor: string): string {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=${DIGITOS}&period=${PASSO_MS / 1000}`;
}

/** Códigos de recuperação "XXXX-XXXX" sem letras que se confundem (0/O, 1/I/L). */
const ALFABETO_RECUPERACAO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function gerarCodigoRecuperacao(): string {
  const parte = () => Array.from({ length: 4 }, () => ALFABETO_RECUPERACAO[randomInt(ALFABETO_RECUPERACAO.length)]).join('');
  return `${parte()}-${parte()}`;
}
export const normalizarRecuperacao = (codigo: string): string => codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
