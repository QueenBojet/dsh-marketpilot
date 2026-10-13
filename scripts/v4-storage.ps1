[CmdletBinding()]
param(
  [Parameter(Mandatory)][ValidateSet('downgrade', 'restore', 'validate')][string]$Mode,
  [string]$Source,
  [string]$Output,
  [string]$Bundle,
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$mpScript = Join-Path $PSScriptRoot 'v4-storage.mjs'
if (!(Test-Path -LiteralPath (Join-Path $PSScriptRoot '../lib/storage/downgrade.js'))) {
  Write-Error 'Run npm run build in the MarketPilot repository first.'
  exit 2
}
$mpArguments = @($mpScript, '--mode', $Mode)
if ($Source) { $mpArguments += @('--source', $Source) }
if ($Output) { $mpArguments += @('--output', $Output) }
if ($Bundle) { $mpArguments += @('--bundle', $Bundle) }
if ($DryRun) { $mpArguments += '--dry-run' }
& node @mpArguments
exit $LASTEXITCODE
