import type { AtividadeDto } from '@tofalando/shared';

/** "🎮 Jogando X" e/ou "🎵 Ouvindo Música — Artista" (o jogo vem antes). */
export function textosAtividade(a: AtividadeDto | undefined): string[] {
  if (!a) return [];
  const r: string[] = [];
  if (a.jogo) r.push(`🎮 Jogando ${a.jogo}`);
  if (a.musica) r.push(`🎵 Ouvindo ${a.musica.titulo}${a.musica.artista ? ` — ${a.musica.artista}` : ''}`);
  return r;
}
