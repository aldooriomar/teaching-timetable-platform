[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $ProjectRoot '.runtime\server.pid'
if (-not (Test-Path -LiteralPath $PidFile)) {
    Write-Host "Teaching Timetable is not running."
    exit 0
}

$PidText = (Get-Content -LiteralPath $PidFile -Raw).Trim()
if ($PidText -notmatch '^\d+$') {
    Write-Host "The saved process identifier is invalid. Removing the stale file." -ForegroundColor Yellow
    Remove-Item -LiteralPath $PidFile -Force
    exit 0
}

$Process = Get-Process -Id ([int]$PidText) -ErrorAction SilentlyContinue
if ($null -eq $Process) {
    Remove-Item -LiteralPath $PidFile -Force
    Write-Host "Teaching Timetable was already stopped."
    exit 0
}

if ($Process.ProcessName -notmatch '^node') {
    Write-Host "Process $PidText is not Node.js, so it was not stopped." -ForegroundColor Red
    exit 1
}

Stop-Process -Id $Process.Id
Remove-Item -LiteralPath $PidFile -Force
Write-Host "Teaching Timetable stopped." -ForegroundColor Green
