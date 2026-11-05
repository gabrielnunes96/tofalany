import { describe, expect, it } from 'vitest';
import { normalizarUrlServidor } from './validacao.js';

describe('normalizarUrlServidor', () => {
  it('assume http quando não há esquema', () => {
    expect(normalizarUrlServidor('100.64.0.1:3000')).toEqual({ ok: true, valor: 'http://100.64.0.1:3000' });
  });

  it('mantém https e descarta caminho e barra final', () => {
    expect(normalizarUrlServidor('  https://fala.exemplo.com/qualquer/ ')).toEqual({ ok: true, valor: 'https://fala.exemplo.com' });
  });

  it('recusa vazio', () => {
    expect(normalizarUrlServidor('   ')).toEqual({ ok: false, erro: 'Informe o endereço do servidor.' });
  });

  it('recusa outro protocolo', () => {
    expect(normalizarUrlServidor('ftp://servidor')).toEqual({ ok: false, erro: 'Use um endereço http:// ou https://.' });
  });

  it('recusa texto que não é endereço', () => {
    expect(normalizarUrlServidor('http://')).toMatchObject({ ok: false });
    expect(normalizarUrlServidor('não é url com espaço')).toMatchObject({ ok: false });
  });
});
