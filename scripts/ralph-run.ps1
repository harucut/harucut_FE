param(
  [string]$Model = "gpt-5.4"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if (-not (Test-Path '.ralph-loop.yml')) {
  throw "[ralph-run] .ralph-loop.yml not found"
}

$PythonBin = Join-Path $Root '.venv\Scripts\python.exe'
if (-not (Test-Path $PythonBin)) {
  $PythonBin = (Get-Command python -ErrorAction Stop).Source
}

$Runtime = & $PythonBin 'scripts/ralph_runtime.py' --repo-root $Root | ConvertFrom-Json
$env:DISCORD_BRIDGE_HOST = [string]$Runtime.bridge_host
$env:DISCORD_BRIDGE_PORT = [string]$Runtime.bridge_port
$env:OMX_WORKSPACE_ROOT = [string]$Runtime.workspace_root
if ([string]$Runtime.ascii_workspace_drive) {
  $env:OMX_ASCII_WORKSPACE_DRIVE = [string]$Runtime.ascii_workspace_drive
}

$Prompt = @'
$ralph-discord-loop

Run this repository using .ralph-loop.yml.
Continue until RALPH_DONE or RALPH_BLOCKED.
Do not ask the user for ordinary technical choices.
'@

codex exec `
  --cd $Root `
  --model $Model `
  --dangerously-bypass-approvals-and-sandbox `
  $Prompt
