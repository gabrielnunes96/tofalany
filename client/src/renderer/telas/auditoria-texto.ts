import { ROTULOS_AUDITORIA, type RegistroAuditoriaDto } from '@tofalando/shared';

const MOTIVOS: Record<string, string> = {
  servidor_parou: 'servidor desligado',
  servidor_reiniciado: 'servidor reiniciado',
};

/** Frase do registro: "<quem> <evento> <alvo> <canal> (detalhe)". */
export function descreverRegistro(r: RegistroAuditoriaDto): string {
  const partes = [r.ator?.nome ?? 'Host (comando no servidor)', ROTULOS_AUDITORIA[r.tipo]];
  if (r.alvo) partes.push(r.alvo.nome);
  if (r.canal) partes.push(`"${r.canal.nome}"`);
  const extras: string[] = [];
  const { motivo, ...resto } = r.detalhes;
  if (typeof motivo === 'string') extras.push(MOTIVOS[motivo] ?? motivo);
  for (const [chave, valor] of Object.entries(resto)) extras.push(`${chave}: ${valor}`);
  return extras.length ? `${partes.join(' ')} (${extras.join('; ')})` : partes.join(' ');
}

const formato = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
export const formatarQuando = (ms: number): string => formato.format(ms);

/** Converte "aaaa-mm-dd" do campo de data no início (ou fim) daquele dia no fuso local. */
export function limiteDoDia(data: string, fim: boolean): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (fim) d.setHours(23, 59, 59, 999);
  return d.getTime();
}
