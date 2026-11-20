import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Backlog 18: no Windows o instalador só troca a versão com o app fechado, e nesse meio-tempo nada aparecia.
 * Logo antes de fechar, o app abre uma janelinha à parte (PowerShell, que já vem no Windows) com o ícone girando;
 * ela fecha sozinha quando a versão nova abre (o app novo cria a marca "pronto") ou em 90 s, se algo der errado.
 */
export const ARQUIVOS_ESPERA = {
  script: 'tofalany-atualizando.ps1',
  scriptLinux: 'tofalany-atualizando.sh',
  icone: 'tofalany-atualizando.png',
  pronto: 'tofalany-atualizando.pronto',
} as const;

/** Janela sem borda, no meio da tela, com o ícone girando e "Atualizando o ToFalany…". Só caminhos por argumento. */
export const SCRIPT_ESPERA = `param([string]$Icone, [string]$Pronto)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$imagem = [System.Drawing.Image]::FromFile($Icone)
$janela = New-Object System.Windows.Forms.Form
$janela.FormBorderStyle = 'None'
$janela.StartPosition = 'CenterScreen'
$janela.Size = New-Object System.Drawing.Size(260, 250)
$janela.TopMost = $true
$janela.ShowInTaskbar = $false
$janela.BackColor = [System.Drawing.Color]::FromArgb(21, 18, 37)
$janela.GetType().GetProperty('DoubleBuffered', [System.Reflection.BindingFlags]'NonPublic,Instance').SetValue($janela, $true, $null)
$script:angulo = 0
$fonte = New-Object System.Drawing.Font('Segoe UI', 11)
$janela.Add_Paint({
  param($origem, $e)
  $g = $e.Graphics
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.TranslateTransform(130, 105)
  $g.RotateTransform($script:angulo)
  $g.DrawImage($imagem, -56, -56, 112, 112)
  $g.ResetTransform()
  $texto = 'Atualizando o ToFalany...'
  $medida = $g.MeasureString($texto, $fonte)
  $g.DrawString($texto, $fonte, [System.Drawing.Brushes]::White, (130 - $medida.Width / 2), 200)
})
$inicio = Get-Date
$relogio = New-Object System.Windows.Forms.Timer
$relogio.Interval = 30
$relogio.Add_Tick({
  $script:angulo = ($script:angulo + 6) % 360
  $janela.Invalidate()
  if ((Test-Path -LiteralPath $Pronto) -or ((Get-Date) - $inicio).TotalSeconds -gt 90) { $relogio.Stop(); $janela.Close() }
})
$janela.Add_Shown({ $relogio.Start() })
[System.Windows.Forms.Application]::Run($janela)
$imagem.Dispose()
Remove-Item -LiteralPath $Pronto -ErrorAction SilentlyContinue
`;

/**
 * Backlog 21: no .deb, entre fechar o app e abrir a versão nova vêm a senha (pkexec) e o dpkg. Uma janelinha do
 * zenity (vem nas áreas de trabalho GTK) com a barra pulsando cobre esse tempo e fecha do mesmo jeito do Windows.
 * Sem zenity, nada aparece. Caminhos só por argumento ($1 ícone, $2 marca "pronto").
 */
export const SCRIPT_ESPERA_LINUX = `#!/bin/sh
command -v zenity > /dev/null 2>&1 || exit 0
(
  i=0
  while [ ! -f "$2" ] && [ "$i" -lt 90 ]; do echo 50; sleep 1; i=$((i + 1)); done
  echo 100
) | zenity --progress --pulsate --auto-close --no-cancel --title=ToFalany --text="Atualizando o ToFalany…" --window-icon="$1" --width=320
rm -f "$2"
`;

type Iniciar = (comando: string, argumentos: string[]) => void;
const iniciarPadrao: Iniciar = (comando, argumentos) => {
  spawn(comando, argumentos, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
};

/** Abre a janela de espera (Windows; no Linux, só no .deb). Falhar aqui nunca impede a atualização. */
export function abrirEsperaAtualizacao(opcoes: { plataforma: NodeJS.Platform; icone: string; pacote?: string; pasta?: string; iniciar?: Iniciar }): boolean {
  const linux = opcoes.plataforma === 'linux' && opcoes.pacote === 'deb';
  if (opcoes.plataforma !== 'win32' && !linux) return false;
  const pasta = opcoes.pasta ?? tmpdir();
  try {
    if (linux) {
      const script = join(pasta, ARQUIVOS_ESPERA.scriptLinux);
      const icone = join(pasta, ARQUIVOS_ESPERA.icone);
      const pronto = join(pasta, ARQUIVOS_ESPERA.pronto);
      rmSync(pronto, { force: true });
      writeFileSync(script, SCRIPT_ESPERA_LINUX, 'utf8');
      // Cópia fora de /opt: o dpkg troca os arquivos do app enquanto a janela está aberta.
      copyFileSync(opcoes.icone, icone);
      (opcoes.iniciar ?? iniciarPadrao)('sh', [script, icone, pronto]);
      return true;
    }
    const script = join(pasta, ARQUIVOS_ESPERA.script);
    const icone = join(pasta, ARQUIVOS_ESPERA.icone);
    const pronto = join(pasta, ARQUIVOS_ESPERA.pronto);
    rmSync(pronto, { force: true });
    writeFileSync(script, SCRIPT_ESPERA, 'utf8');
    // Cópia fora da pasta do app: o instalador troca os arquivos dela enquanto a janela está aberta.
    copyFileSync(opcoes.icone, icone);
    (opcoes.iniciar ?? iniciarPadrao)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-STA', '-File', script, '-Icone', icone, '-Pronto', pronto]);
    return true;
  } catch (erro) {
    console.warn('Não foi possível abrir a janela de espera da atualização:', erro);
    return false;
  }
}

/** Na abertura da versão nova: avisa a janela de espera (se houver uma) para fechar. */
export function avisarAtualizacaoPronta(pasta: string = tmpdir()): void {
  try {
    if (existsSync(join(pasta, ARQUIVOS_ESPERA.script)) || existsSync(join(pasta, ARQUIVOS_ESPERA.scriptLinux))) {
      writeFileSync(join(pasta, ARQUIVOS_ESPERA.pronto), 'ok');
      rmSync(join(pasta, ARQUIVOS_ESPERA.script), { force: true });
      rmSync(join(pasta, ARQUIVOS_ESPERA.scriptLinux), { force: true });
      rmSync(join(pasta, ARQUIVOS_ESPERA.icone), { force: true });
    }
  } catch {
    /* a janela fecha sozinha em 90 s */
  }
}
