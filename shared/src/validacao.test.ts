import { describe, expect, it } from 'vitest';
import { normalizarUrlServidor, normalizarUsuario, validarSenha, validarUsuario } from './validacao.js';

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

describe('validarUsuario', () => {
  it('aceita e apara', () => {
    expect(validarUsuario('  Gabriel_96 ')).toEqual({ ok: true, valor: 'Gabriel_96' });
  });
  it('recusa curto, longo e caracteres fora do padrão', () => {
    expect(validarUsuario('ab')).toMatchObject({ ok: false });
    expect(validarUsuario('a'.repeat(33))).toMatchObject({ ok: false });
    expect(validarUsuario('joão')).toMatchObject({ ok: false });
    expect(validarUsuario('com espaço')).toMatchObject({ ok: false });
  });
  it('normaliza sem diferenciar maiúsculas', () => {
    expect(normalizarUsuario(' Gabriel ')).toBe(normalizarUsuario('gabriel'));
  });
});

describe('validarSenha', () => {
  it('exige de 8 a 128 caracteres', () => {
    expect(validarSenha('1234567')).toMatchObject({ ok: false });
    expect(validarSenha('12345678')).toEqual({ ok: true, valor: '12345678' });
    expect(validarSenha('x'.repeat(129))).toMatchObject({ ok: false });
  });
});
