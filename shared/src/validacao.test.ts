import { describe, expect, it } from 'vitest';
import { validarTextoMensagem, validarNomeCanal, validarNomeSom, mesclarAudio, mesclarPessoas, mesclarSons, mesclarNotificacoes, lerLinkConvite, montarLinkApp, validarCodigoConvite, normalizarUrlServidor, normalizarUsuario, validarCor, validarNomeExibicao, validarSenha, validarUsuario } from './validacao.js';

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

describe('validarNomeExibicao', () => {
  it('apara, junta espaços e aceita acentos e emoji', () => {
    expect(validarNomeExibicao('  João   da  Silva ')).toEqual({ ok: true, valor: 'João da Silva' });
    expect(validarNomeExibicao('Bia 🎧')).toEqual({ ok: true, valor: 'Bia 🎧' });
  });
  it('recusa vazio, longo e controle', () => {
    expect(validarNomeExibicao('   ')).toMatchObject({ ok: false });
    expect(validarNomeExibicao('x'.repeat(33))).toMatchObject({ ok: false });
    expect(validarNomeExibicao('a\u0007b')).toMatchObject({ ok: false });
  });
});

describe('validarCor', () => {
  it('aceita #rrggbb e normaliza', () => {
    expect(validarCor('#FFAA00')).toEqual({ ok: true, valor: '#ffaa00' });
    expect(validarCor('red')).toMatchObject({ ok: false });
    expect(validarCor('#fff')).toMatchObject({ ok: false });
  });
});

describe('validarCodigoConvite', () => {
  it('6 a 64, só caracteres seguros para link', () => {
    expect(validarCodigoConvite(' turma-2026 ')).toEqual({ ok: true, valor: 'turma-2026' });
    expect(validarCodigoConvite('curto')).toMatchObject({ ok: false });
    expect(validarCodigoConvite('com espaço')).toMatchObject({ ok: false });
    expect(validarCodigoConvite('a/b?c=d')).toMatchObject({ ok: false });
  });
});

describe('link do app (RF-1a)', () => {
  it('ida e volta', () => {
    const link = montarLinkApp('https://fala.exemplo.com', 'turma-2026');
    expect(link).toBe('tofalany://convite?servidor=https%3A%2F%2Ffala.exemplo.com&codigo=turma-2026');
    expect(lerLinkConvite(link)).toEqual({ servidor: 'https://fala.exemplo.com', codigo: 'turma-2026' });
  });
  it('recusa outro esquema, outro destino, servidor ou código inválidos', () => {
    expect(lerLinkConvite('https://x/convite?servidor=http://a&codigo=abcdef')).toBeUndefined();
    expect(lerLinkConvite('tofalany://outra?servidor=http://a&codigo=abcdef')).toBeUndefined();
    expect(lerLinkConvite('tofalany://convite?servidor=javascript:alert(1)&codigo=abcdef')).toBeUndefined();
    expect(lerLinkConvite('tofalany://convite?servidor=http://a&codigo=a b')).toBeUndefined();
    expect(lerLinkConvite('não é url')).toBeUndefined();
  });
});

describe('validarNomeSom', () => {
  it('colapsa espaços e recusa vazio, longo e caracteres de controle', () => {
    expect(validarNomeSom('  Grilo   2 ')).toEqual({ ok: true, valor: 'Grilo 2' });
    expect(validarNomeSom('   ').ok).toBe(false);
    expect(validarNomeSom('a'.repeat(32)).ok).toBe(true);
    expect(validarNomeSom('a'.repeat(33)).ok).toBe(false);
    expect(validarNomeSom('a\u0007b').ok).toBe(false);
  });
});

describe('validarNomeCanal', () => {
  it('apara e limita', () => {
    expect(validarNomeCanal('  bate   papo ')).toEqual({ ok: true, valor: 'bate papo' });
    expect(validarNomeCanal('')).toMatchObject({ ok: false });
    expect(validarNomeCanal('x'.repeat(33))).toMatchObject({ ok: false });
  });
});

describe('validarTextoMensagem', () => {
  it('apara as pontas, mantém quebras internas e limita', () => {
    expect(validarTextoMensagem('  oi\n  tudo bem?  ')).toEqual({ ok: true, valor: 'oi\n  tudo bem?' });
    expect(validarTextoMensagem(' \n ')).toMatchObject({ ok: false });
    expect(validarTextoMensagem('x'.repeat(4001))).toMatchObject({ ok: false });
  });
});

describe('mesclarAudio', () => {
  it('aceita só valores válidos e mantém o resto', () => {
    const base = mesclarAudio(undefined, null);
    expect(base).toMatchObject({ entradaId: null, supressaoRuido: true, sensibilidadeDb: -50 });
    expect(mesclarAudio(base, { entradaId: 'abc', saidaId: null, cancelamentoEco: false, sensibilidadeDb: -30.4 })).toMatchObject({
      entradaId: 'abc',
      saidaId: null,
      cancelamentoEco: false,
      sensibilidadeDb: -30,
    });
    expect(mesclarAudio(base, { entradaId: '', ganhoAutomatico: 'sim', sensibilidadeDb: 10, outro: 1 })).toEqual(base);
  });
});

describe('mesclarPessoas e mesclarSons (RF-19, RF-38)', () => {
  it('guarda volume 0–200% e silenciados válidos por servidor', () => {
    const r = mesclarPessoas({}, {
      'http://100.64.0.1:3000': { volumes: { '2': 0.5, '3': 2.5, x: 1, '4': 1.234 }, silenciados: [3, 3, -1, 'a', 5] },
      'javascript:alert(1)': { volumes: {}, silenciados: [] },
    });
    expect(r).toEqual({ 'http://100.64.0.1:3000': { volumes: { '2': 0.5, '4': 1.23 }, silenciados: [3, 5] } });
    expect(Object.keys(mesclarPessoas({}, { ' fala.exemplo.com/x ': { volumes: {}, silenciados: [] } }))).toEqual(['http://fala.exemplo.com']);
    let muitos = {};
    for (let i = 0; i < 25; i++) muitos = mesclarPessoas(muitos, { [`http://s${i}.exemplo.com`]: { volumes: {}, silenciados: [] } });
    expect(Object.keys(muitos)).toHaveLength(20);
    expect(Object.keys(muitos).at(-1)).toBe('http://s24.exemplo.com');
    expect(mesclarSons(undefined, { voz: false, soundboard: 0 })).toEqual({ voz: false, soundboard: 0 });
    expect(mesclarSons(undefined, { voz: 'x', soundboard: 3 })).toEqual({ voz: true, soundboard: 0.8 });
  });
});

describe('mesclarNotificacoes (RF-39 a RF-41)', () => {
  it('liga/desliga cada opção e guarda conversas silenciadas válidas por servidor', () => {
    const r = mesclarNotificacoes(undefined, {
      mensagens: false,
      entradaSaidaSom: 'x',
      silenciadas: { 'http://s.exemplo.com': ['c:1', 'd:2', 'c:1', 'x:3', 5], 'javascript:x': ['c:1'] },
    });
    expect(r).toEqual({ mensagens: false, entradaSaidaSom: true, entradaSaidaAviso: true, silenciadas: { 'http://s.exemplo.com': ['c:1', 'd:2'] } });
  });
});
