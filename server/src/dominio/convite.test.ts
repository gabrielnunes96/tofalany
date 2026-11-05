import { describe, expect, it } from 'vitest';
import { lerConfig } from '../config.js';
import { baseDoServidor, montarLinkConvite } from './convite.js';

describe('baseDoServidor', () => {
  it('URL_PUBLICA vence; atrás do proxy usa o primeiro X-Forwarded-*; senão o host', () => {
    expect(baseDoServidor(lerConfig({ URL_PUBLICA: 'https://fala.x' }), { host: 'interno:3000' }, false)).toBe('https://fala.x');
    const proxy = lerConfig({ ATRAS_DE_PROXY: 'true' });
    expect(baseDoServidor(proxy, { host: 'server:3000', 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'fala.x, outro' }, false)).toBe(
      'https://fala.x',
    );
    expect(baseDoServidor(lerConfig({}), { host: '100.64.0.1:3000', 'x-forwarded-host': 'ignorado' }, false)).toBe('http://100.64.0.1:3000');
    expect(montarLinkConvite('http://a', 'turma 1')).toBe('http://a/convite/turma%201');
  });
});
