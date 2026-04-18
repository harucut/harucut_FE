param(
  [string]$EnvFile = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not $EnvFile) {
  if ($env:DISCORD_ENV_FILE) {
    $EnvFile = $env:DISCORD_ENV_FILE
  } else {
    $EnvFile = 'omx_discord_bridge/.env.discord'
  }
}

if (-not (Test-Path $EnvFile)) {
  throw "[discord-bridge] env file missing: $EnvFile"
}

$PythonBin = Join-Path $Root '.venv\Scripts\python.exe'
if (-not (Test-Path $PythonBin)) {
  $PythonBin = (Get-Command python -ErrorAction Stop).Source
}

$Runtime = & $PythonBin 'scripts/ralph_runtime.py' --repo-root $Root | ConvertFrom-Json

New-Item -ItemType Directory -Force -Path '.omx\runtime' | Out-Null

$env:DISCORD_ENV_FILE = $EnvFile
$env:DISCORD_BRIDGE_HOST = [string]$Runtime.bridge_host
$env:DISCORD_BRIDGE_PORT = [string]$Runtime.bridge_port
$env:OMX_WORKSPACE_ROOT = [string]$Runtime.workspace_root
if ([string]$Runtime.ascii_workspace_drive) {
  $env:OMX_ASCII_WORKSPACE_DRIVE = [string]$Runtime.ascii_workspace_drive
}
$env:PYTHONUTF8 = '1'

Write-Host "[discord-bridge] starting with env=$EnvFile port=$($Runtime.bridge_port)"
& $PythonBin 'omx_discord_bridge/discord_omx_bridge.py' 2>&1 | Tee-Object -FilePath '.omx\runtime\discord-bridge-live.log'
exit $LASTEXITCODE
