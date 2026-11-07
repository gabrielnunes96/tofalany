import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CONFIGURACOES_PADRAO, mesclarAtalhos, mesclarAudio, mesclarPessoas, mesclarSons, mesclarNotificacoes, mesclarTela, normalizarUrlServidor, ESCOLHAS_STATUS, TEMAS, type ConfiguracoesLocais, type EscolhaStatus, type Tema } from '@tofalando/shared';

export interface ArmazemConfiguracoes {
  ler(): ConfiguracoesLocais;
  gravar(parcial: Partial<ConfiguracoesLocais>): ConfiguracoesLocais;
}

/**
 * Aplica sobre `base` só os valores válidos de `bruto`; chave desconhecida ou valor inválido
 * mantém o que já estava. A URL é validada aqui, no processo confiável (vira origem da CSP na T23).
 */
function mesclar(base: ConfiguracoesLocais, bruto: unknown): ConfiguracoesLocais {
  const resultado: ConfiguracoesLocais = { ...base };
  if (!bruto || typeof bruto !== 'object') return resultado;
  const obj = bruto as Record<string, unknown>;
  if ('servidorUrl' in obj) {
    const valor = obj.servidorUrl;
    if (valor === null) resultado.servidorUrl = null;
    else if (typeof valor === 'string') {
      const url = normalizarUrlServidor(valor);
      if (url.ok) resultado.servidorUrl = url.valor;
    }
  }
  if ('audio' in obj) resultado.audio = mesclarAudio(base.audio, obj.audio);
  if ('atalhos' in obj) resultado.atalhos = mesclarAtalhos(base.atalhos, obj.atalhos);
  if ('pessoas' in obj) resultado.pessoas = mesclarPessoas(base.pessoas, obj.pessoas);
  if ('sons' in obj) resultado.sons = mesclarSons(base.sons, obj.sons);
  if ('notificacoes' in obj) resultado.notificacoes = mesclarNotificacoes(base.notificacoes, obj.notificacoes);
  if ('tela' in obj) resultado.tela = mesclarTela(base.tela, obj.tela);
  if (typeof obj.fecharParaBandeja === 'boolean') resultado.fecharParaBandeja = obj.fecharParaBandeja;
  if (obj.ocultos && typeof obj.ocultos === 'object') {
    const o = obj.ocultos as Record<string, unknown>;
    resultado.ocultos = { canais: o.canais === true, membros: o.membros === true, cameras: o.cameras === true };
  }
  if (typeof obj.tema === 'string' && (TEMAS as string[]).includes(obj.tema)) resultado.tema = obj.tema as Tema;
  if (obj.statusEscolhido && typeof obj.statusEscolhido === 'object') {
    const validos: Record<string, EscolhaStatus> = {};
    for (const [url, valor] of Object.entries(obj.statusEscolhido as Record<string, unknown>)) {
      if (typeof valor === 'string' && (ESCOLHAS_STATUS as string[]).includes(valor)) validos[url] = valor as EscolhaStatus;
    }
    resultado.statusEscolhido = validos;
  }
  return resultado;
}

/** Configurações locais (RN-14) num JSON em userData, gravado de forma atômica. */
export function criarArmazemConfiguracoes(arquivo: string): ArmazemConfiguracoes {
  let atual: ConfiguracoesLocais | undefined;

  function ler(): ConfiguracoesLocais {
    if (!atual) {
      try {
        atual = mesclar(CONFIGURACOES_PADRAO, JSON.parse(readFileSync(arquivo, 'utf8')));
      } catch {
        atual = { ...CONFIGURACOES_PADRAO };
      }
    }
    return { ...atual };
  }

  function gravar(parcial: Partial<ConfiguracoesLocais>): ConfiguracoesLocais {
    const novo = mesclar(ler(), parcial);
    mkdirSync(dirname(arquivo), { recursive: true });
    const tmp = `${arquivo}.tmp`;
    writeFileSync(tmp, JSON.stringify(novo, null, 2), 'utf8');
    renameSync(tmp, arquivo);
    atual = novo;
    return { ...novo };
  }

  return { ler, gravar };
}
