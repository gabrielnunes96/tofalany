import { PassThrough, type Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { lerComandoMusica, type EstadoMusica } from '@tofalando/shared';
import { criarBotMusica, type SaidaAudio } from '../src/musica/bot.js';
import { alvoDaBusca, lerInfo, type FonteMusica } from '../src/musica/fonte.js';
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

describe('bot de música (backlog v2, item 14)', () => {
  it('toca na ordem, conecta uma vez por canal, pula e sai quando a fila acaba', async () => {
    const { fonte, abertos } = fonteFalsa();
    const { conectar, fechar } = saidaFalsa();
    const estados: EstadoMusica[] = [];
    const bot = criarBotMusica({ fonte, conectar, registrarErro: vi.fn(), aoMudar: (e) => estados.push(e), agora: () => 1000 });

    const primeiro = await bot.tocar(7, 'a', 1);
    expect(primeiro.tocando?.titulo).toBe('Música a');
    await bot.tocar(7, 'b', 2);
    expect(bot.estado(7).fila.map((m) => m.titulo)).toEqual(['Música b']);
    await esperar();
    expect(abertos.map((a) => a.url)).toEqual(['https://youtu.be/a']);

    // Pular: corta a atual e vai para a próxima, sem reconectar.
    bot.pular(7);
    await esperar();
    expect(abertos[0]!.parado).toBe(true);
    expect(bot.estado(7).tocando?.titulo).toBe('Música b');
    expect(bot.estado(7).tocando?.pedidoPor).toBe(2);
    expect(conectar).toHaveBeenCalledTimes(1);

    // A última termina sozinha: o bot sai do canal e avisa que parou.
    abertos[1]!.audio.end();
    await esperar();
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(bot.estados()).toEqual([]);
    expect(estados.at(-1)).toEqual({ canalVozId: 7, tocando: null, desde: null, fila: [] });
  });

  it('parar limpa a fila e sai; canais diferentes têm filas separadas', async () => {
    const { fonte, abertos } = fonteFalsa();
    const { conectar, fechar } = saidaFalsa();
    const bot = criarBotMusica({ fonte, conectar, registrarErro: vi.fn(), aoMudar: vi.fn() });
    await bot.tocar(1, 'a', 1);
    await bot.tocar(1, 'b', 1);
    await bot.tocar(2, 'c', 3);
    await esperar();
    expect(conectar).toHaveBeenCalledTimes(2);
    bot.parar(1);
    await esperar();
    expect(bot.estado(1)).toEqual({ canalVozId: 1, tocando: null, desde: null, fila: [] });
    expect(fechar).toHaveBeenCalledTimes(1);
    expect(bot.estado(2).tocando?.titulo).toBe('Música c');
    expect(abertos.map((a) => a.url)).toEqual(['https://youtu.be/a', 'https://youtu.be/c']);
    expect(() => bot.pular(1)).toThrow(ErroHttp);
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
    const bot = criarBotMusica({ fonte, conectar, registrarErro, aoMudar: vi.fn() });
    await bot.tocar(1, 'a', 1);
    await bot.tocar(1, 'b', 1);
    await esperar();
    expect(registrarErro).toHaveBeenCalled();
    expect(bot.estado(1).tocando?.titulo).toBe('Música b');
    abertos[0]!.audio.end();
    await esperar();
    expect(bot.estados()).toEqual([]);
  });

  it('busca que falha não entra na fila; fila tem limite', async () => {
    const { fonte } = fonteFalsa();
    (fonte.buscar as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new ErroHttp(404, 'nao_encontrado', 'Não achei essa música.'));
    const bot = criarBotMusica({ fonte, conectar: saidaFalsa().conectar, registrarErro: vi.fn(), aoMudar: vi.fn() });
    await expect(bot.tocar(1, 'x', 1)).rejects.toThrow('Não achei');
    expect(bot.estados()).toEqual([]);
    for (let i = 0; i < 51; i++) await bot.tocar(1, String(i), 1);
    await expect(bot.tocar(1, 'demais', 1)).rejects.toThrow('A fila já tem 50 músicas.');
  });
});

describe('fonte e saída do bot', () => {
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
    expect(lerComandoMusica('/tocar')).toEqual({ erro: expect.stringContaining('/tocar <link') });
    expect(lerComandoMusica('bora /tocar algo')).toBeUndefined();
    expect(lerComandoMusica('/tocarxyz')).toBeUndefined();
    expect(lerComandoMusica('oi')).toBeUndefined();
  });
});
