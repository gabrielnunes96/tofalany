import { PassThrough, type Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { lerComandoMusica, type EstadoMusica } from '@tofalando/shared';
import { criarBotMusica, type SaidaAudio } from '../src/musica/bot.js';
import { alvoDaBusca, ehPlaylist, lerInfo, lerPlaylist, type FonteMusica } from '../src/musica/fonte.js';
import { quadros, urlDaSala } from '../src/musica/saida-livekit.js';
import { ErroHttp } from '../src/erros.js';

/** Fonte falsa: cada música é um fluxo que só termina quando o teste manda (ou quando o bot corta). */
function fonteFalsa() {
  const abertos: { url: string; audio: PassThrough; parado: boolean }[] = [];
  const fonte: FonteMusica = {
    buscar: vi.fn(async (busca: string) => ({ titulo: `Música ${busca}`, url: `https://youtu.be/${busca}`, duracao: 180 })),
    abrir: vi.fn((url: string) => {
      const audio = new PassThrough();
      const item = { url, audio, parado: false };
      abertos.push(item);
      return {
        audio,
        parar() {
          item.parado = true;
          audio.end();
        },
      };
    }),
  };
  return { fonte, abertos };
}

/** Saída falsa: "toca" consumindo o fluxo até o fim. */
function saidaFalsa() {
  const fechar = vi.fn(async () => undefined);
  const tocadas: string[] = [];
  const conectar = vi.fn(async (): Promise<SaidaAudio> => ({
    async tocar(pcm: Readable) {
      for await (const pedaco of pcm) tocadas.push(String(pedaco));
    },
    fechar,
  }));
  return { conectar, fechar, tocadas };
}

const esperar = () => new Promise((r) => setTimeout(r, 10));

describe('ToOuvini, o bot de música (backlog v2, item 14)', () => {
  it('toca na ordem, conecta uma vez por canal, pula; sem fila espera ocioso na sala e depois sai', async () => {
    const { fonte, abertos } = fonteFalsa();
    const { conectar, fechar } = saidaFalsa();
    const estados: EstadoMusica[] = [];
    const bot = criarBotMusica({ fonte, conectar, registrarErro: vi.fn(), aoMudar: (e) => estados.push(e), agora: () => 1000, esperaOciosoMs: 30 });

    const primeiro = await bot.tocar(7, 'a', 1);
    expect(primeiro.tocando?.titulo).toBe('Música a');
    await bot.tocar(7, 'b', 2);
    expect(bot.estado(7).fila.map((m) => m.titulo)).toEqual(['Música b']);
    await esperar();
    expect(abertos.map((a) => a.url)).toEqual(['https://youtu.be/a']);

    bot.pular(7);
    await esperar();
    expect(abertos[0]!.parado).toBe(true);
    expect(bot.estado(7).tocando).toMatchObject({ titulo: 'Música b', pedidoPor: 2 });
    expect(conectar).toHaveBeenCalledTimes(1);

    // A última termina: fica na sala, parado, e sai sozinho depois da espera.
    abertos[1]!.audio.end();
    await esperar();
    expect(bot.estado(7)).toMatchObject({ tocando: null, conectado: true });
    expect(fechar).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 50));
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(bot.estados()).toEqual([]);
    expect(estados.at(-1)).toEqual({ canalVozId: 7, tocando: null, desde: null, fila: [], pausado: false, conectado: false });
  });

  it('pausa e continua; stop limpa e espera; kick sai na hora; canais diferentes têm filas separadas', async () => {
    const { fonte, abertos } = fonteFalsa();
    const { conectar, fechar } = saidaFalsa();
    const pausar = vi.fn();
    const continuar = vi.fn();
    const conectarComPausa = vi.fn(async () => ({ ...(await conectar()), pausar, continuar }));
    let relogio = 1000;
    const bot = criarBotMusica({ fonte, conectar: conectarComPausa, registrarErro: vi.fn(), aoMudar: vi.fn(), agora: () => relogio, esperaOciosoMs: 10_000 });
    await bot.tocar(1, 'a', 1);
    await bot.tocar(1, 'b', 1);
    await bot.tocar(2, 'c', 3);
    await esperar();
    relogio = 4000;
    expect(bot.pausar(1)).toMatchObject({ pausado: true });
    expect(pausar).toHaveBeenCalledTimes(1);
    relogio = 9000;
    // Continua de onde parou: 3 s tocados antes da pausa.
    expect(bot.continuar(1)).toMatchObject({ pausado: false, desde: 6000 });
    expect(continuar).toHaveBeenCalledTimes(1);

    bot.parar(1);
    await esperar();
    expect(bot.estado(1)).toMatchObject({ tocando: null, fila: [], conectado: true });
    expect(abertos[0]!.parado).toBe(true);
    expect(() => bot.pular(1)).toThrow(ErroHttp);
    // Pedir de novo reaproveita a conexão.
    await bot.tocar(1, 'd', 1);
    await esperar();
    expect(conectarComPausa).toHaveBeenCalledTimes(2);
    expect(bot.estado(1).tocando?.titulo).toBe('Música d');

    await bot.expulsar(1);
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(bot.estado(1)).toMatchObject({ tocando: null, conectado: false });
    expect(bot.estado(2).tocando?.titulo).toBe('Música c');
  });

  it('falha ao conectar ou ao tocar não trava a fila', async () => {
    const { fonte, abertos } = fonteFalsa();
    const registrarErro = vi.fn();
    let tentativas = 0;
    const fechar = vi.fn(async () => undefined);
    const conectar = vi.fn(async (): Promise<SaidaAudio> => {
      if (tentativas++ === 0) throw new Error('LiveKit fora');
      return { tocar: async (pcm) => void (await new Promise((r) => pcm.on('end', r).resume())), fechar };
    });
    const bot = criarBotMusica({ fonte, conectar, registrarErro, aoMudar: vi.fn(), esperaOciosoMs: 10 });
    await bot.tocar(1, 'a', 1);
    await bot.tocar(1, 'b', 1);
    await esperar();
    expect(registrarErro).toHaveBeenCalled();
    expect(bot.estado(1).tocando?.titulo).toBe('Música b');
    abertos[0]!.audio.end();
    await new Promise((r) => setTimeout(r, 40));
    expect(bot.estados()).toEqual([]);
  });

  it('busca que falha não entra na fila; fila tem limite; playlist entra inteira até o limite; até 5 canais', async () => {
    const { fonte } = fonteFalsa();
    (fonte.buscar as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new ErroHttp(404, 'nao_encontrado', 'Não achei essa música.'));
    const bot = criarBotMusica({ fonte, conectar: saidaFalsa().conectar, registrarErro: vi.fn(), aoMudar: vi.fn() });
    await expect(bot.tocar(1, 'x', 1)).rejects.toThrow('Não achei');
    expect(bot.estados()).toEqual([]);
    for (let i = 0; i < 51; i++) await bot.tocar(1, String(i), 1);
    await expect(bot.tocar(1, 'demais', 1)).rejects.toThrow('A fila já tem 50 músicas.');
    for (const c of [2, 3, 4, 5]) await bot.tocar(c, 'a', 1);
    await expect(bot.tocar(6, 'a', 1)).rejects.toThrow('já está tocando em 5 canais');

    const comPlaylist = fonteFalsa().fonte;
    comPlaylist.buscarVarias = vi.fn(async (_b: string, limite: number) => Array.from({ length: Math.min(80, limite) }, (_, i) => ({ titulo: `P${i}`, url: `https://youtu.be/p${i}`, duracao: 60 })));
    const outro = criarBotMusica({ fonte: comPlaylist, conectar: saidaFalsa().conectar, registrarErro: vi.fn(), aoMudar: vi.fn() });
    const r = await outro.tocar(9, 'https://www.youtube.com/playlist?list=PL1', 1);
    expect(r.tocando?.titulo).toBe('P0');
    expect(r.fila).toHaveLength(49);
  });
});

describe('fonte e saída do bot', () => {
  it('playlist do YouTube (list=) e leitura da lista do yt-dlp', () => {
    expect(ehPlaylist('https://www.youtube.com/playlist?list=PL123')).toBe(true);
    expect(ehPlaylist('https://music.youtube.com/watch?v=a&list=RDAMVM')).toBe(true);
    expect(ehPlaylist('https://www.youtube.com/watch?v=a')).toBe(false);
    expect(ehPlaylist('tempo perdido')).toBe(false);
    const saida = JSON.stringify({ entries: [{ id: 'a1', title: 'Um', duration: 200 }, { id: 'b2', title: '[Private video]' }, { id: 'c3', title: 'Três', duration: null }, { id: 'd4', title: 'Quatro' }] });
    expect(lerPlaylist(saida, 2)).toEqual([
      { titulo: 'Um', url: 'https://www.youtube.com/watch?v=a1', duracao: 200 },
      { titulo: 'Três', url: 'https://www.youtube.com/watch?v=c3', duracao: 0 },
    ]);
  });

  it('só links do YouTube; texto vira busca', () => {
    expect(alvoDaBusca('https://www.youtube.com/watch?v=abc')).toBe('https://www.youtube.com/watch?v=abc');
    expect(alvoDaBusca('https://youtu.be/abc')).toBe('https://youtu.be/abc');
    expect(alvoDaBusca('https://music.youtube.com/watch?v=abc')).toBe('https://music.youtube.com/watch?v=abc');
    expect(alvoDaBusca('  legião urbana tempo perdido ')).toBe('ytsearch1:legião urbana tempo perdido');
    expect(() => alvoDaBusca('https://exemplo.com/musica.mp3')).toThrow('só toca links do YouTube');
    expect(() => alvoDaBusca('https://192.168.0.1/x')).toThrow('só toca links do YouTube');
    expect(() => alvoDaBusca('https://youtube.com.mal.io/x')).toThrow('só toca links do YouTube');
  });

  it('lê título, página e duração do yt-dlp; recusa longa demais e resposta vazia', () => {
    expect(lerInfo('aviso\n{"title":"Tempo Perdido","webpage_url":"https://www.youtube.com/watch?v=x","duration":301.4}\n')).toEqual({
      titulo: 'Tempo Perdido',
      url: 'https://www.youtube.com/watch?v=x',
      duracao: 301,
    });
    expect(lerInfo('{"title":"Ao vivo","webpage_url":"https://www.youtube.com/watch?v=y","is_live":true}').duracao).toBe(0);
    expect(() => lerInfo('{"title":"Longa","webpage_url":"https://youtu.be/z","duration":99999}')).toThrow('longa demais');
    expect(() => lerInfo('')).toThrow('Não achei');
  });

  it('corta o PCM em quadros de 20 ms e guarda o resto', () => {
    const bytesQuadro = 960 * 2 * 2;
    const corte = quadros(Buffer.alloc(bytesQuadro * 2 + 100, 1));
    const vistos: Int16Array[] = [];
    let r = corte.next();
    while (!r.done) {
      vistos.push(r.value);
      r = corte.next();
    }
    expect(vistos).toHaveLength(2);
    expect(vistos[0]).toHaveLength(1920);
    expect(vistos[0]![0]).toBe(0x0101);
    expect(r.value).toHaveLength(100);
    expect(urlDaSala('http://livekit:7880')).toBe('ws://livekit:7880');
    expect(urlDaSala('https://midia.exemplo.com')).toBe('wss://midia.exemplo.com');
  });

  it('comandos do chat', () => {
    expect(lerComandoMusica('/tocar tempo perdido')).toEqual({ comando: 'tocar', busca: 'tempo perdido' });
    expect(lerComandoMusica('/play https://youtu.be/x')).toEqual({ comando: 'tocar', busca: 'https://youtu.be/x' });
    expect(lerComandoMusica('/pular')).toEqual({ comando: 'pular' });
    expect(lerComandoMusica('/SKIP')).toEqual({ comando: 'pular' });
    expect(lerComandoMusica('/parar')).toEqual({ comando: 'parar' });
    expect(lerComandoMusica('/tocar')).toEqual({ comando: 'continuar' });
    expect(lerComandoMusica('/pause')).toEqual({ comando: 'pausar' });
    expect(lerComandoMusica('/resume')).toEqual({ comando: 'continuar' });
    expect(lerComandoMusica('/next')).toEqual({ comando: 'pular' });
    expect(lerComandoMusica('/stop')).toEqual({ comando: 'parar' });
    expect(lerComandoMusica('/queue')).toEqual({ comando: 'fila' });
    expect(lerComandoMusica('/kick')).toEqual({ comando: 'expulsar' });
    expect(lerComandoMusica('bora /tocar algo')).toBeUndefined();
    expect(lerComandoMusica('/tocarxyz')).toBeUndefined();
    expect(lerComandoMusica('oi')).toBeUndefined();
  });
});
