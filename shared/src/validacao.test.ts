import { describe, expect, it } from 'vitest';
import { lerQualquerConvite, urlArquivoValida, validarCoresFundo, validarSobreMim, textoSemGif, validarGif, validarEmojiReacao, validarTextoMensagem, validarNomeCanal, validarNomeSom, mesclarAudio, mesclarPessoas, mesclarSons, mesclarNotificacoes, mesclarTela, lerLinkConvite, montarLinkApp, validarCodigoConvite, normalizarUrlServidor, normalizarUsuario, validarCor, validarNomeExibicao, validarSenha, validarUsuario } from './validacao.js';

describe('normalizarUrlServidor', () => {
  it('mantém o /c/<id> de um servidor criado na mesma instalação (e trata /c/1 como o principal)', () => {
    expect(normalizarUrlServidor('https://x.io/c/7/')).toEqual({ ok: true, valor: 'https://x.io/c/7' });
    expect(normalizarUrlServidor('https://x.io/c/7/api/eu')).toEqual({ ok: true, valor: 'https://x.io/c/7' });
    expect(normalizarUrlServidor('https://x.io/c/1')).toEqual({ ok: true, valor: 'https://x.io' });
    expect(normalizarUrlServidor('https://x.io/c/abc')).toEqual({ ok: true, valor: 'https://x.io' });
    expect(lerQualquerConvite('https://x.io/c/7/convite/abc123')).toEqual({ servidor: 'https://x.io/c/7', codigo: 'abc123' });
  });

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
  it('exige de 8 a 128 caracteres, maiúscula, minúscula e número (e diz o que falta)', () => {
    expect(validarSenha('Abcdef1')).toEqual({ ok: false, erro: 'A senha precisa ter: pelo menos 8 caracteres.' });
    expect(validarSenha('12345678')).toEqual({ ok: false, erro: 'A senha precisa ter: uma letra maiúscula, uma letra minúscula.' });
    expect(validarSenha('Ábcdefg9')).toEqual({ ok: true, valor: 'Ábcdefg9' });
    expect(validarSenha('Aa1' + 'x'.repeat(126))).toMatchObject({ ok: false, erro: expect.stringContaining('no máximo') });
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
  it('volume-da-voz, CA-1: nivelar ligado por padrão, ganho e volume da chamada em 100%; arquivo antigo ganha os padrões', () => {
    const antigo = mesclarAudio(undefined, { supressaoRuido: false, sensibilidadeDb: -40 });
    expect(antigo).toMatchObject({ nivelarVoz: true, ganhoMicrofone: 1, volumeChamada: 1, supressaoRuido: false });
  });

  it('volume-da-voz: faixas do ganho (50–300%) e do volume da chamada (0–200%), arredondados; inválidos ignorados', () => {
    expect(mesclarAudio(undefined, { nivelarVoz: false, ganhoMicrofone: 2.345, volumeChamada: 1.5 })).toMatchObject({ nivelarVoz: false, ganhoMicrofone: 2.35, volumeChamada: 1.5 });
    expect(mesclarAudio(undefined, { ganhoMicrofone: 0.4, volumeChamada: 2.1 })).toMatchObject({ ganhoMicrofone: 1, volumeChamada: 1 });
    expect(mesclarAudio(undefined, { ganhoMicrofone: 3, volumeChamada: 0 })).toMatchObject({ ganhoMicrofone: 3, volumeChamada: 0 });
    expect(mesclarAudio(undefined, { nivelarVoz: 'sim', ganhoMicrofone: Number.NaN, volumeChamada: '1' })).toMatchObject({ nivelarVoz: true, ganhoMicrofone: 1, volumeChamada: 1 });
  });

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

describe('mesclarTela (RF-28)', () => {
  it('aceita qualidade e codec conhecidos', () => {
    expect(mesclarTela(undefined, { qualidade: '1440p60', codec: 'vp9' })).toEqual({ qualidade: '1440p60', codec: 'vp9' });
    expect(mesclarTela(undefined, { qualidade: '4k', codec: 'av1' })).toEqual({ qualidade: '720p30', codec: 'h264' });
    expect(mesclarTela(undefined, { qualidade: '720p60' }).qualidade).toBe('720p60');
    expect(mesclarTela(undefined, { qualidade: '1080p30' }).qualidade).toBe('1080p30');
  });
});

describe('lerQualquerConvite (backlog v2, item 4)', () => {
  it('aceita o link da página de convite e o link do app', () => {
    expect(lerQualquerConvite('  https://203-0-113-7.sslip.io/convite/a1b2c3d4e5f6 ')).toEqual({ servidor: 'https://203-0-113-7.sslip.io', codigo: 'a1b2c3d4e5f6' });
    expect(lerQualquerConvite('http://100.64.0.1:3000/convite/turma-2026')).toEqual({ servidor: 'http://100.64.0.1:3000', codigo: 'turma-2026' });
    expect(lerQualquerConvite('tofalany://convite?servidor=https%3A%2F%2Ffala.io&codigo=abc123')).toEqual({ servidor: 'https://fala.io', codigo: 'abc123' });
  });

  it('endereço comum, outro caminho ou lixo não é convite', () => {
    expect(lerQualquerConvite('https://fala.io')).toBeUndefined();
    expect(lerQualquerConvite('fala.io:3000')).toBeUndefined();
    expect(lerQualquerConvite('https://fala.io/outra/abc')).toBeUndefined();
    expect(lerQualquerConvite('https://fala.io/convite/')).toBeUndefined();
    expect(lerQualquerConvite('ftp://fala.io/convite/abc')).toBeUndefined();
  });
});

describe('validarEmojiReacao (reações, CA-6)', () => {
  it('aceita um emoji padrão inteiro, com tom de pele, bandeira, sequência e a forma com FE0F', () => {
    for (const e of ['👍', '👍🏽', '🇧🇷', '❤️', '👨‍👩‍👧', '#️⃣', '🥳']) expect(validarEmojiReacao(e), e).toBe(true);
  });
  it('recusa texto, dois emojis, espaço, a forma sem FE0F e o que não é texto', () => {
    for (const e of ['abc', '👍👍', ' 👍', '👍 ', '❤', '©', '', 'a👍', '🏽', 42, null, undefined]) expect(validarEmojiReacao(e), String(e)).toBe(false);
  });
  it('recusa acima de 32 bytes', () => {
    expect(validarEmojiReacao('👍'.repeat(9))).toBe(false);
  });
});

describe('validarGif e textoSemGif (busca de GIF, CA-8, CA-12)', () => {
  const bom = { slug: 'gato-dancando-12', url: 'https://static.klipy.com/ii/abc/14/af/x.webp', largura: 498, altura: 280, descricao: '  Gato\n dançando ' };
  it('aceita mídia https da Klipy e limpa a descrição', () => {
    expect(validarGif(bom)).toEqual({ ...bom, descricao: 'Gato dançando' });
    expect(validarGif({ ...bom, url: 'https://static2.klipy.com/ii/a/b.gif' })?.url).toBe('https://static2.klipy.com/ii/a/b.gif');
    expect(validarGif({ ...bom, descricao: 'x'.repeat(300) })?.descricao).toHaveLength(200);
    expect(validarGif({ ...bom, descricao: undefined })?.descricao).toBe('');
  });
  it('recusa outro host, http, porta, credenciais, slug e lados inválidos', () => {
    for (const url of [
      'http://static.klipy.com/a.gif',
      'https://static.klipy.com:8443/a.gif',
      'https://u:s@static.klipy.com/a.gif',
      'https://evil-klipy.com/a.gif',
      'https://static.klipy.com.evil.io/a.gif',
      'https://api.klipy.com/a.gif',
      'javascript:alert(1)',
      'https://static.klipy.com/' + 'a'.repeat(600),
      'https://static.klipy.com/a.gif\n\nhttps://evil.io/phish',
      '  https://static.klipy.com/a.gif',
      'https://static.klipy.com/a b @todos',
      'https://static.klipy.com/a.gif#',
      'https://static.klipy.com/ii/a/b.webp?u=42',
      'https://static.klipy.com/outro/b.webp',
      'https://static.klipy.com/ii/a/b.mp4',
      'https://static.klipy.com/ii/../b.webp',
    ])
      expect(validarGif({ ...bom, url }), url).toBeUndefined();
    for (const slug of ['', 'a b', '../x', 'x'.repeat(121), 3]) expect(validarGif({ ...bom, slug })).toBeUndefined();
    for (const lado of [0, -1, 1.5, 5000, '10']) expect(validarGif({ ...bom, largura: lado })).toBeUndefined();
    expect(validarGif(null)).toBeUndefined();
    expect(validarGif('x')).toBeUndefined();
  });
  it('aceita outro host e http só quando pedido (Klipy falsa dos testes)', () => {
    const local = { ...bom, url: 'http://127.0.0.1:4000/ii/a.webp' };
    expect(validarGif(local)).toBeUndefined();
    expect(validarGif(local, /^127\.0\.0\.1$/, true)?.url).toBe(local.url);
  });
  it('tira o endereço que o servidor põe no fim do texto', () => {
    const gif = validarGif(bom)!;
    expect(textoSemGif(`olha isso\n${gif.url}`, gif)).toBe('olha isso');
    expect(textoSemGif(gif.url, gif)).toBe('');
    expect(textoSemGif('sem endereço', gif)).toBe('sem endereço');
    expect(textoSemGif(`x\n${gif.url}`, undefined)).toBe(`x\n${gif.url}`);
  });
});

describe('mini perfil: sobre mim, cores do fundo e endereço de arquivo (T1)', () => {
  it('sobre mim: normaliza, conta caracteres e linhas, recusa bidi e largura zero, aceita ZWJ', () => {
    expect(validarSobreMim('  oi\r\ntudo  ')).toEqual({ ok: true, valor: 'oi\ntudo' });
    expect(validarSobreMim('a'.repeat(190)).ok).toBe(true);
    expect(validarSobreMim('a'.repeat(191)).ok).toBe(false);
    expect(validarSobreMim('😀'.repeat(190)).ok).toBe(true);
    expect(validarSobreMim('a\nb\nc').ok).toBe(true);
    expect(validarSobreMim('a\nb\nc\nd').ok).toBe(false);
    expect(validarSobreMim('a\r\nb\r\nc\r\nd').ok).toBe(false);
    for (const t of ['x\u202Ey', 'x\u200By', 'x\u2028y', 'x\u0007y', 'x\uFEFFy', 'x\u2066y', 'x\u061Cy', 'x\u00ADy', 'x\u3164y']) expect(validarSobreMim(t).ok, JSON.stringify(t)).toBe(false);
    expect(validarSobreMim('👨‍👩‍👧').ok).toBe(true);
    expect(validarSobreMim('a' + '\u0301'.repeat(5)).ok).toBe(false);
  });
  it('cores: uma ou duas #rrggbb', () => {
    expect(validarCoresFundo(['#FF0000'])).toEqual({ ok: true, valor: ['#ff0000'] });
    expect(validarCoresFundo(['#000000', '#ffffff']).ok).toBe(true);
    for (const c of [[], ['red'], ['#fff'], ['#000000', '#111111', '#222222'], 'x', [1]]) expect(validarCoresFundo(c).ok).toBe(false);
  });
  it('endereço de arquivo: só /files/<32 hex>.webp', () => {
    expect(urlArquivoValida('/files/0123456789abcdef0123456789abcdef.webp')).toBe(true);
    for (const u of ['https://x.io/a.webp', '/files/abc.webp', '/files/0123456789abcdef0123456789abcdef.gif', '//x.io/files/0123456789abcdef0123456789abcdef.webp', 3])
      expect(urlArquivoValida(u)).toBe(false);
  });
});
