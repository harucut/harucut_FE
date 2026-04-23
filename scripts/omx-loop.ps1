param(
  [int]$MaxIterations = 30,
  [switch]$InfiniteMode,
  [int]$LoopIntervalSeconds = 30,
  [int]$ErrorBackoffSeconds = 90
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

New-Item -ItemType Directory -Force -Path '.omx\runtime', '.omx\journal', '.omx\state' | Out-Null

$env:PYTHONUTF8 = '1'
$env:OMX_LOOP_INTERVAL_SECONDS = [string]$LoopIntervalSeconds
$env:OMX_LOOP_ERROR_BACKOFF_SECONDS = [string]$ErrorBackoffSeconds
$env:MAX_ITERATIONS = [string]$MaxIterations
$env:INFINITE_MODE = if ($InfiniteMode.IsPresent -or $MaxIterations -eq 0) { 'true' } else { 'false' }

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

Write-Host "[omx-loop] root=$Root infinite=$($env:INFINITE_MODE) interval=${LoopIntervalSeconds}s port=$($Runtime.bridge_port)"

$iteration = 1
while ($true) {
  $timestamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
  Set-Content -Path '.omx\runtime\heartbeat.txt' -Value "$timestamp iteration=$iteration" -Encoding utf8
  $env:OMX_LOOP_ITERATION = [string]$iteration
  Write-Host "[omx-loop] iteration=$iteration start"

  try {
    & $PythonBin 'scripts/omx_autonomous_loop.py' 2>&1 | Tee-Object -FilePath '.omx\runtime\omx-loop-last.log'
    $exitCode = $LASTEXITCODE
  } catch {
    $exitCode = 1
    $_ | Out-String | Tee-Object -FilePath '.omx\runtime\omx-loop-last.log' | Out-Null
  }

  if ($exitCode -eq 0) {
    Write-Host "[omx-loop] iteration=$iteration ok"
  } elseif ($exitCode -eq 2) {
    Write-Host "[omx-loop] iteration=$iteration stop requested"
    break
  } else {
    $errorTimestamp = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    Set-Content -Path '.omx\runtime\omx-loop-error.txt' -Value "$errorTimestamp iteration=$iteration exit=$exitCode" -Encoding utf8
    Write-Host "[omx-loop] iteration=$iteration failed; see .omx/runtime/omx-loop-last.log"
    Start-Sleep -Seconds $ErrorBackoffSeconds
  }

  if ($env:INFINITE_MODE -ne 'true' -and $MaxIterations -ne 0 -and $iteration -ge $MaxIterations) {
    break
  }

  $iteration += 1
  Start-Sleep -Seconds $LoopIntervalSeconds
}
