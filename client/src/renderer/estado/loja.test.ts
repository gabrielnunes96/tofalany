import { beforeEach, describe, expect, it } from 'vitest';
import { useLoja } from './loja';

const eu = { id: 1, usuario: 'ana', nomeExibicao: 'Ana', cor: '#fff', avatarUrl: null, cargo: 'admin' as const };

describe('useLoja', () => {
  beforeEach(() => useLoja.getState().limpar());

  it('aplica o retrato inicial e limpa ao sair', () => {
    useLoja.getState().aplicarOla({ servidor: { nome: 'Turma' }, convite: { link: 'http://s/convite/a' }, eu, usuarios: [eu], canais: [], dms: [], naoLidas: {}, sons: [], voz: [], presencas: {}, transmissoes: [] });
    expect(useLoja.getState().linkConvite).toBe('http://s/convite/a');
    useLoja.getState().definirLinkConvite('http://s/convite/b');
    expect(useLoja.getState().linkConvite).toBe('http://s/convite/b');
    useLoja.getState().definirConexao('conectado');
    expect(useLoja.getState()).toMatchObject({ nomeServidor: 'Turma', eu, usuarios: [eu], conexao: 'conectado' });
    useLoja.getState().adicionarUsuario({ ...eu, id: 2, nomeExibicao: 'Bia' });
    useLoja.getState().adicionarUsuario({ ...eu, id: 3, nomeExibicao: 'abel' });
    useLoja.getState().adicionarUsuario({ ...eu, id: 2, nomeExibicao: 'Bia' });
    expect(useLoja.getState().usuarios.map((u) => u.nomeExibicao)).toEqual(['abel', 'Ana', 'Bia']);
    useLoja.getState().adicionarUsuario({ ...eu, id: 4, nomeExibicao: 'ana' });
    expect(useLoja.getState().usuarios.map((u) => u.id)).toEqual([3, 1, 4, 2]);
    useLoja.getState().atualizarUsuario({ ...eu, nomeExibicao: 'Zuleica' });
    expect(useLoja.getState().eu?.nomeExibicao).toBe('Zuleica');
    expect(useLoja.getState().usuarios.at(-1)?.id).toBe(1);
    useLoja.getState().removerUsuario(4);
    expect(useLoja.getState().usuarios.some((u) => u.id === 4)).toBe(false);
    useLoja.getState().limpar();
    expect(useLoja.getState()).toMatchObject({ nomeServidor: null, eu: null, usuarios: [], conexao: 'conectando' });
  });
});

describe('canais na loja', () => {
  beforeEach(() => useLoja.getState().limpar());
  const ola = (canais: { id: number; tipo: 'texto' | 'voz'; nome: string; posicao: number }[]) =>
    useLoja.getState().aplicarOla({ servidor: { nome: 'T' }, convite: { link: 'x' }, eu, usuarios: [eu], canais, dms: [], naoLidas: {}, sons: [], voz: [], presencas: {}, transmissoes: [] });

  it('ordena texto antes de voz, abre o primeiro de texto e troca ao remover o aberto', () => {
    ola([
      { id: 5, tipo: 'voz', nome: 'Sala', posicao: 1 },
      { id: 2, tipo: 'texto', nome: 'b', posicao: 2 },
      { id: 1, tipo: 'texto', nome: 'a', posicao: 1 },
    ]);
    expect(useLoja.getState().canais.map((c) => c.id)).toEqual([1, 2, 5]);
    expect(useLoja.getState().canalAtivo).toBe(1);
    useLoja.getState().abrirCanal(2);
    expect(useLoja.getState().canalAtivo).toBe(2);
    useLoja.getState().abrirCanal(5);
    expect(useLoja.getState().canalAtivo).toBe(1);
    useLoja.getState().abrirCanal(2);
    useLoja.getState().removerCanal(2);
    expect(useLoja.getState().canalAtivo).toBe(1);
    useLoja.getState().salvarCanal({ id: 1, tipo: 'texto', nome: 'renomeado', posicao: 1 });
    expect(useLoja.getState().canais.find((c) => c.id === 1)?.nome).toBe('renomeado');
  });

  it('reconectar mantém o canal aberto se ele ainda existe', () => {
    ola([{ id: 1, tipo: 'texto', nome: 'a', posicao: 1 }, { id: 2, tipo: 'texto', nome: 'b', posicao: 2 }]);
    useLoja.getState().abrirCanal(2);
    ola([{ id: 1, tipo: 'texto', nome: 'a', posicao: 1 }, { id: 2, tipo: 'texto', nome: 'b', posicao: 2 }]);
    expect(useLoja.getState().canalAtivo).toBe(2);
  });
});

describe('histórico de mensagens na loja', () => {
  beforeEach(() => useLoja.getState().limpar());
  const msg = (id: number, canalId = 1) => ({ id, canalId, dmId: null, autorId: 1, texto: `m${id}`, criadaEm: id, editadaEm: null, anexos: [] });

  it('primeira carga, páginas antigas na frente, novas no fim, sem duplicar', () => {
    const l = useLoja.getState();
    l.adicionarMensagem(msg(99));
    expect(useLoja.getState().historicos['c:1']).toBeUndefined();
    let g = l.iniciarCarga('c:1');
    expect(useLoja.getState().historicos['c:1']?.carregando).toBe(true);
    l.receberPagina('c:1', { mensagens: [msg(5), msg(6)], fim: false }, g);
    l.adicionarMensagem(msg(7));
    l.adicionarMensagem(msg(7));
    g = l.iniciarCarga('c:1');
    l.receberPagina('c:1', { mensagens: [msg(3), msg(4)], fim: true }, g);
    const h = useLoja.getState().historicos['c:1']!;
    expect(h.mensagens.map((m) => m.id)).toEqual([3, 4, 5, 6, 7]);
    expect(h).toMatchObject({ fim: true, carregando: false });
    g = l.iniciarCarga('c:1');
    l.falharCarga('c:1', 'Sem conexão', g);
    expect(useLoja.getState().historicos['c:1']).toMatchObject({ erro: 'Sem conexão', mensagens: h.mensagens });
  });

  it('RF-37: status vem do ola e muda pelo evento; offline sai da lista', () => {
    useLoja.getState().aplicarOla({ servidor: { nome: 'T' }, convite: { link: 'x' }, eu, usuarios: [eu], canais: [], dms: [], naoLidas: {}, sons: [], voz: [], presencas: { '1': 'online', '2': 'ausente' }, transmissoes: [] });
    expect(useLoja.getState().presencas).toEqual({ 1: 'online', 2: 'ausente' });
    useLoja.getState().definirPresenca(2, 'online');
    useLoja.getState().definirPresenca(1, 'offline');
    expect(useLoja.getState().presencas).toEqual({ 2: 'online' });
  });

  it('RN-10: transmissões do ola; várias no mesmo canal (uma por pessoa); parar tira só a da pessoa; espectadores', () => {
    useLoja.getState().aplicarOla({ servidor: { nome: 'T' }, convite: { link: 'x' }, eu, usuarios: [eu], canais: [], dms: [], naoLidas: {}, sons: [], voz: [], presencas: {}, transmissoes: [{ canalVozId: 5, usuarioId: 1, qualidade: '720p30' }] });
    useLoja.getState().iniciarTransmissao({ canalVozId: 5, usuarioId: 2, qualidade: '720p30' });
    useLoja.getState().iniciarTransmissao({ canalVozId: 6, usuarioId: 3, qualidade: '720p30' });
    // A mesma pessoa de novo troca a dela (não duplica).
    useLoja.getState().iniciarTransmissao({ canalVozId: 5, usuarioId: 2, qualidade: '1080p60' });
    expect(useLoja.getState().transmissoes.map((t) => [t.canalVozId, t.usuarioId])).toEqual([[5, 1], [6, 3], [5, 2]]);
    useLoja.getState().espectadoresDaTransmissao(5, 2, [1]);
    expect(useLoja.getState().transmissoes.find((t) => t.usuarioId === 2)?.espectadores).toEqual([1]);
    expect(useLoja.getState().transmissoes.find((t) => t.usuarioId === 1)?.espectadores).toBeUndefined();
    useLoja.getState().pararTransmissao(5, 1);
    expect(useLoja.getState().transmissoes.map((t) => [t.canalVozId, t.usuarioId])).toEqual([[6, 3], [5, 2]]);
    // Servidor antigo (sem usuário): todas do canal.
    useLoja.getState().pararTransmissao(5);
    expect(useLoja.getState().transmissoes.map((t) => t.canalVozId)).toEqual([6]);
  });

  it('sons vêm do ola e são trocados pelo evento', () => {
    const som = { id: 1, nome: 'Grilo', url: '/files/a.wav', duracaoMs: 800 };
    useLoja.getState().aplicarOla({ servidor: { nome: 'T' }, convite: { link: 'x' }, eu, usuarios: [eu], canais: [], dms: [], naoLidas: {}, sons: [som], voz: [], presencas: {}, transmissoes: [] });
    expect(useLoja.getState().sons).toEqual([som]);
    useLoja.getState().salvarSom({ ...som, id: 3 });
    useLoja.getState().salvarSom({ ...som, nome: 'Grilo 2' });
    expect(useLoja.getState().sons.map((s) => [s.id, s.nome])).toEqual([[1, 'Grilo 2'], [3, 'Grilo']]);
    useLoja.getState().tirarSom(1);
    expect(useLoja.getState().sons.map((s) => s.id)).toEqual([3]);
    useLoja.getState().definirSons([]);
    expect(useLoja.getState().sons).toEqual([]);
  });

  it('reconexão (ola) descarta os históricos; remover canal também', () => {
    const l = useLoja.getState();
    l.receberPagina('c:1', { mensagens: [msg(1)], fim: true }, l.iniciarCarga('c:1'));
    l.receberPagina('c:2', { mensagens: [msg(2, 2)], fim: true }, l.iniciarCarga('c:2'));
    l.removerCanal(2);
    expect(useLoja.getState().historicos['c:2']).toBeUndefined();
    l.aplicarOla({ servidor: { nome: 'T' }, convite: { link: 'x' }, eu, usuarios: [eu], canais: [], dms: [], naoLidas: {}, sons: [], voz: [], presencas: {}, transmissoes: [] });
    expect(useLoja.getState().historicos).toEqual({});
  });
});

describe('respostas atrasadas do histórico', () => {
  beforeEach(() => useLoja.getState().limpar());
  const msg = (id: number) => ({ id, canalId: 1, dmId: null, autorId: 1, texto: `m${id}`, criadaEm: id, editadaEm: null, anexos: [] });

  it('resposta de antes da reconexão é ignorada; a ordem fica certa', () => {
    const l = useLoja.getState();
    const velha = l.iniciarCarga('c:1');
    l.aplicarOla({ servidor: { nome: 'T' }, convite: { link: 'x' }, eu, usuarios: [eu], canais: [], dms: [], naoLidas: {}, sons: [], voz: [], presencas: {}, transmissoes: [] });
    const nova = l.iniciarCarga('c:1');
    l.receberPagina('c:1', { mensagens: [msg(11), msg(12)], fim: false }, nova);
    l.receberPagina('c:1', { mensagens: [msg(1), msg(2)], fim: false }, velha);
    expect(useLoja.getState().historicos['c:1']!.mensagens.map((m) => m.id)).toEqual([11, 12]);
  });

  it('resposta de canal removido não recria o histórico', () => {
    const l = useLoja.getState();
    const g = l.iniciarCarga('c:1');
    l.removerCanal(1);
    l.receberPagina('c:1', { mensagens: [msg(1)], fim: true }, g);
    l.falharCarga('c:1', 'x', g);
    expect(useLoja.getState().historicos['c:1']).toBeUndefined();
  });
});


describe('edição, exclusão e digitando na loja', () => {
  beforeEach(() => useLoja.getState().limpar());
  const msg = (id: number, autorId = 1) => ({ id, canalId: 1, dmId: null, autorId, texto: `m${id}`, criadaEm: id, editadaEm: null, anexos: [] });

  it('atualiza e remove mensagens do canal carregado', () => {
    const l = useLoja.getState();
    l.receberPagina('c:1', { mensagens: [msg(1), msg(2)], fim: true }, l.iniciarCarga('c:1'));
    l.atualizarMensagem({ ...msg(1), texto: 'novo', editadaEm: 5 });
    l.removerMensagem(2, 'c:1');
    l.removerMensagem(9, null);
    expect(useLoja.getState().historicos['c:1']!.mensagens).toEqual([{ ...msg(1), texto: 'novo', editadaEm: 5 }]);
  });

  it('digitando registra até quando; a mensagem da pessoa limpa o aviso', () => {
    const l = useLoja.getState();
    l.registrarDigitando('c:1', 2, 1000);
    l.registrarDigitando('c:1', 3, 2000);
    expect(useLoja.getState().digitando['c:1']).toEqual({ 2: 1000, 3: 2000 });
    l.adicionarMensagem(msg(5, 2));
    expect(useLoja.getState().digitando['c:1']).toEqual({ 3: 2000 });
  });
});

describe('DMs na loja', () => {
  beforeEach(() => useLoja.getState().limpar());
  const ola = (dms: { id: number; outroId: number; ultimaEm: number }[]) =>
    useLoja.getState().aplicarOla({ servidor: { nome: 'T' }, convite: { link: 'x' }, eu, usuarios: [eu], canais: [{ id: 1, tipo: 'texto', nome: 'geral', posicao: 1 }], dms, naoLidas: {}, sons: [], voz: [], presencas: {}, transmissoes: [] });

  it('ordena pela mais recente; abrir DM e voltar ao canal; reconectar mantém a DM aberta se ela existe', () => {
    ola([{ id: 1, outroId: 2, ultimaEm: 10 }, { id: 2, outroId: 3, ultimaEm: 20 }]);
    expect(useLoja.getState().dms.map((d) => d.id)).toEqual([2, 1]);
    useLoja.getState().salvarDm({ id: 1, outroId: 2, ultimaEm: 30 });
    expect(useLoja.getState().dms.map((d) => d.id)).toEqual([1, 2]);
    useLoja.getState().abrirDm(1);
    expect(useLoja.getState().dmAtiva).toBe(1);
    useLoja.getState().abrirDm(99);
    expect(useLoja.getState().dmAtiva).toBe(1);
    ola([{ id: 1, outroId: 2, ultimaEm: 30 }]);
    expect(useLoja.getState().dmAtiva).toBe(1);
    useLoja.getState().abrirCanal(1);
    expect(useLoja.getState().dmAtiva).toBeNull();
  });

  it('mensagem de DM vai para a chave da DM, não para o canal de mesmo número', () => {
    const l = useLoja.getState();
    l.receberPagina('d:1', { mensagens: [], fim: true }, l.iniciarCarga('d:1'));
    l.receberPagina('c:1', { mensagens: [], fim: true }, l.iniciarCarga('c:1'));
    l.adicionarMensagem({ id: 5, canalId: null, dmId: 1, autorId: 2, texto: 'oi', criadaEm: 1, editadaEm: null, anexos: [] });
    expect(useLoja.getState().historicos['d:1']!.mensagens.map((m) => m.id)).toEqual([5]);
    expect(useLoja.getState().historicos['c:1']!.mensagens).toEqual([]);
  });
});

describe('não lidas na loja', () => {
  beforeEach(() => useLoja.getState().limpar());

  it('vem do retrato inicial (ignorando chaves estranhas), conta e zera', () => {
    useLoja.getState().aplicarOla({
      servidor: { nome: 'T' },
      convite: { link: 'x' },
      eu,
      usuarios: [eu],
      canais: [],
      dms: [],
      naoLidas: { 'c:1': 3, 'd:2': 1, lixo: 9 },
      sons: [],
      voz: [],
      presencas: {},
      transmissoes: [],
    });
    expect(useLoja.getState().naoLidas).toEqual({ 'c:1': 3, 'd:2': 1 });
    useLoja.getState().contarNaoLida('c:1', 10);
    useLoja.getState().contarNaoLida('c:5', 11);
    expect(useLoja.getState().naoLidas).toEqual({ 'c:1': 4, 'd:2': 1, 'c:5': 1 });
    useLoja.getState().zerarNaoLidas('c:1');
    expect(useLoja.getState().naoLidas).toEqual({ 'd:2': 1, 'c:5': 1 });
  });

  it('leitura de outro computador só tira o que foi lido; apagada desconta', () => {
    const l = useLoja.getState();
    l.contarNaoLida('c:1', 10);
    l.contarNaoLida('c:1', 12);
    l.contarNaoLida('c:1', 14);
    l.aplicarLeitura('c:1', 12);
    expect(useLoja.getState().naoLidas['c:1']).toBe(1);
    l.descontarApagada('c:1', 99);
    expect(useLoja.getState().naoLidas['c:1']).toBe(1);
    l.descontarApagada('c:1', 14);
    expect(useLoja.getState().naoLidas['c:1']).toBeUndefined();
    l.contarNaoLida('d:2', 20);
    l.aplicarLeitura('d:2', 20);
    expect(useLoja.getState().naoLidas['d:2']).toBeUndefined();
  });
});
